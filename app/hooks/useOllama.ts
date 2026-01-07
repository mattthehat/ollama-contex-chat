import { useState, useCallback } from 'react';
import { americanToBritish } from '~/lib/utils.client';

type OllamaChunk = {
    model: string;
    created_at: string;
    message: { role: 'assistant'; content: string };
    done: boolean;
    done_reason?: 'stop';
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
};

type Message = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type ModelOptions = {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_ctx?: number;
};

export function useOllama() {
    const [response, setResponse] = useState<string>('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string>('');
    const [responseTime, setResponseTime] = useState<number>(0);

    const sendMessage = useCallback(
        async (
            userInput: string,
            model: string,
            messages?: Message[],
            options?: ModelOptions
        ) => {
            if (!userInput?.trim()) {
                setError('Please enter a message');
                return;
            }

            setIsStreaming(true);
            setResponse('');
            setError('');
            setResponseTime(0);
            const startTime = performance.now();

            const payload: any = {
                model,
                messages: messages || [
                    {
                        role: 'system' as const,
                        content: 'You are a helpful assistant.',
                    },
                    { role: 'user' as const, content: userInput },
                ],
                stream: true,
            };

            // Add model options if provided, filtering out undefined/null values
            if (options) {
                const cleanOptions: Record<string, number> = {};
                if (
                    options.temperature !== undefined &&
                    options.temperature !== null
                ) {
                    cleanOptions.temperature = options.temperature;
                }
                if (options.top_p !== undefined && options.top_p !== null) {
                    cleanOptions.top_p = options.top_p;
                }
                if (options.top_k !== undefined && options.top_k !== null) {
                    cleanOptions.top_k = options.top_k;
                }
                if (
                    options.repeat_penalty !== undefined &&
                    options.repeat_penalty !== null
                ) {
                    cleanOptions.repeat_penalty = options.repeat_penalty;
                }
                if (options.seed !== undefined && options.seed !== null) {
                    cleanOptions.seed = options.seed;
                }
                if (options.num_ctx !== undefined && options.num_ctx !== null) {
                    cleanOptions.num_ctx = options.num_ctx;
                }

                if (Object.keys(cleanOptions).length > 0) {
                    payload.options = cleanOptions;
                }
            }

            try {
                const ollamaEndpoint =
                    import.meta.env.VITE_OLLAMA_ENDPOINT ||
                    'http://localhost:11434/api/chat';
                const fetchResponse = await fetch(ollamaEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                if (!fetchResponse.ok) {
                    const errorText = await fetchResponse.text();
                    throw new Error(
                        `Failed to fetch from Ollama API: ${fetchResponse.status} - ${errorText}`
                    );
                }

                const reader = fetchResponse.body?.getReader();
                const decoder = new TextDecoder('utf-8');

                if (!reader) {
                    throw new Error('No reader available');
                }

                let done = false;
                let rawAccumulated = ''; // Accumulate raw text before conversion
                let buffer = ''; // Buffer for incomplete words

                while (!done) {
                    const { value, done: doneReading } = await reader.read();
                    done = doneReading;

                    if (value) {
                        const chunk = decoder.decode(value);
                        const lines = chunk
                            .split('\n')
                            .filter((line) => line.trim());

                        for (const line of lines) {
                            try {
                                const json = JSON.parse(line) as OllamaChunk;
                                if (json.message?.content) {
                                    // Add to buffer
                                    buffer += json.message.content;

                                    // Only process complete words (text ending with space or punctuation)
                                    // Keep incomplete word in buffer for next chunk
                                    // Include markdown formatting characters to avoid breaking syntax
                                    const lastSpaceIndex = Math.max(
                                        buffer.lastIndexOf(' '),
                                        buffer.lastIndexOf('\n'),
                                        buffer.lastIndexOf('.'),
                                        buffer.lastIndexOf(','),
                                        buffer.lastIndexOf('!'),
                                        buffer.lastIndexOf('?'),
                                        buffer.lastIndexOf(';'),
                                        buffer.lastIndexOf(':'),
                                        buffer.lastIndexOf('*'),
                                        buffer.lastIndexOf('_'),
                                        buffer.lastIndexOf('`'),
                                        buffer.lastIndexOf('['),
                                        buffer.lastIndexOf(']'),
                                        buffer.lastIndexOf('('),
                                        buffer.lastIndexOf(')'),
                                        buffer.lastIndexOf('#'),
                                        buffer.lastIndexOf('>'),
                                        buffer.lastIndexOf('-')
                                    );

                                    if (lastSpaceIndex > 0) {
                                        // Process complete words
                                        const completeText = buffer.substring(
                                            0,
                                            lastSpaceIndex + 1
                                        );
                                        const incompleteWord = buffer.substring(
                                            lastSpaceIndex + 1
                                        );

                                        rawAccumulated += completeText;
                                        buffer = incompleteWord;

                                        // Convert and display
                                        setResponse(
                                            americanToBritish(rawAccumulated) +
                                                buffer
                                        );
                                    } else if (json.done) {
                                        // On final chunk, process everything
                                        rawAccumulated += buffer;
                                        buffer = '';
                                        setResponse(
                                            americanToBritish(rawAccumulated)
                                        );
                                    } else {
                                        // Show buffered text as-is (unconverted) while waiting for word completion
                                        setResponse(
                                            americanToBritish(rawAccumulated) +
                                                buffer
                                        );
                                    }
                                }
                            } catch (e) {
                                console.error('Invalid JSON chunk:', line);
                            }
                        }
                    }
                }

                // Final conversion of any remaining buffered text
                if (buffer) {
                    rawAccumulated += buffer;
                    setResponse(americanToBritish(rawAccumulated));
                }

                // Record total response time
                setResponseTime(performance.now() - startTime);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : 'An error occurred'
                );
            } finally {
                setIsStreaming(false);
            }
        },
        []
    );

    const reset = useCallback(() => {
        setResponse('');
        setError('');
        setIsStreaming(false);
        setResponseTime(0);
    }, []);

    return {
        response,
        isStreaming,
        error,
        responseTime,
        sendMessage,
        reset,
    };
}
