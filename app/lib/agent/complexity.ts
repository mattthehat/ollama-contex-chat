/**
 * Query Complexity Detection
 *
 * Analyses user queries to determine their complexity level and whether
 * they would benefit from ReAct agent reasoning.
 *
 * Complexity Levels:
 * - LOW: Simple factual questions, single-step queries
 * - MEDIUM: Multi-part questions, comparisons, analysis requests
 * - HIGH: Complex reasoning, multi-step procedures, investigation tasks
 */

export type ComplexityLevel = 'low' | 'medium' | 'high';

export interface ComplexityAnalysis {
  level: ComplexityLevel;
  score: number; // 0-100
  indicators: string[];
  reasoning: string;
}

/**
 * Detects the complexity level of a user query
 */
export function detectQueryComplexity(
  query: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): ComplexityAnalysis {
  const indicators: string[] = [];
  let score = 0;

  const lowerQuery = query.toLowerCase();
  const wordCount = query.split(/\s+/).length;
  const sentenceCount = query.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

  // ========================================
  // LOW COMPLEXITY INDICATORS (negative score)
  // ========================================

  // Very short queries (< 5 words)
  if (wordCount < 5) {
    score -= 10;
    indicators.push('very short query');
  }

  // Single simple question
  if (sentenceCount === 1 && wordCount < 15) {
    score -= 5;
    indicators.push('single simple question');
  }

  // Basic greetings
  if (/^(hi|hello|hey|thanks|thank you|bye|goodbye)\b/i.test(lowerQuery.trim())) {
    score -= 20;
    indicators.push('greeting or courtesy');
  }

  // Simple factual questions (what is, who is, when is)
  if (/^(what|who|when|where)\s+(is|are|was|were)\s+\w+\??$/i.test(lowerQuery.trim())) {
    score -= 10;
    indicators.push('simple factual question');
  }

  // ========================================
  // MEDIUM COMPLEXITY INDICATORS
  // ========================================

  // Multiple questions
  if (sentenceCount >= 2 && sentenceCount <= 4) {
    score += 15;
    indicators.push('multiple questions');
  }

  // Comparison requests
  if (/\b(compare|difference|versus|vs|better|worse|pros and cons)\b/i.test(lowerQuery)) {
    score += 10;
    indicators.push('comparison request');
  }

  // Analysis requests
  if (/\b(analys|analy[sz]e|examine|evaluate|assess|review)\b/i.test(lowerQuery)) {
    score += 12;
    indicators.push('analysis request');
  }

  // Explanation requests
  if (/\b(explain|describe|elaborate|clarify|illustrate)\b/i.test(lowerQuery)) {
    score += 8;
    indicators.push('explanation request');
  }

  // How-to questions
  if (/\b(how (do|can|should|would)|what (are the )?steps)\b/i.test(lowerQuery)) {
    score += 10;
    indicators.push('procedural question');
  }

  // ========================================
  // HIGH COMPLEXITY INDICATORS
  // ========================================

  // Multiple complex questions (5+)
  if (sentenceCount >= 5) {
    score += 25;
    indicators.push('many questions in sequence');
  }

  // Multi-step reasoning required
  if (/\b(first|then|next|finally|step by step|walkthrough)\b/i.test(lowerQuery)) {
    score += 20;
    indicators.push('multi-step reasoning required');
  }

  // Investigation or research tasks
  if (/\b(investigate|research|find out|determine|identify all|list all)\b/i.test(lowerQuery)) {
    score += 18;
    indicators.push('investigation task');
  }

  // Complex reasoning keywords
  if (/\b(why|justify|prove|demonstrate|reasoning|rationale)\b/i.test(lowerQuery)) {
    score += 15;
    indicators.push('requires justification or reasoning');
  }

  // Both "how" and "why" questions (deep understanding)
  if (/\bhow\b/i.test(lowerQuery) && /\bwhy\b/i.test(lowerQuery)) {
    score += 20;
    indicators.push('requires both procedural and causal understanding');
  }

  // Scenario analysis
  if (/\b(scenario|situation|case|if .+ then|what if|suppose)\b/i.test(lowerQuery)) {
    score += 12;
    indicators.push('scenario analysis');
  }

  // Document synthesis (UK safeguarding context)
  if (/\b(according to|based on|references|guidance|policy|procedure|kcsie|prevent|safeguarding)\b/i.test(lowerQuery)) {
    score += 8;
    indicators.push('requires document synthesis');
  }

  // Comprehensive or exhaustive requests
  if (/\b(comprehensive|complete|detailed|thorough|exhaustive|all relevant)\b/i.test(lowerQuery)) {
    score += 15;
    indicators.push('comprehensive response required');
  }

  // Long queries (detailed context)
  if (wordCount > 40) {
    score += 12;
    indicators.push('long detailed query');
  }

  // Very long queries (> 80 words)
  if (wordCount > 80) {
    score += 18;
    indicators.push('very long query with complex context');
  }

  // Multiple constraints or conditions
  const constraintMatches = lowerQuery.match(/\b(if|when|where|unless|provided|given that|assuming)\b/gi);
  if (constraintMatches && constraintMatches.length >= 2) {
    score += 15;
    indicators.push('multiple constraints or conditions');
  }

  // ========================================
  // CONVERSATION CONTEXT ANALYSIS
  // ========================================

  // Follow-up requiring context from multiple previous messages
  if (conversationHistory.length >= 3) {
    const recentHistory = conversationHistory.slice(-5);
    const hasCoreference = /\b(this|that|these|those|it|them|they)\b/i.test(lowerQuery);
    const hasFollowUp = /\b(also|additionally|furthermore|moreover|and what about)\b/i.test(lowerQuery);

    if (hasCoreference && hasFollowUp) {
      score += 10;
      indicators.push('complex follow-up requiring context');
    }
  }

  // ========================================
  // DETERMINE COMPLEXITY LEVEL
  // ========================================

  let level: ComplexityLevel;
  let reasoning: string;

  if (score < 10) {
    level = 'low';
    reasoning = 'Simple query that can be answered directly without multi-step reasoning.';
  } else if (score < 30) {
    level = 'medium';
    reasoning = 'Moderate complexity query that may benefit from structured reasoning but can be handled with standard RAG.';
  } else {
    level = 'high';
    reasoning = 'Complex query requiring multi-step reasoning, investigation, or synthesis of multiple sources. Agent mode recommended.';
  }

  // Normalise score to 0-100 range
  const normalisedScore = Math.min(100, Math.max(0, score + 20)); // Offset by 20 to handle negative scores

  return {
    level,
    score: normalisedScore,
    indicators,
    reasoning,
  };
}

/**
 * Determines if agent mode should be used based on complexity and configuration
 */
export function shouldUseAgent(
  complexity: ComplexityAnalysis,
  agentMode: 'disabled' | 'auto' | 'forced',
  complexityThreshold: ComplexityLevel = 'medium'
): boolean {
  // Agent mode explicitly disabled
  if (agentMode === 'disabled') {
    return false;
  }

  // Agent mode forced on
  if (agentMode === 'forced') {
    return true;
  }

  // Auto mode - check if complexity meets threshold
  const thresholdMap: Record<ComplexityLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  const levelMap: Record<ComplexityLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  return levelMap[complexity.level] >= thresholdMap[complexityThreshold];
}

/**
 * Formats complexity analysis for logging or debugging
 */
export function formatComplexityAnalysis(analysis: ComplexityAnalysis): string {
  return [
    `Complexity: ${analysis.level.toUpperCase()} (score: ${analysis.score})`,
    `Reasoning: ${analysis.reasoning}`,
    `Indicators: ${analysis.indicators.join(', ') || 'none'}`,
  ].join('\n');
}
