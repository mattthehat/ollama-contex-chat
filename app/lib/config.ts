const config = {
    ollamaEndpoint: 'http://localhost:11434/api/chat',
    maxContext: 16384,
    chatModels: [
        {
            friendlyName: 'Gemma 3 8B',
            modelName: 'gemma3:latest',
        },
        {
            friendlyName: 'DeepSeek R1 1.5B',
            modelName: 'deepseek-r1:1.5b',
        },
        {
            friendlyName: 'Llama 3.2 1B',
            modelName: 'llama3.2:1b',
        },
        {
            friendlyName: 'Gemma3 1B',
            modelName: 'gemma3:1b',
        },
    ],
    embedModel: 'nomic-embed-text:latest',
} as const;

export default config;
