import { useFetcher, redirect } from 'react-router';
import type { Route } from './+types/new';
import Loader from '~/components/Loader';
import { processTextDocument, processPDFDocument } from '~/lib/document.server';

export function meta({}: Route.MetaArgs) {
    return [
        { title: 'Add New Document' },
        {
            name: 'description',
            content: 'Upload a new document to the library',
        },
    ];
}

export async function action({ request }: Route.ActionArgs) {
    const formData = await request.formData();

    const title = formData.get('title') as string;
    const type = formData.get('type') as string;
    const file = formData.get('file') as File;

    if (!title || !type || !file) {
        return {
            error: 'Missing required fields',
        };
    }

    try {
        if (type === 'pdf') {
            // Handle PDF files
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            await processPDFDocument(title, buffer);
        } else {
            // Handle text-based files (text, markdown, code, documentation)
            const fileContent = await file.text();
            await processTextDocument(
                title,
                fileContent,
                type as 'text' | 'markdown' | 'code' | 'documentation'
            );
        }

        // Redirect to library page after successful upload
        return redirect('/library');
    } catch (error) {
        console.error('Error processing document:', error);
        return {
            error:
                error instanceof Error
                    ? error.message
                    : 'Failed to process document',
        };
    }
}

export default function LibraryNew() {
    const fetcher = useFetcher();

    const isBusy =
        fetcher.state === 'submitting' || fetcher.state === 'loading';
    const error = fetcher.data?.error;

    return (
        <div className="container mx-auto max-w-4xl px-4">
            <h1 className="text-4xl font-bold text-center mt-10">
                Add New Library Item
            </h1>

            {error && (
                <div className="mt-4 max-w-md mx-auto p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-md">
                    <p className="font-bold">Error</p>
                    <p>{error}</p>
                </div>
            )}

            <fetcher.Form
                method="post"
                className="mt-8 max-w-md mx-auto"
                encType="multipart/form-data"
            >
                <div className="mb-4">
                    <label
                        htmlFor="title"
                        className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    >
                        Title
                    </label>
                    <input
                        type="text"
                        id="title"
                        name="title"
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring focus:border-blue-300 dark:bg-gray-800 dark:text-gray-100"
                    />
                </div>

                <div className="mb-4">
                    <label
                        htmlFor="type"
                        className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    >
                        Document Type
                    </label>
                    <select
                        id="type"
                        name="type"
                        required
                        defaultValue="text"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring focus:border-blue-300 dark:bg-gray-800 dark:text-gray-100"
                    >
                        <option value="text">Text</option>
                        <option value="markdown">Markdown</option>
                        <option value="code">Code</option>
                        <option value="documentation">Documentation</option>
                        <option value="pdf">PDF</option>
                    </select>
                </div>

                <div className="mb-4">
                    <label
                        htmlFor="file"
                        className="block text-gray-700 dark:text-gray-300 font-bold mb-2"
                    >
                        Upload File
                    </label>
                    <input
                        type="file"
                        id="file"
                        name="file"
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring focus:border-blue-300 dark:bg-gray-800 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-300"
                    />
                </div>

                <div className="mb-4">
                    <button
                        type="submit"
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        disabled={isBusy}
                    >
                        {isBusy && <Loader className="inline-block mr-2" />}
                        {isBusy ? 'Uploading...' : 'Upload Document'}
                    </button>
                </div>
            </fetcher.Form>
        </div>
    );
}
