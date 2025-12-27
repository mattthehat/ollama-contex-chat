import { db } from './db.server';
import type { Message } from './chat';

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
            orderDirection: 'ASC',
            limit: 100,
        },
        [chatId || '']
    );

    // Map database results to Message type
    const messages: Message[] = dbMessages.rows.flatMap((row) => [
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
