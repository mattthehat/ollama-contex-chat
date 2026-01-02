/**
 * Enhanced RAG with citations, confidence scoring, and smart retrieval
 */

import { db } from './db.server';
import { generateEmbedding } from './document.server';
import type { DocumentChunkWithSimilarity } from './document.server';

export interface ChunkCitation {
    chunkId: number;
    documentTitle: string;
    pageNumber?: number;
    section?: string;
    similarity: number;
    excerpt: string;
}

export interface EnhancedRAGResult {
    context: string;
    citations: ChunkCitation[];
    confidence: 'high' | 'medium' | 'low';
    confidenceScore: number;
    metadata: {
        chunks: number;
        avgSimilarity: number;
        time: number;
        hasLowConfidence: boolean;
    };
}

/**
 * Format chunks with inline citations [1], [2], etc.
 */
function formatContextWithCitations(
    chunks: DocumentChunkWithSimilarity[],
    documentTitles: Map<number, string>
): {
    context: string;
    citations: ChunkCitation[];
} {
    const citations: ChunkCitation[] = [];
    const contextParts: string[] = [];

    chunks.forEach((chunk, index) => {
        const citationNum = index + 1;
        const metadata =
            typeof chunk.chunkMetadata === 'string'
                ? JSON.parse(chunk.chunkMetadata)
                : chunk.chunkMetadata;

        // Build citation
        const citation: ChunkCitation = {
            chunkId: chunk.chunkId,
            documentTitle: documentTitles.get(chunk.chunkDocumentId) || 'Unknown Document',
            pageNumber: metadata.pageNumber,
            section: metadata.section,
            similarity: chunk.similarity,
            excerpt: chunk.chunkContent.slice(0, 100) + '...',
        };

        citations.push(citation);

        // Format context with citation marker
        let sourceLine = `[${citationNum}]`;
        if (metadata.pageNumber) sourceLine += ` (page ${metadata.pageNumber})`;
        if (metadata.section) sourceLine += ` - ${metadata.section}`;

        contextParts.push(`${chunk.chunkContent}\n${sourceLine}`);
    });

    const context = contextParts.join('\n\n---\n\n');

    return { context, citations };
}

/**
 * Calculate confidence score based on retrieval quality
 */
function calculateConfidence(chunks: DocumentChunkWithSimilarity[]): {
    level: 'high' | 'medium' | 'low';
    score: number;
} {
    if (chunks.length === 0) {
        return { level: 'low', score: 0 };
    }

    // Calculate average similarity
    const avgSimilarity =
        chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;

    // Calculate similarity variance (low variance = more consistent results)
    const variance =
        chunks.reduce(
            (sum, c) => sum + Math.pow(c.similarity - avgSimilarity, 2),
            0
        ) / chunks.length;

    const stdDev = Math.sqrt(variance);

    // Calculate confidence score (0-1)
    // High similarity + low variance = high confidence
    let score = avgSimilarity;

    // Penalty for high variance (inconsistent results)
    if (stdDev > 0.15) {
        score *= 0.8;
    }

    // Penalty for low number of chunks
    if (chunks.length < 3) {
        score *= 0.9;
    }

    // Bonus for very high top similarity
    if (chunks[0].similarity > 0.8) {
        score = Math.min(1, score * 1.1);
    }

    // Determine level
    let level: 'high' | 'medium' | 'low';
    if (score >= 0.7) {
        level = 'high';
    } else if (score >= 0.4) {
        level = 'medium';
    } else {
        level = 'low';
    }

    return { level, score };
}

/**
 * Build enhanced RAG context with citations and confidence
 */
export async function buildEnhancedRAGContext(
    query: string,
    documentUUIDs: string[],
    maxChunks: number = 5,
    similarityThreshold: number = 0.3
): Promise<EnhancedRAGResult> {
    const startTime = Date.now();

    if (documentUUIDs.length === 0) {
        return {
            context: '',
            citations: [],
            confidence: 'low',
            confidenceScore: 0,
            metadata: {
                chunks: 0,
                avgSimilarity: 0,
                time: Date.now() - startTime,
                hasLowConfidence: true,
            },
        };
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    const embeddingJson = JSON.stringify(queryEmbedding);
    const placeholders = documentUUIDs.map(() => '?').join(',');

    // Retrieve chunks with document info
    const result = await db.rawQuery(
        `SELECT
            dc.chunkId,
            dc.chunkUUID,
            dc.chunkDocumentId,
            dc.chunkContent,
            dc.chunkIndex,
            dc.chunkMetadata,
            dc.chunkCreatedAt,
            d.documentTitle,
            (1 - VEC_DISTANCE_COSINE(dc.chunkEmbedding, VEC_FromText(?))) AS similarity
        FROM document_chunks dc
        INNER JOIN documents d ON dc.chunkDocumentId = d.documentId
        WHERE d.documentUUID IN (${placeholders})
        ORDER BY similarity DESC
        LIMIT ?`,
        [embeddingJson, ...documentUUIDs, maxChunks]
    );

    const chunks = (Array.isArray(result) ? result : (result as any)?.rows || []) as (DocumentChunkWithSimilarity & { documentTitle: string })[];

    // Filter by similarity threshold
    const relevantChunks = chunks.filter(
        chunk => chunk.similarity > similarityThreshold
    );

    if (relevantChunks.length === 0) {
        return {
            context: '',
            citations: [],
            confidence: 'low',
            confidenceScore: 0,
            metadata: {
                chunks: 0,
                avgSimilarity: 0,
                time: Date.now() - startTime,
                hasLowConfidence: true,
            },
        };
    }

    // Build document title map
    const documentTitles = new Map<number, string>();
    relevantChunks.forEach(chunk => {
        documentTitles.set(chunk.chunkDocumentId, chunk.documentTitle);
    });

    // Format context with citations
    const { context, citations } = formatContextWithCitations(
        relevantChunks,
        documentTitles
    );

    // Calculate confidence
    const { level: confidence, score: confidenceScore } =
        calculateConfidence(relevantChunks);

    // Calculate metadata
    const avgSimilarity =
        relevantChunks.reduce((sum, c) => sum + c.similarity, 0) /
        relevantChunks.length;

    // Build instruction based on confidence
    let instruction = '';
    if (confidence === 'high') {
        instruction = `Use the above information to answer the user's question. The information is highly relevant and you should answer confidently based on it.`;
    } else if (confidence === 'medium') {
        instruction = `Use the above information to answer the user's question. The information may be partially relevant, so answer what you can and acknowledge any limitations.`;
    } else {
        instruction = `The above information may not be directly relevant to the user's question. If you cannot answer based on this information, clearly state "I don't have enough relevant information in the provided documents to answer this question."`;
    }

    const fullContext = `${context}\n\n---\n\n${instruction}\n\nIMPORTANT: When referencing information, cite the source using [1], [2], etc. notation shown above.`;

    return {
        context: fullContext,
        citations,
        confidence,
        confidenceScore,
        metadata: {
            chunks: relevantChunks.length,
            avgSimilarity,
            time: Date.now() - startTime,
            hasLowConfidence: confidence === 'low',
        },
    };
}

/**
 * Format citations for display to user
 */
export function formatCitationsForDisplay(citations: ChunkCitation[]): string {
    if (citations.length === 0) return '';

    const lines = ['', '**Sources:**'];

    citations.forEach((citation, index) => {
        let line = `[${index + 1}] ${citation.documentTitle}`;

        if (citation.pageNumber) {
            line += ` - Page ${citation.pageNumber}`;
        }

        if (citation.section) {
            line += ` (${citation.section})`;
        }

        lines.push(line);
    });

    return lines.join('\n');
}
