/**
 * Proactive Query Clarification
 * Detects ambiguous queries before expensive RAG processing
 * Returns clarification needs immediately to save processing time
 */

export interface ClarificationNeed {
    needed: boolean;
    reason?: string;
    suggestions?: string[];
}

/**
 * Check if query needs clarification before processing
 * This is a FAST pre-processing check (no LLM calls)
 */
export function detectClarificationNeeds(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>
): ClarificationNeed {
    const query = message.trim().toLowerCase();

    // 1. Unresolved pronouns without context
    if (conversationHistory.length <= 2) {
        // Early in conversation - check for pronouns without referents
        const pronouns = /\b(it|this|that|these|those|them|they)\b/i;
        const hasPronouns = pronouns.test(message);

        if (hasPronouns && !hasConcreteNouns(message)) {
            return {
                needed: true,
                reason: 'Your question uses pronouns ("it", "this", "that") but I need more context to understand what you\'re referring to.',
                suggestions: [
                    'Could you be more specific about what you\'re asking about?',
                    'What topic or document section are you referring to?',
                ],
            };
        }
    }

    // 2. Extremely vague queries
    const veryVaguePatterns = [
        /^(what|how|why|tell me)[\s\?]*$/i,
        /^(yes|no|ok|okay)[\s\?]*$/i,
        /^(huh|what|sorry)[\s\?]*$/i,
    ];

    if (veryVaguePatterns.some((pattern) => pattern.test(query))) {
        return {
            needed: true,
            reason: 'I need more information to help you effectively.',
            suggestions: [
                'Could you provide more details about what you\'d like to know?',
                'What specific aspect are you interested in?',
            ],
        };
    }

    // 3. Multiple possible interpretations without context
    const ambiguousTerms = [
        'best',
        'better',
        'good',
        'right',
        'correct',
        'should i',
        'which one',
        'what about',
    ];

    if (
        ambiguousTerms.some((term) => query.includes(term)) &&
        message.split(/\s+/).length < 6 &&
        conversationHistory.length < 4
    ) {
        return {
            needed: true,
            reason: 'Your question could be interpreted in multiple ways.',
            suggestions: [
                'Could you clarify what you\'re comparing or asking about?',
                'What criteria are important to you?',
            ],
        };
    }

    // 4. Follow-up questions without clear topic
    const followUpMarkers = /\b(also|what else|anything else|what about|how about)\b/i;
    if (
        followUpMarkers.test(message) &&
        message.split(/\s+/).length < 8 &&
        conversationHistory.length < 2
    ) {
        return {
            needed: true,
            reason: 'This seems like a follow-up question, but I need more context about the topic.',
            suggestions: [
                'What topic are you asking about?',
                'Could you rephrase with more specifics?',
            ],
        };
    }

    // 5. Incomplete questions
    if (message.endsWith('?') && message.split(/\s+/).length <= 3) {
        const words = message.toLowerCase().replace('?', '').trim().split(/\s+/);
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];

        if (words.length === 1 && questionWords.includes(words[0])) {
            return {
                needed: true,
                reason: 'Your question is incomplete.',
                suggestions: [
                    `${words[0].charAt(0).toUpperCase() + words[0].slice(1)} would you like to know?`,
                ],
            };
        }
    }

    // No clarification needed
    return { needed: false };
}

/**
 * Check if message contains concrete nouns (entities)
 * Helper to detect if there's actual content to work with
 */
function hasConcreteNouns(message: string): boolean {
    // Check for:
    // - Capitalized words (proper nouns)
    // - Technical terms (camelCase, snake_case)
    // - Numbers or dates
    // - Long words (>7 chars, likely specific terms)

    const capitalizedWords = message.match(/\b[A-Z][a-z]+[A-Z][a-z]*/g); // CamelCase
    const properNouns = message.match(/\b[A-Z][a-z]+\b/g); // Capitalized
    const technicalTerms = message.match(/\b[a-z]+_[a-z]+\b/g); // snake_case
    const numbers = message.match(/\b\d+\b/g);
    const words = message.split(/\s+/);
    const longWords = words.filter((w) => w.length > 7);

    const totalEntitySignals =
        (capitalizedWords?.length || 0) +
        (properNouns?.length || 0) +
        (technicalTerms?.length || 0) +
        (numbers?.length || 0) +
        (longWords.length > 2 ? 1 : 0);

    return totalEntitySignals >= 2;
}

/**
 * Build clarification response message
 */
export function buildClarificationMessage(clarification: ClarificationNeed): string {
    if (!clarification.needed || !clarification.reason) {
        return '';
    }

    let message = clarification.reason;

    if (clarification.suggestions && clarification.suggestions.length > 0) {
        message += '\n\n';
        message += clarification.suggestions.join('\n');
    }

    return message;
}
