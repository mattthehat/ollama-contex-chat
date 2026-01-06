const config = {
    // Ollama Configuration
    ollamaEndpoint: 'http://localhost:11434/api/chat',
    // PERFORMANCE: Reduced from 16384 to 8192 for faster response times
    // Most conversations don't need 16K context, and smaller context = faster processing
    maxContext: 8192,
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
        {
            friendlyName: 'Granite 3 Moe',
            modelName: 'granite3.1-moe',
        },
        {
            friendlyName: 'Granite 4 Micro',
            modelName: 'granite4:micro',
        },
    ],
    embedModel: 'nomic-embed-text:latest',

    // Security Settings
    security: {
        maxUploadSize: 50 * 1024 * 1024, // 50MB
        maxDocumentsPerUser: 1000,
        maxChunksPerDocument: 10000,
        enablePIIDetection: true,
        enablePromptInjectionProtection: true,
        allowedFileTypes: ['.pdf', '.txt', '.md', '.markdown'],
        maxFilenameLength: 255,
    },

    // Rate Limiting
    rateLimit: {
        upload: {
            maxRequests: 10, // per hour
            windowMs: 60 * 60 * 1000,
            blockDuration: 15 * 60 * 1000,
        },
        query: {
            maxRequests: 60, // per minute
            windowMs: 60 * 1000,
        },
        embedding: {
            maxRequests: 100, // per minute
            windowMs: 60 * 1000,
        },
    },

    // Performance Settings
    performance: {
        embeddingBatchSize: 5,
        maxConcurrentEmbeddings: 3,
        cacheTTL: 3600, // 1 hour in seconds
        enableCircuitBreaker: true,
    },

    // RAG Quality Settings
    rag: {
        minSimilarityThreshold: 0.3,
        // PERFORMANCE: Reduced from 5 to 3 chunks for faster processing
        // 3 chunks is sufficient for most queries while significantly improving speed
        maxContextChunks: 3,
        // PERFORMANCE: Disabled reranking by default for speed (can be enabled per-model)
        enableReranking: false,
        enableHybridSearch: true,
        enableCitations: true,
        enableConfidenceScoring: true,
    },
} as const;

export default config;
