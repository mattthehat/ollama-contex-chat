import { db } from './db.server';
import config from './config';
import { randomUUID } from 'crypto';
import pdf from 'pdf-parse';
import pdf2md from '@opendocsg/pdf2md';
import { buildContextualChunkText, getAdaptiveChunkSize } from './rag-advanced.server';
import net from 'net';

/**
 * Decode HTTP chunked transfer encoding
 */
function decodeChunkedResponse(chunkedBody: string): string {
    let decoded = '';
    let position = 0;

    while (position < chunkedBody.length) {
        // Find the chunk size line (hex number followed by \r\n)
        const chunkSizeEnd = chunkedBody.indexOf('\r\n', position);
        if (chunkSizeEnd === -1) break;

        const chunkSizeHex = chunkedBody.substring(position, chunkSizeEnd).trim();
        const chunkSize = parseInt(chunkSizeHex, 16);

        // If chunk size is 0, we're done
        if (chunkSize === 0) break;

        // Extract the chunk data
        const chunkStart = chunkSizeEnd + 2; // Skip \r\n
        const chunkEnd = chunkStart + chunkSize;
        decoded += chunkedBody.substring(chunkStart, chunkEnd);

        // Move position past this chunk and its trailing \r\n
        position = chunkEnd + 2;
    }

    return decoded;
}

// Enhanced LRU cache for embeddings with statistics and adaptive TTL
class EmbeddingCache {
    private cache: Map<string, { embedding: number[]; timestamp: number; hits: number; lastAccess: number }> = new Map();
    private maxSize: number = 500;
    private baseTTL: number = 1000 * 60 * 15; // 15 minutes base
    private maxTTL: number = 1000 * 60 * 60; // 1 hour max
    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0
    };

    get(key: string): number[] | null {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Adaptive TTL: frequently accessed items stay longer
        const adaptiveTTL = Math.min(
            this.maxTTL,
            this.baseTTL * (1 + Math.log(entry.hits + 1))
        );

        // Check if expired
        if (Date.now() - entry.timestamp > adaptiveTTL) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        // Update access stats
        entry.hits++;
        entry.lastAccess = Date.now();
        this.stats.hits++;

        return entry.embedding;
    }

    set(key: string, embedding: number[]): void {
        // If cache is full, use LRU eviction (remove least recently used)
        if (this.cache.size >= this.maxSize) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;

            for (const [k, v] of this.cache.entries()) {
                if (v.lastAccess < oldestTime) {
                    oldestTime = v.lastAccess;
                    oldestKey = k;
                }
            }

            if (oldestKey) {
                this.cache.delete(oldestKey);
                this.stats.evictions++;
            }
        }

        this.cache.set(key, {
            embedding,
            timestamp: Date.now(),
            hits: 0,
            lastAccess: Date.now()
        });
    }

    getStats(): { size: number; maxSize: number; hitRate: number; hits: number; misses: number; evictions: number } {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? this.stats.hits / total : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate,
            hits: this.stats.hits,
            misses: this.stats.misses,
            evictions: this.stats.evictions
        };
    }

    clear(): void {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }
}

const embeddingCache = new EmbeddingCache();

export type Document = {
    documentId: number;
    documentUUID: string;
    documentTitle: string;
    documentType: 'text' | 'markdown' | 'code' | 'documentation' | 'pdf';
    documentTotalChunks: number;
    documentMarkdown?: string;
    documentMetadata: any;
    documentCreatedAt: Date;
    documentUpdatedAt: Date;
};

export type DocumentChunk = {
    chunkId: number;
    chunkUUID: string;
    chunkDocumentId: number;
    chunkContent: string;
    chunkIndex: number;
    chunkMetadata: any;
    chunkCreatedAt: Date;
};

export type DocumentChunkWithSimilarity = DocumentChunk & {
    similarity: number;
};

export type ChunkMetadata = {
    pageNumber?: number;
    section?: string;
    hierarchy?: string[];
    chunkSize: number;
};

export type DocumentMetadata = {
    pageCount?: number;
    fileSize?: number;
};

/**
 * Generate embeddings for text using Ollama with caching
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const embeddingStart = performance.now();

    // Normalize text for cache key
    const cacheKey = text.trim().toLowerCase().slice(0, 1000); // Use first 1000 chars for key

    // Check cache first
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
        console.log(`    [EMBED] Cache hit (${(performance.now() - embeddingStart).toFixed(2)}ms)`);
        return cached;
    }

    console.log(`    [EMBED] Cache miss, generating embedding for ${text.length} chars`);

    // Truncate text to max token limit for embedding model
    // nomic-embed-text has 2048 token limit (despite num_ctx=8192, model architecture is 2048)
    // CRITICAL: Use absolute maximum of 512 tokens (2048/4) = 2048 chars to be ultra-safe
    // This accounts for worst-case tokenization where each token is only 2 chars
    const maxChars = 2048;
    const truncatedText = text.length > maxChars
        ? text.slice(0, maxChars)
        : text;

    // Text truncation is expected behavior for long chunks

    // Use raw TCP socket to completely bypass all HTTP client compression handling
    // This is necessary because Bun's fetch and other HTTP clients have automatic decompression
    // that's causing zlib errors with Ollama's responses
    const requestBody = JSON.stringify({
        model: config.embedModel,
        input: truncatedText,
    });

    const httpRequest = [
        'POST /api/embed HTTP/1.1',
        'Host: localhost:11434',
        'Content-Type: application/json',
        `Content-Length: ${Buffer.byteLength(requestBody)}`,
        'Accept-Encoding: identity',
        'Connection: close',
        '',
        requestBody
    ].join('\r\n');

    const data = await new Promise<any>((resolve, reject) => {
        const client = net.connect(11434, 'localhost', () => {
            client.write(httpRequest);
        });

        let responseData = '';
        client.on('data', (chunk) => {
            responseData += chunk.toString();
        });

        client.on('end', () => {
            try {
                // Parse HTTP response - split on double CRLF
                const headerEndIndex = responseData.indexOf('\r\n\r\n');
                if (headerEndIndex === -1) {
                    reject(new Error('Invalid HTTP response: no header/body separator'));
                    return;
                }

                const headers = responseData.substring(0, headerEndIndex);
                let body = responseData.substring(headerEndIndex + 4); // Skip the \r\n\r\n

                const statusMatch = headers.match(/HTTP\/1\.\d (\d+)/);
                const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;

                if (statusCode !== 200) {
                    reject(new Error(`Failed to generate embedding: ${statusCode} ${body.substring(0, 200)}`));
                    return;
                }

                // Check if response uses chunked transfer encoding
                if (headers.toLowerCase().includes('transfer-encoding: chunked')) {
                    body = decodeChunkedResponse(body);
                }

                // Parse JSON response
                const jsonData = JSON.parse(body);
                resolve(jsonData);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                const preview = responseData.substring(0, 500);
                reject(new Error(`Failed to parse Ollama response: ${errorMsg}\nResponse preview: ${preview}`));
            }
        });

        client.on('error', (error) => {
            reject(new Error(`Socket error: ${error.message}`));
        });
    });

    // Ollama API returns { embeddings: [[...]] } - note the array wrapper
    const embedding = data.embeddings?.[0] || data.embedding;

    if (!embedding || !Array.isArray(embedding)) {
        console.error('Invalid embedding response. Keys:', Object.keys(data));
        console.error('Full response:', JSON.stringify(data).slice(0, 500));
        console.error('embeddings value:', data.embeddings);
        console.error('embedding value:', data.embedding);
        throw new Error('Invalid embedding format from Ollama');
    }

    // Cache the result
    embeddingCache.set(cacheKey, embedding);

    console.log(`    [EMBED] Generated embedding in ${(performance.now() - embeddingStart).toFixed(2)}ms`);
    return embedding;
}

/**
 * Generate embeddings in parallel with controlled concurrency
 * Processes chunks in batches to avoid overwhelming the embedding service
 */
async function generateEmbeddingsInBatches(
    chunks: string[],
    batchSize: number = 5 // Reduced from 10 to avoid overwhelming Ollama
): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        // Process each embedding with retry logic
        const batchEmbeddings: number[][] = [];
        for (const chunk of batch) {
            let retries = 3;
            let embedding: number[] | null = null;

            while (retries > 0 && !embedding) {
                try {
                    embedding = await generateEmbedding(chunk);
                    batchEmbeddings.push(embedding);
                    break;
                } catch (error) {
                    retries--;
                    console.error(`Embedding generation attempt ${3 - retries + 1} failed:`, error);
                    if (retries === 0) {
                        console.error(`Failed to generate embedding after 3 attempts. Chunk preview:`, chunk.slice(0, 100));
                        throw error;
                    }
                    // Wait before retry with exponential backoff
                    console.log(`Retrying in ${(3 - retries) * 1000}ms...`);
                    await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
                }
            }
        }

        results.push(...batchEmbeddings);

        // Log progress every 50 batches
        if ((i / batchSize + 1) % 50 === 0) {
            console.log(`Generated embeddings for ${i + batchSize}/${chunks.length} chunks`);
        }

        // Small delay between batches to avoid overwhelming Ollama
        if (i + batchSize < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log(`Successfully generated all ${chunks.length} embeddings`);
    return results;
}

/**
 * Split text into sentences using common sentence boundaries
 */
function splitIntoSentences(text: string): string[] {
    // Match sentence endings: . ! ? followed by space/newline or end of string
    // Handle common abbreviations like Dr. Mr. Mrs. etc.
    const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [];
    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Chunk text into smaller pieces for embedding
 * Uses sentence boundaries to maintain semantic coherence
 */
export function chunkText(
    text: string,
    maxChunkSize: number = 700,
    overlap: number = 100
): string[] {
    const chunks: string[] = [];
    const sentences = splitIntoSentences(text);

    if (sentences.length === 0) {
        return [];
    }

    let currentChunk: string[] = [];
    let currentSize = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const sentenceSize = sentence.length;

        // If single sentence is larger than max chunk size, split it by character with word boundaries
        if (sentenceSize > maxChunkSize) {
            // Save current chunk if it has content
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join(' '));
                currentChunk = [];
                currentSize = 0;
            }

            // Split large sentence by words
            const words = sentence.split(/\s+/);
            let largeSentenceChunk = '';

            for (const word of words) {
                if (
                    largeSentenceChunk.length + word.length + 1 >
                    maxChunkSize
                ) {
                    if (largeSentenceChunk) {
                        chunks.push(largeSentenceChunk.trim());
                    }
                    largeSentenceChunk = word;
                } else {
                    largeSentenceChunk +=
                        (largeSentenceChunk ? ' ' : '') + word;
                }
            }

            if (largeSentenceChunk) {
                chunks.push(largeSentenceChunk.trim());
            }
            continue;
        }

        // If adding this sentence would exceed chunk size
        if (
            currentSize + sentenceSize > maxChunkSize &&
            currentChunk.length > 0
        ) {
            chunks.push(currentChunk.join(' '));

            // Create overlap by keeping last few sentences
            const overlapSentences: string[] = [];
            let overlapSize = 0;

            for (let j = currentChunk.length - 1; j >= 0; j--) {
                const sent = currentChunk[j];
                if (overlapSize + sent.length <= overlap) {
                    overlapSentences.unshift(sent);
                    overlapSize += sent.length;
                } else {
                    break;
                }
            }

            currentChunk = overlapSentences;
            currentSize = overlapSize;
        }

        currentChunk.push(sentence);
        currentSize += sentenceSize;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks.filter((c) => c.length > 0);
}

/**
 * Chunk code while preserving function/class boundaries
 * Attempts to keep logical code blocks together
 */
export function chunkCode(
    code: string,
    maxChunkSize: number = 700,
    overlap: number = 100
): string[] {
    const chunks: string[] = [];
    const lines = code.split('\n');

    let currentChunk: string[] = [];
    let currentSize = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineSize = line.length + 1; // +1 for newline

        // Track indentation to detect block boundaries
        const trimmed = line.trim();
        if (trimmed) {
            const currentIndent = line.length - line.trimStart().length;

            // If we're at chunk size limit and at a good breaking point (low indent or block boundary)
            if (
                currentSize + lineSize > maxChunkSize &&
                currentChunk.length > 0 &&
                (currentIndent === 0 || trimmed === '}' || trimmed === '};')
            ) {
                chunks.push(currentChunk.join('\n'));

                // Create overlap with last few lines
                const overlapLines: string[] = [];
                let overlapSize = 0;

                for (let j = currentChunk.length - 1; j >= 0; j--) {
                    const overlapLine = currentChunk[j];
                    if (overlapSize + overlapLine.length <= overlap) {
                        overlapLines.unshift(overlapLine);
                        overlapSize += overlapLine.length;
                    } else {
                        break;
                    }
                }

                currentChunk = overlapLines;
                currentSize = overlapSize;
            }
        }

        currentChunk.push(line);
        currentSize += lineSize;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }

    return chunks.filter((c) => c.trim().length > 0);
}

/**
 * Chunk markdown by sections (headers) while maintaining hierarchy
 * Returns chunks with metadata including the full heading hierarchy
 */
export function chunkMarkdown(
    markdown: string,
    maxChunkSize: number = 700
): Array<{ text: string; metadata: { section?: string; hierarchy?: string[] } }> {
    const chunks: Array<{ text: string; metadata: { section?: string; hierarchy?: string[] } }> = [];
    const lines = markdown.split('\n');

    // Track heading hierarchy as a stack
    const headerStack: Array<{ level: number; text: string }> = [];
    let currentChunk: string[] = [];
    let currentSize = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineSize = line.length + 1;

        // Detect headers (# Header)
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headerMatch) {
            const level = headerMatch[1].length;
            const headerText = headerMatch[2].trim();

            // Update header stack - remove headers of equal or greater level
            while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
                headerStack.pop();
            }
            headerStack.push({ level, text: headerText });

            // If we have content and hit a header, consider chunking
            if (currentChunk.length > 0 && currentSize > maxChunkSize * 0.5) {
                chunks.push({
                    text: currentChunk.join('\n').slice(0, maxChunkSize), // Hard limit enforcement
                    metadata: {
                        section: headerStack.length > 0 ? headerStack[headerStack.length - 1].text : undefined,
                        hierarchy: headerStack.map(h => h.text)
                    }
                });

                // Start new chunk with current line
                currentChunk = [line];
                currentSize = lineSize;
                continue;
            }
        }

        // If we exceed size, chunk immediately (don't wait for paragraph boundary)
        if (currentSize + lineSize > maxChunkSize && currentChunk.length > 0) {
            chunks.push({
                text: currentChunk.join('\n').slice(0, maxChunkSize), // Hard limit enforcement
                metadata: {
                    section: headerStack.length > 0 ? headerStack[headerStack.length - 1].text : undefined,
                    hierarchy: headerStack.map(h => h.text)
                }
            });

            // Don't add headers to new chunk - just start fresh to keep size down
            currentChunk = [line];
            currentSize = lineSize;
            continue;
        }

        currentChunk.push(line);
        currentSize += lineSize;
    }

    // Add final chunk with hard limit
    if (currentChunk.length > 0) {
        chunks.push({
            text: currentChunk.join('\n').slice(0, maxChunkSize), // Hard limit enforcement
            metadata: {
                section: headerStack.length > 0 ? headerStack[headerStack.length - 1].text : undefined,
                hierarchy: headerStack.map(h => h.text)
            }
        });
    }

    return chunks.filter((c) => c.text.trim().length > 0);
}

/**
 * Smart PDF chunking that preserves paragraphs and sections
 */
export function chunkPDFText(
    text: string,
    pageBreaks: number[],
    chunkSize: number = 800,
    overlap: number = 200
): Array<{ text: string; pageNumber: number }> {
    const chunks: Array<{ text: string; pageNumber: number }> = [];

    // Split by paragraphs (double newlines)
    const paragraphs = text.split(/\n\n+/);

    let currentChunk = '';
    let currentPageNumber = 1;
    let charCount = 0;

    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim();
        if (!trimmedParagraph) continue;

        // Update page number based on character position
        while (
            pageBreaks[currentPageNumber] &&
            charCount > pageBreaks[currentPageNumber]
        ) {
            currentPageNumber++;
        }

        // If adding this paragraph would exceed chunk size
        if (
            currentChunk.length + trimmedParagraph.length > chunkSize &&
            currentChunk.length > 0
        ) {
            chunks.push({
                text: currentChunk.trim(),
                pageNumber: currentPageNumber,
            });

            // Start new chunk with overlap (last part of previous chunk)
            const overlapStart = Math.max(0, currentChunk.length - overlap);
            currentChunk =
                currentChunk.slice(overlapStart) + '\n\n' + trimmedParagraph;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
        }

        charCount += trimmedParagraph.length;
    }

    // Add final chunk
    if (currentChunk.trim()) {
        chunks.push({
            text: currentChunk.trim(),
            pageNumber: currentPageNumber,
        });
    }

    return chunks;
}

/**
 * Convert PDF buffer to semantic markdown with proper structure
 */
export async function pdfToMarkdown(buffer: Buffer): Promise<string> {
    try {
        // Use pdf2md to extract semantic markdown with headings and structure
        const markdown = await pdf2md(buffer);
        return markdown;
    } catch (error) {
        console.error('Error converting PDF to markdown:', error);
        // Fallback to plain text extraction if markdown conversion fails
        const data = await pdf(buffer);
        return convertPlainTextToMarkdown(data.text);
    }
}

/**
 * Convert plain text to markdown with basic semantic structure
 * Detects headings, lists, and paragraphs
 */
function convertPlainTextToMarkdown(text: string): string {
    const lines = text.split('\n');
    const markdownLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) {
            markdownLines.push('');
            continue;
        }

        // Detect potential headings (all caps, short lines, followed by content)
        if (
            line.length < 100 &&
            line === line.toUpperCase() &&
            line.match(/^[A-Z\s]+$/)
        ) {
            // Determine heading level based on length and position
            const level = line.length < 30 ? 2 : 3;
            markdownLines.push(`${'#'.repeat(level)} ${line}`);
            continue;
        }

        // Detect numbered lists
        if (line.match(/^\d+[\.)]\s/)) {
            markdownLines.push(line);
            continue;
        }

        // Detect bullet points
        if (line.match(/^[•\-\*]\s/)) {
            if (!line.startsWith('- ')) {
                markdownLines.push(line.replace(/^[•\*]\s/, '- '));
            } else {
                markdownLines.push(line);
            }
            continue;
        }

        // Regular paragraph
        markdownLines.push(line);
    }

    return markdownLines.join('\n');
}

/**
 * Parse PDF buffer and extract text with page information
 */
export async function parsePDF(buffer: Buffer): Promise<{
    text: string;
    pageCount: number;
    pageBreaks: number[];
}> {
    const data = await pdf(buffer);

    // Track character positions where pages break
    const pageBreaks: number[] = [0];
    let currentPosition = 0;

    // If pdf-parse provides page-by-page text, use it to track breaks
    if (data.text) {
        // Estimate page breaks based on text length distribution
        const avgCharsPerPage = data.text.length / data.numpages;
        for (let i = 1; i < data.numpages; i++) {
            currentPosition += avgCharsPerPage;
            pageBreaks.push(Math.floor(currentPosition));
        }
    }

    return {
        text: data.text,
        pageCount: data.numpages,
        pageBreaks,
    };
}

/**
 * Get all documents
 */
export async function getAllDocuments(): Promise<Document[]> {
    const result = await db.getData<Document>(
        {
            table: 'documents',
            idField: 'documentId',
            fields: {
                documentId: 'documentId',
                documentUUID: 'documentUUID',
                documentTitle: 'documentTitle',
                documentType: 'documentType',
                documentTotalChunks: 'documentTotalChunks',
                documentMarkdown: 'documentMarkdown',
                documentMetadata: 'documentMetadata',
                documentCreatedAt: 'documentCreatedAt',
                documentUpdatedAt: 'documentUpdatedAt',
            },
            orderBy: ['documentCreatedAt'],
            orderDirection: 'DESC',
        },
        []
    );

    // Documents retrieved successfully
    return result.rows;
}

/**
 * Get document by UUID
 */
export async function getDocumentByUUID(
    uuid: string
): Promise<Document | null> {
    const result = await db.getFirst<Document>(
        {
            table: 'documents',
            idField: 'documentId',
            where: ['documentUUID = ?'],
            fields: {
                documentId: 'documentId',
                documentUUID: 'documentUUID',
                documentTitle: 'documentTitle',
                documentType: 'documentType',
                documentTotalChunks: 'documentTotalChunks',
                documentMarkdown: 'documentMarkdown',
                documentMetadata: 'documentMetadata',
                documentCreatedAt: 'documentCreatedAt',
                documentUpdatedAt: 'documentUpdatedAt',
            },
        },
        [uuid]
    );

    return result || null;
}

/**
 * Get chunks for a specific document
 */
export async function getChunksByDocumentId(
    documentId: number
): Promise<DocumentChunk[]> {
    const result = await db.getData<DocumentChunk>(
        {
            table: 'document_chunks',
            idField: 'chunkId',
            where: ['chunkDocumentId = ?'],
            fields: {
                chunkId: 'chunkId',
                chunkUUID: 'chunkUUID',
                chunkDocumentId: 'chunkDocumentId',
                chunkContent: 'chunkContent',
                chunkIndex: 'chunkIndex',
                chunkMetadata: 'chunkMetadata',
                chunkCreatedAt: 'chunkCreatedAt',
            },
            orderBy: ['chunkIndex'],
            orderDirection: 'ASC',
        },
        [documentId]
    );

    return result.rows;
}

/**
 * Process and store a text document with embeddings
 */
export async function processTextDocument(
    title: string,
    content: string,
    documentType: 'text' | 'markdown' | 'code' | 'documentation' = 'text'
): Promise<string> {
    // Create document record
    const documentUUID = randomUUID();

    // Convert content to markdown for semantic structure
    let markdownContent: string;
    switch (documentType) {
        case 'markdown':
        case 'documentation':
            markdownContent = content;
            break;
        case 'code':
            // Wrap code in markdown code block
            markdownContent = `# ${title}\n\n\`\`\`\n${content}\n\`\`\``;
            break;
        case 'text':
        default:
            // Convert plain text to markdown
            markdownContent = convertPlainTextToMarkdown(content);
            break;
    }

    // Use adaptive chunk sizes based on document type
    const adaptiveChunkSize = getAdaptiveChunkSize(documentType);

    // Use markdown-aware chunking for better semantic coherence
    // This ensures chunks preserve heading context and structure
    let chunksWithMetadata: Array<{ text: string; metadata: { section?: string; hierarchy?: string[] } }>;
    if (documentType === 'code') {
        const codeChunks = chunkCode(markdownContent, adaptiveChunkSize);
        chunksWithMetadata = codeChunks.map(text => ({ text, metadata: {} }));
    } else {
        // Use markdown chunking for all types since we converted to markdown
        chunksWithMetadata = chunkMarkdown(markdownContent, adaptiveChunkSize);
    }

    const metadata: DocumentMetadata = {
        fileSize: content.length,
    };

    // Don't store full markdown for very large documents to avoid packet size issues
    // The content is preserved in chunks anyway
    const shouldStoreMarkdown = markdownContent.length < 1000000; // 1MB limit

    await db.insertData('documents', {
        documentUUID,
        documentTitle: title,
        documentType,
        documentTotalChunks: chunksWithMetadata.length,
        documentMarkdown: shouldStoreMarkdown ? markdownContent : null,
        documentMetadata: JSON.stringify(metadata),
    });

    // Get the created document ID
    const document = await getDocumentByUUID(documentUUID);
    if (!document) {
        throw new Error('Failed to create document');
    }

    // Extract text for embeddings with contextual enhancement
    // Include heading hierarchy in embedding for better semantic understanding
    const chunkTexts = chunksWithMetadata.map(c =>
        buildContextualChunkText(c.text, c.metadata)
    );

    // Generate all embeddings in parallel batches
    const embeddings = await generateEmbeddingsInBatches(chunkTexts);

    // Store all chunks with their embeddings
    for (let i = 0; i < chunksWithMetadata.length; i++) {
        const chunkData = chunksWithMetadata[i];
        const embedding = embeddings[i];

        const chunkMetadata: ChunkMetadata = {
            chunkSize: chunkData.text.length,
            section: chunkData.metadata.section,
            hierarchy: chunkData.metadata.hierarchy,
        };

        const chunkUUID = randomUUID();
        const embeddingVector = JSON.stringify(embedding);

        try {
            // Use VEC_FromText() function for MariaDB 11.7+ vector conversion
            await db.rawQuery(
                `INSERT INTO document_chunks
                (chunkUUID, chunkDocumentId, chunkContent, chunkIndex, chunkMetadata, chunkEmbedding)
                VALUES (?, ?, ?, ?, ?, VEC_FromText(?))`,
                [
                    chunkUUID,
                    document.documentId,
                    chunkData.text,
                    i,
                    JSON.stringify(chunkMetadata),
                    embeddingVector,
                ]
            );

            // Log progress every 100 chunks for large documents
            if ((i + 1) % 100 === 0) {
                console.log(`Processed ${i + 1}/${chunksWithMetadata.length} chunks for text document`);
            }
        } catch (error) {
            console.error(`Error inserting chunk ${i}:`, error);
            // Delete the document if chunk insertion fails
            await db.deleteData('documents', { documentId: document.documentId });
            throw new Error(`Failed to insert chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    console.log(`Successfully processed all ${chunksWithMetadata.length} chunks for text document: ${title}`);
    return documentUUID;
}

/**
 * Process and store a PDF document with embeddings
 */
export async function processPDFDocument(
    title: string,
    pdfBuffer: Buffer
): Promise<string> {
    // Convert PDF to semantic markdown
    const markdownContent = await pdfToMarkdown(pdfBuffer);

    // Parse PDF to get page count metadata
    const { pageCount } = await parsePDF(pdfBuffer);

    // Create document record
    const documentUUID = randomUUID();

    // Use adaptive chunk sizes for PDFs
    const adaptiveChunkSize = getAdaptiveChunkSize('pdf');

    // Use markdown-based chunking to preserve semantic structure
    // This is superior to plain text chunking as it maintains headings and context
    const chunksWithMetadata = chunkMarkdown(markdownContent, adaptiveChunkSize);

    const metadata: DocumentMetadata = {
        pageCount,
        fileSize: pdfBuffer.length,
    };

    // Don't store full markdown for very large documents to avoid packet size issues
    // The content is preserved in chunks anyway
    const shouldStoreMarkdown = markdownContent.length < 1000000; // 1MB limit

    await db.insertData('documents', {
        documentUUID,
        documentTitle: title,
        documentType: 'pdf',
        documentTotalChunks: chunksWithMetadata.length,
        documentMarkdown: shouldStoreMarkdown ? markdownContent : null,
        documentMetadata: JSON.stringify(metadata),
    });

    // Get the created document ID
    const document = await getDocumentByUUID(documentUUID);
    if (!document) {
        throw new Error('Failed to create document');
    }

    // Extract text for embeddings with contextual enhancement
    // Include heading hierarchy in embedding for better semantic understanding
    const chunkTexts = chunksWithMetadata.map(c =>
        buildContextualChunkText(c.text, c.metadata)
    );

    console.log(`Generating embeddings for ${chunkTexts.length} chunks from PDF: ${title}`);

    // Generate all embeddings in parallel batches
    let embeddings: number[][];
    try {
        embeddings = await generateEmbeddingsInBatches(chunkTexts);
    } catch (error) {
        console.error('FATAL ERROR during embedding generation:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        // Delete the document if embedding generation fails
        await db.deleteData('documents', { documentId: document.documentId });
        throw error;
    }

    console.log(`Inserting ${chunksWithMetadata.length} chunks into database...`);

    // Store all chunks with their embeddings
    for (let i = 0; i < chunksWithMetadata.length; i++) {
        const chunkData = chunksWithMetadata[i];
        const embedding = embeddings[i];

        const chunkMetadata: ChunkMetadata = {
            chunkSize: chunkData.text.length,
            section: chunkData.metadata.section,
            hierarchy: chunkData.metadata.hierarchy,
        };

        const chunkUUID = randomUUID();
        const embeddingVector = JSON.stringify(embedding);

        try {
            // Use VEC_FromText() function for MariaDB 11.7+ vector conversion
            await db.rawQuery(
                `INSERT INTO document_chunks
                (chunkUUID, chunkDocumentId, chunkContent, chunkIndex, chunkMetadata, chunkEmbedding)
                VALUES (?, ?, ?, ?, ?, VEC_FromText(?))`,
                [
                    chunkUUID,
                    document.documentId,
                    chunkData.text,
                    i,
                    JSON.stringify(chunkMetadata),
                    embeddingVector,
                ]
            );

            // Log progress every 100 chunks for large documents
            if ((i + 1) % 100 === 0) {
                console.log(`Processed ${i + 1}/${chunksWithMetadata.length} chunks for PDF`);
            }
        } catch (error) {
            console.error(`Error inserting chunk ${i} for PDF "${title}":`, error);
            // Delete the document if chunk insertion fails
            await db.deleteData('documents', { documentId: document.documentId });
            throw new Error(`Failed to insert chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    console.log(`Successfully processed all ${chunksWithMetadata.length} chunks for PDF: ${title}`);
    return documentUUID;
}

/**
 * Search chunks by semantic similarity using vector search
 * MariaDB 11.7+ supports native VEC_DISTANCE_COSINE function
 */
export async function searchChunksBySimilarity(
    query: string,
    limit: number = 5
): Promise<DocumentChunkWithSimilarity[]> {
    const queryEmbedding = await generateEmbedding(query);

    // Convert embedding array to JSON string for VEC_FromText
    const embeddingJson = JSON.stringify(queryEmbedding);

    // Use MariaDB's native vector distance function
    // VEC_DISTANCE_COSINE returns distance (lower = more similar)
    // Convert to similarity score: 1 - distance (higher = more similar)
    const result = await db.rawQuery(
        `SELECT
            chunkId,
            chunkUUID,
            chunkDocumentId,
            chunkContent,
            chunkIndex,
            chunkMetadata,
            chunkCreatedAt,
            (1 - VEC_DISTANCE_COSINE(chunkEmbedding, VEC_FromText(?))) AS similarity
        FROM document_chunks
        ORDER BY similarity DESC
        LIMIT ?`,
        [embeddingJson, limit]
    );

    // Handle different result formats from rawQuery
    if (Array.isArray(result)) {
        return result as DocumentChunkWithSimilarity[];
    }

    return ((result as any)?.rows || []) as DocumentChunkWithSimilarity[];
}

/**
 * Search chunks from specific documents by semantic similarity
 * Filters results to only include chunks from the provided document UUIDs
 */
export async function searchChunksInDocuments(
    query: string,
    documentUUIDs: string[],
    limit: number = 5
): Promise<DocumentChunkWithSimilarity[]> {
    const searchStart = performance.now();
    console.log(`  [RAG] searchChunksInDocuments: Starting search for ${documentUUIDs.length} documents, limit=${limit}`);

    if (documentUUIDs.length === 0) {
        return [];
    }

    const embeddingStart = performance.now();
    const queryEmbedding = await generateEmbedding(query);
    console.log(`  [RAG] Embedding generation took ${(performance.now() - embeddingStart).toFixed(2)}ms`);

    const embeddingJson = JSON.stringify(queryEmbedding);

    // Create placeholders for document UUIDs
    const placeholders = documentUUIDs.map(() => '?').join(',');

    const dbQueryStart = performance.now();
    const result = await db.rawQuery(
        `SELECT
            dc.chunkId,
            dc.chunkUUID,
            dc.chunkDocumentId,
            dc.chunkContent,
            dc.chunkIndex,
            dc.chunkMetadata,
            dc.chunkCreatedAt,
            (1 - VEC_DISTANCE_COSINE(dc.chunkEmbedding, VEC_FromText(?))) AS similarity
        FROM document_chunks dc
        INNER JOIN documents d ON dc.chunkDocumentId = d.documentId
        WHERE d.documentUUID IN (${placeholders})
        ORDER BY similarity DESC
        LIMIT ?`,
        [embeddingJson, ...documentUUIDs, limit]
    );
    console.log(`  [RAG] Database vector search took ${(performance.now() - dbQueryStart).toFixed(2)}ms`);

    const chunks = Array.isArray(result)
        ? result as DocumentChunkWithSimilarity[]
        : ((result as any)?.rows || []) as DocumentChunkWithSimilarity[];

    console.log(`  [RAG] searchChunksInDocuments completed in ${(performance.now() - searchStart).toFixed(2)}ms, found ${chunks.length} chunks`);

    return chunks;
}

/**
 * Build RAG context from selected documents with conversation history
 * Retrieves relevant chunks and formats them for inclusion in the system prompt
 *
 * @param useAdvanced - Set to true to use advanced RAG features (multi-query, hybrid search, re-ranking)
 */
export async function buildRAGContext(
    currentMessage: string,
    documentUUIDs: string[],
    conversationHistory: Array<{ role: string; content: string }> = [],
    maxChunks: number = 5,
    similarityThreshold: number = 0.3,
    useAdvanced: boolean = false
): Promise<string> {
    const buildStart = performance.now();
    console.log(`  [RAG] buildRAGContext: Starting (advanced=${useAdvanced})`);

    // Use advanced RAG if requested
    if (useAdvanced) {
        console.log(`  [RAG] Using advanced RAG with multi-query, hybrid search, and reranking`);
        const advancedStart = performance.now();
        const { buildAdvancedRAGContext } = await import('./rag-advanced.server');
        const result = await buildAdvancedRAGContext(
            currentMessage,
            documentUUIDs,
            conversationHistory,
            maxChunks,
            similarityThreshold,
            true,  // useMultiQuery
            true,  // useHybridSearch
            true   // useReranking
        );
        console.log(`  [RAG] Advanced RAG completed in ${(performance.now() - advancedStart).toFixed(2)}ms`);
        console.log(`  [RAG] buildRAGContext total: ${(performance.now() - buildStart).toFixed(2)}ms`);
        return result.context;
    }

    // Use standard RAG (existing implementation below)
    if (documentUUIDs.length === 0) {
        console.log(`  [RAG] No documents provided, returning empty context`);
        return '';
    }

    // Build contextual query using momentum-aware strategy
    let contextualQuery = currentMessage;

    // Fast path for short queries (< 5 words) - always expand for better retrieval
    const wordCount = currentMessage.trim().split(/\s+/).length;
    if (wordCount < 5 && conversationHistory.length > 0) {
        const recentUserMessages = conversationHistory
            .filter(m => m.role === 'user')
            .slice(-3)
            .map(m => m.content);

        if (recentUserMessages.length > 0) {
            contextualQuery = `${currentMessage} ${recentUserMessages.join(' ')}`;
            console.log(`  [RAG] Short query (${wordCount} words): expanded with ${recentUserMessages.length} recent messages`);
        }
    } else if (conversationHistory.length > 0) {
        // For longer queries, use smart momentum-based expansion
        // This is lightweight - only extracts entities, no LLM calls
        const { analyzeConversationMomentum, buildMomentumAwareQuery } = await import(
            './conversation-momentum.server'
        );

        const momentumStart = performance.now();
        const momentum = analyzeConversationMomentum(currentMessage, conversationHistory);
        contextualQuery = buildMomentumAwareQuery(currentMessage, conversationHistory, momentum.momentum);

        console.log(`  [RAG] Momentum analysis: ${(performance.now() - momentumStart).toFixed(2)}ms`);

        // Adjust maxChunks based on momentum recommendations (if deepening, get more context)
        if (momentum.recommendations.adjustChunkLimit) {
            maxChunks = Math.min(maxChunks, momentum.recommendations.adjustChunkLimit);
            console.log(`  [RAG] Adjusted chunk limit to ${maxChunks} based on ${momentum.momentum} momentum`);
        }
    }

    // Limit query length to prevent overly long embeddings (max ~500 words)
    const trimmedQuery = contextualQuery.split(' ').slice(-500).join(' ');
    console.log(`  [RAG] Query prepared (length: ${trimmedQuery.length} chars)`);

    const chunks = await searchChunksInDocuments(trimmedQuery, documentUUIDs, maxChunks);

    // Filter out chunks below similarity threshold to avoid irrelevant context
    const filterStart = performance.now();
    const relevantChunks = chunks.filter(chunk => chunk.similarity > similarityThreshold);
    console.log(`  [RAG] Filtering took ${(performance.now() - filterStart).toFixed(2)}ms, kept ${relevantChunks.length}/${chunks.length} chunks above threshold ${similarityThreshold}`);

    if (relevantChunks.length === 0) {
        console.log(`  [RAG] No relevant chunks found, returning empty context`);
        console.log(`  [RAG] buildRAGContext total: ${(performance.now() - buildStart).toFixed(2)}ms`);
        return '';
    }

    // Format chunks with natural context (no chunk numbers or artificial instructions)
    const formatStart = performance.now();
    const contextParts = relevantChunks.map((chunk) => {
        const metadata = typeof chunk.chunkMetadata === 'string'
            ? JSON.parse(chunk.chunkMetadata)
            : chunk.chunkMetadata;

        const metaInfo = [];
        if (metadata.pageNumber) metaInfo.push(`page ${metadata.pageNumber}`);
        if (metadata.section) metaInfo.push(metadata.section);

        const sourceInfo = metaInfo.length > 0 ? ` [${metaInfo.join(', ')}]` : '';

        return `${chunk.chunkContent}${sourceInfo}`;
    });
    console.log(`  [RAG] Context formatting took ${(performance.now() - formatStart).toFixed(2)}ms`);
    console.log(`  [RAG] buildRAGContext total: ${(performance.now() - buildStart).toFixed(2)}ms`);

    return `${contextParts.join('\n\n')}

Use the above information to answer the user's question. You have access to this information and should answer confidently based on it. Do not use phrases like "I don't have specific guidance" or "based on the information provided" - simply answer the question directly using this knowledge as if it were your own expertise.`;
}

/**
 * Delete a document and all its chunks
 */
export async function deleteDocument(documentUUID: string): Promise<boolean> {
    const document = await getDocumentByUUID(documentUUID);
    if (!document) {
        return false;
    }

    // Foreign key constraint will automatically delete chunks
    await db.deleteData('documents', {
        documentId: document.documentId,
    });
    return true;
}

/**
 * Get total chunk count
 */
export async function getChunkCount(): Promise<number> {
    const result = await db.rawQuery(
        'SELECT COUNT(*) as count FROM document_chunks',
        []
    );
    return (result as any).rows[0]?.count || 0;
}

/**
 * Get document count
 */
export async function getDocumentCount(): Promise<number> {
    const result = await db.rawQuery(
        'SELECT COUNT(*) as count FROM documents',
        []
    );
    return (result as any).rows[0]?.count || 0;
}
