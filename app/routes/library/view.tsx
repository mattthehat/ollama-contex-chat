import { useFetcher, useLoaderData, Link } from 'react-router';
import type { Route } from './+types/view';
import {
    getDocumentByUUID,
    getChunksByDocumentId,
    searchChunksBySimilarity,
} from '~/lib/document.server';
import { useState } from 'react';
import Loader from '~/components/Loader';

export async function loader({ request, params }: Route.LoaderArgs) {
    const uuid = params.uuid;

    if (!uuid) {
        throw new Response('Document UUID required', { status: 400 });
    }

    const document = await getDocumentByUUID(uuid);

    if (!document) {
        throw new Response('Document not found', { status: 404 });
    }

    const chunks = await getChunksByDocumentId(document.documentId);

    return {
        document,
        chunks,
    };
}

export async function action({ request }: Route.ActionArgs) {
    const formData = await request.formData();
    const query = formData.get('query') as string;
    const uuid = formData.get('uuid') as string;

    if (!query) {
        return { error: 'Query is required', results: [] };
    }

    try {
        // Search across all chunks (or filter by document if needed)
        const results = await searchChunksBySimilarity(query, 10);

        // If uuid is provided, filter results to only this document
        if (uuid) {
            const document = await getDocumentByUUID(uuid);
            if (document) {
                const filteredResults = results.filter(
                    (r) => r.chunkDocumentId === document.documentId
                );
                return { results: filteredResults, error: null };
            }
        }

        return { results, error: null };
    } catch (error) {
        console.error('Search error:', error);
        return {
            error: error instanceof Error ? error.message : 'Search failed',
            results: [],
        };
    }
}

export default function LibraryView() {
    const { document, chunks } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const [showAllChunks, setShowAllChunks] = useState(false);

    const metadata =
        typeof document.documentMetadata === 'string'
            ? JSON.parse(document.documentMetadata)
            : document.documentMetadata || {};

    const searchResults = fetcher.data?.results || [];
    const hasSearched = fetcher.state === 'idle' && fetcher.data !== undefined;

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <div className="mb-6">
                <Link
                    to="/library"
                    className="text-blue-500 hover:text-blue-600 dark:text-blue-400"
                >
                    ← Back to Library
                </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
                <h1 className="text-3xl font-bold mb-4">
                    {document.documentTitle}
                </h1>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <span className="font-semibold">Type:</span>{' '}
                        <span className="capitalize">
                            {document.documentType}
                        </span>
                    </div>
                    <div>
                        <span className="font-semibold">Chunks:</span>{' '}
                        {document.documentTotalChunks}
                    </div>
                    {metadata.pageCount && (
                        <div>
                            <span className="font-semibold">Pages:</span>{' '}
                            {metadata.pageCount}
                        </div>
                    )}
                    {metadata.fileSize && (
                        <div>
                            <span className="font-semibold">Size:</span>{' '}
                            {(metadata.fileSize / 1024).toFixed(1)} KB
                        </div>
                    )}
                </div>
            </div>

            {/* Semantic Search */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-2xl font-bold mb-4">
                    Semantic Search (RAG Test)
                </h2>

                <fetcher.Form method="post" className="mb-4">
                    <input
                        type="hidden"
                        name="uuid"
                        value={document.documentUUID}
                    />
                    <div className="flex gap-2">
                        <input
                            type="text"
                            name="query"
                            placeholder="Ask a question about this document..."
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring focus:border-blue-300 dark:bg-gray-700 dark:text-gray-100"
                            required
                        />
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={fetcher.state === 'submitting'}
                        >
                            {fetcher.state === 'submitting' && (
                                <Loader className="inline-block mr-2" />
                            )}
                            Search
                        </button>
                    </div>
                </fetcher.Form>

                {fetcher.data?.error && (
                    <div className="p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-md mb-4">
                        <p className="font-bold">Error</p>
                        <p>{fetcher.data.error}</p>
                    </div>
                )}

                {hasSearched && searchResults.length > 0 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            Search Results ({searchResults.length})
                        </h3>
                        <div className="space-y-3">
                            {searchResults.map((result) => {
                                const chunkMeta = result.chunkMetadata
                                    ? JSON.parse(result.chunkMetadata)
                                    : {};
                                return (
                                    <div
                                        key={result.chunkId}
                                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                                Chunk #{result.chunkIndex + 1}
                                                {chunkMeta.pageNumber &&
                                                    ` (Page ${chunkMeta.pageNumber})`}
                                            </span>
                                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                                Similarity:{' '}
                                                {(
                                                    result.similarity * 100
                                                ).toFixed(1)}
                                                %
                                            </span>
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap">
                                            {result.chunkContent}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {hasSearched && searchResults.length === 0 && (
                    <p className="text-gray-600 dark:text-gray-400">
                        No results found. Try a different query.
                    </p>
                )}
            </div>

            {/* All Chunks */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Document Chunks</h2>
                    <button
                        onClick={() => setShowAllChunks(!showAllChunks)}
                        className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400"
                    >
                        {showAllChunks ? 'Hide' : 'Show'} All Chunks
                    </button>
                </div>

                {showAllChunks && (
                    <div className="space-y-3">
                        {chunks.map((chunk) => {
                            const chunkMeta = chunk.chunkMetadata
                                ? JSON.parse(chunk.chunkMetadata)
                                : {};
                            return (
                                <div
                                    key={chunk.chunkId}
                                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-md"
                                >
                                    <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                                        Chunk #{chunk.chunkIndex + 1}
                                        {chunkMeta.pageNumber &&
                                            ` (Page ${chunkMeta.pageNumber})`}
                                        {chunkMeta.chunkSize &&
                                            ` - ${chunkMeta.chunkSize} chars`}
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap">
                                        {chunk.chunkContent}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
