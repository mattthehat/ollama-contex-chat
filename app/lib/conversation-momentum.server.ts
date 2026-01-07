/**
 * Conversation Momentum Detection
 * Analyzes conversation patterns to determine if user is going deeper or switching topics
 */

import { extractEntities } from './intelligent-rag.server';

export type ConversationMomentum =
    | 'deepening'      // User exploring topic in more detail
    | 'switching'      // User changing topics
    | 'continuing'     // User continuing same topic at same depth
    | 'initial';       // First message in conversation

export interface MomentumAnalysis {
    momentum: ConversationMomentum;
    entityOverlap: number;      // 0-1 scale
    topicConsistency: number;   // 0-1 scale
    depthIndicator: number;     // 0-1 scale (0=surface, 1=deep)
    recommendations: {
        adjustChunkLimit?: number;
        adjustContextWindow?: number;
        useMoreHistory?: boolean;
        resetContext?: boolean;
    };
}

/**
 * Analyze conversation momentum to guide RAG strategy
 */
export function analyzeConversationMomentum(
    currentMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
): MomentumAnalysis {
    // Initial message - no history to compare
    if (conversationHistory.length === 0) {
        return {
            momentum: 'initial',
            entityOverlap: 0,
            topicConsistency: 0,
            depthIndicator: 0,
            recommendations: {
                adjustChunkLimit: 5, // Start with full context
            },
        };
    }

    // Extract entities from current message and recent history
    const currentEntities = extractEntities([{ role: 'user', content: currentMessage }]);
    const recentMessages = conversationHistory.slice(-6); // Last 3 exchanges
    const recentEntities = extractEntities(recentMessages);

    // Calculate entity overlap (Jaccard similarity)
    const currentEntitySet = new Set(currentEntities.map((e) => e.value.toLowerCase()));
    const recentEntitySet = new Set(recentEntities.map((e) => e.value.toLowerCase()));

    const intersection = new Set(
        [...currentEntitySet].filter((x) => recentEntitySet.has(x))
    );
    const union = new Set([...currentEntitySet, ...recentEntitySet]);
    const entityOverlap = union.size > 0 ? intersection.size / union.size : 0;

    // Calculate depth indicator - longer questions, technical terms, "how", "why" indicate depth
    const depthSignals = {
        wordCount: currentMessage.split(/\s+/).length,
        hasHow: /\bhow\b/i.test(currentMessage),
        hasWhy: /\bwhy\b/i.test(currentMessage),
        hasExplain: /\bexplain\b/i.test(currentMessage),
        hasTechnicalTerms: currentEntities.some(
            (e) => /^[A-Z][a-z]+[A-Z]/.test(e.value) || e.value.toUpperCase() === e.value
        ),
        hasFollowUpMarkers: /\b(also|additionally|furthermore|moreover|specifically)\b/i.test(
            currentMessage
        ),
    };

    let depthScore = 0;
    if (depthSignals.wordCount > 15) depthScore += 0.2;
    if (depthSignals.wordCount > 30) depthScore += 0.1;
    if (depthSignals.hasHow || depthSignals.hasWhy) depthScore += 0.2;
    if (depthSignals.hasExplain) depthScore += 0.15;
    if (depthSignals.hasTechnicalTerms) depthScore += 0.2;
    if (depthSignals.hasFollowUpMarkers) depthScore += 0.15;

    const depthIndicator = Math.min(1, depthScore);

    // Topic consistency - check if user messages maintain similar themes
    const userMessages = conversationHistory.filter((m) => m.role === 'user').slice(-3);
    let topicConsistency = 0;
    if (userMessages.length >= 2) {
        const allUserEntities = extractEntities(userMessages);
        const entityCounts = new Map<string, number>();
        allUserEntities.forEach((e) => {
            const key = e.value.toLowerCase();
            entityCounts.set(key, (entityCounts.get(key) || 0) + 1);
        });

        // Consistency = how many entities appear multiple times
        const repeatedEntities = Array.from(entityCounts.values()).filter((count) => count > 1);
        topicConsistency =
            entityCounts.size > 0 ? repeatedEntities.length / entityCounts.size : 0;
    }

    // Determine momentum based on metrics
    let momentum: ConversationMomentum;
    let recommendations: MomentumAnalysis['recommendations'] = {};

    if (entityOverlap > 0.7 && depthIndicator > 0.5) {
        // High overlap + deep questions = deepening exploration
        momentum = 'deepening';
        recommendations = {
            adjustChunkLimit: 7, // Increase chunks for detailed context
            adjustContextWindow: 40, // Use more conversation history
            useMoreHistory: true,
        };
    } else if (entityOverlap < 0.3) {
        // Low overlap = topic switch
        momentum = 'switching';
        recommendations = {
            adjustChunkLimit: 4, // Fewer chunks, fresh start
            adjustContextWindow: 20, // Less history to avoid confusion
            resetContext: true,
        };
    } else if (entityOverlap > 0.4 && topicConsistency > 0.5) {
        // Moderate overlap + consistent topic = continuing
        momentum = 'continuing';
        recommendations = {
            adjustChunkLimit: 5, // Standard chunks
            adjustContextWindow: 30, // Moderate history
        };
    } else {
        // Default to continuing with standard settings
        momentum = 'continuing';
        recommendations = {
            adjustChunkLimit: 5,
            adjustContextWindow: 30,
        };
    }

    console.log(
        `  [MOMENTUM] ${momentum.toUpperCase()} (overlap=${(entityOverlap * 100).toFixed(0)}%, depth=${(depthIndicator * 100).toFixed(0)}%, consistency=${(topicConsistency * 100).toFixed(0)}%)`
    );

    return {
        momentum,
        entityOverlap,
        topicConsistency,
        depthIndicator,
        recommendations,
    };
}

/**
 * Get enhanced query context based on momentum
 * When deepening, include more conversation context in the query
 */
export function buildMomentumAwareQuery(
    currentMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    momentum: ConversationMomentum
): string {
    let query = currentMessage;

    if (momentum === 'deepening') {
        // Add last 4 user messages for deep exploration context
        const recentUserMessages = conversationHistory
            .filter((m) => m.role === 'user')
            .slice(-4)
            .map((m) => m.content);

        if (recentUserMessages.length > 0) {
            query = `${currentMessage} ${recentUserMessages.join(' ')}`;
            console.log(
                `  [MOMENTUM] Enhanced query with ${recentUserMessages.length} previous messages`
            );
        }
    } else if (momentum === 'switching') {
        // Use only current message to avoid topic contamination
        query = currentMessage;
        console.log(`  [MOMENTUM] Using isolated query for topic switch`);
    } else {
        // Continuing: add last 2 messages for continuity (existing behavior)
        const recentUserMessages = conversationHistory
            .filter((m) => m.role === 'user')
            .slice(-2)
            .map((m) => m.content);

        if (recentUserMessages.length > 0) {
            query = `${currentMessage} ${recentUserMessages.join(' ')}`;
        }
    }

    return query;
}
