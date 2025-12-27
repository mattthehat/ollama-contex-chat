import type { Route } from './+types/new';
import { Form, redirect, useActionData } from 'react-router';
import { createCustomModel } from '~/lib/models.server';
import { getAllDocuments } from '~/lib/document.server';
import config from '~/lib/config';

export const loader = async () => {
    const documents = await getAllDocuments();
    const availableModels = config.chatModels.map(m => ({
        id: m.modelName,
        name: m.friendlyName
    }));
    return { documents, availableModels };
};

export const meta = () => {
    return [
        { title: 'New AI Model - Ollama Context Chat' },
        { name: 'description', content: 'Create a new custom AI model' },
    ];
};

type ActionData = {
    errors?: {
        modelName?: string;
        ollamaModel?: string;
        systemPrompt?: string;
    };
};

export const action = async ({ request }: Route.ActionArgs) => {
    const formData = await request.formData();

    const modelName = formData.get('modelName') as string;
    const modelDescription = formData.get('modelDescription') as string;
    const modelIcon = formData.get('modelIcon') as string;
    const ollamaModel = formData.get('ollamaModel') as string;
    const systemPrompt = formData.get('systemPrompt') as string;

    // Parse numeric values
    const ollamaTemperature = parseFloat(formData.get('ollamaTemperature') as string);
    const ollamaTopP = parseFloat(formData.get('ollamaTopP') as string);
    const ollamaTopK = parseInt(formData.get('ollamaTopK') as string);
    const ollamaRepeatPenalty = parseFloat(formData.get('ollamaRepeatPenalty') as string);
    const ragMaxChunks = parseInt(formData.get('ragMaxChunks') as string);
    const ragSimilarityThreshold = parseFloat(formData.get('ragSimilarityThreshold') as string);
    const maxContextTokens = parseInt(formData.get('maxContextTokens') as string);
    const maxOutputTokens = parseInt(formData.get('maxOutputTokens') as string);

    // Parse boolean values
    const useAdvancedRAG = formData.get('useAdvancedRAG') === 'on';
    const ragUseMultiQuery = formData.get('ragUseMultiQuery') === 'on';
    const ragUseHybridSearch = formData.get('ragUseHybridSearch') === 'on';
    const ragUseReranking = formData.get('ragUseReranking') === 'on';

    // Get selected documents
    const documentIds = formData.getAll('documents').map((id) => parseInt(id as string));

    // Validation
    const errors: ActionData['errors'] = {};

    if (!modelName?.trim()) {
        errors.modelName = 'Model name is required';
    }
    if (!ollamaModel?.trim()) {
        errors.ollamaModel = 'Ollama model is required';
    }
    if (!systemPrompt?.trim()) {
        errors.systemPrompt = 'System prompt is required';
    }

    if (Object.keys(errors).length > 0) {
        return { errors };
    }

    try {
        const modelUUID = await createCustomModel({
            modelName,
            modelDescription: modelDescription || undefined,
            modelIcon: modelIcon || '🤖',
            ollamaModel,
            ollamaTemperature,
            ollamaTopP,
            ollamaTopK,
            ollamaRepeatPenalty,
            useAdvancedRAG,
            ragMaxChunks,
            ragSimilarityThreshold,
            ragUseMultiQuery,
            ragUseHybridSearch,
            ragUseReranking,
            systemPrompt,
            maxContextTokens,
            maxOutputTokens,
            documentIds,
        });

        return redirect(`/models/${modelUUID}`);
    } catch (error) {
        console.error('Error creating model:', error);
        return { errors: { modelName: 'Failed to create model' } };
    }
};

export default function NewModel({ loaderData }: Route.ComponentProps) {
    const { documents, availableModels } = loaderData;
    const actionData = useActionData<ActionData>();

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <h1 className="text-3xl font-bold mb-8 dark:text-white">Create New AI Model</h1>

            <Form method="post" className="space-y-8">
                {/* Basic Information */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">Basic Information</h2>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="modelName" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Model Name *
                            </label>
                            <input
                                type="text"
                                id="modelName"
                                name="modelName"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                placeholder="e.g., Code Assistant, Research Helper"
                                required
                            />
                            {actionData?.errors?.modelName && (
                                <p className="text-red-600 dark:text-red-400 text-sm mt-1">{actionData.errors.modelName}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="modelIcon" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Icon (Emoji)
                            </label>
                            <input
                                type="text"
                                id="modelIcon"
                                name="modelIcon"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                placeholder="🤖"
                                defaultValue="🤖"
                                maxLength={10}
                            />
                        </div>

                        <div>
                            <label htmlFor="modelDescription" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Description
                            </label>
                            <textarea
                                id="modelDescription"
                                name="modelDescription"
                                rows={3}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                placeholder="Describe what this AI model is specialized for..."
                            />
                        </div>
                    </div>
                </div>

                {/* Ollama Configuration */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">Ollama Configuration</h2>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="ollamaModel" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Base Model *
                            </label>
                            <select
                                id="ollamaModel"
                                name="ollamaModel"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                required
                            >
                                {availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                            {actionData?.errors?.ollamaModel && (
                                <p className="text-red-600 dark:text-red-400 text-sm mt-1">{actionData.errors.ollamaModel}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="ollamaTemperature" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Temperature
                                </label>
                                <input
                                    type="number"
                                    id="ollamaTemperature"
                                    name="ollamaTemperature"
                                    step="0.01"
                                    min="0"
                                    max="2"
                                    defaultValue="0.7"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Higher = more creative (0-2)</p>
                            </div>

                            <div>
                                <label htmlFor="ollamaTopP" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Top P
                                </label>
                                <input
                                    type="number"
                                    id="ollamaTopP"
                                    name="ollamaTopP"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    defaultValue="0.9"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Nucleus sampling (0-1)</p>
                            </div>

                            <div>
                                <label htmlFor="ollamaTopK" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Top K
                                </label>
                                <input
                                    type="number"
                                    id="ollamaTopK"
                                    name="ollamaTopK"
                                    step="1"
                                    min="1"
                                    defaultValue="40"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Top-k sampling</p>
                            </div>

                            <div>
                                <label htmlFor="ollamaRepeatPenalty" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Repeat Penalty
                                </label>
                                <input
                                    type="number"
                                    id="ollamaRepeatPenalty"
                                    name="ollamaRepeatPenalty"
                                    step="0.01"
                                    min="0"
                                    max="2"
                                    defaultValue="1.1"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Repetition penalty (0-2)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RAG Configuration */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">RAG Configuration</h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="useAdvancedRAG"
                                name="useAdvancedRAG"
                                className="w-4 h-4"
                                defaultChecked
                            />
                            <label htmlFor="useAdvancedRAG" className="text-sm font-medium dark:text-gray-200">
                                Use Advanced RAG (multi-query, hybrid search, re-ranking)
                            </label>
                        </div>

                        <div className="pl-7 space-y-3 border-l-2 border-gray-200">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="ragUseMultiQuery"
                                    name="ragUseMultiQuery"
                                    className="w-4 h-4"
                                    defaultChecked
                                />
                                <label htmlFor="ragUseMultiQuery" className="text-sm dark:text-gray-300">
                                    Multi-Query Retrieval
                                </label>
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="ragUseHybridSearch"
                                    name="ragUseHybridSearch"
                                    className="w-4 h-4"
                                    defaultChecked
                                />
                                <label htmlFor="ragUseHybridSearch" className="text-sm dark:text-gray-300">
                                    Hybrid Search (Vector + Keyword)
                                </label>
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="ragUseReranking"
                                    name="ragUseReranking"
                                    className="w-4 h-4"
                                    defaultChecked
                                />
                                <label htmlFor="ragUseReranking" className="text-sm dark:text-gray-300">
                                    Re-ranking
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="ragMaxChunks" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Max Chunks
                                </label>
                                <input
                                    type="number"
                                    id="ragMaxChunks"
                                    name="ragMaxChunks"
                                    min="1"
                                    max="20"
                                    defaultValue="5"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum chunks to retrieve</p>
                            </div>

                            <div>
                                <label htmlFor="ragSimilarityThreshold" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Similarity Threshold
                                </label>
                                <input
                                    type="number"
                                    id="ragSimilarityThreshold"
                                    name="ragSimilarityThreshold"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    defaultValue="0.1"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Minimum relevance (0-1)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Document Library */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">Document Library</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Select which documents this AI model should have access to
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4 dark:bg-gray-750">
                        {documents.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm">No documents available</p>
                        ) : (
                            documents.map((doc) => (
                                <div key={doc.documentUUID} className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id={`doc-${doc.documentUUID}`}
                                        name="documents"
                                        value={doc.documentId}
                                        className="w-4 h-4"
                                    />
                                    <label htmlFor={`doc-${doc.documentUUID}`} className="text-sm flex-1">
                                        {doc.documentTitle}
                                        <span className="text-gray-500 dark:text-gray-400 ml-2">({doc.documentType})</span>
                                    </label>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* System Prompt */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">System Prompt *</h2>
                    <textarea
                        id="systemPrompt"
                        name="systemPrompt"
                        rows={6}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white font-mono text-sm"
                        placeholder="You are a helpful AI assistant..."
                        defaultValue="You are a helpful AI assistant with access to a library of documents. When answering questions, cite relevant information from the provided context when available."
                        required
                    />
                    {actionData?.errors?.systemPrompt && (
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{actionData.errors.systemPrompt}</p>
                    )}
                </div>

                {/* Context Settings */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">Context Settings</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="maxContextTokens" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Max Context Tokens
                            </label>
                            <input
                                type="number"
                                id="maxContextTokens"
                                name="maxContextTokens"
                                step="1024"
                                min="1024"
                                defaultValue="16384"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            />
                        </div>

                        <div>
                            <label htmlFor="maxOutputTokens" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Max Output Tokens
                            </label>
                            <input
                                type="number"
                                id="maxOutputTokens"
                                name="maxOutputTokens"
                                step="512"
                                min="512"
                                defaultValue="4096"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
                    >
                        Create Model
                    </button>
                    <a
                        href="/models"
                        className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-8 py-3 rounded-lg font-medium transition-colors"
                    >
                        Cancel
                    </a>
                </div>
            </Form>
        </div>
    );
}
