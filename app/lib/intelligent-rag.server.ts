/**
 * Intelligent RAG system for professional-grade responses
 * Includes: HyDE, query decomposition, contextual compression, and more
 */

import { generateEmbedding } from './document.server';
import type { DocumentChunkWithSimilarity } from './document.server';
import { db } from './db.server';
import config from './config';

/**
 * HyDE (Hypothetical Document Embeddings)
 * Generate hypothetical answer, embed that instead of the query
 * This often retrieves more relevant documents than embedding the question
 */
export async function generateHypotheticalAnswer(
    query: string,
    conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
    // Build context from recent conversation
    const recentContext = conversationHistory
        .slice(-3)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

    const prompt = `${recentContext ? recentContext + '\n\n' : ''}Given the question: "${query}"

Write a detailed, professional answer to this question as if you had access to comprehensive documentation. Focus on technical accuracy and include specific terminology that would appear in authoritative sources.

Answer (2-3 sentences):`;

    try {
        // Use Ollama to generate hypothetical answer
        const response = await fetch(config.ollamaEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: config.chatModels[0].modelName, // Use first available model
                prompt,
                stream: false,
                options: {
                    temperature: 0.3, // Low temperature for focused answers
                    num_predict: 150, // Short answer
                },
            }),
        });

        const data = await response.json();
        return data.response || query; // Fallback to original query
    } catch (error) {
        console.error('HyDE generation failed, using original query:', error);
        return query;
    }
}

/**
 * Query Decomposition
 * Break complex queries into simpler sub-questions
 */
export async function decomposeQuery(query: string): Promise<string[]> {
    // Pattern-based decomposition for common query types
    const queries: string[] = [query];

    // Detect comparative queries
    if (/\b(vs|versus|compare|difference|between)\b/i.test(query)) {
        const parts = query.split(/\b(?:vs|versus|and|or|between)\b/i);
        parts.forEach((part) => {
            const cleaned = part.trim();
            if (cleaned.length > 10) {
                queries.push(cleaned);
            }
        });
    }

    // Detect multi-part queries (and/or)
    if (
        /\band\b|\bor\b/i.test(query) &&
        query.split(/\band\b|\bor\b/i).length <= 3
    ) {
        const parts = query.split(/\band\b|\bor\b/i);
        parts.forEach((part) => {
            const cleaned = part.trim();
            if (cleaned.length > 15) {
                queries.push(cleaned);
            }
        });
    }

    // Detect procedural queries
    if (/\bhow (?:do|to|can)\b/i.test(query)) {
        // Extract the main action
        const actionMatch = query.match(
            /\bhow (?:do|to|can) (?:I |we )?(.+?)(?:\?|$)/i
        );
        if (actionMatch) {
            queries.push(actionMatch[1]);
        }
    }

    return [...new Set(queries)].slice(0, 3); // Max 3 sub-queries
}

/**
 * Contextual Compression
 * Compress retrieved chunks to only relevant sentences
 */
export function compressContext(
    chunks: DocumentChunkWithSimilarity[],
    query: string
): DocumentChunkWithSimilarity[] {
    const queryTerms = new Set(
        query
            .toLowerCase()
            .split(/\W+/)
            .filter((term) => term.length > 3)
    );

    return chunks.map((chunk) => {
        const sentences = chunk.chunkContent
            .split(/[.!?]+/)
            .filter((s) => s.trim());

        // Score each sentence by relevance
        const scoredSentences = sentences.map((sentence) => {
            const sentenceTerms = sentence.toLowerCase().split(/\W+/);
            const matches = sentenceTerms.filter((term) =>
                queryTerms.has(term)
            ).length;
            const score = matches / queryTerms.size;

            return { sentence: sentence.trim(), score };
        });

        // Keep top 70% most relevant sentences
        const threshold = 0.1; // Keep sentences with >10% term match
        const relevantSentences = scoredSentences
            .filter((s) => s.score > threshold || scoredSentences.length <= 3)
            .map((s) => s.sentence);

        // If we filtered too much, keep original
        const compressed = relevantSentences.join('. ');
        const compressionRatio = compressed.length / chunk.chunkContent.length;

        // Only use compression if it's significant (>20% reduction) but not too aggressive (>60% kept)
        if (compressionRatio > 0.4 && compressionRatio < 0.8) {
            return {
                ...chunk,
                chunkContent: compressed + '.',
            };
        }

        return chunk;
    });
}

/**
 * Extract entities from conversation for context tracking
 */
export interface ConversationEntity {
    type: 'topic' | 'concept' | 'person' | 'technology';
    value: string;
    frequency: number;
}

export function extractEntities(
    conversationHistory: Array<{ role: string; content: string }>
): ConversationEntity[] {
    const entityMap = new Map<string, ConversationEntity>();

    // Common technical terms, proper nouns, and important concepts
    const messages = conversationHistory.map((m) => m.content).join(' ');

    // Extract capitalized terms (likely proper nouns)
    const properNouns =
        messages.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

    properNouns.forEach((noun) => {
        if (
            noun.length > 2 &&
            !['The', 'This', 'That', 'What', 'How'].includes(noun)
        ) {
            const key = noun.toLowerCase();
            const existing = entityMap.get(key);

            if (existing) {
                existing.frequency++;
            } else {
                entityMap.set(key, {
                    type: 'concept',
                    value: noun,
                    frequency: 1,
                });
            }
        }
    });

    // Extract technical terms (CamelCase, acronyms, tech-like patterns)
    const technicalTerms =
        messages.match(/\b(?:[A-Z]{2,}|[a-z]+[A-Z][a-z]+)\b/g) || [];

    technicalTerms.forEach((term) => {
        const key = term.toLowerCase();
        const existing = entityMap.get(key);

        if (existing) {
            existing.frequency++;
        } else {
            entityMap.set(key, {
                type: 'technology',
                value: term,
                frequency: 1,
            });
        }
    });

    return Array.from(entityMap.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10); // Top 10 entities
}

/**
 * Build intelligent context summary from conversation
 */
export function buildConversationSummary(
    conversationHistory: Array<{ role: string; content: string }>,
    maxLength: number = 500
): string {
    if (conversationHistory.length === 0) return '';

    const entities = extractEntities(conversationHistory);
    const topics = entities.filter((e) => e.frequency > 1).map((e) => e.value);

    const recentMessages = conversationHistory.slice(-5);
    const userQuestions = recentMessages
        .filter((m) => m.role === 'user')
        .map((m) => m.content);

    let summary = '';

    if (topics.length > 0) {
        summary += `Discussion topics: ${topics.join(', ')}. `;
    }

    if (userQuestions.length > 0) {
        const lastQuestion = userQuestions[userQuestions.length - 1];
        summary += `Current focus: ${lastQuestion.slice(0, 100)}`;
    }

    return summary.slice(0, maxLength);
}

/**
 * Multi-query retrieval with HyDE
 */
export async function hybridMultiQueryRetrieval(
    query: string,
    documentUUIDs: string[],
    conversationHistory: Array<{ role: string; content: string }> = [],
    limit: number = 10
): Promise<DocumentChunkWithSimilarity[]> {
    if (documentUUIDs.length === 0) return [];

    // 1. Generate HyDE answer
    const hypotheticalAnswer = await generateHypotheticalAnswer(
        query,
        conversationHistory
    );

    // 2. Decompose query
    const subQueries = await decomposeQuery(query);

    // 3. Generate embeddings for all queries
    const allQueries = [query, hypotheticalAnswer, ...subQueries];
    const embeddings = await Promise.all(
        allQueries.map((q) => generateEmbedding(q))
    );

    // 4. Search with each embedding
    const placeholders = documentUUIDs.map(() => '?').join(',');
    const allResults: DocumentChunkWithSimilarity[][] = [];

    for (const embedding of embeddings) {
        const embeddingJson = JSON.stringify(embedding);

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

        const chunks = (
            Array.isArray(result) ? result : (result as any)?.rows || []
        ) as DocumentChunkWithSimilarity[];
        allResults.push(chunks);
    }

    // 5. Merge using RRF (Reciprocal Rank Fusion)
    const { reciprocalRankFusion } = await import('./rag-advanced.server');
    const fusedResults = reciprocalRankFusion(allResults);

    // 6. Compress context
    const compressed = compressContext(fusedResults.slice(0, limit), query);

    return compressed;
}

/**
 * Build professional system prompt with conversation context
 */
export function buildProfessionalSystemPrompt(
    ragContext: string,
    conversationSummary: string,
    userRole?: string
): string {
    const roleContext = userRole || 'a professional';

    return `You are an expert assistant helping ${roleContext}. You have access to authoritative documentation and should provide accurate, professional responses.

${conversationSummary ? `Conversation context: ${conversationSummary}\n\n` : ''}${ragContext}

Guidelines for your responses:
1. **Be precise and technical**: Use proper terminology and be specific
2. **Cite sources**: Reference the numbered sources [1], [2] when using information
3. **Acknowledge uncertainty**: If information is incomplete or ambiguous, say so
4. **Structure clearly**: Use headings, bullet points, and clear sections for complex topics
5. **Provide context**: Explain why something matters, not just what it is
6. **Be actionable**: Include specific steps, examples, or recommendations when relevant

If the question cannot be answered from the provided documentation, clearly state what information is missing and suggest what would be needed to answer properly.`;
}

/**
 * Validate answer against retrieved context
 */
export function validateAnswer(
    answer: string,
    context: string,
    query: string
): {
    valid: boolean;
    confidence: 'high' | 'medium' | 'low';
    issues: string[];
} {
    const issues: string[] = [];

    // Check if answer is too short
    if (answer.length < 50) {
        issues.push('Answer may be too brief');
    }

    // Check if answer contains hedging phrases when it shouldn't
    const hedgePhrases = [
        "i don't have",
        'i cannot',
        "i'm not sure",
        "i don't know",
        'unclear',
        'cannot determine',
    ];

    const hasHedging = hedgePhrases.some((phrase) =>
        answer.toLowerCase().includes(phrase)
    );

    // Check if answer references the sources
    const hasCitations = /\[\d+\]/.test(answer);

    if (!hasCitations && context.length > 0) {
        issues.push('No citations found in answer');
    }

    // Check if answer is just repeating the question
    const queryWords = new Set(
        query
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 3)
    );
    const answerWords = new Set(
        answer
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length > 3)
    );
    const overlap = Array.from(queryWords).filter((w) =>
        answerWords.has(w)
    ).length;
    const overlapRatio = overlap / queryWords.size;

    if (overlapRatio > 0.8) {
        issues.push('Answer may just be restating the question');
    }

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low';

    if (issues.length === 0 && hasCitations && answer.length > 100) {
        confidence = 'high';
    } else if (issues.length <= 1 || (hasCitations && !hasHedging)) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    return {
        valid: issues.length <= 2,
        confidence,
        issues,
    };
}
