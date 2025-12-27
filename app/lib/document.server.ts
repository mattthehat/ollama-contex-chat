import { db } from './db.server';
import config from './config';
import { randomUUID } from 'crypto';
import pdf from 'pdf-parse';
import pdf2md from '@opendocsg/pdf2md';

// Simple in-memory LRU cache for embeddings
class EmbeddingCache {
    private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
    private maxSize: number = 500;
    private ttl: number = 1000 * 60 * 15; // 15 minutes

    get(key: string): number[] | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.embedding;
    }

    set(key: string, embedding: number[]): void {
        // If cache is full, remove oldest entry
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(key, { embedding, timestamp: Date.now() });
    }

    getStats(): { size: number; maxSize: number; hitRate?: number } {
        return { size: this.cache.size, maxSize: this.maxSize };
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
    // Normalize text for cache key
    const cacheKey = text.trim().toLowerCase().slice(0, 1000); // Use first 1000 chars for key

    // Check cache first
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    // Truncate text to max token limit for embedding model
    // nomic-embed-text has 2048 token limit (despite num_ctx=8192, model architecture is 2048)
    // CRITICAL: Use absolute maximum of 512 tokens (2048/4) = 2048 chars to be ultra-safe
    // This accounts for worst-case tokenization where each token is only 2 chars
    const maxChars = 2048;
    const truncatedText = text.length > maxChars
        ? text.slice(0, maxChars)
        : text;

    if (text.length > maxChars) {
        console.warn(`[Embedding] Text truncated from ${text.length} to ${maxChars} chars (${Math.round(text.length/4)} → ${Math.round(maxChars/4)} est. tokens)`);
    }

    const response = await fetch('http://localhost:11434/api/embed', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.embedModel,
            input: truncatedText,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Embedding API error:', response.status, errorText);
        throw new Error(`Failed to generate embedding: ${response.status} ${errorText}`);
    }

    const data = await response.json();

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

    return embedding;
}

/**
 * Generate embeddings in parallel with controlled concurrency
 * Processes chunks in batches to avoid overwhelming the embedding service
 */
async function generateEmbeddingsInBatches(
    chunks: string[],
    batchSize: number = 10
): Promise<number[][]> {
    const results: number[][] = [];
    const startTime = Date.now();

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchEmbeddings = await Promise.all(
            batch.map(chunk => generateEmbedding(chunk))
        );
        results.push(...batchEmbeddings);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Embedding] Generated ${chunks.length} embeddings in ${totalTime}ms (${Math.round(totalTime / chunks.length)}ms/chunk avg)`);

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
 * Ultra-conservative 300 char limit to guarantee fit within 2048 token limit
 */
export function chunkText(
    text: string,
    maxChunkSize: number = 300,
    overlap: number = 50
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
 * Ultra-conservative 300 chars to account for code's high token density
 */
export function chunkCode(
    code: string,
    maxChunkSize: number = 300,
    overlap: number = 50
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
 * Ultra-conservative 300 char hard limit with strict enforcement
 */
export function chunkMarkdown(
    markdown: string,
    maxChunkSize: number = 300
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

    // Use markdown-aware chunking for better semantic coherence
    // This ensures chunks preserve heading context and structure
    let chunksWithMetadata: Array<{ text: string; metadata: { section?: string; hierarchy?: string[] } }>;
    if (documentType === 'code') {
        const codeChunks = chunkCode(markdownContent);
        chunksWithMetadata = codeChunks.map(text => ({ text, metadata: {} }));
    } else {
        // Use markdown chunking for all types since we converted to markdown
        chunksWithMetadata = chunkMarkdown(markdownContent);
    }

    const metadata: DocumentMetadata = {
        fileSize: content.length,
    };

    await db.insertData('documents', {
        documentUUID,
        documentTitle: title,
        documentType,
        documentTotalChunks: chunksWithMetadata.length,
        documentMarkdown: markdownContent,
        documentMetadata: JSON.stringify(metadata),
    });

    // Get the created document ID
    const document = await getDocumentByUUID(documentUUID);
    if (!document) {
        throw new Error('Failed to create document');
    }

    // Extract text for embeddings
    const chunkTexts = chunksWithMetadata.map(c => c.text);

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
    }

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

    // Use markdown-based chunking to preserve semantic structure
    // This is superior to plain text chunking as it maintains headings and context
    const chunksWithMetadata = chunkMarkdown(markdownContent);

    const metadata: DocumentMetadata = {
        pageCount,
        fileSize: pdfBuffer.length,
    };

    await db.insertData('documents', {
        documentUUID,
        documentTitle: title,
        documentType: 'pdf',
        documentTotalChunks: chunksWithMetadata.length,
        documentMarkdown: markdownContent,
        documentMetadata: JSON.stringify(metadata),
    });

    // Get the created document ID
    const document = await getDocumentByUUID(documentUUID);
    if (!document) {
        throw new Error('Failed to create document');
    }

    // Extract text for embeddings
    const chunkTexts = chunksWithMetadata.map(c => c.text);

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
    }

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
    if (documentUUIDs.length === 0) {
        return [];
    }

    const queryEmbedding = await generateEmbedding(query);
    const embeddingJson = JSON.stringify(queryEmbedding);

    // Create placeholders for document UUIDs
    const placeholders = documentUUIDs.map(() => '?').join(',');

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

    if (Array.isArray(result)) {
        return result as DocumentChunkWithSimilarity[];
    }

    return ((result as any)?.rows || []) as DocumentChunkWithSimilarity[];
}

/**
 * Build RAG context from selected documents with conversation history
 * Retrieves relevant chunks and formats them for inclusion in the system prompt
 */
export async function buildRAGContext(
    currentMessage: string,
    documentUUIDs: string[],
    conversationHistory: Array<{ role: string; content: string }> = [],
    maxChunks: number = 5,
    similarityThreshold: number = 0.3
): Promise<string> {
    const startTime = Date.now();

    if (documentUUIDs.length === 0) {
        return '';
    }

    // Build weighted query: current message is most important
    let contextualQuery = currentMessage;

    // Add recent user messages (not assistant responses) with lower weight
    const recentUserMessages = conversationHistory
        .filter(m => m.role === 'user')
        .slice(-2)
        .map(m => m.content);

    if (recentUserMessages.length > 0) {
        // Current message gets more weight by appearing twice
        contextualQuery = `${currentMessage} ${currentMessage} ${recentUserMessages.join(' ')}`;
    }

    // Limit query length to prevent overly long embeddings (max ~500 words)
    const trimmedQuery = contextualQuery.split(' ').slice(-500).join(' ');

    const chunks = await searchChunksInDocuments(trimmedQuery, documentUUIDs, maxChunks);

    // Filter out chunks below similarity threshold to avoid irrelevant context
    const relevantChunks = chunks.filter(chunk => chunk.similarity > similarityThreshold);

    if (relevantChunks.length === 0) {
        console.log(`[RAG] No chunks above similarity threshold ${similarityThreshold}`);
        return '';
    }

    const searchTime = Date.now() - startTime;
    const avgSimilarity = relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length;

    console.log(`[RAG] Search: ${searchTime}ms | Chunks: ${relevantChunks.length}/${chunks.length} | Avg Similarity: ${avgSimilarity.toFixed(3)}`);

    // Format chunks into a context string with enhanced metadata
    const contextParts = relevantChunks.map((chunk, index) => {
        const metadata = typeof chunk.chunkMetadata === 'string'
            ? JSON.parse(chunk.chunkMetadata)
            : chunk.chunkMetadata;

        const metaInfo = [];
        if (metadata.pageNumber) metaInfo.push(`Page ${metadata.pageNumber}`);
        if (metadata.section) metaInfo.push(`Section: ${metadata.section}`);
        if (metadata.hierarchy) metaInfo.push(`Path: ${metadata.hierarchy.join(' > ')}`);

        const metaStr = metaInfo.length > 0 ? ` (${metaInfo.join(', ')})` : '';
        const similarityPercent = Math.round(chunk.similarity * 100);

        return `### Document Chunk ${index + 1}${metaStr}
**Relevance:** ${similarityPercent}%

${chunk.chunkContent}`;
    });

    return `# Relevant Context from Library Documents

The following ${relevantChunks.length} chunks have been retrieved from your selected documents (ordered by relevance):

${contextParts.join('\n\n---\n\n')}

**Instructions:**
- Use the above context to inform your response when relevant
- Cite specific chunks when using information (e.g., "According to Chunk 2...")
- If the context doesn't contain relevant information, rely on your general knowledge`;
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
