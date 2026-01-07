/**
 * Intelligent chat orchestrator that combines all advanced features
 */

import {
    hybridMultiQueryRetrieval,
    buildProfessionalSystemPrompt,
    buildConversationSummary,
    extractEntities,
    validateAnswer,
} from './intelligent-rag.server';
import {
    buildEnhancedRAGContext,
    formatCitationsForDisplay,
} from './rag-enhanced.server';
import { enhanceResponse } from './response-formatter';
import { detectPromptInjection, sanitizeRAGContext } from './prompt-protection';
import { getCircuitBreaker } from './circuit-breaker';
import config from './config';

export interface IntelligentChatRequest {
    message: string;
    documentUUIDs: string[];
    conversationHistory: Array<{ role: string; content: string }>;
    userRole?: string;
    useAdvancedRAG?: boolean;
    customSystemPrompt?: string;
    modelId?: number;
    chatId?: number;
}

export interface IntelligentChatResponse {
    answer: string;
    citations?: string;
    confidence: 'high' | 'medium' | 'low';
    metadata: {
        processingTime: number;
        chunksUsed: number;
        avgSimilarity: number;
        usedHyDE: boolean;
        entities: Array<{ value: string; type: string }>;
        validationIssues: string[];
    };
}

/**
 * Generate intelligent response with all advanced features
 */
export async function generateIntelligentResponse(
    request: IntelligentChatRequest
): Promise<IntelligentChatResponse> {
    const startTime = Date.now();
    const {
        message,
        documentUUIDs,
        conversationHistory,
        userRole,
        useAdvancedRAG,
        customSystemPrompt,
        modelId,
        chatId,
    } = request;

    console.log(
        `  [INTELLIGENT-RAG] Starting (useAdvancedRAG=${useAdvancedRAG}, docs=${documentUUIDs.length})`
    );

    // 1. Security: Check for prompt injection
    const securityStart = Date.now();
    const injectionWarning = detectPromptInjection(message);
    console.log(
        `  [INTELLIGENT-RAG] Security check: ${Date.now() - securityStart}ms`
    );
    if (injectionWarning) {
        return {
            answer: injectionWarning,
            confidence: 'high',
            metadata: {
                processingTime: Date.now() - startTime,
                chunksUsed: 0,
                avgSimilarity: 0,
                usedHyDE: false,
                entities: [],
                validationIssues: ['Prompt injection detected'],
            },
        };
    }

    // 2. Extract entities from conversation
    const entitiesStart = Date.now();
    const entities = extractEntities([
        ...conversationHistory,
        { role: 'user', content: message },
    ]);
    console.log(
        `  [INTELLIGENT-RAG] Entity extraction: ${Date.now() - entitiesStart}ms`
    );

    // 3. Build conversation summary
    const summaryStart = Date.now();
    const conversationSummary = buildConversationSummary(conversationHistory);
    console.log(
        `  [INTELLIGENT-RAG] Conversation summary: ${Date.now() - summaryStart}ms`
    );

    // 4. Retrieve context with intelligent RAG
    let ragResult;
    let usedHyDE = false;

    if (useAdvancedRAG && documentUUIDs.length > 0) {
        // Use HyDE + multi-query retrieval
        usedHyDE = true;
        const hydeStart = Date.now();
        console.log(
            `  [INTELLIGENT-RAG] Starting HyDE multi-query retrieval...`
        );
        const chunks = await hybridMultiQueryRetrieval(
            message,
            documentUUIDs,
            conversationHistory,
            config.rag.maxContextChunks
        );
        console.log(
            `  [INTELLIGENT-RAG] HyDE multi-query: ${Date.now() - hydeStart}ms`
        );

        // Build enhanced context with citations
        const contextStart = Date.now();
        ragResult = await buildEnhancedRAGContext(
            message,
            documentUUIDs,
            config.rag.maxContextChunks,
            config.rag.minSimilarityThreshold
        );
        console.log(
            `  [INTELLIGENT-RAG] Enhanced context build: ${Date.now() - contextStart}ms`
        );
    } else if (documentUUIDs.length > 0) {
        // Standard enhanced RAG
        const ragStart = Date.now();
        console.log(`  [INTELLIGENT-RAG] Starting standard enhanced RAG...`);
        ragResult = await buildEnhancedRAGContext(
            message,
            documentUUIDs,
            config.rag.maxContextChunks,
            config.rag.minSimilarityThreshold
        );
        console.log(
            `  [INTELLIGENT-RAG] Standard RAG: ${Date.now() - ragStart}ms`
        );
    } else {
        // No documents selected
        ragResult = {
            context: '',
            citations: [],
            confidence: 'low' as const,
            confidenceScore: 0,
            metadata: {
                chunks: 0,
                avgSimilarity: 0,
                time: 0,
                hasLowConfidence: true,
            },
        };
    }

    // 5. Sanitize RAG context
    const sanitizeStart = Date.now();
    let sanitizedContext = config.security.enablePromptInjectionProtection
        ? sanitizeRAGContext(ragResult.context)
        : ragResult.context;
    console.log(
        `  [INTELLIGENT-RAG] Context sanitization: ${Date.now() - sanitizeStart}ms`
    );

    // 6. Build professional system prompt
    const promptStart = Date.now();
    const systemPrompt = customSystemPrompt
        ? `${customSystemPrompt}\n\n${conversationSummary ? `Conversation context: ${conversationSummary}\n\n` : ''}${sanitizedContext}`
        : buildProfessionalSystemPrompt(
              sanitizedContext,
              conversationSummary,
              userRole
          );
    console.log(
        `  [INTELLIGENT-RAG] System prompt build: ${Date.now() - promptStart}ms`
    );

    // 7. Generate response with circuit breaker
    const llmStart = Date.now();
    console.log(`  [INTELLIGENT-RAG] Starting LLM call (non-streaming)...`);
    const breaker = getCircuitBreaker('ollama-chat', {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
    });

    let rawAnswer: string;
    try {
        rawAnswer = await breaker.execute(async () => {
            return await callOllamaChat(
                systemPrompt,
                message,
                conversationHistory
            );
        });
        console.log(
            `  [INTELLIGENT-RAG] LLM call completed: ${Date.now() - llmStart}ms`
        );
    } catch (error) {
        console.error('Chat generation failed:', error);
        return {
            answer: 'I apologize, but I am currently unable to generate a response. The service may be temporarily unavailable. Please try again in a moment.',
            confidence: 'low',
            metadata: {
                processingTime: Date.now() - startTime,
                chunksUsed: ragResult.metadata.chunks,
                avgSimilarity: ragResult.metadata.avgSimilarity,
                usedHyDE,
                entities,
                validationIssues: ['Service unavailable'],
            },
        };
    }

    // 8. Validate answer
    const validationStart = Date.now();
    const validation = validateAnswer(rawAnswer, sanitizedContext, message);
    console.log(
        `  [INTELLIGENT-RAG] Answer validation: ${Date.now() - validationStart}ms`
    );

    // 9. Enhance response
    const enhanceStart = Date.now();
    const enhanced = enhanceResponse(rawAnswer, {
        query: message,
        entities,
        confidenceLevel: validation.confidence,
        addSummary: rawAnswer.split(/\s+/).length > 300,
        addFollowUps: entities.length > 0,
        addDisclaimer: true,
    });
    console.log(
        `  [INTELLIGENT-RAG] Response enhancement: ${Date.now() - enhanceStart}ms`
    );

    // 10. Format citations
    const citationStart = Date.now();
    const citationText =
        ragResult.citations.length > 0
            ? formatCitationsForDisplay(ragResult.citations)
            : undefined;
    console.log(
        `  [INTELLIGENT-RAG] Citation formatting: ${Date.now() - citationStart}ms`
    );

    const totalTime = Date.now() - startTime;
    console.log(`  [INTELLIGENT-RAG] TOTAL TIME: ${totalTime}ms\n`);

    return {
        answer: enhanced.content,
        citations: citationText,
        confidence: validation.confidence,
        metadata: {
            processingTime: totalTime,
            chunksUsed: ragResult.metadata.chunks,
            avgSimilarity: ragResult.metadata.avgSimilarity,
            usedHyDE,
            entities,
            validationIssues: validation.issues,
        },
    };
}

/**
 * Call Ollama chat API
 */
async function callOllamaChat(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
    // Build message history
    // Use more context for better conversation coherence
    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-30), // Last 30 messages (15 exchanges) for better context
        { role: 'user', content: userMessage },
    ];

    const response = await fetch(config.ollamaEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.chatModels[0].modelName,
            messages,
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9,
                num_ctx: config.maxContext,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();

    return data.message?.content || data.response || '';
}

/**
 * Stream intelligent response (for real-time UI updates)
 */
export async function* streamIntelligentResponse(
    request: IntelligentChatRequest
): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();
    const {
        message,
        documentUUIDs,
        conversationHistory,
        userRole,
        useAdvancedRAG,
        customSystemPrompt,
    } = request;

    // Security check
    const injectionWarning = detectPromptInjection(message);
    if (injectionWarning) {
        yield injectionWarning;
        return;
    }

    // Build context (same as non-streaming)
    const entities = extractEntities([
        ...conversationHistory,
        { role: 'user', content: message },
    ]);
    const conversationSummary = buildConversationSummary(conversationHistory);

    let ragResult;
    if (useAdvancedRAG && documentUUIDs.length > 0) {
        const chunks = await hybridMultiQueryRetrieval(
            message,
            documentUUIDs,
            conversationHistory,
            config.rag.maxContextChunks
        );
        ragResult = await buildEnhancedRAGContext(
            message,
            documentUUIDs,
            config.rag.maxContextChunks,
            config.rag.minSimilarityThreshold
        );
    } else if (documentUUIDs.length > 0) {
        ragResult = await buildEnhancedRAGContext(
            message,
            documentUUIDs,
            config.rag.maxContextChunks,
            config.rag.minSimilarityThreshold
        );
    } else {
        ragResult = {
            context: '',
            citations: [],
            confidence: 'low' as const,
            confidenceScore: 0,
            metadata: {
                chunks: 0,
                avgSimilarity: 0,
                time: 0,
                hasLowConfidence: true,
            },
        };
    }

    const sanitizedContext = config.security.enablePromptInjectionProtection
        ? sanitizeRAGContext(ragResult.context)
        : ragResult.context;

    const systemPrompt = customSystemPrompt
        ? `${customSystemPrompt}\n\n${conversationSummary ? `Conversation context: ${conversationSummary}\n\n` : ''}${sanitizedContext}`
        : buildProfessionalSystemPrompt(
              sanitizedContext,
              conversationSummary,
              userRole
          );

    // Stream response
    // Use more context for better conversation coherence
    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-30), // Last 30 messages (15 exchanges) for better context
        { role: 'user', content: message },
    ];

    const response = await fetch(config.ollamaEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.chatModels[0].modelName,
            messages,
            stream: true,
            options: {
                temperature: 0.7,
                top_p: 0.9,
                num_ctx: config.maxContext,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const data = JSON.parse(line);
                    if (data.message?.content) {
                        yield data.message.content;
                    } else if (data.response) {
                        yield data.response;
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        }
    }

    // Add citations at the end
    if (ragResult.citations.length > 0) {
        const citationText = formatCitationsForDisplay(ragResult.citations);
        yield '\n\n' + citationText;
    }
}
