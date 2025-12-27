import type { Route } from './+types/detail';

import { useFetcher } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useOllama } from '~/hooks/useOllama';
import Spinner from '~/components/Loader';
import ChatHistory from '~/components/ChatHistory';
import ChatMessage from '~/components/ChatMessage';
import { getChatMessages, saveMessage } from '~/lib/chat.server';
import { buildMessagesForOllama, estimateTokenCount, calculateTotalTokens } from '~/lib/chat';
import config from '~/lib/config';
import { getAllDocuments, buildRAGContext } from '~/lib/document.server';

export const loader = async ({ params }: Route.LoaderArgs) => {
    const { chatId } = params;
    const messages = await getChatMessages(chatId || '');
    const libraryDocuments = await getAllDocuments();

    return { messages, libraryDocuments, chatId };
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
};

export const action = async ({ request, params }: Route.ActionArgs) => {
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
    const model = formData.get('model') as string;
    const selectedDocs = formData.getAll('libraryDocs') as string[];

    if (!message?.trim()) {
        return {
            errors: { message: 'Please enter a message', model: null },
            message: null,
            model: null,
            selectedDocs: [],
        };
    } else if (!model?.trim()) {
        return {
            errors: { message: null, model: 'Please select a model' },
            message: null,
            model: null,
            selectedDocs: [],
        };
    } else {
        // Get conversation history for better RAG context
        const conversationHistory = chatId
            ? await getChatMessages(chatId)
            : [];

        // Calculate dynamic chunk limit based on available context window
        const systemPromptTokens = estimateTokenCount('You are a helpful assistant.');
        const conversationTokens = calculateTotalTokens(conversationHistory);
        const messageTokens = estimateTokenCount(message);
        const availableTokens = (config.maxContext * 0.7) - systemPromptTokens - conversationTokens - messageTokens;

        // Assume ~500 tokens per chunk on average, min 3, max 10
        const dynamicChunkLimit = Math.max(3, Math.min(10, Math.floor(availableTokens / 500)));

        // Build RAG context from selected documents with conversation context
        const ragContext = selectedDocs.length > 0
            ? await buildRAGContext(message, selectedDocs, conversationHistory, dynamicChunkLimit)
            : '';

        return {
            message,
            model,
            selectedDocs,
            ragContext,
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
            const allMessages = buildMessagesForOllama(
                loaderData?.messages || [],
                actionData.message,
                'You are a helpful assistant.',
                actionData.ragContext || ''
            );

            ollama.sendMessage(
                actionData.message,
                actionData.model,
                allMessages
            );
            setThinking(true);
        }
    }, [actionData?.message, actionData?.model, actionData?.ragContext]);

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

            {/* Render chat history from loader */}
            <ChatHistory messages={loaderData?.messages} />

            {/* Show current streaming message (only if not saved yet) */}
            {actionData?.message && currentUserMessage && (
                <ChatMessage
                    message={{ role: 'user', content: actionData.message }}
                />
            )}

            {thinking && <Spinner />}

            {ollama.response && currentUserMessage && (
                <ChatMessage
                    message={{ role: 'assistant', content: ollama.response }}
                />
            )}

            <fetcher.Form method="post" className="my-6">
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
                />
                {actionData?.errors?.message && (
                    <div id="message-error" className="text-red-500">
                        {actionData.errors.message}
                    </div>
                )}
                <div className="flex items-center flex-wrap w-full gap-2 mb-4">
                    {loaderData.libraryDocuments.length > 0 && (
                        <>
                            <span className="text-sm text-gray-600 dark:text-gray-400 w-full mb-1">
                                Select documents for context:
                            </span>
                            {loaderData.libraryDocuments.map((doc: any) => (
                                <div key={doc.documentId}>
                                    <input
                                        type="checkbox"
                                        id={doc.documentId}
                                        name="libraryDocs"
                                        value={doc.documentUUID}
                                        className="peer hidden"
                                    />
                                    <label
                                        htmlFor={doc.documentId}
                                        className="cursor-pointer px-3 py-1 rounded-full text-sm transition-all
                                            bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200
                                            peer-checked:bg-blue-500 peer-checked:text-white peer-checked:ring-2 peer-checked:ring-blue-300
                                            hover:bg-gray-300 dark:hover:bg-gray-600
                                            inline-block"
                                    >
                                        {doc.documentTitle}
                                    </label>
                                </div>
                            ))}
                        </>
                    )}
                </div>
                <div className="flex items-center justify-between w-full">
                    <button
                        disabled={isBusy || ollama.isStreaming}
                        type="submit"
                        className={`mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer ${
                            isBusy ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isBusy ? 'Sending...' : 'Send'}
                    </button>
                    <select
                        name="model"
                        className={`mt-4 p-2 border border-gray-300 rounded block ml-auto ${
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
                        {config.chatModels.map(
                            (model: {
                                modelName: string;
                                friendlyName: string;
                            }) => (
                                <option
                                    key={model.modelName}
                                    value={model.modelName}
                                >
                                    {model.friendlyName}
                                </option>
                            )
                        )}
                    </select>
                </div>
            </fetcher.Form>
        </div>
    );
}
