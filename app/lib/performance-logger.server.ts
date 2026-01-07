import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

type PerformanceLogEntry = {
    timestamp: string;
    chatId?: string;
    userId?: string;
    messagePreview: string;
    modelName: string;
    timings: {
        total: number;
        modelLookup: number;
        parallelOperations: number;
        documentConversion?: number;
        tokenCalculations: number;
        ragProcessing?: number;
        embeddingGeneration?: number;
        vectorSearch?: number;
        systemPromptProtection: number;
    };
    metadata: {
        hasDocuments: boolean;
        documentCount: number;
        useIntelligentRAG: boolean;
        conversationLength: number;
        ragChunksFound?: number;
        cacheHit?: boolean;
    };
};

class PerformanceLogger {
    private logPath: string;
    private isEnabled: boolean;

    constructor() {
        // Use environment variable or default to logs/performance.log
        this.logPath = process.env.PERFORMANCE_LOG_PATH || './logs/performance.log';
        this.isEnabled = process.env.PERFORMANCE_LOGGING_ENABLED !== 'false'; // Enabled by default

        // Ensure logs directory exists
        const logDir = join(process.cwd(), 'logs');
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }
    }

    log(entry: PerformanceLogEntry): void {
        if (!this.isEnabled) {
            return;
        }

        try {
            const logLine = JSON.stringify({
                ...entry,
                timestamp: new Date().toISOString(),
            }) + '\n';

            const fullPath = join(process.cwd(), this.logPath);
            appendFileSync(fullPath, logLine, 'utf-8');

            // Also log summary to console for quick viewing
            this.logToConsole(entry);
        } catch (error) {
            console.error('Failed to write performance log:', error);
        }
    }

    private logToConsole(entry: PerformanceLogEntry): void {
        const ragInfo = entry.timings.ragProcessing
            ? ` | RAG: ${entry.timings.ragProcessing.toFixed(0)}ms (${entry.metadata.ragChunksFound || 0} chunks)`
            : '';

        console.log(
            `[PERF] ${entry.timings.total.toFixed(0)}ms total | ` +
            `Model: ${entry.modelName}${ragInfo} | ` +
            `Msg: "${entry.messagePreview}"`
        );
    }

    // Helper to analyze performance logs
    getLogPath(): string {
        return join(process.cwd(), this.logPath);
    }
}

// Singleton instance
export const performanceLogger = new PerformanceLogger();

// Helper type for tracking timings during request
export type TimingTracker = {
    startTime: number;
    modelLookupStart?: number;
    modelLookupEnd?: number;
    parallelStart?: number;
    parallelEnd?: number;
    docConversionStart?: number;
    docConversionEnd?: number;
    tokenCalcStart?: number;
    tokenCalcEnd?: number;
    ragStart?: number;
    ragEnd?: number;
    embeddingStart?: number;
    embeddingEnd?: number;
    vectorSearchStart?: number;
    vectorSearchEnd?: number;
    protectStart?: number;
    protectEnd?: number;
};

export function createTimingTracker(): TimingTracker {
    return {
        startTime: performance.now(),
    };
}

export function logPerformance(
    tracker: TimingTracker,
    metadata: {
        chatId?: string;
        userId?: string;
        message: string;
        modelName: string;
        hasDocuments: boolean;
        documentCount: number;
        useIntelligentRAG: boolean;
        conversationLength: number;
        ragChunksFound?: number;
        cacheHit?: boolean;
    }
): void {
    const now = performance.now();
    const totalTime = now - tracker.startTime;

    // Truncate message preview to 50 chars
    const messagePreview = metadata.message.length > 50
        ? metadata.message.substring(0, 50) + '...'
        : metadata.message;

    const entry: PerformanceLogEntry = {
        timestamp: new Date().toISOString(),
        chatId: metadata.chatId,
        userId: metadata.userId,
        messagePreview,
        modelName: metadata.modelName,
        timings: {
            total: totalTime,
            modelLookup: tracker.modelLookupEnd && tracker.modelLookupStart
                ? tracker.modelLookupEnd - tracker.modelLookupStart
                : 0,
            parallelOperations: tracker.parallelEnd && tracker.parallelStart
                ? tracker.parallelEnd - tracker.parallelStart
                : 0,
            documentConversion: tracker.docConversionEnd && tracker.docConversionStart
                ? tracker.docConversionEnd - tracker.docConversionStart
                : undefined,
            tokenCalculations: tracker.tokenCalcEnd && tracker.tokenCalcStart
                ? tracker.tokenCalcEnd - tracker.tokenCalcStart
                : 0,
            ragProcessing: tracker.ragEnd && tracker.ragStart
                ? tracker.ragEnd - tracker.ragStart
                : undefined,
            embeddingGeneration: tracker.embeddingEnd && tracker.embeddingStart
                ? tracker.embeddingEnd - tracker.embeddingStart
                : undefined,
            vectorSearch: tracker.vectorSearchEnd && tracker.vectorSearchStart
                ? tracker.vectorSearchEnd - tracker.vectorSearchStart
                : undefined,
            systemPromptProtection: tracker.protectEnd && tracker.protectStart
                ? tracker.protectEnd - tracker.protectStart
                : 0,
        },
        metadata: {
            hasDocuments: metadata.hasDocuments,
            documentCount: metadata.documentCount,
            useIntelligentRAG: metadata.useIntelligentRAG,
            conversationLength: metadata.conversationLength,
            ragChunksFound: metadata.ragChunksFound,
            cacheHit: metadata.cacheHit,
        },
    };

    performanceLogger.log(entry);
}
