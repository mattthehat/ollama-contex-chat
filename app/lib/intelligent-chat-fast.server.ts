/**
 * Fast-path Intelligent RAG
 * Returns basic RAG context immediately without expensive HyDE/enhancement operations
 * Designed for sub-second response times
 */

import { buildRAGContext } from './document.server';
import {
    detectPromptInjection,
    sanitizeRAGContext,
    protectSystemPrompt,
} from './prompt-protection';
import { recommendRAGStrategy } from './rag-strategy-learner.server';
import config from './config';

/**
 * Build a lightweight conversation summary for context retention
 * This is a fast, non-LLM approach that extracts key topics and recent context
 * Target: <5ms execution time
 */
export function buildLightweightConversationSummary(
    conversationHistory: Array<{ role: string; content: string }>,
    maxLength: number = 400
): string {
    if (!conversationHistory || conversationHistory.length === 0) return '';

    const summaryParts: string[] = [];

    // 1. Extract recent conversation flow (last 3 exchanges max)
    const recentMessages = conversationHistory.slice(-6); // 3 exchanges
    const recentTopics: string[] = [];

    for (const msg of recentMessages) {
        if (msg.role === 'user' && msg.content && msg.content.length > 10) {
            // Extract key phrases from user questions (first 80 chars)
            const topic = msg.content
                .slice(0, 80)
                .replace(/[?!.]+$/, '')
                .trim();
            if (topic && !recentTopics.includes(topic)) {
                recentTopics.push(topic);
            }
        }
    }

    if (recentTopics.length > 0) {
        summaryParts.push(
            `Recent questions: ${recentTopics.slice(-3).join(' → ')}`
        );
    }

    // 2. Extract key entities/terms mentioned multiple times (indicates importance)
    const allText = conversationHistory
        .map((m) => m.content || '')
        .filter((c) => c)
        .join(' ');

    if (!allText) return '';

    const wordFrequency = new Map<string, number>();

    // Find significant terms (3+ chars, not common words)
    const commonWords = new Set([
        'the',
        'and',
        'for',
        'are',
        'but',
        'not',
        'you',
        'all',
        'can',
        'her',
        'was',
        'one',
        'our',
        'out',
        'has',
        'have',
        'been',
        'were',
        'they',
        'their',
        'what',
        'when',
        'where',
        'which',
        'this',
        'that',
        'with',
        'from',
        'your',
        'will',
        'would',
        'could',
        'should',
        'there',
        'about',
        'please',
        'thank',
        'thanks',
        'help',
        'need',
        'want',
        'like',
        'just',
        'some',
        'more',
        'also',
        'how',
        'why',
        'does',
        'into',
        'very',
        'then',
    ]);

    const words = allText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    for (const word of words) {
        if (!commonWords.has(word)) {
            wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        }
    }

    // Find terms mentioned 2+ times
    const frequentTerms = Array.from(wordFrequency.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

    if (frequentTerms.length > 0) {
        summaryParts.push(`Key topics: ${frequentTerms.join(', ')}`);
    }

    // 3. Note conversation length for context
    const exchanges = Math.floor(conversationHistory.length / 2);
    if (exchanges > 2) {
        summaryParts.push(`(${exchanges} exchanges in this conversation)`);
    }

    // 4. If the last assistant message was substantial, note what was discussed
    const lastAssistant = conversationHistory
        .filter((m) => m.role === 'assistant' && m.content)
        .pop();

    if (
        lastAssistant &&
        lastAssistant.content &&
        lastAssistant.content.length > 100
    ) {
        // Extract first sentence of last response as context
        const sentences = lastAssistant.content.split(/[.!?]\s/);
        const firstSentence = sentences[0]?.slice(0, 100);
        if (firstSentence) {
            summaryParts.push(`Last response covered: ${firstSentence}...`);
        }
    }

    // 5. Extract the original incident/question from first user message (critical for follow-ups)
    const firstUserMessage = conversationHistory.find(
        (m) => m.role === 'user' && m.content
    );
    if (
        firstUserMessage &&
        firstUserMessage.content &&
        conversationHistory.length > 2
    ) {
        // Keep the core question/incident for context in follow-ups
        const incident = firstUserMessage.content
            .slice(0, 150)
            .replace(/[?!.]+$/, '')
            .trim();
        if (incident.length > 20) {
            summaryParts.push(`Original incident: ${incident}`);
        }
    }

    const summary = summaryParts.join('. ');
    return summary.slice(0, maxLength);
}

export interface FastIntelligentChatRequest {
    message: string;
    documentUUIDs: string[];
    conversationHistory: Array<{ role: string; content: string }>;
    customSystemPrompt?: string;
    maxChunks?: number;
    similarityThreshold?: number;
    modelId?: number;
    chatId?: number;
}

export interface FastIntelligentChatResponse {
    ragContext: string;
    systemPrompt: string;
    metadata: {
        processingTime: number;
        chunksUsed: number;
        skippedHyDE: boolean;
        skippedEnhancement: boolean;
    };
}

/**
 * Generate fast RAG context without expensive operations
 * Target: <500ms for most queries
 */
export async function generateFastIntelligentContext(
    request: FastIntelligentChatRequest
): Promise<FastIntelligentChatResponse> {
    const startTime = Date.now();
    const {
        message,
        documentUUIDs,
        conversationHistory,
        customSystemPrompt,
        maxChunks = config.rag.maxContextChunks,
        similarityThreshold = config.rag.minSimilarityThreshold,
        modelId,
        chatId,
    } = request;

    console.log(
        `  [FAST-RAG] Starting fast path (docs=${documentUUIDs.length}, history=${conversationHistory?.length || 0} messages)`
    );

    // Debug: Log conversation history to verify it's being passed
    if (conversationHistory && conversationHistory.length > 0) {
        console.log(`  [FAST-RAG] *** CONVERSATION HISTORY RECEIVED ***`);
        conversationHistory.slice(-4).forEach((m, i) => {
            const preview = (m.content || '').slice(0, 100).replace(/\n/g, ' ');
            console.log(`  [FAST-RAG]   [${i}] ${m.role}: "${preview}..."`);
        });
    } else {
        console.log(`  [FAST-RAG] *** NO CONVERSATION HISTORY ***`);
    }

    // Debug: Log conversation history summary
    if (conversationHistory && conversationHistory.length > 0) {
        const recentMsgs = conversationHistory
            .slice(-4)
            .map((m) => `${m.role}: ${(m.content || '').slice(0, 50)}...`);
        console.log(`  [FAST-RAG] Recent history: ${recentMsgs.join(' | ')}`);
    }

    // 1. Quick security check
    const securityStart = Date.now();
    const injectionWarning = detectPromptInjection(message);
    if (injectionWarning) {
        console.log(
            `  [FAST-RAG] Security check failed: ${Date.now() - securityStart}ms`
        );
        return {
            ragContext: '',
            systemPrompt: injectionWarning,
            metadata: {
                processingTime: Date.now() - startTime,
                chunksUsed: 0,
                skippedHyDE: true,
                skippedEnhancement: true,
            },
        };
    }
    console.log(`  [FAST-RAG] Security check: ${Date.now() - securityStart}ms`);

    // 2. Build basic RAG context (no HyDE, no multi-query, no reranking)
    let ragContext = '';
    let chunksUsed = 0;

    if (documentUUIDs.length > 0) {
        const ragStart = Date.now();
        console.log(`  [FAST-RAG] Building basic RAG context...`);

        // Use basic RAG without advanced features
        const rawRAGContext = await buildRAGContext(
            message,
            documentUUIDs,
            conversationHistory,
            maxChunks,
            similarityThreshold,
            false // useAdvanced = false (no HyDE, no reranking)
        );

        ragContext = config.security.enablePromptInjectionProtection
            ? sanitizeRAGContext(rawRAGContext)
            : rawRAGContext;

        // Estimate chunks from context (rough approximation)
        chunksUsed = ragContext
            ? Math.min(maxChunks, Math.ceil(ragContext.length / 500))
            : 0;

        console.log(
            `  [FAST-RAG] Basic RAG: ${Date.now() - ragStart}ms (${chunksUsed} chunks)`
        );
    } else {
        console.log(`  [FAST-RAG] No documents, skipping RAG`);
    }

    // 3. Build system prompt WITH lightweight conversation context
    // This is critical for maintaining context without expensive LLM calls
    const promptStart = Date.now();

    // Build lightweight conversation summary (fast, no LLM)
    const conversationSummary =
        buildLightweightConversationSummary(conversationHistory);
    console.log(
        `  [FAST-RAG] Conversation summary: "${conversationSummary.slice(0, 100)}..."`
    );

    let contextParts: string[] = [];

    // Add conversation context PROMINENTLY if we have history
    // This ensures the model knows exactly what incident/topic is being discussed
    if (conversationHistory && conversationHistory.length > 0) {
        // Include actual recent messages for full context, not just summary
        const recentExchanges = conversationHistory.slice(-6); // Last 3 exchanges
        const formattedHistory = recentExchanges
            .map((m) => {
                const role = m.role === 'user' ? 'USER' : 'ASSISTANT';
                // Truncate very long messages but keep enough context
                const content =
                    (m.content || '').length > 800
                        ? (m.content || '').slice(0, 800) + '...[truncated]'
                        : m.content || '';
                return `${role}: ${content}`;
            })
            .join('\n\n');

        contextParts.push(
            `## CURRENT CONVERSATION CONTEXT (CRITICAL - USE THIS)\n` +
                `The user is continuing a conversation. When they say "the incident", "this", "the letter", etc., ` +
                `they are referring to the context below. DO NOT ask for clarification - use this context:\n\n` +
                `${formattedHistory}\n\n` +
                `Summary: ${conversationSummary}`
        );
    }

    // Add RAG context if available
    if (ragContext) {
        contextParts.push(`## REFERENCE DOCUMENTS:\n${ragContext}`);
    }

    const combinedContext = contextParts.join('\n\n---\n\n');

    const systemPrompt = customSystemPrompt
        ? `${customSystemPrompt}${combinedContext ? `\n\n${combinedContext}` : ''}`
        : protectSystemPrompt(
              combinedContext
                  ? `You are a helpful AI assistant. You are in an ongoing conversation with the user. 
                  
IMPORTANT: Maintain context from the conversation. Reference previous topics when relevant. 
Don't repeat information you've already provided unless asked.

${combinedContext}`
                  : 'You are a helpful AI assistant.'
          );
    console.log(
        `  [FAST-RAG] System prompt build: ${Date.now() - promptStart}ms`
    );

    const totalTime = Date.now() - startTime;
    console.log(
        `  [FAST-RAG] TOTAL TIME: ${totalTime}ms (skipped HyDE & enhancement)\n`
    );

    return {
        ragContext,
        systemPrompt,
        metadata: {
            processingTime: totalTime,
            chunksUsed,
            skippedHyDE: true,
            skippedEnhancement: true,
        },
    };
}

/**
 * Check if query should use fast path using learned strategy
 * Now powered by performance-based recommendations
 */
export function shouldUseFastPath(
    message: string,
    useAdvancedRAG: boolean,
    conversationLength: number,
    documentCount: number = 1
): boolean {
    // Use the learned strategy recommender
    const recommendation = recommendRAGStrategy(
        message,
        conversationLength,
        documentCount,
        useAdvancedRAG
    );

    const useFastPath = !recommendation.useHyDE;

    console.log(
        `  [RAG-STRATEGY] ${useFastPath ? 'FAST PATH' : 'HyDE PATH'}: ${recommendation.reason} (confidence: ${(recommendation.confidence * 100).toFixed(0)}%)`
    );

    return useFastPath;
}

/**
 * Background enhancement service (for future implementation)
 * This would run after the response is sent to enhance it with:
 * - HyDE-based retrieval
 * - Entity extraction
 * - Confidence scoring
 * - Citation formatting
 * - Follow-up suggestions
 */
export async function enhanceResponseInBackground(
    chatId: string,
    message: string,
    basicResponse: string,
    documentUUIDs: string[],
    conversationHistory: Array<{ role: string; content: string }>
): Promise<void> {
    console.log(
        `  [BACKGROUND-ENHANCE] Starting background enhancement for chat ${chatId}`
    );

    // TODO: Implement background enhancement
    // This could:
    // 1. Run HyDE retrieval to find better context
    // 2. Extract entities and add them to response
    // 3. Calculate confidence score
    // 4. Format citations nicely
    // 5. Generate follow-up questions
    // 6. Store enhanced version in database
    // 7. Send update via WebSocket/SSE if client is still connected

    // For now, just log that we would enhance
    console.log(
        `  [BACKGROUND-ENHANCE] Would enhance response with HyDE, entities, citations, etc.`
    );
    console.log(
        `  [BACKGROUND-ENHANCE] Message: "${message.substring(0, 50)}..."`
    );
    console.log(
        `  [BACKGROUND-ENHANCE] Basic response length: ${basicResponse.length} chars`
    );
}
