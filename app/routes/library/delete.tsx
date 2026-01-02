import { redirect } from 'react-router';
import { deleteDocument } from '~/lib/document.server';
import type { Route } from './+types/delete';

export async function action({ request }: Route.ActionArgs) {
    const formData = await request.formData();
    const documentUUID = formData.get('documentUUID') as string;

    if (!documentUUID) {
        throw new Response('Document UUID required', { status: 400 });
    }

    const success = await deleteDocument(documentUUID);

    if (!success) {
        throw new Response('Document not found', { status: 404 });
    }

    return redirect('/library');
}
