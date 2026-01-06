import { db } from './db.server';
import type { Message } from './chat';

/**
 * Get chat messages for display in UI
 * Note: This loads 50 messages for UI display, but buildMessagesForOllama
 * will only send the last 20 to Ollama for performance optimization
 */
export async function getChatMessages(chatId: string): Promise<Message[]> {
    const dbMessages = await db.getData<{
        user: string;
        assistant: string;
    }>(
        {
            table: 'chats',
            idField: 'chatId',
            where: ['chatUUID = ?'],
            fields: {
                user: 'messageUser',
                assistant: 'messageSystem',
            },
            joins: [
                {
                    table: 'messages',
                    on: 'chats.chatId = messages.messageChat',
                    type: 'LEFT',
                },
            ],
            orderBy: ['messages.messageCreated'],
            orderDirection: 'DESC', // Get most recent first
            limit: 50, // Show last 50 messages in UI for user context
        },
        [chatId || '']
    );

    // Map database results to Message type in chronological order
    // Fixed: Reverse rows first (to get oldest->newest), then flatMap to maintain user->assistant order
    const messages: Message[] = dbMessages.rows
        .reverse() // Reverse rows to get chronological order (oldest to newest)
        .flatMap((row) => [
            { role: 'user' as const, content: row.user },
            { role: 'assistant' as const, content: row.assistant },
        ]);

    return messages;
}

export async function saveMessage(
    chatId: string,
    userMessage: string,
    assistantMessage: string
): Promise<boolean> {
    const chatTableId = await db.getFirst<{ id: number }>(
        {
            table: 'chats',
            idField: 'chatId',
            where: ['chatUUID = ?'],
            fields: {
                id: 'chatId',
            },
        },
        [chatId]
    );

    if (!chatTableId?.id) {
        return false;
    }

    await db.insertData('messages', {
        messageChat: chatTableId.id,
        messageUser: userMessage,
        messageSystem: assistantMessage,
    });

    return true;
}
