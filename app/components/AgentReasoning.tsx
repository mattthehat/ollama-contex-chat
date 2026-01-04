/**
 * Agent Reasoning Display Component
 *
 * Displays the ReAct agent's reasoning process including thoughts,
 * actions, observations, and final answer in a collapsible UI.
 */

import { useState } from 'react';
import type { ReActStep } from '~/lib/agent/react.server';

interface AgentReasoningProps {
  steps: ReActStep[];
  toolsUsed: string[];
  iterations: number;
  totalDurationMs: number;
  showByDefault?: boolean;
}

export default function AgentReasoning({
  steps,
  toolsUsed,
  iterations,
  totalDurationMs,
  showByDefault = false,
}: AgentReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(showByDefault);

  // Separate final answer from reasoning steps
  const reasoningSteps = steps.filter((s) => s.type !== 'final_answer');
  const finalAnswerStep = steps.find((s) => s.type === 'final_answer');

  return (
    <div className="agent-reasoning mb-4">
      {/* Agent Mode Indicator */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Agent Mode: ReAct Reasoning
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
          >
            {isExpanded ? 'Hide reasoning' : 'Show reasoning process'}
          </button>
        </div>

        {/* Summary */}
        <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <div>
            <span className="font-medium">Iterations:</span> {iterations}
          </div>
          <div>
            <span className="font-medium">Tools used:</span>{' '}
            {toolsUsed.length > 0 ? toolsUsed.join(', ') : 'None'}
          </div>
          <div>
            <span className="font-medium">Processing time:</span> {(totalDurationMs / 1000).toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Detailed Reasoning Steps */}
      {isExpanded && reasoningSteps.length > 0 && (
        <div className="space-y-3 mb-4">
          {reasoningSteps.map((step) => (
            <ReasoningStep key={step.stepNumber} step={step} />
          ))}
        </div>
      )}

      {/* Final Answer */}
      {finalAnswerStep && (
        <div className="prose dark:prose-invert max-w-none">
          <div
            dangerouslySetInnerHTML={{
              __html: formatMarkdown(finalAnswerStep.content),
            }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REASONING STEP COMPONENT
// ============================================================================

interface ReasoningStepProps {
  step: ReActStep;
}

function ReasoningStep({ step }: ReasoningStepProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'thought':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        );
      case 'action':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        );
      case 'observation':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'thought':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100';
      case 'action':
        return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100';
      case 'observation':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100';
      default:
        return 'bg-grey-50 dark:bg-grey-900/20 border-grey-200 dark:border-grey-800 text-grey-900 dark:text-grey-100';
    }
  };

  const colorClasses = getStepColor(step.type);

  return (
    <div className={`border rounded-lg p-3 ${colorClasses}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {getStepIcon(step.type)}
          <span className="text-sm font-medium capitalize">{step.type}</span>
          {step.toolName && (
            <span className="text-xs font-mono bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded">
              {step.toolName}
            </span>
          )}
          {step.durationMs && (
            <span className="text-xs opacity-60">{step.durationMs}ms</span>
          )}
        </div>

        {(step.toolInput || step.toolOutput) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs hover:underline opacity-60 hover:opacity-100"
          >
            {isExpanded ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>

      <div className="mt-2 text-sm whitespace-pre-wrap">{step.content}</div>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {step.toolInput && (
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-xs font-medium opacity-60 mb-1">Tool Input:</div>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(step.toolInput, null, 2)}
              </pre>
            </div>
          )}

          {step.toolOutput && (
            <div className="bg-white/50 dark:bg-black/20 rounded p-2">
              <div className="text-xs font-medium opacity-60 mb-1">Tool Output:</div>
              <div className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                {step.toolOutput}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MARKDOWN FORMATTING
// ============================================================================

/**
 * Basic markdown to HTML converter
 * For production, consider using a library like marked or remark
 */
function formatMarkdown(text: string): string {
  let html = text;

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>');

  // Lists
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Citations
  html = html.replace(/\[(\d+)\]/g, '<sup class="text-blue-600">[$1]</sup>');

  return html;
}
