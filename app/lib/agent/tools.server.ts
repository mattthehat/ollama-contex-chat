/**
 * Agent Tools for ReAct Pattern
 *
 * Provides tool definitions and executors for the ReAct agent to interact
 * with the RAG document system, perform analysis, and gather information.
 */

import { searchChunksBySimilarity, searchChunksInDocuments } from '../document.server';
import { decomposeQuery } from '../intelligent-rag.server';
import { extractEntities } from '../intelligent-rag.server';
import { classifyQuery } from '../rag-advanced.server';
import { db } from '../db.server';

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required: boolean;
    default?: any;
  }>;
}

export const AVAILABLE_TOOLS: Tool[] = [
  {
    name: 'search_documents',
    description: 'Search across all available documents using semantic similarity. Use this to find relevant information from the document library. Returns ranked chunks with similarity scores.',
    parameters: {
      query: {
        type: 'string',
        description: 'The search query to find relevant information',
        required: true,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-10)',
        required: false,
        default: 5,
      },
      threshold: {
        type: 'number',
        description: 'Minimum similarity threshold (0.0-1.0)',
        required: false,
        default: 0.3,
      },
    },
  },
  {
    name: 'search_selected_documents',
    description: 'Search within specific documents by UUID. Use this when you need to look up information from particular documents that the user has selected.',
    parameters: {
      query: {
        type: 'string',
        description: 'The search query',
        required: true,
      },
      documentUUIDs: {
        type: 'array',
        description: 'Array of document UUIDs to search within',
        required: true,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        required: false,
        default: 5,
      },
    },
  },
  {
    name: 'get_document_metadata',
    description: 'Retrieve metadata about a specific document including title, type, total chunks, and creation date. Use this to understand what documents are available.',
    parameters: {
      documentUUID: {
        type: 'string',
        description: 'The UUID of the document',
        required: true,
      },
    },
  },
  {
    name: 'list_documents',
    description: 'List all available documents with their metadata. Use this to see what documents are in the library before searching.',
    parameters: {
      filter: {
        type: 'string',
        description: 'Optional filter by document type or title substring',
        required: false,
      },
    },
  },
  {
    name: 'decompose_query',
    description: 'Break down a complex question into simpler sub-questions. Use this when faced with multi-part or complex queries that need to be tackled step by step.',
    parameters: {
      question: {
        type: 'string',
        description: 'The complex question to decompose',
        required: true,
      },
    },
  },
  {
    name: 'extract_entities',
    description: 'Extract key entities, topics, and concepts from text. Use this to identify important subjects being discussed.',
    parameters: {
      text: {
        type: 'string',
        description: 'The text to extract entities from',
        required: true,
      },
    },
  },
  {
    name: 'classify_query',
    description: 'Classify the type of query (factual, comparative, summary, procedural, exploratory). Use this to determine the best approach for answering.',
    parameters: {
      query: {
        type: 'string',
        description: 'The query to classify',
        required: true,
      },
    },
  },
];

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  data?: any;
  error?: string;
}

/**
 * Executes a tool with the given inputs
 */
export async function executeTool(
  toolName: string,
  inputs: Record<string, any>
): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case 'search_documents':
        return await executeSearchDocuments(inputs);

      case 'search_selected_documents':
        return await executeSearchSelectedDocuments(inputs);

      case 'get_document_metadata':
        return await executeGetDocumentMetadata(inputs);

      case 'list_documents':
        return await executeListDocuments(inputs);

      case 'decompose_query':
        return await executeDecomposeQuery(inputs);

      case 'extract_entities':
        return await executeExtractEntities(inputs);

      case 'classify_query':
        return await executeClassifyQuery(inputs);

      default:
        return {
          success: false,
          output: `Unknown tool: ${toolName}`,
          error: `Tool '${toolName}' is not available`,
        };
    }
  } catch (error) {
    return {
      success: false,
      output: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function executeSearchDocuments(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { query, limit = 5, threshold = 0.3 } = inputs;

  if (!query || typeof query !== 'string') {
    return {
      success: false,
      output: 'Invalid query parameter',
      error: 'Query must be a non-empty string',
    };
  }

  const results = await searchChunksBySimilarity(
    query,
    Math.min(10, Math.max(1, limit)),
    threshold
  );

  if (!results || results.length === 0) {
    return {
      success: true,
      output: 'No relevant documents found matching your query.',
      data: [],
    };
  }

  // Format results for agent
  const formattedResults = results.map((chunk, index) => ({
    rank: index + 1,
    content: chunk.chunkContent,
    similarity: Math.round(chunk.similarity * 100),
    source: chunk.metadata?.section || 'Unknown section',
    page: chunk.metadata?.page || null,
  }));

  const output = formattedResults
    .map(
      (r) =>
        `[${r.rank}] (${r.similarity}% relevant) ${r.source}${r.page ? ` - Page ${r.page}` : ''}\n${r.content}`
    )
    .join('\n\n---\n\n');

  return {
    success: true,
    output: `Found ${results.length} relevant chunks:\n\n${output}`,
    data: formattedResults,
  };
}

async function executeSearchSelectedDocuments(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { query, documentUUIDs, limit = 5 } = inputs;

  if (!query || typeof query !== 'string') {
    return {
      success: false,
      output: 'Invalid query parameter',
      error: 'Query must be a non-empty string',
    };
  }

  if (!Array.isArray(documentUUIDs) || documentUUIDs.length === 0) {
    return {
      success: false,
      output: 'Invalid documentUUIDs parameter',
      error: 'documentUUIDs must be a non-empty array',
    };
  }

  const results = await searchChunksInDocuments(
    query,
    documentUUIDs,
    [],
    Math.min(10, Math.max(1, limit))
  );

  if (!results || results.length === 0) {
    return {
      success: true,
      output: 'No relevant information found in the selected documents.',
      data: [],
    };
  }

  const formattedResults = results.map((chunk, index) => ({
    rank: index + 1,
    content: chunk.chunkContent,
    similarity: Math.round(chunk.similarity * 100),
    source: chunk.metadata?.section || 'Unknown section',
    documentTitle: chunk.documentTitle || 'Unknown document',
  }));

  const output = formattedResults
    .map(
      (r) =>
        `[${r.rank}] ${r.documentTitle} - ${r.source} (${r.similarity}% relevant)\n${r.content}`
    )
    .join('\n\n---\n\n');

  return {
    success: true,
    output: `Found ${results.length} relevant chunks in selected documents:\n\n${output}`,
    data: formattedResults,
  };
}

async function executeGetDocumentMetadata(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { documentUUID } = inputs;

  if (!documentUUID || typeof documentUUID !== 'string') {
    return {
      success: false,
      output: 'Invalid documentUUID parameter',
      error: 'documentUUID must be a non-empty string',
    };
  }

  const document = await db.query(
    `SELECT documentTitle, documentType, documentTotalChunks, documentCreatedAt, documentMetadata
     FROM documents
     WHERE documentUUID = ?`,
    [documentUUID]
  );

  if (!document || document.length === 0) {
    return {
      success: false,
      output: `Document with UUID ${documentUUID} not found.`,
      error: 'Document not found',
    };
  }

  const doc = document[0];
  const metadata = doc.documentMetadata ? JSON.parse(doc.documentMetadata) : {};

  const output = [
    `Title: ${doc.documentTitle}`,
    `Type: ${doc.documentType}`,
    `Total Chunks: ${doc.documentTotalChunks}`,
    `Created: ${new Date(doc.documentCreatedAt).toLocaleDateString('en-GB')}`,
    metadata.author ? `Author: ${metadata.author}` : null,
    metadata.pages ? `Pages: ${metadata.pages}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    success: true,
    output,
    data: { ...doc, metadata },
  };
}

async function executeListDocuments(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { filter } = inputs;

  let query = 'SELECT documentUUID, documentTitle, documentType, documentTotalChunks FROM documents';
  const params: any[] = [];

  if (filter && typeof filter === 'string') {
    query += ' WHERE documentTitle LIKE ? OR documentType = ?';
    params.push(`%${filter}%`, filter);
  }

  query += ' ORDER BY documentCreatedAt DESC LIMIT 50';

  const documents = await db.query(query, params);

  if (!documents || documents.length === 0) {
    return {
      success: true,
      output: 'No documents found in the library.',
      data: [],
    };
  }

  const output = documents
    .map(
      (doc: any, index: number) =>
        `${index + 1}. ${doc.documentTitle} (${doc.documentType}, ${doc.documentTotalChunks} chunks)\n   UUID: ${doc.documentUUID}`
    )
    .join('\n\n');

  return {
    success: true,
    output: `Found ${documents.length} documents:\n\n${output}`,
    data: documents,
  };
}

async function executeDecomposeQuery(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { question } = inputs;

  if (!question || typeof question !== 'string') {
    return {
      success: false,
      output: 'Invalid question parameter',
      error: 'Question must be a non-empty string',
    };
  }

  const subQuestions = await decomposeQuery(question);

  if (!subQuestions || subQuestions.length === 0) {
    return {
      success: true,
      output: 'Query is already simple and does not need decomposition.',
      data: [question],
    };
  }

  const output = subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  return {
    success: true,
    output: `Decomposed into ${subQuestions.length} sub-questions:\n\n${output}`,
    data: subQuestions,
  };
}

async function executeExtractEntities(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { text } = inputs;

  if (!text || typeof text !== 'string') {
    return {
      success: false,
      output: 'Invalid text parameter',
      error: 'Text must be a non-empty string',
    };
  }

  const entities = await extractEntities(text);

  if (!entities || Object.keys(entities).length === 0) {
    return {
      success: true,
      output: 'No significant entities found in the text.',
      data: {},
    };
  }

  const output = Object.entries(entities)
    .map(([category, items]) => `${category}: ${(items as string[]).join(', ')}`)
    .join('\n');

  return {
    success: true,
    output: `Extracted entities:\n\n${output}`,
    data: entities,
  };
}

async function executeClassifyQuery(inputs: Record<string, any>): Promise<ToolExecutionResult> {
  const { query } = inputs;

  if (!query || typeof query !== 'string') {
    return {
      success: false,
      output: 'Invalid query parameter',
      error: 'Query must be a non-empty string',
    };
  }

  const classification = await classifyQuery(query);

  const descriptions: Record<string, string> = {
    factual: 'Seeking specific facts or definitions',
    comparative: 'Comparing multiple items or concepts',
    summary: 'Requesting a summary or overview',
    procedural: 'Asking how to do something step-by-step',
    exploratory: 'Open-ended exploration of a topic',
  };

  return {
    success: true,
    output: `Query type: ${classification}\n${descriptions[classification] || 'Unknown type'}`,
    data: { type: classification, description: descriptions[classification] },
  };
}

// ============================================================================
// TOOL FORMATTING FOR AGENT PROMPT
// ============================================================================

/**
 * Formats available tools as a string for inclusion in the agent system prompt
 */
export function formatToolsForPrompt(): string {
  return AVAILABLE_TOOLS.map((tool) => {
    const params = Object.entries(tool.parameters)
      .map(([name, config]) => {
        const requiredStr = config.required ? ' (required)' : ' (optional)';
        const defaultStr = config.default !== undefined ? `, default: ${JSON.stringify(config.default)}` : '';
        return `  - ${name} (${config.type}${requiredStr}${defaultStr}): ${config.description}`;
      })
      .join('\n');

    return `**${tool.name}**\n${tool.description}\nParameters:\n${params}`;
  }).join('\n\n');
}
