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

    // Agent configuration
    const agentMode = formData.get('agentMode') as 'disabled' | 'auto' | 'forced';
    const agentMaxIterations = parseInt(formData.get('agentMaxIterations') as string);
    const agentTemperature = parseFloat(formData.get('agentTemperature') as string);
    const agentComplexityThreshold = formData.get('agentComplexityThreshold') as 'low' | 'medium' | 'high';
    const agentShowReasoning = formData.get('agentShowReasoning') === 'on';

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
            agentMode,
            agentMaxIterations,
            agentTemperature,
            agentComplexityThreshold,
            agentShowReasoning,
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
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A friendly name to identify this AI model</p>
                            {actionData?.errors?.modelName && (
                                <p className="text-red-600 dark:text-red-400 text-sm mt-1">{actionData.errors.modelName}</p>
                            )}
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
                                placeholder="Describe what this AI model is specialised for..."
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Optional description of the model's purpose and capabilities</p>
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
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The underlying Ollama model that powers this AI assistant</p>
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
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Controls randomness: 0 = deterministic, 1 = balanced, 2 = very creative</p>
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
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Limits token choices to top probability mass (0.9 = top 90% likely tokens)</p>
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
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Limits token choices to top K most likely options (40 = consider 40 tokens)</p>
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
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Discourages repetition: 1.0 = no penalty, 1.1 = slight penalty, 2.0 = strong penalty</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RAG Configuration */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">RAG Configuration</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="useAdvancedRAG"
                                    name="useAdvancedRAG"
                                    className="w-4 h-4"
                                    defaultChecked
                                />
                                <label htmlFor="useAdvancedRAG" className="text-sm font-medium dark:text-gray-200">
                                    Use Advanced RAG
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Enables sophisticated retrieval techniques for better context matching</p>
                        </div>

                        <div className="pl-7 space-y-3 border-l-2 border-gray-200 dark:border-gray-700">
                            <div>
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
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">Generates multiple search variations to find more relevant context</p>
                            </div>

                            <div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="ragUseHybridSearch"
                                        name="ragUseHybridSearch"
                                        className="w-4 h-4"
                                        defaultChecked
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
                                        defaultChecked
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
                                    defaultValue="5"
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
                                    defaultValue="0.1"
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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
                                            defaultChecked
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

                {/* Agent Configuration */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold mb-4 dark:text-white">Agent Mode (ReAct)</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Configure multi-step reasoning capabilities for complex queries. The agent can automatically detect query complexity and use tools to gather information.
                    </p>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="agentMode" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Agent Mode
                            </label>
                            <select
                                id="agentMode"
                                name="agentMode"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                defaultValue="auto"
                            >
                                <option value="disabled">Disabled - Never use agent mode</option>
                                <option value="auto">Auto - Detect complexity and use agent when needed</option>
                                <option value="forced">Forced - Always use agent mode</option>
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Auto mode automatically activates agent reasoning for complex queries
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="agentMaxIterations" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Max Iterations
                                </label>
                                <input
                                    type="number"
                                    id="agentMaxIterations"
                                    name="agentMaxIterations"
                                    min="1"
                                    max="10"
                                    step="1"
                                    defaultValue="5"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum reasoning loops (1-10)</p>
                            </div>

                            <div>
                                <label htmlFor="agentTemperature" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                    Agent Temperature
                                </label>
                                <input
                                    type="number"
                                    id="agentTemperature"
                                    name="agentTemperature"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    defaultValue="0.7"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Creativity for reasoning (0.0-1.0)</p>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="agentComplexityThreshold" className="block text-sm font-medium mb-1 dark:text-gray-200">
                                Complexity Threshold
                            </label>
                            <select
                                id="agentComplexityThreshold"
                                name="agentComplexityThreshold"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700 dark:text-white"
                                defaultValue="medium"
                            >
                                <option value="low">Low - Activate for most queries</option>
                                <option value="medium">Medium - Balanced (recommended)</option>
                                <option value="high">High - Only very complex queries</option>
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Minimum query complexity required to trigger agent mode in auto mode
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="agentShowReasoning"
                                    name="agentShowReasoning"
                                    className="w-4 h-4"
                                    defaultChecked
                                />
                                <label htmlFor="agentShowReasoning" className="text-sm font-medium dark:text-gray-300">
                                    Show Reasoning Steps
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
                                Display the agent's thought process, actions, and observations to users
                            </p>
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
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Define the AI's role, personality, and behaviour. This instruction is sent with every message.
                    </p>
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
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total tokens for conversation history + documents (check your model's limit)</p>
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
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum length of AI responses (higher allows longer answers)</p>
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
