/**
 * Advanced RAG utilities for improved retrieval quality
 * Includes: multi-query, hybrid search, re-ranking, RRF, and more
 */

import { generateEmbedding } from './document.server';
import type { DocumentChunkWithSimilarity } from './document.server';
import { db } from './db.server';
import config from './config';

/**
 * Query classification types
 */
export type QueryType =
    | 'factual'
    | 'comparative'
    | 'summary'
    | 'procedural'
    | 'exploratory';

/**
 * Classify user query to determine best retrieval strategy
 */
export function classifyQuery(query: string): QueryType {
    const lowerQuery = query.toLowerCase();

    // Factual: who, what, when, where, which
    if (lowerQuery.match(/^(who|what|when|where|which|how many|how much)\s/)) {
        return 'factual';
    }

    // Comparative: compare, difference, versus, vs
    if (
        lowerQuery.match(
            /\b(compare|difference|versus|vs|better|worse|contrast)\b/
        )
    ) {
        return 'comparative';
    }

    // Summary: summarize, overview, explain
    if (lowerQuery.match(/\b(summarise|summary|overview|explain|describe)\b/)) {
        return 'summary';
    }

    // Procedural: how to, steps, procedure
    if (
        lowerQuery.match(/\b(how to|steps|procedure|process|guide|tutorial)\b/)
    ) {
        return 'procedural';
    }

    // Default: exploratory
    return 'exploratory';
}

/**
 * Generate query variations for multi-query retrieval
 * Creates different phrasings of the same question to improve recall
 */
export async function generateQueryVariations(
    originalQuery: string,
    queryType: QueryType
): Promise<string[]> {
    const variations: string[] = [originalQuery];

    // Generate variations based on query type
    switch (queryType) {
        case 'factual':
            // Rephrase as statement
            variations.push(
                originalQuery.replace(
                    /^(what|who|where|when|which)\s+(is|are|was|were)\s+/i,
                    ''
                )
            );
            break;

        case 'comparative':
            // Split into individual queries
            const parts = originalQuery.split(/\b(vs|versus|and|or)\b/i);
            if (parts.length > 1) {
                parts.forEach((part) => {
                    const cleaned = part.trim();
                    if (cleaned.length > 10) variations.push(cleaned);
                });
            }
            break;

        case 'summary':
            // Remove summary-specific words
            variations.push(
                originalQuery
                    .replace(
                        /\b(summarise|summary|overview|explain|describe)\b/gi,
                        ''
                    )
                    .trim()
            );
            break;

        case 'procedural':
            // Remove procedural markers
            variations.push(
                originalQuery
                    .replace(/\b(how to|steps to|procedure for)\b/gi, '')
                    .trim()
            );
            break;
    }

    // Remove duplicates and empty strings
    return [...new Set(variations)].filter((v) => v.length > 5);
}

/**
 * Hybrid Search: Combine vector similarity with keyword matching (BM25-like)
 * Uses MariaDB full-text search with vector search
 */
export async function hybridSearch(
    query: string,
    documentUUIDs: string[],
    limit: number = 10,
    vectorWeight: number = 0.7 // 70% vector, 30% keyword
): Promise<DocumentChunkWithSimilarity[]> {
    if (documentUUIDs.length === 0) {
        return [];
    }

    const queryEmbedding = await generateEmbedding(query);
    const embeddingJson = JSON.stringify(queryEmbedding);
    const placeholders = documentUUIDs.map(() => '?').join(',');

    // Extract keywords from query (remove stop words)
    const stopWords = new Set([
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'for',
        'of',
        'with',
        'by',
        'from',
        'as',
        'is',
        'was',
        'are',
        'were',
        'be',
        'been',
        'being',
    ]);
    const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word))
        .join(' ');

    // Perform hybrid search combining vector similarity with keyword relevance
    const result = await db.rawQuery(
        `SELECT DISTINCT
            dc.chunkId,
            dc.chunkUUID,
            dc.chunkDocumentId,
            dc.chunkContent,
            dc.chunkIndex,
            dc.chunkMetadata,
            dc.chunkCreatedAt,
            (1 - VEC_DISTANCE_COSINE(dc.chunkEmbedding, VEC_FromText(?))) AS vector_score,
            CASE
                WHEN dc.chunkContent LIKE ? THEN 1.0
                ELSE 0.0
            END AS keyword_score,
            (
                (1 - VEC_DISTANCE_COSINE(dc.chunkEmbedding, VEC_FromText(?))) * ?
                + CASE WHEN dc.chunkContent LIKE ? THEN 1.0 ELSE 0.0 END * ?
            ) AS similarity
        FROM document_chunks dc
        INNER JOIN documents d ON dc.chunkDocumentId = d.documentId
        WHERE d.documentUUID IN (${placeholders})
        ORDER BY similarity DESC
        LIMIT ?`,
        [
            embeddingJson,
            `%${keywords}%`,
            embeddingJson,
            vectorWeight,
            `%${keywords}%`,
            1 - vectorWeight,
            ...documentUUIDs,
            limit,
        ]
    );

    if (Array.isArray(result)) {
        return result as DocumentChunkWithSimilarity[];
    }

    return ((result as any)?.rows || []) as DocumentChunkWithSimilarity[];
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines multiple ranked lists into a single ranking
 * Formula: RRF(d) = Σ 1/(k + rank(d)) where k=60 is typical
 */
export function reciprocalRankFusion(
    rankedLists: DocumentChunkWithSimilarity[][],
    k: number = 60
): DocumentChunkWithSimilarity[] {
    const rrfScores = new Map<
        number,
        { chunk: DocumentChunkWithSimilarity; score: number }
    >();

    // Calculate RRF score for each chunk
    for (const list of rankedLists) {
        list.forEach((chunk, rank) => {
            const existing = rrfScores.get(chunk.chunkId);
            const rrfScore = 1 / (k + rank + 1); // rank is 0-indexed

            if (existing) {
                existing.score += rrfScore;
            } else {
                rrfScores.set(chunk.chunkId, {
                    chunk: { ...chunk },
                    score: rrfScore,
                });
            }
        });
    }

    // Sort by RRF score and update similarity to RRF score
    const results = Array.from(rrfScores.values())
        .sort((a, b) => b.score - a.score)
        .map(({ chunk, score }) => ({
            ...chunk,
            similarity: score, // Replace original similarity with RRF score
        }));

    return results;
}

/**
 * Multi-Query Retrieval
 * Generate multiple query variations and combine results using RRF
 */
export async function multiQueryRetrieval(
    query: string,
    documentUUIDs: string[],
    limit: number = 10,
    similarityThreshold: number = 0.3
): Promise<DocumentChunkWithSimilarity[]> {
    const queryType = classifyQuery(query);
    const variations = await generateQueryVariations(query, queryType);

    // Search with each query variation
    const searchResults: DocumentChunkWithSimilarity[][] = [];

    for (const variation of variations) {
        const queryEmbedding = await generateEmbedding(variation);
        const embeddingJson = JSON.stringify(queryEmbedding);
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

        const chunks = Array.isArray(result)
            ? result
            : (result as any)?.rows || [];
        searchResults.push(chunks as DocumentChunkWithSimilarity[]);
    }

    // Combine results using RRF
    const fusedResults = reciprocalRankFusion(searchResults);

    // Note: Don't filter by similarityThreshold here since RRF scores are not comparable to cosine similarity
    // RRF scores typically range from ~0.016 (top rank) down to near zero
    // Just limit to requested number of chunks
    return fusedResults.slice(0, limit);
}

/**
 * Re-rank chunks using a simple relevance score
 * In a full implementation, this would use a cross-encoder model
 * For now, we use a heuristic based on query keyword overlap
 */
export function reRankChunks(
    query: string,
    chunks: DocumentChunkWithSimilarity[]
): DocumentChunkWithSimilarity[] {
    const queryTerms = new Set(
        query
            .toLowerCase()
            .split(/\W+/)
            .filter((term) => term.length > 3)
    );

    const reranked = chunks.map((chunk) => {
        const chunkTerms = chunk.chunkContent.toLowerCase().split(/\W+/);
        const matchCount = chunkTerms.filter((term) =>
            queryTerms.has(term)
        ).length;
        const matchRatio = matchCount / queryTerms.size;

        // Combine original similarity with keyword match ratio
        // 80% original score, 20% keyword match
        const rerankedScore = chunk.similarity * 0.8 + matchRatio * 0.2;

        return {
            ...chunk,
            similarity: rerankedScore,
        };
    });

    // Sort by new score
    return reranked.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Deduplicate chunks that are too similar (same document, consecutive indices)
 * Merges consecutive chunks if they overlap significantly
 */
export function deduplicateChunks(
    chunks: DocumentChunkWithSimilarity[],
    mergeConsecutive: boolean = true
): DocumentChunkWithSimilarity[] {
    if (chunks.length === 0) return [];

    const seen = new Set<number>();
    const deduplicated: DocumentChunkWithSimilarity[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (seen.has(chunk.chunkId)) {
            continue;
        }

        seen.add(chunk.chunkId);

        // Check if next chunk is consecutive from same document
        if (mergeConsecutive && i < chunks.length - 1) {
            const nextChunk = chunks[i + 1];

            if (
                nextChunk.chunkDocumentId === chunk.chunkDocumentId &&
                Math.abs(nextChunk.chunkIndex - chunk.chunkIndex) === 1 &&
                !seen.has(nextChunk.chunkId)
            ) {
                // Merge consecutive chunks
                const merged: DocumentChunkWithSimilarity = {
                    ...chunk,
                    chunkContent:
                        chunk.chunkIndex < nextChunk.chunkIndex
                            ? `${chunk.chunkContent}\n\n${nextChunk.chunkContent}`
                            : `${nextChunk.chunkContent}\n\n${chunk.chunkContent}`,
                    similarity: Math.max(
                        chunk.similarity,
                        nextChunk.similarity
                    ),
                };

                deduplicated.push(merged);
                seen.add(nextChunk.chunkId);
                i++; // Skip next chunk since we merged it
                continue;
            }
        }

        deduplicated.push(chunk);
    }

    return deduplicated;
}

/**
 * Enhanced RAG context building with all advanced features
 */
export async function buildAdvancedRAGContext(
    currentMessage: string,
    documentUUIDs: string[],
    conversationHistory: Array<{ role: string; content: string }> = [],
    maxChunks: number = 5,
    similarityThreshold: number = 0.3,
    useMultiQuery: boolean = true,
    useHybridSearch: boolean = true,
    useReranking: boolean = true
): Promise<{ context: string; metadata: any }> {
    const startTime = Date.now();

    if (documentUUIDs.length === 0) {
        return { context: '', metadata: { chunks: 0, time: 0 } };
    }

    const queryType = classifyQuery(currentMessage);

    let chunks: DocumentChunkWithSimilarity[];

    // Choose retrieval strategy based on configuration
    if (useMultiQuery) {
        chunks = await multiQueryRetrieval(
            currentMessage,
            documentUUIDs,
            maxChunks * 2, // Get more chunks for re-ranking
            similarityThreshold
        );
    } else if (useHybridSearch) {
        chunks = await hybridSearch(
            currentMessage,
            documentUUIDs,
            maxChunks * 2
        );
    } else {
        // Standard vector search
        const queryEmbedding = await generateEmbedding(currentMessage);
        const embeddingJson = JSON.stringify(queryEmbedding);
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
            [embeddingJson, ...documentUUIDs, maxChunks * 2]
        );

        chunks = Array.isArray(result) ? result : (result as any)?.rows || [];
    }

    // Apply re-ranking if enabled
    if (useReranking && chunks.length > 0) {
        chunks = reRankChunks(currentMessage, chunks);
    }

    // Deduplicate and merge consecutive chunks
    chunks = deduplicateChunks(chunks, true);

    // When using multi-query or re-ranking, similarity scores are RRF scores (not cosine similarity)
    // RRF scores range from ~0.016 down to near zero, so don't filter by similarity threshold
    // Only apply threshold filtering for standard vector search without RRF
    const relevantChunks =
        useMultiQuery || useReranking
            ? chunks.slice(0, maxChunks)
            : chunks
                  .filter((chunk) => chunk.similarity > similarityThreshold)
                  .slice(0, maxChunks);

    if (relevantChunks.length === 0) {
        return {
            context: '',
            metadata: {
                chunks: 0,
                time: Date.now() - startTime,
                queryType,
            },
        };
    }

    const searchTime = Date.now() - startTime;
    const avgSimilarity =
        relevantChunks.reduce((sum, c) => sum + c.similarity, 0) /
        relevantChunks.length;

    // Format chunks with natural context (no chunk numbers or artificial instructions)
    const contextParts = relevantChunks.map((chunk) => {
        const metadata =
            typeof chunk.chunkMetadata === 'string'
                ? JSON.parse(chunk.chunkMetadata)
                : chunk.chunkMetadata;

        const metaInfo = [];
        if (metadata.pageNumber) metaInfo.push(`page ${metadata.pageNumber}`);
        if (metadata.section) metaInfo.push(metadata.section);

        const sourceInfo =
            metaInfo.length > 0 ? ` [${metaInfo.join(', ')}]` : '';

        return `${chunk.chunkContent}${sourceInfo}`;
    });

    const context = `${contextParts.join('\n\n')}

Use the above information to answer the user's question. You have access to this information and should answer confidently based on it. Do not use phrases like "I don't have specific guidance" or "based on the information provided" - simply answer the question directly using this knowledge as if it were your own expertise.`;

    return {
        context,
        metadata: {
            chunks: relevantChunks.length,
            time: searchTime,
            avgSimilarity,
            queryType,
            chunkIds: relevantChunks.map((c) => c.chunkId),
        },
    };
}

/**
 * Highlight query keywords in content
 * Simple implementation - in production would use more sophisticated NLP
 */
function highlightKeywords(content: string, query: string): string {
    const queryTerms = query
        .toLowerCase()
        .split(/\W+/)
        .filter((term) => term.length > 3)
        .sort((a, b) => b.length - a.length); // Sort by length to match longer terms first

    let highlighted = content;

    for (const term of queryTerms) {
        const regex = new RegExp(`\\b(${term})\\b`, 'gi');
        highlighted = highlighted.replace(regex, '**$1**');
    }

    return highlighted;
}

/**
 * Contextual embedding: Include heading hierarchy in the text being embedded
 * This improves semantic understanding by providing structural context
 */
export function buildContextualChunkText(
    chunkText: string,
    metadata: { section?: string; hierarchy?: string[] }
): string {
    const parts: string[] = [];

    // Add hierarchy as context prefix
    if (metadata.hierarchy && metadata.hierarchy.length > 0) {
        parts.push(`Context: ${metadata.hierarchy.join(' > ')}`);
    }

    // Add the actual content
    parts.push(chunkText);

    return parts.join('\n\n');
}

/**
 * Adaptive chunk size based on document type and content density
 */
export function getAdaptiveChunkSize(
    documentType: string,
    averageTokenDensity: number = 4 // chars per token
): number {
    const baseChunkSize = 700; // Increased for better semantic coherence

    switch (documentType) {
        case 'code':
            // Code has high token density, use smaller chunks
            return Math.floor(baseChunkSize * 0.7); // ~490 chars

        case 'documentation':
        case 'markdown':
            // Well-structured content, can use larger chunks
            return Math.floor(baseChunkSize * 1.2); // ~840 chars

        case 'pdf':
            // PDFs vary, use base size
            return baseChunkSize;

        case 'text':
        default:
            // Plain text, use base size
            return baseChunkSize;
    }
}
