import { Link } from 'react-router';
import { db } from '~/lib/db.server';
import type { Route } from './+types/index';

export const loader = async () => {
    const chats = await db.getData<{
        chatUUID: string;
        chatCreated: string;
        firstMessage: string;
    }>(
        {
            table: 'chats',
            idField: 'chatId',
            fields: {
                chatUUID: 'chatUUID',
                chatCreated: 'DATE_FORMAT(chatCreated, "%Y-%m-%d %H:%i:%s")',
                firstMessage:
                    'SUBSTRING_INDEX(GROUP_CONCAT(messageUser ORDER BY messageCreated ASC SEPARATOR "|||"), "|||", 1)',
            },
            joins: [
                {
                    table: 'messages',
                    on: 'chats.chatId = messages.messageChat',
                    type: 'LEFT',
                },
            ],
            groupBy: ['chats.chatId'],
            orderBy: ['chatCreated'],
            orderDirection: 'DESC',
        },
        []
    );

    return { chats };
};

export default function Chats({ loaderData }: Route.ComponentProps) {
    return (
        <div className="container mx-auto max-w-6xl px-4">
            <h1 className="text-4xl font-bold text-center mt-10">Chats</h1>
            <div className="mt-8 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Chat ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Created
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {loaderData.chats.rows.map((chat) => (
                            <tr
                                key={chat.chatUUID}
                                className="hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                    <span className="block w-48">
                                        {chat.chatUUID}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm truncate">
                                        {chat.firstMessage}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {chat.chatCreated}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Link
                                        to={`/chats/${chat.chatUUID}`}
                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                    >
                                        View
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
