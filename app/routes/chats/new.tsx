import { generateUUID } from '~/lib/utils.server';
import type { Route } from './+types/new';
import { redirect } from 'react-router';
import { db } from '~/lib/db.server';

export const loader = async ({ request }: Route.LoaderArgs) => {
    const chatId = generateUUID();

    await db.insertData('chats', {
        chatUUID: chatId,
    });

    return redirect(`/chats/${chatId}`, 302);
};
