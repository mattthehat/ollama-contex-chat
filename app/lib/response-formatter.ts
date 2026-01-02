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
 * Enhance response with follow-up suggestions
 */
export function addFollowUpSuggestions(
    response: string,
    query: string,
    entities: Array<{ value: string; type: string }> = []
): string {
    // Extract key topics from response
    const topics = entities.map(e => e.value).slice(0, 3);

    if (topics.length === 0) return response;

    const suggestions: string[] = [];

    // Generate contextual follow-up questions
    if (/\bhow\b/i.test(query)) {
        suggestions.push(`Why is ${topics[0]} important?`);
        if (topics[1]) suggestions.push(`What are best practices for ${topics[1]}?`);
    } else if (/\bwhat\b/i.test(query)) {
        suggestions.push(`How do I implement ${topics[0]}?`);
        if (topics[1]) suggestions.push(`What are common pitfalls with ${topics[1]}?`);
    } else if (/\bwhy\b/i.test(query)) {
        suggestions.push(`How does ${topics[0]} work?`);
        if (topics[1]) suggestions.push(`What alternatives exist to ${topics[1]}?`);
    } else {
        // Generic follow-ups
        suggestions.push(`Tell me more about ${topics[0]}`);
        if (topics[1]) suggestions.push(`How does ${topics[0]} compare to ${topics[1]}?`);
    }

    if (suggestions.length > 0) {
        const followUps = suggestions
            .slice(0, 2)
            .map((s, i) => `${i + 1}. ${s}`)
            .join('\n');

        return response + `\n\n---\n\n**Follow-up questions you might ask:**\n${followUps}`;
    }

    return response;
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
