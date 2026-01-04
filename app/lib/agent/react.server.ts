/**
 * ReAct Agent Orchestrator
 *
 * Implements the ReAct (Reason + Act) pattern for complex query processing.
 * The agent iteratively:
 *   1. THOUGHT: Reasons about what to do next
 *   2. ACTION: Executes a tool to gather information
 *   3. OBSERVATION: Receives and processes tool results
 *   4. Repeats until ready to provide final answer
 *
 * References:
 * - ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)
 */

import { executeTool, formatToolsForPrompt } from './tools.server';
import type { ComplexityAnalysis } from './complexity';

// ============================================================================
// TYPES
// ============================================================================

export interface ReActStep {
  stepNumber: number;
  type: 'thought' | 'action' | 'observation' | 'final_answer';
  content: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: string;
  timestamp: Date;
  durationMs?: number;
}

export interface AgentConfig {
  maxIterations: number;
  temperature: number;
  showReasoning: boolean;
  model: string;
  systemPrompt: string;
}

export interface AgentRequest {
  query: string;
  conversationHistory: Array<{ role: string; content: string }>;
  config: AgentConfig;
  complexity: ComplexityAnalysis;
  documentUUIDs?: string[];
}

export interface AgentResponse {
  success: boolean;
  finalAnswer: string;
  steps: ReActStep[];
  toolsUsed: string[];
  iterations: number;
  totalDurationMs: number;
  error?: string;
}

// ============================================================================
// REACT SYSTEM PROMPT
// ============================================================================

function buildReActSystemPrompt(config: AgentConfig): string {
  const toolsDescription = formatToolsForPrompt();

  return `${config.systemPrompt}

# AGENT MODE: ReAct Reasoning

You are operating in agent mode with access to tools for researching and analysing information. Your task is to answer the user's query by following the ReAct (Reasoning + Acting) pattern.

## Available Tools

${toolsDescription}

## ReAct Format

You MUST follow this exact format for your responses:

THOUGHT: [Your reasoning about what to do next]
ACTION: [tool_name]
ACTION INPUT: [JSON object with tool parameters]

After each action, you will receive an OBSERVATION with the tool's output. Then continue with the next THOUGHT.

When you have gathered enough information to answer the query, provide your final answer using:

THOUGHT: [Final reasoning synthesising all information]
FINAL ANSWER: [Your complete answer to the user's query]

## Important Guidelines

1. **Think step-by-step**: Break down complex queries into manageable steps
2. **Use tools strategically**: Don't use tools unnecessarily; think first
3. **Synthesise information**: Combine results from multiple tool calls
4. **Cite sources**: Reference specific documents or sections when answering
5. **Be thorough**: For complex queries, take multiple reasoning steps
6. **Know when to stop**: Provide FINAL ANSWER when you have sufficient information
7. **British English**: Use British spelling (analyse, organise, etc.)
8. **Professional tone**: Maintain a helpful, authoritative tone for DSL audience

## Example

THOUGHT: The user is asking about procedures for handling a specific safeguarding scenario. I should first search the relevant policy documents.
ACTION: search_documents
ACTION INPUT: {"query": "procedure for online safety incident reporting", "limit": 5}

[OBSERVATION will be provided]

THOUGHT: The search results show the relevant procedures. Now I have enough information to provide a comprehensive answer.
FINAL ANSWER: According to the Online Safety Policy...

## Your Task

Answer the user's query using the ReAct format above. Begin with your first THOUGHT.`;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

interface ParsedResponse {
  thought?: string;
  action?: string;
  actionInput?: Record<string, any>;
  finalAnswer?: string;
}

function parseAgentResponse(response: string): ParsedResponse {
  const result: ParsedResponse = {};

  // Extract THOUGHT
  const thoughtMatch = response.match(/THOUGHT:\s*(.+?)(?=\n(?:ACTION|FINAL ANSWER):|$)/is);
  if (thoughtMatch) {
    result.thought = thoughtMatch[1].trim();
  }

  // Extract FINAL ANSWER
  const finalAnswerMatch = response.match(/FINAL ANSWER:\s*(.+)/is);
  if (finalAnswerMatch) {
    result.finalAnswer = finalAnswerMatch[1].trim();
    return result; // If we have final answer, no need to parse action
  }

  // Extract ACTION
  const actionMatch = response.match(/ACTION:\s*(\w+)/i);
  if (actionMatch) {
    result.action = actionMatch[1].trim();
  }

  // Extract ACTION INPUT
  const actionInputMatch = response.match(/ACTION INPUT:\s*(\{.+?\})/is);
  if (actionInputMatch) {
    try {
      result.actionInput = JSON.parse(actionInputMatch[1]);
    } catch (error) {
      console.error('Failed to parse ACTION INPUT JSON:', error);
      result.actionInput = {};
    }
  }

  return result;
}

// ============================================================================
// OLLAMA INTEGRATION
// ============================================================================

async function callOllama(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number
): Promise<string> {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: 2048,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.message.content;
}

// ============================================================================
// MAIN REACT LOOP
// ============================================================================

export async function runReActAgent(request: AgentRequest): Promise<AgentResponse> {
  const startTime = Date.now();
  const steps: ReActStep[] = [];
  const toolsUsed: string[] = [];
  let iterations = 0;

  // Build initial messages
  const systemPrompt = buildReActSystemPrompt(request.config);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...request.conversationHistory,
    { role: 'user', content: request.query },
  ];

  try {
    // ReAct loop
    while (iterations < request.config.maxIterations) {
      iterations++;
      const iterationStart = Date.now();

      console.log(`\n=== Iteration ${iterations}/${request.config.maxIterations} ===`);

      // Get agent response
      const agentResponse = await callOllama(messages, request.config.model, request.config.temperature);
      const parsed = parseAgentResponse(agentResponse);

      console.log('Agent response:', agentResponse.substring(0, 200) + '...');

      // Record THOUGHT step
      if (parsed.thought) {
        steps.push({
          stepNumber: steps.length + 1,
          type: 'thought',
          content: parsed.thought,
          timestamp: new Date(),
          durationMs: Date.now() - iterationStart,
        });
      }

      // Check for FINAL ANSWER
      if (parsed.finalAnswer) {
        steps.push({
          stepNumber: steps.length + 1,
          type: 'final_answer',
          content: parsed.finalAnswer,
          timestamp: new Date(),
          durationMs: Date.now() - iterationStart,
        });

        console.log('Final answer reached!');

        return {
          success: true,
          finalAnswer: parsed.finalAnswer,
          steps,
          toolsUsed: Array.from(new Set(toolsUsed)),
          iterations,
          totalDurationMs: Date.now() - startTime,
        };
      }

      // Execute ACTION if present
      if (parsed.action && parsed.actionInput) {
        const actionStepStart = Date.now();

        // Record ACTION step
        steps.push({
          stepNumber: steps.length + 1,
          type: 'action',
          content: `Using tool: ${parsed.action}`,
          toolName: parsed.action,
          toolInput: parsed.actionInput,
          timestamp: new Date(),
        });

        toolsUsed.push(parsed.action);

        // Execute tool
        console.log(`Executing tool: ${parsed.action}`);
        console.log('Tool input:', JSON.stringify(parsed.actionInput, null, 2));

        const toolResult = await executeTool(parsed.action, parsed.actionInput);

        // Record OBSERVATION step
        const observationContent = toolResult.success
          ? toolResult.output
          : `Error: ${toolResult.error || 'Unknown error'}`;

        steps.push({
          stepNumber: steps.length + 1,
          type: 'observation',
          content: observationContent,
          toolName: parsed.action,
          toolOutput: observationContent,
          timestamp: new Date(),
          durationMs: Date.now() - actionStepStart,
        });

        console.log('Tool result:', observationContent.substring(0, 200) + '...');

        // Add observation to conversation
        messages.push({
          role: 'assistant',
          content: agentResponse,
        });

        messages.push({
          role: 'user',
          content: `OBSERVATION: ${observationContent}`,
        });
      } else {
        // No action or final answer - agent might be confused
        console.warn('No valid ACTION or FINAL ANSWER found in agent response');

        // Try to guide the agent
        messages.push({
          role: 'user',
          content: 'Please provide either an ACTION with ACTION INPUT (in JSON format), or a FINAL ANSWER.',
        });
      }
    }

    // Max iterations reached without final answer
    console.warn('Max iterations reached without final answer');

    return {
      success: false,
      finalAnswer: 'I was unable to complete my reasoning within the allowed iterations. Please try simplifying your query.',
      steps,
      toolsUsed: Array.from(new Set(toolsUsed)),
      iterations,
      totalDurationMs: Date.now() - startTime,
      error: 'Maximum iterations reached',
    };
  } catch (error) {
    console.error('ReAct agent error:', error);

    return {
      success: false,
      finalAnswer: 'An error occurred during agent processing. Please try again.',
      steps,
      toolsUsed: Array.from(new Set(toolsUsed)),
      iterations,
      totalDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Formats agent steps for display or logging
 */
export function formatAgentSteps(steps: ReActStep[]): string {
  return steps
    .map((step) => {
      const header = `[Step ${step.stepNumber}] ${step.type.toUpperCase()}`;
      let content = step.content;

      if (step.toolName) {
        content += `\nTool: ${step.toolName}`;
      }

      if (step.toolInput) {
        content += `\nInput: ${JSON.stringify(step.toolInput, null, 2)}`;
      }

      if (step.durationMs) {
        content += `\nDuration: ${step.durationMs}ms`;
      }

      return `${header}\n${content}\n`;
    })
    .join('\n---\n\n');
}

/**
 * Extracts citations from agent response for proper formatting
 */
export function extractCitations(finalAnswer: string): {
  answer: string;
  citations: string[];
} {
  const citations: string[] = [];
  const citationRegex = /\[(\d+)\]/g;

  // Find all citation numbers
  const matches = finalAnswer.match(citationRegex);
  if (matches) {
    matches.forEach((match) => {
      const num = match.replace(/\[|\]/g, '');
      if (!citations.includes(num)) {
        citations.push(num);
      }
    });
  }

  return {
    answer: finalAnswer,
    citations: citations.sort((a, b) => parseInt(a) - parseInt(b)),
  };
}
