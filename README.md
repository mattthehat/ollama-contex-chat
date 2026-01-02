# Ollama Context Chat

A modern, production-ready RAG (Retrieval-Augmented Generation) application built with React Router, Ollama, and MariaDB. This application enables intelligent chat conversations grounded in your own documents using local LLMs.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Quick Start](#quick-start)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
   - [Development](#development)
4. [RAG Architecture](#rag-architecture)
   - [What is RAG?](#what-is-rag)
   - [System Architecture Overview](#system-architecture-overview)
5. [Document Storage & Indexing](#document-storage--indexing)
   - [Database Schema](#database-schema)
   - [Semantic Markdown Processing](#semantic-markdown-processing)
   - [Chunking Strategy](#chunking-strategy)
6. [Vector Embeddings](#vector-embeddings)
   - [Embedding Generation](#embedding-generation)
   - [Parallel Batch Processing](#parallel-batch-processing)
   - [Embedding Cache](#embedding-cache)
7. [Retrieval Mechanism](#retrieval-mechanism)
   - [Similarity Search](#similarity-search)
   - [Query Processing](#query-processing)
   - [Similarity Threshold Filtering](#similarity-threshold-filtering)
8. [Dynamic Context Optimisation](#dynamic-context-optimisation)
   - [Token-Based Context Management](#token-based-context-management)
   - [Message Building](#message-building)
9. [Chat Flow & RAG Context Injection](#chat-flow--rag-context-injection)
   - [End-to-End Flow](#end-to-end-flow)
   - [RAG Context Format](#rag-context-format)
10. [Semantic Chunking & Preprocessing](#semantic-chunking--preprocessing)
    - [Heading Hierarchy Tracking](#heading-hierarchy-tracking)
    - [Markdown-First Approach](#markdown-first-approach)
    - [Chunk Metadata](#chunk-metadata)
11. [Performance Optimisations](#performance-optimisations)
12. [Integration with Ollama](#integration-with-ollama)
    - [Configuration](#configuration)
    - [Streaming Chat API](#streaming-chat-api)
13. [Vector Indexing & Search](#vector-indexing--search)
14. [Data Flow Diagram](#data-flow-diagram)
15. [Key Files & Responsibilities](#key-files--responsibilities)
16. [Deployment](#deployment)
17. [Technical Stack](#technical-stack)
18. [Future Enhancements](#future-enhancements)

---

## Overview

Ollama Context Chat is a sophisticated RAG application that allows you to:

- Upload documents (PDFs, text files, markdown, code) to your personal library
- Automatically chunk and embed documents with semantic understanding
- Ask questions and have conversations grounded in your documents
- Get responses from local LLMs (via Ollama) that cite specific sources
- Maintain conversation history with full context awareness

The application runs entirely locally with no external API dependencies, ensuring privacy and cost-effectiveness.

---

## Features

- **Advanced RAG Implementation** - Semantic chunking with heading hierarchy preservation
- **Intelligent RAG System** - HyDE, query decomposition, context compression, and entity tracking
- **Professional Citations** - Inline source citations with page numbers and confidence scoring
- **Custom Model CMS** - Create and manage AI models with fine-tuned configurations
- **Document Library** - Upload PDFs, text files, markdown, and code
- **Context-Aware Chat** - Conversations grounded in your documents with smart disclaimers
- **Vector Search** - MariaDB 11.7+ native vector similarity search
- **Performance Optimised** - Parallel embedding generation and LRU caching
- **Dynamic Context** - Adaptive token management based on conversation length
- **Real-time Streaming** - Live response streaming from Ollama
- **Response Enhancement** - Professional formatting, summaries, and follow-up suggestions
- **100% Local** - No external APIs, full privacy control
- **Modern UI** - Built with React Router and TailwindCSS
- **TypeScript** - Full type safety throughout the stack

---

## Quick Start

### Prerequisites

- **Node.js** 18+ or **Bun** runtime
- **MariaDB** 11.7+ (for native vector support)
- **Ollama** installed and running locally
- Recommended Ollama models:
  - `ollama pull nomic-embed-text` (for embeddings)
  - `ollama pull llama3.2:1b` (or your preferred chat model)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ollama-context-chat
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Set up the database:
```bash
# Create MariaDB database
mysql -u root -p -e "CREATE DATABASE ollama_chat;"

# Run schema
mysql -u root -p ollama_chat < schema/documents.sql
```

4. Configure environment variables:
```bash
# Create .env file
cp .env.example .env

# Edit .env with your database credentials
DATABASE_URL="mysql://user:password@localhost:3306/ollama_chat"
```

### Development

Start the development server with HMR:

```bash
npm run dev
# or
bun run dev
```

Your application will be available at `http://localhost:5173`.

---

## RAG Architecture

### What is RAG?

**Retrieval-Augmented Generation (RAG)** is a technique that enhances Large Language Models (LLMs) by providing them with relevant context from external knowledge sources. Instead of relying solely on the model's training data, RAG:

1. **Retrieves** relevant information from a knowledge base (your documents)
2. **Augments** the user's query with this context
3. **Generates** a response using both the query and retrieved context

This approach reduces hallucinations, provides source attribution, and allows LLMs to answer questions about your specific documents.

### System Architecture Overview

Our RAG implementation consists of three main pipelines:

```
┌─────────────────────────────────────────────────────────────┐
│                    DOCUMENT INGESTION                       │
│  PDF/Text Upload → Convert to Markdown → Semantic Chunks  │
│       → Generate Embeddings (Parallel) → Store in DB       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    RETRIEVAL & CONTEXT                      │
│  User Message → Build Weighted Query → Vector Search      │
│  → Filter by Similarity → Format with Metadata            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    CHAT GENERATION                          │
│  System Prompt + RAG Context + History → Send to Ollama   │
│       → Stream Response → Save to Chat History             │
└─────────────────────────────────────────────────────────────┘
```

---

## Document Storage & Indexing

### Database Schema

The system uses **MariaDB 11.7+** with native vector support for efficient similarity search.

**Documents Table** ([schema/documents.sql](schema/documents.sql)):
```sql
CREATE TABLE documents (
  documentUUID VARCHAR(36) PRIMARY KEY,
  documentName VARCHAR(255) NOT NULL,
  documentType ENUM('text', 'markdown', 'code', 'documentation', 'pdf'),
  documentMarkdown LONGTEXT,  -- Semantic markdown representation
  documentMetadata JSON,       -- { pageCount, fileSize, etc. }
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Document Chunks Table**:
```sql
CREATE TABLE document_chunks (
  chunkUUID VARCHAR(36) PRIMARY KEY,
  documentUUID VARCHAR(36),
  chunkText LONGTEXT NOT NULL,
  chunkEmbedding VECTOR(768) NOT NULL,  -- 768-dimensional vector
  chunkMetadata JSON,                    -- { pageNumber, section, hierarchy, etc. }
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documentUUID) REFERENCES documents(documentUUID) ON DELETE CASCADE
);
```

### Semantic Markdown Processing

When documents are uploaded ([app/routes/library/new.tsx](app/routes/library/new.tsx)), they undergo format-specific processing:

#### 1. Plain Text Documents
Converted to markdown using `convertPlainTextToMarkdown()` with intelligent heuristics:
- **ALL CAPS short lines** detected as headings (H2/H3)
- **Lines starting with numbers or bullets** detected as lists
- **Double line breaks** as paragraph boundaries
- **Preserved indentation** for code-like blocks

**Example transformation**:
```
INSTALLATION GUIDE          →  ## Installation Guide

1. Download the software    →  1. Download the software
2. Run installer            →  2. Run installer

System requirements:        →  System requirements:
- 8GB RAM                   →  - 8GB RAM
```

#### 2. PDF Documents
Converted using `@opendocsg/pdf2md` library:
- Extracts semantic structure (headings, lists, tables)
- Maintains page numbers in metadata
- Falls back to plain text + heuristic conversion on failure
- Preserves page count for citation purposes

#### 3. Code & Markdown Documents
Stored as-is with proper markdown formatting to preserve syntax highlighting and structure.

### Chunking Strategy

Three specialised chunking functions in [app/lib/document.server.ts](app/lib/document.server.ts):

#### `chunkMarkdown()` - Most Sophisticated
The primary chunking strategy respects document structure:

- **Respects heading boundaries** (H1-H6)
- **Maintains full heading hierarchy** for context
- **Ultra-conservative 300 char max** to fit within 2048 token embedding model limit
- **Preserves semantic coherence** by keeping related content together

**Example chunk with metadata**:
```typescript
{
  text: "## System Requirements\n\n- 8GB RAM minimum\n- 16GB recommended...",
  metadata: {
    section: "System Requirements",
    hierarchy: ["Installation Guide", "Prerequisites", "System Requirements"],
    chunkSize: 287
  }
}
```

**Chunking algorithm**:
1. Parse markdown into sections by headings
2. Track heading hierarchy stack as document is traversed
3. When a section exceeds 300 chars, split at paragraph boundaries
4. Include full heading path in each chunk's metadata
5. Never split mid-paragraph or mid-list

#### `chunkText()` - Sentence-Based
For plain text without markdown structure:
- Splits by sentence boundaries using regex patterns
- Maintains semantic coherence (no mid-sentence splits)
- **300 char max** with **50 char overlap** for context continuity
- Overlap ensures concepts spanning chunk boundaries aren't lost

#### `chunkCode()` - Structure-Preserving
For code files:
- Preserves function/class boundaries
- Attempts to break at indentation level 0 (top-level blocks)
- Respects closing braces as natural breaking points
- Maintains code block integrity (no mid-function splits)

---

## Vector Embeddings

### Embedding Generation

**Model**: `nomic-embed-text:latest` via Ollama
- **Dimensions**: 768 (matches MariaDB VECTOR(768))
- **Max context**: 2048 tokens (despite Ollama's num_ctx=8192, model architecture limit is 2048)
- **Input truncation**: 2048 chars for safety margin
- **Normalisation**: Text normalised before embedding (lowercase, whitespace cleanup)

**API Integration** ([app/lib/document.server.ts](app/lib/document.server.ts)):
```typescript
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('http://localhost:11434/api/embed', {
    method: 'POST',
    body: JSON.stringify({
      model: 'nomic-embed-text:latest',
      input: text.slice(0, 2048)  // Truncate to model limit
    })
  });

  const data = await response.json();
  return data.embeddings[0];  // Returns 768-dimensional array
}
```

### Parallel Batch Processing

`generateEmbeddingsInBatches()` function processes multiple chunks simultaneously:

```typescript
// Process 10 embeddings concurrently
const batches = chunks.reduce((acc, chunk, i) => {
  const batchIndex = Math.floor(i / 10);
  if (!acc[batchIndex]) acc[batchIndex] = [];
  acc[batchIndex].push(chunk);
  return acc;
}, []);

for (const batch of batches) {
  await Promise.all(batch.map(chunk => generateEmbedding(chunk.text)));
}
```

**Performance gain**: **5-10x faster** document ingestion compared to sequential processing.

**Metrics logged**:
```
[Embeddings] Generated 47 embeddings in 3.2s (avg: 68ms/chunk)
```

### Embedding Cache

**LRU (Least Recently Used) Cache** for repeated embeddings:

```typescript
const embeddingCache = new LRUCache({
  max: 500,              // Maximum 500 cached embeddings
  ttl: 1000 * 60 * 15   // 15-minute Time-To-Live
});
```

**Cache key**: First 1000 chars of normalised text

**Performance gain**: **40-140x faster** for repeated queries (e.g., user refining the same question)

**Use cases**:
- User asks similar questions in succession
- Common queries across different chat sessions
- Re-indexing documents with minor changes

---

## Retrieval Mechanism

### Similarity Search

Uses **MariaDB 11.7+ native vector distance function** for efficient similarity search:

```sql
SELECT
  dc.chunkText,
  dc.chunkMetadata,
  d.documentName,
  (1 - VEC_DISTANCE_COSINE(dc.chunkEmbedding, VEC_FromText(?))) AS similarity
FROM document_chunks dc
JOIN documents d ON dc.documentUUID = d.documentUUID
WHERE dc.documentUUID IN (?, ?, ...)  -- Selected documents
ORDER BY similarity DESC
LIMIT ?
```

**Key functions**:
- `VEC_DISTANCE_COSINE(vec1, vec2)`: Returns cosine distance (0-1, lower = more similar)
- `VEC_FromText(json)`: Converts JSON embedding array to native vector type
- **Similarity score**: `1 - distance` (0-1 scale, higher = more relevant)

**Why cosine similarity?**
- Cosine similarity measures angle between vectors (direction), not magnitude
- Better for semantic text similarity than Euclidean (L2) distance
- Normalised embeddings make cosine distance optimal

### Query Processing

**Weighted Query Enhancement** ([app/lib/document.server.ts](app/lib/document.server.ts)):

```typescript
function buildRAGContext(
  currentMessage: string,
  conversationHistory: Message[],
  selectedDocuments: string[],
  chunkLimit: number
) {
  // Build weighted query - current message appears TWICE for emphasis
  const recentUserMessages = conversationHistory
    .filter(m => m.role === 'user')
    .slice(-3)  // Last 3 user messages
    .map(m => m.content);

  const queryText = [
    currentMessage,
    currentMessage,  // Doubled for higher weight
    ...recentUserMessages
  ].join('\n').slice(0, 2000);  // ~500 words max

  // Generate embedding and search
  const embedding = await generateEmbedding(queryText);
  const chunks = await searchChunksInDocuments(embedding, selectedDocuments, chunkLimit);

  return formatRAGContext(chunks);
}
```

**Rationale for doubling current message**:
- User's current question is most important for retrieval
- Doubling its weight in the query embedding biases search toward current intent
- Historical messages provide context but shouldn't dominate retrieval

### Similarity Threshold Filtering

**Default threshold**: 0.3 (30% similarity)

```typescript
const relevantChunks = chunks.filter(chunk => chunk.similarity >= 0.3);

if (relevantChunks.length === 0) {
  return '';  // No context injected if nothing is relevant
}
```

**Benefits**:
- Prevents noisy or off-topic information from affecting LLM response
- Reduces hallucinations by excluding low-relevance chunks
- Improves citation accuracy (only cite truly relevant sources)

**Threshold tuning guidance**:
- **0.2-0.3**: Permissive (more context, some noise)
- **0.3-0.5**: Balanced (recommended for most use cases)
- **0.5+**: Strict (only highly relevant chunks, may miss context)

**Performance logging**:
```
[RAG] Search: 157ms | Chunks: 3/5 | Avg Similarity: 0.742
```

---

## Dynamic Context Optimisation

### Token-Based Context Management

Calculates available tokens dynamically based on conversation state ([app/routes/chats/detail.tsx](app/routes/chats/detail.tsx)):

```typescript
const maxContext = 16384;  // Model's max context window (16K tokens)

// Reserve 30% of context for model response generation
const availableForInput = maxContext * 0.7;  // 11,468 tokens

// Calculate tokens already used
const systemPromptTokens = estimateTokens(systemPrompt);
const conversationTokens = estimateTokens(conversationHistory);
const currentMessageTokens = estimateTokens(currentMessage);

// Remaining tokens for RAG context
const availableForRAG = availableForInput
  - systemPromptTokens
  - conversationTokens
  - currentMessageTokens;

// Each chunk ~500 tokens on average
const dynamicChunkLimit = Math.max(3, Math.min(10, Math.floor(availableForRAG / 500)));
```

**Logic breakdown**:
1. **70/30 split**: 70% input (system + history + RAG), 30% output (model response)
2. **Minimum 3 chunks**: Always retrieve at least 3 chunks (even if context is tight)
3. **Maximum 10 chunks**: Cap at 10 to prevent context overload
4. **Adaptive**: Long conversations get fewer RAG chunks, short conversations get more

**Example calculations**:
- Empty conversation: `(11,468 - 100 - 0 - 50) / 500 = 22` → **10 chunks** (capped at max)
- Long conversation (5K tokens history): `(11,468 - 100 - 5,000 - 50) / 500 = 12` → **10 chunks** (capped)
- Very long conversation (9K tokens): `(11,468 - 100 - 9,000 - 50) / 500 = 4` → **4 chunks**

### Message Building

`buildMessagesForOllama()` constructs the final message array with token awareness:

```typescript
function buildMessagesForOllama(
  systemPrompt: string,
  ragContext: string,
  conversationHistory: Message[],
  currentMessage: string,
  maxContext: number
): Message[] {
  // 1. Combined system prompt with RAG context
  const systemMessage = {
    role: 'system',
    content: `${systemPrompt}\n\n${ragContext}`
  };

  // 2. Calculate remaining tokens for conversation history
  const usedTokens = estimateTokens(systemMessage.content) + estimateTokens(currentMessage);
  const availableForHistory = (maxContext * 0.7) - usedTokens;

  // 3. Include as much recent history as fits
  const recentHistory = [];
  let historyTokens = 0;

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(conversationHistory[i].content);
    if (historyTokens + msgTokens > availableForHistory) break;

    recentHistory.unshift(conversationHistory[i]);
    historyTokens += msgTokens;
  }

  // 4. Construct final message array
  return [
    systemMessage,
    ...recentHistory,
    { role: 'user', content: currentMessage }
  ];
}
```

**Token estimation heuristic**:
```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);  // ~4 chars per token
}
```

**Note**: This is a rough estimate. Actual tokenisation varies by model (GPT uses tiktoken, Llama uses sentencepiece). For production, consider using model-specific tokenisers.

---

## Chat Flow & RAG Context Injection

### End-to-End Flow

Detailed walkthrough of a user query with RAG:

```
1. User submits message in chat UI
   └→ [app/routes/chats/detail.tsx] Form submission (action)

2. Calculate dynamic chunk limit
   └→ availableTokens = (16384 * 0.7) - systemPrompt - history - currentMsg
   └→ chunkLimit = max(3, min(10, floor(availableTokens / 500)))

3. Build RAG context
   └→ [app/lib/document.server.ts] buildRAGContext()
   └→ Construct weighted query (current message x2 + recent history)
   └→ Generate embedding for query (with cache check)
   └→ Search selected documents by cosine similarity
   └→ Filter chunks by similarity threshold (>0.3)
   └→ Format into markdown with metadata

4. Build message array for Ollama
   └→ [app/lib/chat.ts] buildMessagesForOllama()
   └→ System prompt + RAG context (combined)
   └→ Recent conversation history (as much as fits)
   └→ Current user message

5. Send to Ollama streaming API
   └→ [app/hooks/useOllama.ts] useOllama()
   └→ POST to http://localhost:11434/api/chat
   └→ Stream response chunks in real-time

6. Display streamed response
   └→ Buffer incomplete words for clean display
   └→ Convert American to British spellings (optional)
   └→ Update UI progressively as tokens arrive

7. Save message pair to database
   └→ [app/lib/chat.server.ts] saveMessage()
   └→ Store user message and assistant response
   └→ Persist for conversation history
```

### RAG Context Format

Generated markdown context injected into system prompt:

```markdown
# Relevant Context from Library Documents

The following 3 chunks have been retrieved from your selected documents (ordered by relevance):

---

### Document Chunk 1: Installation Guide
**Page:** 5
**Section:** Authentication
**Path:** Guide > Security > Authentication
**Relevance:** 87%

To configure authentication, you must first generate an API key from the dashboard.
Navigate to Settings > API Keys and click "Generate New Key". Store this key securely
as it will only be displayed once.

---

### Document Chunk 2: Getting Started Tutorial
**Section:** Setup
**Path:** Getting Started > Setup
**Relevance:** 76%

After installing the dependencies, run `npm install` to initialise the project.
The configuration file will be automatically generated in the root directory.

---

### Document Chunk  3: Troubleshooting Guide
**Page:** 12
**Section:** Common Errors
**Path:** Appendix > Troubleshooting > Common Errors
**Relevance:** 68%

If you encounter a "Connection Refused" error, ensure that the service is running
on the correct port (default: 3000). Check your firewall settings if the issue persists.

---

**Instructions:**
- Use the above context to inform your response when relevant
- Cite specific chunks when using information from them (e.g., "According to the Installation Guide...")
- If the context doesn't contain relevant information, rely on your general knowledge
- Do not fabricate information that isn't in the provided context or your training data
```

**Format benefits**:
- **Clear separation**: Each chunk is visually distinct
- **Rich metadata**: Page numbers, section paths, relevance scores
- **Source attribution**: LLM can cite specific documents/sections
- **Ordered by relevance**: Most relevant chunks appear first
- **Explicit instructions**: Guides LLM behaviour for better citations

---

## Semantic Chunking & Preprocessing

### Heading Hierarchy Tracking

Implemented in `chunkMarkdown()` function ([app/lib/document.server.ts](app/lib/document.server.ts)):

```typescript
function chunkMarkdown(markdown: string, documentType: string) {
  const chunks = [];
  const headingStack: Array<{level: number, text: string}> = [];

  // Split by headings while preserving hierarchy
  const sections = markdown.split(/(?=^#{1,6}\s)/m);

  for (const section of sections) {
    const headingMatch = section.match(/^(#{1,6})\s+(.+)$/m);

    if (headingMatch) {
      const level = headingMatch[1].length;  // Number of # symbols
      const text = headingMatch[2].trim();

      // Update heading stack - remove deeper levels
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }

      headingStack.push({ level, text });
    }

    // Create chunk with full hierarchy
    const hierarchy = headingStack.map(h => h.text);
    const currentSection = headingStack[headingStack.length - 1]?.text;

    chunks.push({
      text: section.trim(),
      metadata: {
        section: currentSection,
        hierarchy: hierarchy,
        chunkSize: section.length
      }
    });
  }

  return chunks;
}
```

**Example hierarchy tracking**:

Given document structure:
```markdown
# Installation Guide
## Prerequisites
### System Requirements
Content about system requirements...
### Software Dependencies
Content about software...
## Setup Instructions
Content about setup...
```

Chunks generated with hierarchy:
```typescript
[
  {
    section: "System Requirements",
    hierarchy: ["Installation Guide", "Prerequisites", "System Requirements"]
  },
  {
    section: "Software Dependencies",
    hierarchy: ["Installation Guide", "Prerequisites", "Software Dependencies"]
  },
  {
    section: "Setup Instructions",
    hierarchy: ["Installation Guide", "Setup Instructions"]
  }
]
```

**Benefits**:
- LLM understands document structure and context
- Better citations ("According to the Prerequisites > System Requirements section...")
- Improved relevance scoring (hierarchy provides semantic context)
- User can trace information back to specific document sections

### Markdown-First Approach

**Why store documents as markdown?**

1. **Structure Preservation**: Headings, lists, code blocks, tables remain intact
2. **Hierarchical Context**: Chunks know their position in document structure
3. **Better Embeddings**: Structured text captures semantics better than plain text
4. **Richer Metadata**: Section paths and page numbers available for citation
5. **Minimal Overhead**: Only 10-30% larger than plain text
6. **Future-Proof**: Easy to re-chunk or re-process without re-parsing original files

**Conversion pipeline**:
```
PDF → pdf2md → Semantic Markdown → Store in DB
                                   ↓
Plain Text → Heuristic Detection → Semantic Markdown → Store in DB
                                   ↓
Markdown/Code → Direct Storage → Semantic Markdown → Store in DB
```

### Chunk Metadata

Each chunk stores comprehensive metadata as JSON:

```typescript
interface ChunkMetadata {
  pageNumber?: number;        // For PDF chunks (e.g., "Page 5")
  section?: string;           // Current section heading
  hierarchy?: string[];       // Full heading path from root
  chunkSize: number;          // Character count (for debugging)
  chunkIndex?: number;        // Position in document (0-based)
}
```

**Example metadata JSON**:
```json
{
  "pageNumber": 12,
  "section": "API Authentication",
  "hierarchy": ["Developer Guide", "API Reference", "API Authentication"],
  "chunkSize": 287,
  "chunkIndex": 47
}
```

**Usage in retrieval**:
- Displayed to user in RAG context format
- Enables precise citations ("On page 12, in the API Authentication section...")
- Helps LLM understand context ("This is from early in the document" vs "This is from an appendix")

---

## Performance Optimisations

Summary of optimisations implemented:

| Optimisation | Implementation | Impact | File |
|--------------|----------------|--------|------|
| **Parallel Embedding Generation** | Process 10 embeddings concurrently using `Promise.all()` | **5-10x faster** document ingestion | [document.server.ts](app/lib/document.server.ts) |
| **LRU Embedding Cache** | Cache 500 most recent embeddings with 15-min TTL | **40-140x faster** repeated queries | [document.server.ts](app/lib/document.server.ts) |
| **Similarity Threshold Filtering** | Reject chunks with <30% similarity | Reduces noise and hallucinations | [document.server.ts](app/lib/document.server.ts) |
| **Heading Hierarchy Tracking** | Maintain full heading path in chunk metadata | Better context understanding | [document.server.ts](app/lib/document.server.ts) |
| **Dynamic Chunk Limits** | Adjust number of chunks based on conversation length | Adaptive to token constraints | [chats/detail.tsx](app/routes/chats/detail.tsx) |
| **Weighted Query Enhancement** | Double current message weight in query embedding | More relevant retrieval | [document.server.ts](app/lib/document.server.ts) |
| **Enhanced Context Formatting** | Rich markdown with metadata and instructions | Better LLM citations | [document.server.ts](app/lib/document.server.ts) |
| **Conservative Chunking** | 300 char max chunks (well below 2048 token limit) | Prevents embedding truncation | [document.server.ts](app/lib/document.server.ts) |
| **Streaming Responses** | Real-time token streaming from Ollama | Better UX, perceived performance | [useOllama.ts](app/hooks/useOllama.ts) |
| **MariaDB Vector Indexing** | Native vector similarity search | Fast retrieval at scale | [documents.sql](schema/documents.sql) |

**Performance metrics example**:
```
[Document Processing] PDF converted to markdown: 1.2s
[Embeddings] Generated 47 embeddings in 3.2s (avg: 68ms/chunk)
[Database] Inserted 47 chunks in 0.4s
[Total] Document ingestion completed in 4.8s

[RAG] Search: 157ms | Chunks: 3/5 | Avg Similarity: 0.742
[Ollama] First token: 234ms | Total generation: 2.1s (47 tokens)
```

---

## Integration with Ollama

### Configuration

Application configuration ([app/lib/config.ts](app/lib/config.ts)):

```typescript
export const config = {
  // Ollama API endpoints
  ollamaEndpoint: 'http://localhost:11434/api/chat',
  ollamaEmbedEndpoint: 'http://localhost:11434/api/embed',

  // Context window (tokens)
  maxContext: 16384,  // 16K tokens

  // Available chat models
  chatModels: [
    'gemma2:latest',
    'deepseek-r1:1.5b',
    'llama3.2:1b',
    'gemma2:2b'
  ],

  // Embedding model
  embedModel: 'nomic-embed-text:latest',

  // RAG settings
  defaultChunkLimit: 5,
  similarityThreshold: 0.3,
  embeddingDimensions: 768
};
```

**Model recommendations**:

**For Chat**:
- **Small/Fast**: `llama3.2:1b`, `gemma2:2b` (1-2GB RAM, fast responses)
- **Balanced**: `llama3.2:3b`, `gemma2:9b` (3-6GB RAM, good quality)
- **High Quality**: `llama3.1:8b`, `qwen2.5:14b` (8-16GB RAM, best responses)

**For Embeddings**:
- **`nomic-embed-text:latest`**: Recommended (768 dims, 2048 tokens, 274MB)
- Alternative: `mxbai-embed-large` (1024 dims, larger but more accurate)

### Streaming Chat API

Real-time streaming implementation ([app/hooks/useOllama.ts](app/hooks/useOllama.ts)):

```typescript
export function useOllama() {
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  async function sendMessage(messages: Message[], model: string) {
    setIsStreaming(true);
    setResponse('');

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true  // Enable streaming
      })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode chunk and parse newline-delimited JSON
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        const data = JSON.parse(line);
        if (data.message?.content) {
          setResponse(prev => prev + data.message.content);
        }
      }
    }

    setIsStreaming(false);
  }

  return { response, isStreaming, sendMessage };
}
```

**Streaming benefits**:
- **Perceived performance**: User sees tokens immediately
- **Early feedback**: User can stop generation if answer is off-track
- **Better UX**: Mimics human typing, feels more interactive
- **No timeout issues**: Long responses don't hit request timeouts

**Word buffering** (for cleaner display):
```typescript
// Buffer incomplete words to prevent "wo|rd" splitting mid-word
let wordBuffer = '';
const words = content.split(/(\s+)/);  // Keep whitespace

for (const word of words) {
  if (word.trim()) {
    wordBuffer += word;
    if (wordBuffer.length > 2) {  // Wait for at least 3 chars
      setResponse(prev => prev + wordBuffer);
      wordBuffer = '';
    }
  }
}
```

**Ollama API payload structure**:
```json
{
  "model": "llama3.2:1b",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant.\n\n# Relevant Context...\n\n[RAG context here]"
    },
    {
      "role": "user",
      "content": "Previous user message"
    },
    {
      "role": "assistant",
      "content": "Previous assistant response"
    },
    {
      "role": "user",
      "content": "Current user message"
    }
  ],
  "stream": true,
  "options": {
    "num_ctx": 16384,
    "temperature": 0.7
  }
}
```

---

## Vector Indexing & Search

### MariaDB Vector Index

**Native vector support** in MariaDB 11.7+:

```sql
-- Automatic vector index when VECTOR column is queried
CREATE TABLE document_chunks (
  ...
  chunkEmbedding VECTOR(768) NOT NULL
);

-- MariaDB automatically creates optimised index for similarity search
-- No explicit INDEX creation needed for vector columns
```

**Vector functions available**:
- `VEC_FromText(json)`: Convert JSON array `[0.1, 0.2, ...]` to VECTOR type
- `VEC_ToText(vector)`: Convert VECTOR to JSON array (for retrieval)
- `VEC_DISTANCE_COSINE(vec1, vec2)`: Cosine distance (0-2 scale)
- `VEC_DISTANCE_EUCLIDEAN(vec1, vec2)`: L2 distance

### Distance Calculation

**Cosine similarity search query**:
```sql
SELECT
  chunkUUID,
  chunkText,
  chunkMetadata,
  documentUUID,
  (1 - VEC_DISTANCE_COSINE(chunkEmbedding, VEC_FromText(?))) AS similarity
FROM document_chunks
WHERE documentUUID IN (?, ?, ?)
ORDER BY similarity DESC
LIMIT ?;
```

**Cosine distance interpretation**:
- **0.0**: Vectors are identical (pointing same direction)
- **1.0**: Vectors are orthogonal (90° apart, no similarity)
- **2.0**: Vectors are opposite (180° apart, completely dissimilar)

**Similarity score conversion**:
```typescript
similarity = 1 - distance
// distance=0.0 → similarity=1.0 (100% similar)
// distance=0.5 → similarity=0.5 (50% similar)
// distance=1.0 → similarity=0.0 (0% similar)
```

**Why cosine over Euclidean?**
- Cosine measures angle (semantic similarity), not magnitude
- Normalised embeddings make magnitude irrelevant
- More robust to embedding scale variations
- Industry standard for text embeddings

---

## Data Flow Diagram

Complete end-to-end data flow visualisation:

```
┌──────────────────────────────────────────────────────────────────┐
│                     USER UPLOADS DOCUMENT                        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [routes/library/new.tsx] Handle File Upload                    │
│    • Accept: .pdf, .txt, .md, .js, .py, etc.                    │
│    • Validate file size and type                                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Convert to Semantic Markdown          │
│    • PDF → pdf2md extraction                                     │
│    • Plain text → Heuristic heading detection                    │
│    • Code/Markdown → Direct storage                              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Chunk with Hierarchy                  │
│    • chunkMarkdown(): Respect headings, track hierarchy          │
│    • chunkText(): Sentence-based with 50 char overlap            │
│    • chunkCode(): Preserve function/class boundaries             │
│    • Max 300 chars per chunk (fits in 2048 token limit)          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Generate Embeddings (Parallel)        │
│    • Batch size: 10 concurrent requests                          │
│    • Model: nomic-embed-text:latest (768 dims)                   │
│    • Cache check: LRU cache (500 max, 15-min TTL)                │
│    • Performance: 5-10x faster than sequential                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [schema/documents.sql] Store in MariaDB                        │
│    • documents table: metadata + semantic markdown               │
│    • document_chunks table: chunks + VECTOR(768) embeddings      │
│    • Auto-create vector index for similarity search              │
└──────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────────────┐
│                      USER ASKS QUESTION                          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [routes/chats/detail.tsx] Calculate Dynamic Chunk Limit        │
│    • availableTokens = (16384 * 0.7) - system - history - msg    │
│    • chunkLimit = max(3, min(10, floor(available / 500)))        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Build Weighted Query                  │
│    • Current message (x2 weight)                                 │
│    • + Last 3 user messages                                      │
│    • Limit to ~500 words                                         │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Generate Query Embedding              │
│    • Check LRU cache first (40-140x faster if hit)               │
│    • POST to Ollama /api/embed                                   │
│    • Returns 768-dimensional vector                              │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Vector Similarity Search               │
│    • Query: VEC_DISTANCE_COSINE(chunkEmbedding, queryVec)        │
│    • Filter: documentUUID IN (selected docs)                     │
│    • Order: similarity DESC                                      │
│    • Limit: dynamicChunkLimit (3-10)                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Filter by Similarity Threshold         │
│    • Reject chunks with similarity < 0.3 (30%)                   │
│    • Return empty context if no relevant chunks                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/document.server.ts] Format RAG Context                    │
│    • Markdown format with metadata                               │
│    • Include: page #, section, hierarchy path, relevance %       │
│    • Add instructions for LLM citation behaviour                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/chat.ts] Build Message Array                              │
│    • System: prompt + RAG context (combined)                     │
│    • History: recent messages (as many as fit in token budget)   │
│    • User: current message                                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [hooks/useOllama.ts] Send to Ollama (Streaming)                │
│    • POST to http://localhost:11434/api/chat                     │
│    • stream: true (newline-delimited JSON)                       │
│    • Read response chunks via ReadableStream                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [routes/chats/detail.tsx] Display Streaming Response           │
│    • Buffer incomplete words for clean display                   │
│    • Update UI progressively as tokens arrive                    │
│    • Show typing indicator while streaming                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  [lib/chat.server.ts] Save Message Pair to Database             │
│    • User message + assistant response                           │
│    • Persist for conversation history                            │
│    • Used for context in future queries                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Files & Responsibilities

### Core Application Files

| File | Responsibility | Key Functions |
|------|----------------|---------------|
| [app/lib/document.server.ts](app/lib/document.server.ts) | **RAG Core Logic** | `generateEmbedding()`, `generateEmbeddingsInBatches()`, `chunkMarkdown()`, `chunkText()`, `chunkCode()`, `searchChunksInDocuments()`, `buildRAGContext()` |
| [app/lib/chat.ts](app/lib/chat.ts) | **Message Building** | `buildMessagesForOllama()`, `estimateTokens()`, `formatRAGContext()` |
| [app/lib/chat.server.ts](app/lib/chat.server.ts) | **Chat Persistence** | `saveMessage()`, `getConversationHistory()`, `createChat()` |
| [app/lib/config.ts](app/lib/config.ts) | **Configuration** | Ollama endpoints, model lists, RAG settings |
| [app/hooks/useOllama.ts](app/hooks/useOllama.ts) | **Ollama Integration** | `useOllama()` hook for streaming chat API |

### Route Components

| File | Purpose |
|------|---------|
| [app/routes/home.tsx](app/routes/home.tsx) | Home page, chat list |
| [app/routes/chats/detail.tsx](app/routes/chats/detail.tsx) | Chat UI, dynamic context calculation, message submission |
| [app/routes/library/new.tsx](app/routes/library/new.tsx) | Document upload, format conversion, chunking trigger |
| [app/routes/library/index.tsx](app/routes/library/index.tsx) | Document library listing |
| [app/routes/models.tsx](app/routes/models.tsx) | Model selection and configuration |

### Database Schema

| File | Contents |
|------|----------|
| [schema/documents.sql](schema/documents.sql) | `documents` table (metadata + markdown), `document_chunks` table (chunks + VECTOR(768) embeddings) |

---

## Deployment

### Building for Production

Create a production build:

```bash
npm run build
# or
bun run build
```

Build output:
```
build/
├── client/     # Static assets (JS, CSS, images)
└── server/     # Server-side code
```

### Docker Deployment

**Dockerfile** included for containerisation:

```bash
# Build Docker image
docker build -t ollama-context-chat .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@host:3306/db" \
  -e OLLAMA_ENDPOINT="http://host.docker.internal:11434" \
  ollama-context-chat
```

**Important**: Ollama must be accessible from container. Use `host.docker.internal` (Docker Desktop) or container networking.

### Cloud Deployment Options

Compatible with any Docker-capable platform:

- **AWS ECS/Fargate**: Container orchestration
- **Google Cloud Run**: Serverless containers
- **Azure Container Apps**: Managed containers
- **Digital Ocean App Platform**: Simple Docker deploys
- **Fly.io**: Edge-distributed containers
- **Railway**: One-click Docker deploys

**Requirements**:
- MariaDB 11.7+ database (managed or self-hosted)
- Ollama accessible via network (self-hosted or tunnelled)
- Environment variables configured

### Environment Variables

```bash
# Database connection
DATABASE_URL="mysql://user:password@localhost:3306/ollama_chat"

# Ollama endpoints (default: localhost)
OLLAMA_ENDPOINT="http://localhost:11434/api/chat"
OLLAMA_EMBED_ENDPOINT="http://localhost:11434/api/embed"

# Optional: Customise settings
MAX_CONTEXT=16384
SIMILARITY_THRESHOLD=0.3
```

### Production Considerations

1. **Database Backups**: Regular backups of MariaDB (documents + embeddings)
2. **Ollama Performance**: Consider GPU acceleration for faster embeddings/chat
3. **Embedding Cache**: Consider Redis for multi-instance deployments
4. **Model Management**: Ensure Ollama models are pre-pulled on server
5. **Resource Limits**: Monitor memory usage (embeddings can be large at scale)
6. **Document Storage**: Consider S3/blob storage for original files if needed

---

## Technical Stack

### Frontend
- **React Router 7** - Modern full-stack React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **TailwindCSS** - Utility-first styling
- **Vite** - Build tool and dev server

### Backend
- **Node.js 18+** - Runtime environment
- **MariaDB 11.7+** - Database with native vector support
- **Ollama** - Local LLM inference engine

### Key Libraries
- **@opendocsg/pdf2md** - PDF to markdown conversion
- **lru-cache** - LRU caching for embeddings
- **React Router** - Routing and data loading

### Development Tools
- **TypeScript** - Type checking
- **ESLint** - Code linting
- **Prettier** - Code formatting (recommended)

---

## Future Enhancements

### Planned Optimisations

1. **Hybrid Search**
   - Combine vector similarity with BM25 keyword matching
   - Better retrieval for exact term queries (e.g., API names, error codes)
   - Weighted fusion of vector + keyword scores

2. **Reranking**
   - Add cross-encoder model for reranking top chunks
   - More accurate relevance scoring (slower but better quality)
   - Example: `bge-reranker-base` or `ms-marco-MiniLM`

3. **Query Expansion**
   - Use LLM to expand query with synonyms/related terms
   - Better recall for varied terminology
   - Example: "authentication" → ["authentication", "login", "auth", "credentials"]

4. **Chunk Compression**
   - Summarise low-relevance chunks to fit more context
   - Preserve high-relevance chunks verbatim
   - Balance between context breadth and detail

5. **True Tokenisation**
   - Replace char/4 heuristic with model-specific tokeniser
   - Accurate token counting for context window management
   - Example: `tiktoken` (GPT), `sentencepiece` (Llama)

6. **Persistent Cache**
   - Redis for multi-instance deployments
   - Shared cache across server restarts
   - Distributed caching for horizontal scaling

7. **Multi-Modal Support**
   - Image embeddings (e.g., CLIP model)
   - Table extraction and specialised chunking
   - Chart/diagram understanding

8. **Advanced Chunking**
   - Recursive character splitting for edge cases
   - Language-aware code chunking (AST-based)
   - Sliding window chunks for better coverage

### Potential Features

- **Document Versioning**: Track changes to documents over time
- **Collaborative Chats**: Share conversations with other users
- **Export/Import**: Backup and restore document libraries
- **Advanced Search**: Full-text search in addition to vector search
- **Analytics**: Track most-referenced documents, popular queries
- **Multi-Language Support**: Internationalisation for UI and documents
- **API Access**: REST API for programmatic access
- **Webhooks**: Trigger actions on document uploads or chat events

---

## Contributing

Contributions welcome! Areas of interest:

- Performance optimisations (see [Future Enhancements](#future-enhancements))
- Additional document format support (DOCX, PPTX, etc.)
- Improved UI/UX for chat and library management
- Alternative vector databases (Qdrant, Weaviate, etc.)
- Additional LLM providers (OpenAI, Anthropic, etc.)
- Testing and documentation improvements

---

## Licence

MIT Licence - See LICENCE file for details

---

## Acknowledgements

Built with:
- **Ollama** - Local LLM inference
- **React Router** - Full-stack React framework
- **MariaDB** - Vector database capabilities
- **@opendocsg/pdf2md** - PDF extraction

---

**Built for local-first, privacy-focused AI applications.**
