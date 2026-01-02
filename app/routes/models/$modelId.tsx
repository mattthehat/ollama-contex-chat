import type { Route } from './+types/$modelId';
import { Form, redirect, useActionData } from 'react-router';
import {
    getCustomModelWithDocuments,
    updateCustomModel,
    deleteCustomModel,
} from '~/lib/models.server';
import { getAllDocuments } from '~/lib/document.server';
import config from '~/lib/config';

export const loader = async ({ params }: Route.LoaderArgs) => {
    const model = await getCustomModelWithDocuments(params.modelId);
    if (!model) {
        throw new Response('Not Found', { status: 404 });
    }

    const allDocuments = await getAllDocuments();
    const availableModels = config.chatModels.map((m) => ({
        id: m.modelName,
        name: m.friendlyName,
    }));
    return { model, allDocuments, availableModels };
};

export const meta = ({ data }: Route.MetaArgs) => {
    if (!data || !data.model) {
        return [{ title: 'Model Not Found' }];
    }
    return [
        { title: `${data.model.modelName} - Ollama Context Chat` },
        {
            name: 'description',
            content: data.model.modelDescription || 'Custom AI model',
        },
    ];
};

type ActionData = {
    errors?: {
        modelName?: string;
        ollamaModel?: string;
        systemPrompt?: string;
    };
};

export const action = async ({ request, params }: Route.ActionArgs) => {
    const formData = await request.formData();
    const intent = formData.get('intent') as string;

    if (intent === 'delete') {
        await deleteCustomModel(params.modelId);
        return redirect('/models');
    }

    // Update logic
    const modelName = formData.get('modelName') as string;
    const modelDescription = formData.get('modelDescription') as string;
    const modelIcon = formData.get('modelIcon') as string;
    const ollamaModel = formData.get('ollamaModel') as string;
    const systemPrompt = formData.get('systemPrompt') as string;

    const ollamaTemperature = parseFloat(
        formData.get('ollamaTemperature') as string
    );
    const ollamaTopP = parseFloat(formData.get('ollamaTopP') as string);
    const ollamaTopK = parseInt(formData.get('ollamaTopK') as string);
    const ollamaRepeatPenalty = parseFloat(
        formData.get('ollamaRepeatPenalty') as string
    );
    const ragMaxChunks = parseInt(formData.get('ragMaxChunks') as string);
    const ragSimilarityThreshold = parseFloat(
        formData.get('ragSimilarityThreshold') as string
    );
    const maxContextTokens = parseInt(
        formData.get('maxContextTokens') as string
    );
    const maxOutputTokens = parseInt(formData.get('maxOutputTokens') as string);

    const useAdvancedRAG = formData.get('useAdvancedRAG') === 'on';
    const ragUseMultiQuery = formData.get('ragUseMultiQuery') === 'on';
    const ragUseHybridSearch = formData.get('ragUseHybridSearch') === 'on';
    const ragUseReranking = formData.get('ragUseReranking') === 'on';

    // Intelligent RAG features
    const ragUseHyDE = formData.get('ragUseHyDE') === 'on';
    const ragUseQueryDecomposition = formData.get('ragUseQueryDecomposition') === 'on';
    const ragUseContextCompression = formData.get('ragUseContextCompression') === 'on';
    const ragUseEntityTracking = formData.get('ragUseEntityTracking') === 'on';
    const ragEnableCitations = formData.get('ragEnableCitations') === 'on';
    const ragEnableConfidenceScoring = formData.get('ragEnableConfidenceScoring') === 'on';
    const ragEnableResponseEnhancement = formData.get('ragEnableResponseEnhancement') === 'on';
    const ragAddExecutiveSummary = formData.get('ragAddExecutiveSummary') === 'on';
    const ragAddFollowUpSuggestions = formData.get('ragAddFollowUpSuggestions') === 'on';
    const ragAddSmartDisclaimers = formData.get('ragAddSmartDisclaimers') === 'on';

    const documentIds = formData
        .getAll('documents')
        .map((id) => parseInt(id as string));

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
        await updateCustomModel(params.modelId, {
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
            ragUseHyDE,
            ragUseQueryDecomposition,
            ragUseContextCompression,
            ragUseEntityTracking,
            ragEnableCitations,
            ragEnableConfidenceScoring,
            ragEnableResponseEnhancement,
            ragAddExecutiveSummary,
            ragAddFollowUpSuggestions,
            ragAddSmartDisclaimers,
            systemPrompt,
            maxContextTokens,
            maxOutputTokens,
            documentIds,
        });

        return redirect('/models');
    } catch (error) {
        console.error('Error updating model:', error);
        return { errors: { modelName: 'Failed to update model' } };
    }
};

export default function ModelDetail({ loaderData }: Route.ComponentProps) {
    const { model, allDocuments, availableModels } = loaderData;
    const actionData = useActionData<ActionData>();
    const selectedDocumentIds = new Set(
        model.documents.map((d) => d.documentId)
    );

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-3 dark:text-white">
                    <span className="text-4xl">{model.modelIcon}</span>
                    {model.modelName}
                    {model.isDefault && (
                        <span className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded">
                            Default
                        </span>
                    )}
                </h1>
            </div>

            <Form method="post" className="space-y-8">
                {/* Same form structure as new.tsx, but with defaultValues from model */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">
                        Basic Information
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="modelName"
                                className="block text-sm font-medium mb-1 dark:text-gray-200"
                            >
                                Model Name *
                            </label>
                            <input
                                type="text"
                                id="modelName"
                                name="modelName"
                                defaultValue={model.modelName}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                required
                            />
                            {actionData?.errors?.modelName && (
                                <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                                    {actionData.errors.modelName}
                                </p>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="modelIcon"
                                className="block text-sm font-medium mb-1 dark:text-gray-200"
                            >
                                Icon (Emoji)
                            </label>
                            <input
                                type="text"
                                id="modelIcon"
                                name="modelIcon"
                                defaultValue={model.modelIcon}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                maxLength={10}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="modelDescription"
                                className="block text-sm font-medium mb-1 dark:text-gray-200"
                            >
                                Description
                            </label>
                            <textarea
                                id="modelDescription"
                                name="modelDescription"
                                rows={3}
                                defaultValue={model.modelDescription || ''}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Ollama Configuration */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">
                        Ollama Configuration
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="ollamaModel"
                                className="block text-sm font-medium mb-1 dark:text-gray-200"
                            >
                                Base Model *
                            </label>
                            <select
                                id="ollamaModel"
                                name="ollamaModel"
                                defaultValue={model.ollamaModel}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                required
                            >
                                {availableModels.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Temperature
                                </label>
                                <input
                                    type="number"
                                    name="ollamaTemperature"
                                    step="0.01"
                                    min="0"
                                    max="2"
                                    defaultValue={model.ollamaTemperature}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Top P
                                </label>
                                <input
                                    type="number"
                                    name="ollamaTopP"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    defaultValue={model.ollamaTopP}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Top K
                                </label>
                                <input
                                    type="number"
                                    name="ollamaTopK"
                                    step="1"
                                    min="1"
                                    defaultValue={model.ollamaTopK}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Repeat Penalty
                                </label>
                                <input
                                    type="number"
                                    name="ollamaRepeatPenalty"
                                    step="0.01"
                                    min="0"
                                    max="2"
                                    defaultValue={model.ollamaRepeatPenalty}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* RAG Configuration */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">
                        RAG Configuration
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="useAdvancedRAG"
                                name="useAdvancedRAG"
                                defaultChecked={model.useAdvancedRAG}
                                className="w-4 h-4"
                            />
                            <label
                                htmlFor="useAdvancedRAG"
                                className="text-sm font-medium dark:text-gray-200"
                            >
                                Use Advanced RAG
                            </label>
                        </div>

                        <div className="pl-7 space-y-3 border-l-2 border-gray-200 dark:border-gray-700">
                            <div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="ragUseMultiQuery"
                                        name="ragUseMultiQuery"
                                        className="w-4 h-4"
                                        defaultChecked={model.ragUseMultiQuery}
                                    />
                                    <label htmlFor="ragUseMultiQuery" className="text-sm dark:text-gray-300">
                                        Multi-Query Retrieval
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Generates multiple search variations to find more relevant context</p>
                            </div>

                            <div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="ragUseHybridSearch"
                                        name="ragUseHybridSearch"
                                        className="w-4 h-4"
                                        defaultChecked={model.ragUseHybridSearch}
                                    />
                                    <label htmlFor="ragUseHybridSearch" className="text-sm dark:text-gray-300">
                                        Hybrid Search
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Combines semantic (vector) and keyword (BM25) search for better results</p>
                            </div>

                            <div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="ragUseReranking"
                                        name="ragUseReranking"
                                        className="w-4 h-4"
                                        defaultChecked={model.ragUseReranking}
                                    />
                                    <label htmlFor="ragUseReranking" className="text-sm dark:text-gray-300">
                                        Re-ranking
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Reorders search results by relevance for higher quality context</p>
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
                                    defaultValue={model.ragMaxChunks}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum number of document chunks to include in context (higher = more info, slower)</p>
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
                                    defaultValue={model.ragSimilarityThreshold}
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Minimum similarity score to include a chunk (0.1 = very lenient, 0.7 = strict)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Intelligent RAG Features */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">Intelligent RAG Features</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Professional-grade features for better retrieval, citations, and response quality
                    </p>

                    <div className="space-y-4">
                        {/* Core Intelligent Features */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold dark:text-white">Core Intelligence</h3>

                            <div className="pl-4 space-y-3 border-l-2 border-blue-200 dark:border-blue-700">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragUseHyDE"
                                            name="ragUseHyDE"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragUseHyDE}
                                        />
                                        <label htmlFor="ragUseHyDE" className="text-sm font-medium dark:text-gray-300">
                                            HyDE (Hypothetical Document Embeddings)
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Generates hypothetical answers for 30-50% better retrieval accuracy</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragUseQueryDecomposition"
                                            name="ragUseQueryDecomposition"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragUseQueryDecomposition}
                                        />
                                        <label htmlFor="ragUseQueryDecomposition" className="text-sm font-medium dark:text-gray-300">
                                            Query Decomposition
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Breaks complex questions into sub-queries for comprehensive answers</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragUseContextCompression"
                                            name="ragUseContextCompression"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragUseContextCompression}
                                        />
                                        <label htmlFor="ragUseContextCompression" className="text-sm font-medium dark:text-gray-300">
                                            Contextual Compression
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Removes irrelevant sentences, fits 2-3x more relevant content in context</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragUseEntityTracking"
                                            name="ragUseEntityTracking"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragUseEntityTracking}
                                        />
                                        <label htmlFor="ragUseEntityTracking" className="text-sm font-medium dark:text-gray-300">
                                            Entity Tracking
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Tracks topics and concepts across conversation for better context</p>
                                </div>
                            </div>
                        </div>

                        {/* Quality Features */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold dark:text-white">Quality & Accuracy</h3>

                            <div className="pl-4 space-y-3 border-l-2 border-green-200 dark:border-green-700">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragEnableCitations"
                                            name="ragEnableCitations"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragEnableCitations}
                                        />
                                        <label htmlFor="ragEnableCitations" className="text-sm font-medium dark:text-gray-300">
                                            Citations [1], [2]
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Add inline citations with page numbers to responses</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragEnableConfidenceScoring"
                                            name="ragEnableConfidenceScoring"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragEnableConfidenceScoring}
                                        />
                                        <label htmlFor="ragEnableConfidenceScoring" className="text-sm font-medium dark:text-gray-300">
                                            Confidence Scoring
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Calculates high/medium/low confidence for answer quality</p>
                                </div>
                            </div>
                        </div>

                        {/* Response Enhancement */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold dark:text-white">Response Enhancement</h3>

                            <div className="pl-4 space-y-3 border-l-2 border-purple-200 dark:border-purple-700">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragEnableResponseEnhancement"
                                            name="ragEnableResponseEnhancement"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragEnableResponseEnhancement}
                                        />
                                        <label htmlFor="ragEnableResponseEnhancement" className="text-sm font-medium dark:text-gray-300">
                                            Professional Formatting
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Enhances responses with proper structure, code blocks, and formatting</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragAddExecutiveSummary"
                                            name="ragAddExecutiveSummary"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragAddExecutiveSummary}
                                        />
                                        <label htmlFor="ragAddExecutiveSummary" className="text-sm font-medium dark:text-gray-300">
                                            Executive Summaries
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Add brief summaries for long responses (300+ words)</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragAddFollowUpSuggestions"
                                            name="ragAddFollowUpSuggestions"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragAddFollowUpSuggestions}
                                        />
                                        <label htmlFor="ragAddFollowUpSuggestions" className="text-sm font-medium dark:text-gray-300">
                                            Follow-up Suggestions
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Suggest relevant follow-up questions based on context</p>
                                </div>

                                <div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="ragAddSmartDisclaimers"
                                            name="ragAddSmartDisclaimers"
                                            className="w-4 h-4"
                                            defaultChecked={model.ragAddSmartDisclaimers}
                                        />
                                        <label htmlFor="ragAddSmartDisclaimers" className="text-sm font-medium dark:text-gray-300">
                                            Smart Disclaimers
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Auto-add appropriate disclaimers (legal, medical, financial, security)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Document Library */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">
                        Document Library
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Currently selected: {model.documents.length} documents
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4 dark:bg-gray-750">
                        {allDocuments.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-sm">
                                No documents available
                            </p>
                        ) : (
                            allDocuments.map((doc) => (
                                <div
                                    key={doc.documentUUID}
                                    className="flex items-center gap-3"
                                >
                                    <input
                                        type="checkbox"
                                        id={`doc-${doc.documentUUID}`}
                                        name="documents"
                                        value={doc.documentId}
                                        defaultChecked={selectedDocumentIds.has(
                                            doc.documentId
                                        )}
                                        className="w-4 h-4"
                                    />
                                    <label
                                        htmlFor={`doc-${doc.documentUUID}`}
                                        className="text-sm flex-1"
                                    >
                                        {doc.documentTitle}
                                        <span className="text-gray-500 dark:text-gray-400 ml-2">
                                            ({doc.documentType})
                                        </span>
                                    </label>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* System Prompt */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">
                        System Prompt *
                    </h2>
                    <textarea
                        name="systemPrompt"
                        rows={32}
                        defaultValue={model.systemPrompt}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 font-mono text-sm"
                        required
                    />
                </div>

                {/* Context Settings */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">
                        Context Settings
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Max Context Tokens
                            </label>
                            <input
                                type="number"
                                name="maxContextTokens"
                                step="1024"
                                min="1024"
                                defaultValue={model.maxContextTokens}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Max Output Tokens
                            </label>
                            <input
                                type="number"
                                name="maxOutputTokens"
                                step="512"
                                min="512"
                                defaultValue={model.maxOutputTokens}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-4">
                        <button
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
                        >
                            Save Changes
                        </button>
                        <a
                            href="/models"
                            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-8 py-3 rounded-lg font-medium transition-colors inline-block"
                        >
                            Cancel
                        </a>
                    </div>

                    {!model.isDefault && (
                        <button
                            type="submit"
                            name="intent"
                            value="delete"
                            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
                            onClick={(e) => {
                                if (
                                    !confirm(
                                        'Are you sure you want to delete this model?'
                                    )
                                ) {
                                    e.preventDefault();
                                }
                            }}
                        >
                            Delete Model
                        </button>
                    )}
                </div>
            </Form>
        </div>
    );
}
