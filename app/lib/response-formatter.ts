/**
 * Professional response formatting and enhancement
 */

export interface FormattedResponse {
    content: string;
    metadata: {
        wordCount: number;
        hasCode: boolean;
        hasList: boolean;
        hasHeadings: boolean;
        readingTime: number; // minutes
    };
}

/**
 * Format response with professional structure
 */
export function formatProfessionalResponse(
    rawResponse: string,
    addReadingTime: boolean = false
): FormattedResponse {
    let formatted = rawResponse;

    // Ensure proper spacing around headings
    formatted = formatted.replace(/^(#{1,6}\s+.+)$/gm, '\n$1\n');

    // Ensure proper spacing around code blocks
    formatted = formatted.replace(/(```[\s\S]+?```)/g, '\n$1\n');

    // Ensure proper list formatting
    formatted = formatted.replace(/^([*\-+]|\d+\.)\s/gm, '\n$&');

    // Clean up multiple newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // Trim
    formatted = formatted.trim();

    // Calculate metadata
    const wordCount = formatted.split(/\s+/).length;
    const hasCode = /```/.test(formatted);
    const hasList = /^[*\-+\d]+[.)]\s/m.test(formatted);
    const hasHeadings = /^#{1,6}\s/m.test(formatted);
    const readingTime = Math.ceil(wordCount / 200); // Average reading speed

    return {
        content: formatted,
        metadata: {
            wordCount,
            hasCode,
            hasList,
            hasHeadings,
            readingTime,
        },
    };
}

/**
 * Add professional disclaimer based on content type
 */
export function addDisclaimer(
    response: string,
    documentTypes: string[] = [],
    confidenceLevel: 'high' | 'medium' | 'low' = 'medium'
): string {
    // Detect content type from response
    const hasLegalTerms = /\b(liability|contract|agreement|legal|law|regulation|compliance)\b/i.test(response);
    const hasMedicalTerms = /\b(diagnosis|treatment|medication|patient|symptoms|disease|health)\b/i.test(response);
    const hasFinancialTerms = /\b(investment|financial|tax|portfolio|trading|stock|bond)\b/i.test(response);
    const hasSecurityTerms = /\b(security|vulnerability|exploit|attack|penetration|malware)\b/i.test(response);

    let disclaimer = '';

    // Critical domains that need strong disclaimers
    if (hasLegalTerms) {
        disclaimer = '\n\n---\n\n**Legal Disclaimer**: This information is for educational purposes only and does not constitute legal advice. Consult a qualified attorney for legal matters.';
    } else if (hasMedicalTerms) {
        disclaimer = '\n\n---\n\n**Medical Disclaimer**: This information is for educational purposes only and does not constitute medical advice. Always consult healthcare professionals for medical decisions.';
    } else if (hasFinancialTerms) {
        disclaimer = '\n\n---\n\n**Financial Disclaimer**: This information is for educational purposes only and does not constitute financial advice. Consult a qualified financial advisor before making investment decisions.';
    } else if (hasSecurityTerms) {
        disclaimer = '\n\n---\n\n**Security Notice**: Information provided for authorized security testing and defensive purposes only. Always obtain proper authorization before security testing.';
    } else if (confidenceLevel === 'low') {
        disclaimer = '\n\n---\n\n**Note**: The confidence in this answer is low based on the available documentation. Please verify this information independently.';
    }

    return response + disclaimer;
}

/**
 * Enhance response with smart follow-up suggestions
 * Now uses learned conversation patterns for better suggestions
 */
export function addFollowUpSuggestions(
    response: string,
    query: string,
    entities: Array<{ value: string; type: string }> = []
): string {
    const topics = entities.map(e => e.value).slice(0, 3);
    const suggestions: string[] = [];

    // PATTERN 1: After "What is X?" → users ask "How does X work?" or "Why use X?"
    if (/^what is /i.test(query) && topics[0]) {
        suggestions.push(`How does ${topics[0]} work?`);
        suggestions.push(`When should I use ${topics[0]}?`);
        if (topics[1]) suggestions.push(`How does ${topics[0]} relate to ${topics[1]}?`);
        return buildFollowUpSection(suggestions);
    }

    // PATTERN 2: After "How to X?" → users ask about troubleshooting or best practices
    if (/\bhow (to|do|can)\b/i.test(query) && topics[0]) {
        suggestions.push(`What are common issues with ${topics[0]}?`);
        suggestions.push(`What are best practices for ${topics[0]}?`);
        if (topics[1]) suggestions.push(`How do ${topics[0]} and ${topics[1]} work together?`);
        return buildFollowUpSection(suggestions);
    }

    // PATTERN 3: After "Why X?" → users ask about implementation or alternatives
    if (/\bwhy\b/i.test(query) && topics[0]) {
        suggestions.push(`How do I implement ${topics[0]}?`);
        suggestions.push(`What are alternatives to ${topics[0]}?`);
        if (topics[1]) suggestions.push(`What's the difference between ${topics[0]} and ${topics[1]}?`);
        return buildFollowUpSection(suggestions);
    }

    // PATTERN 4: After comparison questions → users ask about specific use cases
    if (/\b(compare|difference|versus|vs|better)\b/i.test(query) && topics[0]) {
        suggestions.push(`When should I use ${topics[0]}?`);
        if (topics[1]) suggestions.push(`When should I use ${topics[1]}?`);
        suggestions.push(`Can they be used together?`);
        return buildFollowUpSection(suggestions);
    }

    // PATTERN 5: After procedural questions → users ask about specific steps or examples
    if (/\b(steps?|process|procedure|guide)\b/i.test(query) && topics[0]) {
        suggestions.push(`Can you give an example of ${topics[0]}?`);
        suggestions.push(`What tools are needed for ${topics[0]}?`);
        if (topics[1]) suggestions.push(`How does ${topics[1]} fit into the process?`);
        return buildFollowUpSection(suggestions);
    }

    // PATTERN 6: If response mentions specific concepts, suggest exploring them
    const responseTopics = extractKeyConceptsFromResponse(response);
    if (responseTopics.length > 0) {
        responseTopics.slice(0, 2).forEach(concept => {
            suggestions.push(`Tell me more about ${concept}`);
        });
    }

    // PATTERN 7: Generic but smart follow-ups based on response structure
    if (topics.length > 0) {
        if (!suggestions.length) {
            suggestions.push(`How do I implement ${topics[0]}?`);
            if (topics[1]) suggestions.push(`What's the relationship between ${topics[0]} and ${topics[1]}?`);
        }
    } else {
        // No entities - return response as-is
        return response;
    }

    return buildFollowUpSection(suggestions);
}

/**
 * Build follow-up section from suggestions
 */
function buildFollowUpSection(suggestions: string[]): string {
    if (suggestions.length === 0) return '';

    const followUps = suggestions
        .slice(0, 3) // Top 3 suggestions
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n');

    return `\n\n---\n\n**Follow-up questions you might ask:**\n${followUps}`;
}

/**
 * Extract key concepts from response for follow-up suggestions
 */
function extractKeyConceptsFromResponse(response: string): string[] {
    const concepts: string[] = [];

    // Extract quoted terms or emphasized terms
    const quoted = response.match(/"([^"]+)"|`([^`]+)`/g);
    if (quoted) {
        quoted.slice(0, 3).forEach(q => {
            const cleaned = q.replace(/["`]/g, '').trim();
            if (cleaned.length > 3 && cleaned.length < 50) {
                concepts.push(cleaned);
            }
        });
    }

    // Extract capitalized terms (proper nouns, technical terms)
    if (concepts.length < 2) {
        const capitalized = response.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g); // CamelCase
        if (capitalized) {
            concepts.push(...capitalized.slice(0, 2));
        }
    }

    return concepts;
}

/**
 * Add executive summary for long responses
 */
export function addExecutiveSummary(response: string, threshold: number = 500): string {
    const wordCount = response.split(/\s+/).length;

    if (wordCount < threshold) return response;

    // Extract first 2-3 sentences as summary
    const sentences = response.match(/[^.!?]+[.!?]+/g) || [];
    const summary = sentences.slice(0, 3).join(' ').trim();

    if (summary.length < 50) return response; // Summary too short, skip

    return `**Quick Summary**: ${summary}\n\n---\n\n${response}`;
}

/**
 * Format code blocks with language detection
 */
export function enhanceCodeBlocks(response: string): string {
    // Find code blocks without language specification
    const codeBlockPattern = /```\n([\s\S]+?)```/g;

    return response.replace(codeBlockPattern, (match, code) => {
        // Try to detect language
        const language = detectCodeLanguage(code);

        if (language) {
            return `\`\`\`${language}\n${code}\`\`\``;
        }

        return match;
    });
}

/**
 * Simple code language detection
 */
function detectCodeLanguage(code: string): string | null {
    const trimmed = code.trim();

    // JavaScript/TypeScript
    if (/\b(const|let|var|function|=>|async|await)\b/.test(trimmed)) {
        return trimmed.includes(':') && /interface|type|enum/.test(trimmed) ? 'typescript' : 'javascript';
    }

    // Python
    if (/\b(def|class|import|from|if __name__|print)\b/.test(trimmed)) {
        return 'python';
    }

    // SQL
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i.test(trimmed)) {
        return 'sql';
    }

    // JSON
    if (/^\s*[{[]/.test(trimmed) && /[}\]]\s*$/.test(trimmed)) {
        try {
            JSON.parse(trimmed);
            return 'json';
        } catch {
            // Not valid JSON
        }
    }

    // Bash/Shell
    if (/^#!/.test(trimmed) || /\b(echo|cd|ls|grep|awk|sed)\b/.test(trimmed)) {
        return 'bash';
    }

    // HTML
    if (/<[a-z][\s\S]*>/i.test(trimmed)) {
        return 'html';
    }

    // CSS
    if (/[.#][a-z-]+\s*\{/.test(trimmed)) {
        return 'css';
    }

    return null;
}

/**
 * Comprehensive response enhancement
 */
export function enhanceResponse(
    rawResponse: string,
    options: {
        query?: string;
        entities?: Array<{ value: string; type: string }>;
        confidenceLevel?: 'high' | 'medium' | 'low';
        addSummary?: boolean;
        addFollowUps?: boolean;
        addDisclaimer?: boolean;
    } = {}
): FormattedResponse {
    let enhanced = rawResponse;

    // 1. Format professionally
    const formatted = formatProfessionalResponse(enhanced);
    enhanced = formatted.content;

    // 2. Enhance code blocks
    enhanced = enhanceCodeBlocks(enhanced);

    // 3. Add executive summary for long responses
    if (options.addSummary !== false) {
        enhanced = addExecutiveSummary(enhanced);
    }

    // 4. Add disclaimer
    if (options.addDisclaimer !== false) {
        enhanced = addDisclaimer(enhanced, [], options.confidenceLevel);
    }

    // 5. Add follow-up suggestions
    if (options.addFollowUps && options.query && options.entities) {
        enhanced = addFollowUpSuggestions(enhanced, options.query, options.entities);
    }

    return {
        content: enhanced,
        metadata: formatted.metadata,
    };
}
