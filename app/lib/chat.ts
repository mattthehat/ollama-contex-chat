import config from './config';

export type Message = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

/**
 * Estimate token count for a message
 * Rule of thumb: ~4 characters per token for English text
 * This is a rough estimate - actual tokenization varies by model
 */
export function estimateTokenCount(text: string | null | undefined): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

/**
 * Calculate total token count for an array of messages
 */
export function calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => total + estimateTokenCount(msg.content), 0);
}

/**
 * Build messages array for Ollama with smart token-based context management
 *
 * PERFORMANCE OPTIMIZATION:
 * - UI displays last 50 messages (via getChatMessages)
 * - Ollama receives only last 20 messages (this function)
 * - This keeps UI informative while maintaining fast response times
 * - 20 messages = ~10 full exchanges, sufficient for maintaining conversation coherence
 *
 * This function can be used on both client and server
 */
export function buildMessagesForOllama(
    history: Message[],
    newUserMessage: string,
    systemPrompt: string = 'You are a helpful assistant.',
    ragContext: string = '',
    maxContextTokens: number = config.maxContext * 0.7, // Use 70% of max context to leave room for response
    maxMessages: number = 20 // Hard limit: Send last 20 messages (~10 exchanges) for good context coverage
): Message[] {
    // Combine system prompt with RAG context if available
    const fullSystemPrompt = ragContext
        ? `${systemPrompt}\n\n${ragContext}`
        : systemPrompt;

    const systemMessage: Message = { role: 'system', content: fullSystemPrompt };
    const newMessage: Message = { role: 'user', content: newUserMessage };

    // Calculate tokens for system prompt and new message
    let totalTokens = estimateTokenCount(fullSystemPrompt) + estimateTokenCount(newUserMessage);

    // PERFORMANCE: Limit history to most recent N messages before iteration
    const limitedHistory = history.slice(-maxMessages);

    // Add messages from most recent backwards until we hit the token limit
    const recentHistory: Message[] = [];
    for (let i = limitedHistory.length - 1; i >= 0; i--) {
        // Skip messages with empty or null content
        if (!limitedHistory[i].content || limitedHistory[i].content.trim() === '') {
            continue;
        }

        const messageTokens = estimateTokenCount(limitedHistory[i].content);

        if (totalTokens + messageTokens > maxContextTokens) {
            // Stop if adding this message would exceed the limit
            break;
        }

        totalTokens += messageTokens;
        recentHistory.unshift(limitedHistory[i]); // Add to front to maintain order
    }

    return [systemMessage, ...recentHistory, newMessage];
}
