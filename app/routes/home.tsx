import type { Route } from './+types/home';

export function meta({}: Route.MetaArgs) {
    return [
        { title: 'Ollama Context Chat' },
        { name: 'description', content: 'Chat with Ollama AI' },
    ];
}

export default function Home() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-10">
            <h1 className="text-4xl font-bold text-center mb-8">
                Ollama Context Chat
            </h1>

            <div className="space-y-8">
                <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-2xl font-semibold mb-4">
                        What is This App?
                    </h2>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                        A RAG (Retrieval-Augmented Generation) chat application
                        that lets you have conversations with local Ollama AI
                        models while providing them with context from your
                        document library.
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                        <li>
                            <strong>Chat with Local AI Models</strong> - Stream
                            responses from Ollama models running on your machine
                        </li>
                        <li>
                            <strong>Document Library</strong> - Upload and store
                            documents (PDFs, text, markdown, code)
                        </li>
                        <li>
                            <strong>Context-Aware Conversations</strong> - Select
                            documents to provide relevant context to the AI
                        </li>
                        <li>
                            <strong>Vector Search</strong> - Uses embeddings to
                            find semantically relevant chunks from your documents
                        </li>
                        <li>
                            <strong>Persistent Storage</strong> - Stores chat
                            history and document embeddings in MariaDB
                        </li>
                    </ul>
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-2xl font-semibold mb-4">
                        Required Models
                    </h2>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                        The app expects the following Ollama models to be
                        installed:
                    </p>

                    <div className="mb-4">
                        <h3 className="text-lg font-semibold mb-2">
                            Chat Models:
                        </h3>
                        <ul className="list-none space-y-1 text-gray-700 dark:text-gray-300 font-mono text-sm">
                            <li>• gemma3:latest</li>
                            <li>• deepseek-r1:1.5b</li>
                            <li>• llama3.2:1b</li>
                            <li>• gemma3:1b</li>
                        </ul>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-lg font-semibold mb-2">
                            Embedding Model:
                        </h3>
                        <ul className="list-none space-y-1 text-gray-700 dark:text-gray-300 font-mono text-sm">
                            <li>• nomic-embed-text:latest</li>
                        </ul>
                    </div>

                    <div className="bg-gray-100 dark:bg-gray-900 rounded p-4 mt-4">
                        <h3 className="text-lg font-semibold mb-2">
                            Installation Commands:
                        </h3>
                        <pre className="text-sm overflow-x-auto">
                            <code className="text-gray-800 dark:text-gray-200">
                                {`ollama pull gemma3:latest
ollama pull deepseek-r1:1.5b
ollama pull llama3.2:1b
ollama pull gemma3:1b
ollama pull nomic-embed-text:latest`}
                            </code>
                        </pre>
                    </div>
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-2xl font-semibold mb-4">
                        How to Update Models
                    </h2>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                        To use different models, edit the configuration in{' '}
                        <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded text-sm">
                            app/lib/config.ts
                        </code>
                        :
                    </p>
                    <div className="bg-gray-100 dark:bg-gray-900 rounded p-4">
                        <pre className="text-sm overflow-x-auto">
                            <code className="text-gray-800 dark:text-gray-200">
                                {`const config = {
    ollamaEndpoint: 'http://localhost:11434/api/chat',
    maxContext: 16384,
    chatModels: [
        {
            friendlyName: 'Your Model Name',
            modelName: 'ollama-model:tag',
        },
        // Add more models...
    ],
    embedModel: 'your-embedding-model:latest',
};`}
                            </code>
                        </pre>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 mt-4">
                        Make sure to pull any new models with{' '}
                        <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded text-sm">
                            ollama pull model-name:tag
                        </code>{' '}
                        before using them.
                    </p>
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-2xl font-semibold mb-4">
                        Getting Started
                    </h2>
                    <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
                        <li>
                            Make sure Ollama is running on{' '}
                            <code className="bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded text-sm">
                                http://localhost:11434
                            </code>
                        </li>
                        <li>Pull the required models using the commands above</li>
                        <li>
                            Ensure MariaDB 11.7+ is running with vector support
                        </li>
                        <li>
                            Upload documents to your library (optional but
                            recommended for RAG)
                        </li>
                        <li>Start a new chat and select documents for context</li>
                        <li>Choose your preferred model and start chatting!</li>
                    </ol>
                </section>
            </div>
        </div>
    );
}
