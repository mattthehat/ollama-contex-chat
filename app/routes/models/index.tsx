import type { Route } from './+types/index';
import { Link } from 'react-router';
import { getAllCustomModels } from '~/lib/models.server';

export const loader = async () => {
    const models = await getAllCustomModels();
    return { models };
};

export const meta = () => {
    return [
        { title: 'AI Models - Ollama Context Chat' },
        { name: 'description', content: 'Manage your custom AI models' },
    ];
};

export default function ModelsIndex({ loaderData }: Route.ComponentProps) {
    const { models } = loaderData;

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold dark:text-white">AI Models</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Create specialized AI assistants with custom configurations and document libraries
                    </p>
                </div>
                <Link
                    to="/models/new"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                    + New Model
                </Link>
            </div>

            {models.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">No custom models yet</p>
                    <Link
                        to="/models/new"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                        Create Your First Model
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {models.map((model) => (
                        <Link
                            key={model.modelUUID}
                            to={`/models/${model.modelUUID}`}
                            className="block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 p-6"
                        >
                            <div className="flex items-start gap-4">
                                <div className="text-4xl">{model.modelIcon}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className="font-semibold text-lg truncate dark:text-white">
                                            {model.modelName}
                                        </h3>
                                        {model.isDefault && (
                                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    {model.modelDescription && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                                            {model.modelDescription}
                                        </p>
                                    )}
                                    <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">Model:</span>
                                            <span>{model.ollamaModel}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">RAG:</span>
                                            <span>
                                                {model.useAdvancedRAG ? 'Advanced' : 'Standard'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">Max Chunks:</span>
                                            <span>{model.ragMaxChunks}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
