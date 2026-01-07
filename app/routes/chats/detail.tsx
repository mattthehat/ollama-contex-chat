import type { Route } from './+types/detail';

import { useFetcher } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useOllama } from '~/hooks/useOllama';
import Spinner from '~/components/Loader';
import ChatHistory from '~/components/ChatHistory';
import ChatMessage from '~/components/ChatMessage';
import { getChatMessages, saveMessage } from '~/lib/chat.server';
import {
    buildMessagesForOllama,
    estimateTokenCount,
    calculateTotalTokens,
} from '~/lib/chat';
import { getAllDocuments, buildRAGContext } from '~/lib/document.server';
import { getAllCustomModels, getCustomModelById } from '~/lib/models.server';
import {
    detectPromptInjection,
    sanitizeRAGContext,
    protectSystemPrompt,
} from '~/lib/prompt-protection';
import {
    createTimingTracker,
    logPerformance,
    type TimingTracker,
} from '~/lib/performance-logger.server';

export const loader = async ({ params }: Route.LoaderArgs) => {
    const { chatId } = params;
    const messages = await getChatMessages(chatId || '');
    const libraryDocuments = await getAllDocuments();
    const customModels = await getAllCustomModels();

    return { messages, libraryDocuments, customModels, chatId };
};

export const meta = ({ params }: Route.MetaArgs) => {
    return [
        { title: `Chat Detail - Ollama Context Chat (${params.chatId})` },
        { name: 'description', content: 'Chat with Ollama AI' },
    ];
};

type ActionData = {
    errors: {
        message: string | null;
        model: string | null;
    };
    message: string | null;
    model: string | null;
    selectedDocs: string[];
    ragContext?: string;
    systemPrompt?: string;
    serverProcessingTime?: number;
    modelConfig?: {
        temperature: number;
        top_p: number;
        top_k: number;
        repeat_penalty: number;
        seed?: number;
    };
};

export const action = async ({ request, params }: Route.ActionArgs) => {
    const tracker = createTimingTracker();
    console.log('\n=== ACTION STARTED ===');

    const formData = await request.formData();
    const intent = formData.get('intent') as string;
    const { chatId } = params;

    // Handle saving messages after streaming completes
    if (intent === 'save') {
        const userMessage = formData.get('userMessage') as string;
        const assistantMessage = formData.get('assistantMessage') as string;

        if (chatId && userMessage && assistantMessage) {
            await saveMessage(chatId, userMessage, assistantMessage);
        }

        return { success: true };
    }

    // Handle initial message submission
    const message = formData.get('message') as string;
    const customModelId = formData.get('customModelId') as string;
    console.log(
        `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Form data parsed`
    );

    if (!message?.trim()) {
        return {
            errors: { message: 'Please enter a message', model: null },
            message: null,
            model: null,
            selectedDocs: [],
        };
    } else if (!customModelId?.trim()) {
        return {
            errors: { message: null, model: 'Please select a model' },
            message: null,
            model: null,
            selectedDocs: [],
        };
    }

    // PERFORMANCE: Get the custom model configuration first (fast database lookup)
    tracker.modelLookupStart = performance.now();
    const customModel = await getCustomModelById(parseInt(customModelId));
    tracker.modelLookupEnd = performance.now();
    console.log(
        `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Model lookup took ${(tracker.modelLookupEnd - tracker.modelLookupStart).toFixed(2)}ms`
    );
    if (!customModel) {
        return {
            errors: { message: null, model: 'Model not found' },
            message: null,
            model: null,
            selectedDocs: [],
        };
    }

    // Get conversation history from client (has latest messages not yet saved to DB)
    // Fall back to DB if not provided
    const clientHistoryJson = formData.get('conversationHistory') as string;
    let conversationHistory: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }> = [];

    if (clientHistoryJson) {
        try {
            conversationHistory = JSON.parse(clientHistoryJson);
            console.log(
                `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Using client-provided history (${conversationHistory.length} messages)`
            );
        } catch (e) {
            console.log(
                `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Failed to parse client history, falling back to DB`
            );
            conversationHistory = chatId ? await getChatMessages(chatId) : [];
        }
    } else {
        conversationHistory = chatId ? await getChatMessages(chatId) : [];
        console.log(
            `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Using DB history (${conversationHistory.length} messages)`
        );
    }

    // PERFORMANCE: Run prompt injection check and document fetching in parallel
    tracker.parallelStart = performance.now();
    const [injectionWarning, documentIds] = await Promise.all([
        // Check for prompt injection attempts (fast regex checks)
        Promise.resolve(detectPromptInjection(message)),
        // Get documents associated with this model
        (async () => {
            const { getModelDocumentIds } = await import('~/lib/models.server');
            return getModelDocumentIds(customModel.modelId);
        })(),
    ]);
    tracker.parallelEnd = performance.now();
    console.log(
        `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Parallel operations took ${(tracker.parallelEnd - tracker.parallelStart).toFixed(2)}ms`
    );

    if (injectionWarning) {
        return {
            errors: { message: injectionWarning, model: null },
            message: null,
            model: null,
            selectedDocs: [],
        };
    }

    // PERFORMANCE: Check if query needs clarification (fast, no LLM calls)
    const { detectClarificationNeeds, buildClarificationMessage } =
        await import('~/lib/query-clarification.server');
    const clarification = detectClarificationNeeds(
        message,
        conversationHistory
    );

    if (clarification.needed) {
        console.log(
            `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Query needs clarification - skipping expensive RAG`
        );
        return {
            errors: { message: null, model: null },
            message,
            model: customModel.modelName,
            selectedDocs: [],
            ragContext: buildClarificationMessage(clarification),
            systemPrompt: 'Clarification needed',
            serverProcessingTime: performance.now() - tracker.startTime,
        };
    }

    // Process the message
    {
        // Convert document IDs to UUIDs (only if we have documents)
        let selectedDocs: string[] = [];
        if (documentIds.length > 0) {
            tracker.docConversionStart = performance.now();
            const { getAllDocuments } = await import('~/lib/document.server');
            const allDocs = await getAllDocuments();
            selectedDocs = allDocs
                .filter((doc) => documentIds.includes(doc.documentId))
                .map((doc) => doc.documentUUID);
            tracker.docConversionEnd = performance.now();
            console.log(
                `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Document UUID conversion took ${(tracker.docConversionEnd - tracker.docConversionStart).toFixed(2)}ms`
            );
        } else {
            console.log(
                `[${(performance.now() - tracker.startTime).toFixed(2)}ms] No documents to process`
            );
        }

        // Use model's context configuration
        tracker.tokenCalcStart = performance.now();
        const systemPromptTokens = estimateTokenCount(customModel.systemPrompt);
        const conversationTokens = calculateTotalTokens(conversationHistory);
        const messageTokens = estimateTokenCount(message);
        const availableTokens =
            customModel.maxContextTokens * 0.7 -
            systemPromptTokens -
            conversationTokens -
            messageTokens;

        // PERFORMANCE: Calculate chunk limits efficiently
        const dynamicChunkLimit = Math.max(
            3,
            Math.min(
                customModel.ragMaxChunks,
                Math.floor(availableTokens / 500)
            )
        );
        tracker.tokenCalcEnd = performance.now();
        console.log(
            `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Token calculations took ${(tracker.tokenCalcEnd - tracker.tokenCalcStart).toFixed(2)}ms`
        );

        // Check if model has intelligent RAG enabled
        const useIntelligentRAG =
            customModel.ragUseHyDE ||
            customModel.ragEnableCitations ||
            customModel.ragEnableConfidenceScoring;

        // PERFORMANCE: Check if we should use fast path with learned strategy
        const { shouldUseFastPath } =
            await import('~/lib/intelligent-chat-fast.server');
        const useFastPath = shouldUseFastPath(
            message,
            useIntelligentRAG && customModel.ragUseHyDE,
            conversationHistory.length,
            selectedDocs.length
        );

        let ragContext = '';
        let citations = '';
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        let intelligentMetadata = null;
        let ragChunksFound = 0;

        // PERFORMANCE: Only build RAG context if we have selected documents
        // This is the most expensive operation, so skip it entirely when not needed
        if (selectedDocs.length > 0) {
            tracker.ragStart = performance.now();
            console.log(
                `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Starting RAG processing with ${selectedDocs.length} documents`
            );

            // PERFORMANCE: Use fast path for simple queries to avoid 40+ second HyDE overhead
            if (useFastPath) {
                console.log(
                    `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Using FAST PATH (skipping HyDE)`
                );
                const { generateFastIntelligentContext } =
                    await import('~/lib/intelligent-chat-fast.server');

                const result = await generateFastIntelligentContext({
                    message,
                    documentUUIDs: selectedDocs,
                    conversationHistory,
                    customSystemPrompt: customModel.systemPrompt,
                    maxChunks: dynamicChunkLimit,
                    similarityThreshold: customModel.ragSimilarityThreshold,
                    modelId: customModel.modelId,
                    chatId: undefined,
                });

                ragContext = result.ragContext;
                ragChunksFound = result.metadata.chunksUsed;
                tracker.ragEnd = performance.now();
                console.log(
                    `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Fast path completed in ${(tracker.ragEnd - tracker.ragStart).toFixed(2)}ms`
                );
            } else if (useIntelligentRAG) {
                console.log(
                    `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Using SLOW PATH intelligent RAG (with HyDE)`
                );
                // Use full intelligent RAG system (slow, 40+ seconds)
                const { generateIntelligentResponse } =
                    await import('~/lib/intelligent-chat.server');

                try {
                    const result = await generateIntelligentResponse({
                        message,
                        documentUUIDs: selectedDocs,
                        conversationHistory,
                        userRole: undefined,
                        useAdvancedRAG: customModel.ragUseHyDE,
                        customSystemPrompt: customModel.systemPrompt,
                        modelId: customModel.modelId,
                        chatId: undefined,
                    });

                    ragContext = result.answer;
                    citations = result.citations || '';
                    confidence = result.confidence;
                    intelligentMetadata = result.metadata;
                    ragChunksFound =
                        intelligentMetadata?.chunksUsed || dynamicChunkLimit;
                    tracker.ragEnd = performance.now();
                    console.log(
                        `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Intelligent RAG completed in ${(tracker.ragEnd - tracker.ragStart).toFixed(2)}ms`
                    );
                } catch (error) {
                    console.error(
                        'Intelligent RAG failed, falling back to basic RAG:',
                        error
                    );
                    // Fall back to basic RAG on error
                    const rawRAGContext = await buildRAGContext(
                        message,
                        selectedDocs,
                        conversationHistory,
                        dynamicChunkLimit,
                        customModel.ragSimilarityThreshold,
                        customModel.useAdvancedRAG
                    );
                    ragContext = sanitizeRAGContext(rawRAGContext);
                    ragChunksFound = dynamicChunkLimit;
                    tracker.ragEnd = performance.now();
                    console.log(
                        `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Fallback RAG completed in ${(tracker.ragEnd - tracker.ragStart).toFixed(2)}ms`
                    );
                }
            } else {
                console.log(
                    `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Using basic RAG`
                );
                // Use basic RAG (faster than intelligent RAG)
                const rawRAGContext = await buildRAGContext(
                    message,
                    selectedDocs,
                    conversationHistory,
                    dynamicChunkLimit,
                    customModel.ragSimilarityThreshold,
                    customModel.useAdvancedRAG
                );
                ragContext = sanitizeRAGContext(rawRAGContext);
                ragChunksFound = dynamicChunkLimit;
                tracker.ragEnd = performance.now();
                console.log(
                    `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Basic RAG completed in ${(tracker.ragEnd - tracker.ragStart).toFixed(2)}ms`
                );
            }
        } else {
            console.log(
                `[${(performance.now() - tracker.startTime).toFixed(2)}ms] Skipping RAG (no documents selected)`
            );
        }

        // Protect system prompt against injection attempts
        tracker.protectStart = performance.now();
        const protectedSystemPrompt = protectSystemPrompt(
            customModel.systemPrompt
        );
        tracker.protectEnd = performance.now();
        console.log(
            `[${(performance.now() - tracker.startTime).toFixed(2)}ms] System prompt protection took ${(tracker.protectEnd - tracker.protectStart).toFixed(2)}ms`
        );

        const totalTime = performance.now() - tracker.startTime;
        console.log(
            `[${totalTime.toFixed(2)}ms] === ACTION COMPLETED (Total: ${totalTime.toFixed(2)}ms) ===\n`
        );

        // Log performance data to file with metadata
        logPerformance(tracker, {
            chatId,
            message,
            modelName: customModel.ollamaModel,
            hasDocuments: selectedDocs.length > 0,
            documentCount: selectedDocs.length,
            useIntelligentRAG,
            conversationLength: conversationHistory.length,
            ragChunksFound: ragChunksFound > 0 ? ragChunksFound : undefined,
        });

        return {
            message,
            model: customModel.ollamaModel,
            selectedDocs,
            ragContext,
            citations,
            confidence,
            intelligentMetadata,
            serverProcessingTime: totalTime,
            intelligentRAGConfig: {
                enabled: useIntelligentRAG,
                enableCitations: customModel.ragEnableCitations,
                enableConfidenceScoring: customModel.ragEnableConfidenceScoring,
                addFollowUpSuggestions: customModel.ragAddFollowUpSuggestions,
                addSmartDisclaimers: customModel.ragAddSmartDisclaimers,
            },
            systemPrompt: protectedSystemPrompt,
            modelConfig: {
                temperature: parseFloat(customModel.ollamaTemperature as any),
                top_p: parseFloat(customModel.ollamaTopP as any),
                top_k: parseInt(customModel.ollamaTopK as any),
                repeat_penalty: parseFloat(
                    customModel.ollamaRepeatPenalty as any
                ),
                seed: customModel.ollamaSeed
                    ? parseInt(customModel.ollamaSeed as any)
                    : undefined,
                num_ctx: customModel.maxContextTokens,
            },
            errors: { message: null, model: null },
        };
    }
};

export default function ChatDetail({ loaderData }: Route.ComponentProps) {
    const fetcher = useFetcher<ActionData>();
    const saveFetcher = useFetcher();
    const actionData = fetcher.data;
    const ollama = useOllama();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [thinking, setThinking] = useState(false);
    const [currentUserMessage, setCurrentUserMessage] = useState<string>('');
    const hasSavedRef = useRef(false);
    const processedMessageRef = useRef<string>('');

    // IMPORTANT: Track messages in state so we include saved messages in context
    // loaderData.messages only has messages from page load, not subsequent exchanges
    const [messages, setMessages] = useState<
        Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    >(loaderData?.messages || []);

    const isBusy = fetcher.state === 'submitting';

    useEffect(() => {
        if (
            actionData?.message &&
            actionData?.model &&
            processedMessageRef.current !== actionData.message
        ) {
            processedMessageRef.current = actionData.message;
            setCurrentUserMessage(actionData.message);
            hasSavedRef.current = false; // Reset save flag for new message

            // Build the messages array with system prompt + RAG context + history + new user message
            // IMPORTANT: Use `messages` state which includes saved messages, not just loaderData
            const allMessages = buildMessagesForOllama(
                messages,
                actionData.message,
                actionData.systemPrompt || 'You are a helpful assistant.',
                actionData.ragContext || ''
            );

            ollama.sendMessage(
                actionData.message,
                actionData.model,
                allMessages,
                actionData.modelConfig
            );
            setThinking(true);
        }
    }, [
        actionData?.message,
        actionData?.model,
        actionData?.ragContext,
        messages,
    ]);

    useEffect(() => {
        if (!isBusy && textareaRef.current) {
            textareaRef.current.value = '';
            textareaRef.current.focus();
            // scroll to textarea
            textareaRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [ollama.isStreaming, isBusy]);

    useEffect(() => {
        if (ollama.response) {
            setThinking(false);
        }
    }, [ollama.response]);

    // Save messages when streaming completes
    useEffect(() => {
        if (
            !ollama.isStreaming &&
            ollama.response &&
            currentUserMessage &&
            !hasSavedRef.current
        ) {
            hasSavedRef.current = true; // Mark as saved to prevent duplicate saves

            // IMPORTANT: Add messages to client-side state so next message has full context
            setMessages((prev) => [
                ...prev,
                { role: 'user' as const, content: currentUserMessage },
                { role: 'assistant' as const, content: ollama.response },
            ]);

            const formData = new FormData();
            formData.append('intent', 'save');
            formData.append('userMessage', currentUserMessage);
            formData.append('assistantMessage', ollama.response);

            saveFetcher.submit(formData, { method: 'post' });
        }
    }, [ollama.isStreaming, ollama.response, currentUserMessage]);

    // Clear state after save completes
    useEffect(() => {
        if (
            saveFetcher.state === 'idle' &&
            saveFetcher.data &&
            hasSavedRef.current
        ) {
            setCurrentUserMessage('');
            ollama.reset();
            hasSavedRef.current = false;
            processedMessageRef.current = ''; // Reset processed message ref to allow new messages
        }
    }, [saveFetcher.state, saveFetcher.data]);

    return (
        <div className="container mx-auto max-w-4xl px-4 my-6">
            {ollama.error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {ollama.error}
                </div>
            )}

            {/* Render chat history from state (includes saved messages) */}
            <ChatHistory messages={messages} />

            {/* Show current streaming message (only if not saved yet) */}
            {actionData?.message && currentUserMessage && (
                <ChatMessage
                    message={{ role: 'user', content: actionData.message }}
                    serverTime={actionData.serverProcessingTime}
                />
            )}

            {thinking && <Spinner />}

            {ollama.response && currentUserMessage && (
                <ChatMessage
                    message={{ role: 'assistant', content: ollama.response }}
                    ollamaTime={ollama.responseTime}
                />
            )}

            <fetcher.Form method="post" className="my-6">
                {/* Send current conversation history to server for RAG context */}
                <input
                    type="hidden"
                    name="conversationHistory"
                    value={JSON.stringify(messages)}
                />
                <textarea
                    ref={textareaRef}
                    name="message"
                    className={`w-full h-40 p-2 border border-gray-300 rounded ${
                        actionData?.errors?.message
                            ? 'border-red-500'
                            : 'focus:border-blue-500'
                    }`}
                    placeholder="Type your message here..."
                    disabled={isBusy}
                    aria-invalid={
                        actionData?.errors?.message ? 'true' : undefined
                    }
                    aria-errormessage={
                        actionData?.errors?.message
                            ? 'message-error'
                            : undefined
                    }
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!isBusy && textareaRef.current?.value.trim()) {
                                fetcher.submit(e.currentTarget.form);
                            }
                        }
                    }}
                />
                {actionData?.errors?.message && (
                    <div id="message-error" className="text-red-500">
                        {actionData.errors.message}
                    </div>
                )}
                <div className="flex items-center justify-between w-full gap-4">
                    <button
                        disabled={isBusy || ollama.isStreaming}
                        type="submit"
                        className={`mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer ${
                            isBusy ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isBusy ? 'Sending...' : 'Send'}
                    </button>
                    <div className="flex-1">
                        <label
                            htmlFor="customModelId"
                            className="block text-sm font-medium mb-1"
                        >
                            Select AI Model
                        </label>
                        <select
                            name="customModelId"
                            id="customModelId"
                            className={`w-full p-2 border border-gray-300 rounded ${
                                actionData?.errors?.model
                                    ? 'border-red-500'
                                    : 'focus:border-blue-500'
                            }`}
                            aria-invalid={
                                actionData?.errors?.model ? 'true' : undefined
                            }
                            aria-errormessage={
                                actionData?.errors?.model
                                    ? 'model-error'
                                    : undefined
                            }
                            disabled={isBusy}
                        >
                            {loaderData.customModels.map((model: any) => (
                                <option
                                    key={model.modelId}
                                    value={model.modelId}
                                >
                                    {model.modelName}
                                </option>
                            ))}
                        </select>
                        {actionData?.errors?.model && (
                            <div
                                id="model-error"
                                className="text-red-500 text-sm mt-1"
                            >
                                {actionData.errors.model}
                            </div>
                        )}
                    </div>
                </div>
            </fetcher.Form>
        </div>
    );
}
