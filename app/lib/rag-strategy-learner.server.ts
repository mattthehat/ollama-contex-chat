/**
 * Performance-Based RAG Strategy Learner
 * Analyzes performance logs to determine when HyDE/advanced RAG is worth the cost
 */

import fs from 'fs';
import path from 'path';

export interface RAGStrategyRecommendation {
    useHyDE: boolean;
    reason: string;
    confidence: number; // 0-1
}

interface PerformanceLogEntry {
    timestamp: string;
    chatId: string;
    messagePreview: string;
    modelName: string;
    timings: {
        total: number;
        ragProcessing?: number;
        embeddingGeneration?: number;
    };
    metadata: {
        hasDocuments: boolean;
        documentCount: number;
        useIntelligentRAG: boolean;
        conversationLength: number;
        ragChunksFound: number;
    };
}

/**
 * Analyze query to recommend RAG strategy based on learned patterns
 * This is FAST - just pattern matching, no LLM calls
 */
export function recommendRAGStrategy(
    message: string,
    conversationLength: number,
    documentCount: number,
    useIntelligentRAGEnabled: boolean
): RAGStrategyRecommendation {
    // If user hasn't enabled intelligent RAG, always use fast path
    if (!useIntelligentRAGEnabled) {
        return {
            useHyDE: false,
            reason: 'Intelligent RAG not enabled in model config',
            confidence: 1.0,
        };
    }

    const wordCount = message.trim().split(/\s+/).length;

    // RULE 1: Simple factual queries don't benefit from HyDE
    // Pattern: "What is X?", "Who is Y?", "When did Z?"
    const simpleFactualPatterns = [
        /^what is /i,
        /^who is /i,
        /^when did /i,
        /^when was /i,
        /^where is /i,
        /^define /i,
    ];

    if (simpleFactualPatterns.some((p) => p.test(message)) && wordCount < 10) {
        return {
            useHyDE: false,
            reason: 'Simple factual query - fast retrieval sufficient',
            confidence: 0.85,
        };
    }

    // RULE 2: Very short queries (<5 words) rarely benefit from HyDE
    // They're ambiguous anyway, HyDE won't help much
    if (wordCount < 5) {
        return {
            useHyDE: false,
            reason: 'Query too short for meaningful HyDE improvement',
            confidence: 0.9,
        };
    }

    // RULE 3: Early in conversation (<6 messages), skip HyDE
    // Not enough context for HyDE to generate good hypothetical answers
    if (conversationLength < 6) {
        return {
            useHyDE: false,
            reason: 'Early in conversation - insufficient context for HyDE',
            confidence: 0.8,
        };
    }

    // RULE 4: Complex analytical queries benefit from HyDE
    // Pattern: "Compare", "Analyze", "Explain how", "Why does"
    const complexAnalyticalPatterns = [
        /\b(compare|contrast|difference|versus|vs)\b/i,
        /\b(analyze|analysis|evaluate)\b/i,
        /\bexplain (how|why)\b/i,
        /\bwhy (does|do|is|are)\b/i,
        /\b(implications?|consequences?|effects?)\b/i,
    ];

    if (complexAnalyticalPatterns.some((p) => p.test(message))) {
        return {
            useHyDE: true,
            reason: 'Complex analytical query benefits from HyDE retrieval',
            confidence: 0.85,
        };
    }

    // RULE 5: Multi-document searches benefit from HyDE
    if (documentCount >= 3) {
        return {
            useHyDE: true,
            reason: 'Multiple documents - HyDE improves cross-doc retrieval',
            confidence: 0.75,
        };
    }

    // RULE 6: Longer, detailed questions (>20 words) often benefit
    if (wordCount > 20) {
        return {
            useHyDE: true,
            reason: 'Detailed query - HyDE can capture nuanced intent',
            confidence: 0.7,
        };
    }

    // DEFAULT: Use fast path for average queries
    return {
        useHyDE: false,
        reason: 'Standard query - fast retrieval recommended',
        confidence: 0.7,
    };
}

/**
 * Analyze performance logs to extract learnings
 * This runs periodically (not on every request) to update strategy rules
 */
export async function analyzePerformanceLogs(logPath: string): Promise<{
    avgHyDEBenefit: number;
    recommendationsAccuracy: number;
    insights: string[];
}> {
    try {
        if (!fs.existsSync(logPath)) {
            console.log('[RAG-LEARNER] No performance log found yet');
            return {
                avgHyDEBenefit: 0,
                recommendationsAccuracy: 0,
                insights: ['No performance data available yet'],
            };
        }

        const logContent = fs.readFileSync(logPath, 'utf-8');
        const lines = logContent.trim().split('\n').filter((l) => l.trim());

        if (lines.length === 0) {
            return {
                avgHyDEBenefit: 0,
                recommendationsAccuracy: 0,
                insights: ['Performance log is empty'],
            };
        }

        const entries: PerformanceLogEntry[] = lines
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((e): e is PerformanceLogEntry => e !== null);

        // Separate HyDE vs. non-HyDE requests
        const hydeRequests = entries.filter((e) => e.metadata.useIntelligentRAG);
        const fastRequests = entries.filter((e) => !e.metadata.useIntelligentRAG);

        if (hydeRequests.length === 0 || fastRequests.length === 0) {
            return {
                avgHyDEBenefit: 0,
                recommendationsAccuracy: 0,
                insights: [
                    'Need both HyDE and fast-path requests to compare',
                    `HyDE requests: ${hydeRequests.length}`,
                    `Fast requests: ${fastRequests.length}`,
                ],
            };
        }

        // Calculate average processing times
        const avgHyDETime =
            hydeRequests.reduce((sum, e) => sum + e.timings.total, 0) / hydeRequests.length;
        const avgFastTime =
            fastRequests.reduce((sum, e) => sum + e.timings.total, 0) / fastRequests.length;

        // Calculate average chunks found (proxy for result quality)
        const avgHyDEChunks =
            hydeRequests.reduce((sum, e) => sum + e.metadata.ragChunksFound, 0) /
            hydeRequests.length;
        const avgFastChunks =
            fastRequests.reduce((sum, e) => sum + e.metadata.ragChunksFound, 0) /
            fastRequests.length;

        const insights = [
            `Analyzed ${entries.length} requests (${hydeRequests.length} HyDE, ${fastRequests.length} fast)`,
            `Avg HyDE time: ${avgHyDETime.toFixed(0)}ms vs Fast: ${avgFastTime.toFixed(0)}ms`,
            `Avg chunks found: HyDE=${avgHyDEChunks.toFixed(1)}, Fast=${avgFastChunks.toFixed(1)}`,
            `HyDE overhead: ${((avgHyDETime / avgFastTime - 1) * 100).toFixed(0)}% slower`,
        ];

        // HyDE benefit = chunk quality improvement vs. time cost
        const qualityImprovement = avgHyDEChunks / (avgFastChunks || 1);
        const timeCost = avgHyDETime / avgFastTime;
        const benefit = qualityImprovement / timeCost; // Higher is better

        return {
            avgHyDEBenefit: benefit,
            recommendationsAccuracy: 0.75, // Placeholder - would track actual accuracy
            insights,
        };
    } catch (error) {
        console.error('[RAG-LEARNER] Error analyzing logs:', error);
        return {
            avgHyDEBenefit: 0,
            recommendationsAccuracy: 0,
            insights: [`Error: ${error}`],
        };
    }
}
