import { useLoaderData, Link, useFetcher } from 'react-router';
import { getAllDocuments } from '~/lib/document.server';
import type { Route } from './+types/index';

export async function loader() {
    const documents = await getAllDocuments();
    return { documents };
}

export function meta({}: Route.MetaArgs) {
    return [
        { title: 'Library' },
        { name: 'description', content: 'Chat with Ollama AI' },
    ];
}
export default function LibraryIndex() {
    const { documents } = useLoaderData<typeof loader>();
    const deleteFetcher = useFetcher();

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold">Document Library</h1>
                <Link
                    to="/library/new"
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                    + Add Document
                </Link>
            </div>

            {documents.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                        No documents in library yet
                    </p>
                    <Link
                        to="/library/new"
                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400"
                    >
                        Upload your first document
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {documents.map((doc) => {
                        const metadata =
                            typeof doc.documentMetadata === 'string'
                                ? JSON.parse(doc.documentMetadata)
                                : doc.documentMetadata || {};

                        return (
                            <div
                                key={doc.documentId}
                                className="relative p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
                            >
                                <Link
                                    to={`/library/${doc.documentUUID}`}
                                    className="block"
                                >
                                    <h2 className="text-xl font-bold mb-2 truncate">
                                        {doc.documentTitle}
                                    </h2>

                                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                        <div className="flex justify-between">
                                            <span>Type:</span>
                                            <span className="capitalize font-medium">
                                                {doc.documentType}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Chunks:</span>
                                            <span className="font-medium">
                                                {doc.documentTotalChunks}
                                            </span>
                                        </div>
                                        {metadata.pageCount && (
                                            <div className="flex justify-between">
                                                <span>Pages:</span>
                                                <span className="font-medium">
                                                    {metadata.pageCount}
                                                </span>
                                            </div>
                                        )}
                                        {metadata.fileSize && (
                                            <div className="flex justify-between">
                                                <span>Size:</span>
                                                <span className="font-medium">
                                                    {(
                                                        metadata.fileSize / 1024
                                                    ).toFixed(1)}{' '}
                                                    KB
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                                            <span>Created:</span>
                                            <span className="font-medium">
                                                {new Date(
                                                    doc.documentCreatedAt
                                                ).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </Link>

                                <deleteFetcher.Form
                                    method="post"
                                    action="/library/delete"
                                    onSubmit={(e) => {
                                        if (
                                            !confirm(
                                                `Are you sure you want to delete "${doc.documentTitle}"? This action cannot be undone.`
                                            )
                                        ) {
                                            e.preventDefault();
                                        }
                                    }}
                                    className="mt-4"
                                >
                                    <input
                                        type="hidden"
                                        name="documentUUID"
                                        value={doc.documentUUID}
                                    />
                                    <button
                                        type="submit"
                                        disabled={deleteFetcher.state === 'submitting'}
                                        className="w-full px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {deleteFetcher.state === 'submitting'
                                            ? 'Deleting...'
                                            : 'Delete'}
                                    </button>
                                </deleteFetcher.Form>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
