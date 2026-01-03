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

```mermaid
graph TD
    A[DOCUMENT INGESTION] --> A1[PDF/Text Upload]
    A1 --> A2[Convert to Markdown]
    A2 --> A3[Semantic Chunks]
    A3 --> A4[Generate Embeddings<br/>Parallel Processing]
    A4 --> A5[Store in Database]

    A5 --> B[RETRIEVAL & CONTEXT]
    B --> B1[User Message]
    B1 --> B2[Build Weighted Query]
    B2 --> B3[Vector Search]
    B3 --> B4[Filter by Similarity]
    B4 --> B5[Format with Metadata]

    B5 --> C[CHAT GENERATION]
    C --> C1[System Prompt + RAG Context + History]
    C1 --> C2[Send to Ollama]
    C2 --> C3[Stream Response]
    C3 --> C4[Save to Chat History]

    style A fill:#2d3748,stroke:#4299e1,stroke-width:3px,color:#fff
    style B fill:#2d3748,stroke:#48bb78,stroke-width:3px,color:#fff
    style C fill:#2d3748,stroke:#9f7aea,stroke-width:3px,color:#fff
```

### Complete Chat Data Flow

This section explains the complete journey from when a user sends a message to receiving an AI response. Each stage is explained in detail with file references and timing information.

```mermaid
graph TB
    A[1. USER INPUT<br/>User submits message<br/>⏱️ <10ms] --> B[2. LOAD CONFIGURATION<br/>Query model settings & RAG config<br/>⏱️ 5-15ms]

    B --> C[3. LOAD CONVERSATION HISTORY<br/>Get last 10 messages<br/>⏱️ 3-8ms]

    C --> D{Documents<br/>Selected?}

    D -->|Yes| E[4. RAG PIPELINE]
    D -->|No| J

    E --> F[4a. Generate Query Embedding<br/>Ollama /api/embed<br/>⏱️ 50-150ms or <1ms cached]
    F --> G[4b. Vector Similarity Search<br/>MariaDB VEC_DISTANCE_COSINE<br/>⏱️ 50-200ms]
    G --> H[4c. Filter by Threshold<br/>Top N chunks<br/>⏱️ <1ms]
    H --> I[4d. Format Context<br/>Add metadata & citations<br/>⏱️ 1-3ms]

    I --> J[5. BUILD SYSTEM PROMPT<br/>Combine prompt + context<br/>⏱️ <1ms]

    J --> K[6. CONSTRUCT MESSAGES<br/>OpenAI format array<br/>⏱️ <1ms]

    K --> L[7. SEND TO OLLAMA<br/>POST /api/chat stream=true<br/>⏱️ 100-500ms]

    L --> M[8. STREAM RESPONSE<br/>Server-Sent Events<br/>⏱️ 2.5-7s for 200 tokens]

    M --> N[9. DISPLAY IN UI<br/>Real-time typewriter effect<br/>⏱️ Real-time]

    N --> O[10. ADD CITATIONS<br/>Append sources<br/>⏱️ <1ms]

    O --> P[11. SAVE TO DATABASE<br/>INSERT messages<br/>⏱️ 5-15ms]

    P --> Q[12. UPDATE UI<br/>Revalidate & refresh<br/>⏱️ 10-30ms]

    Q --> R[✅ COMPLETE<br/>Total: ~8 seconds]

    style A fill:#2d3748,stroke:#4299e1,stroke-width:3px,color:#fff
    style E fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style F fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style G fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style H fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style I fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style M fill:#2d3748,stroke:#48bb78,stroke-width:3px,color:#fff
    style R fill:#2d3748,stroke:#9f7aea,stroke-width:3px,color:#fff
```

**Timing Summary:**
- Time to first token: ~400-900ms (Stages 1-7)
- Response generation: ~2.5-7s (Stage 8, depends on model and response length)
- Total time: ~8 seconds for 200 token response on small model

**Key Optimisations:**
- LRU embedding cache: <1ms vs 50-150ms for repeated queries
- MariaDB vector index: Fast similarity search even with thousands of chunks
- Streaming responses: User sees output immediately, no wait for completion
- Limited history: Only 10 messages loaded (fast DB query)
- Parallel processing: Embeddings generated in batches (5-10x faster ingestion)

#### Stage 1: User Message Submission

**Location**: [app/routes/chats/detail.tsx](app/routes/chats/detail.tsx) - Lines 340-380

**What happens**:
1. User types message in textarea
2. Presses Enter (or Shift+Enter for new line)
3. Form submits via React Router action
4. Message is validated (must not be empty)

**Data sent**:
```typescript
{
  message: "How do I install the software?",
  customModelId: 42,
  documentIds: [1, 5, 12],  // Selected from sidebar
  chatId: "uuid-abc-123"
}
```

**Time**: <10ms (instant form submission)

#### Stage 2: Load Model Configuration

**Location**: [app/lib/models.server.ts](app/lib/models.server.ts) - `getCustomModelByIdWithDocuments()`

**What happens**:
1. Query database for model settings
2. Load model's system prompt, temperature, RAG settings
3. Load associated document UUIDs
4. Load intelligent RAG feature flags

**Database query**:
```sql
SELECT
  m.*,
  d.documentUUID, d.documentTitle
FROM custom_models m
LEFT JOIN model_documents md ON m.modelId = md.modelId
LEFT JOIN documents d ON md.documentId = d.documentId
WHERE m.modelId = ?
```

**Data retrieved**:
```typescript
{
  modelName: "Technical Support Bot",
  systemPrompt: "You are a helpful technical support assistant...",
  ollamaModel: "llama3.2:3b",
  ollamaTemperature: 0.7,
  ragMaxChunks: 5,
  ragSimilarityThreshold: 0.3,
  ragUseHyDE: true,
  ragEnableCitations: true,
  documents: [
    { documentUUID: "uuid-1", documentTitle: "User Manual.pdf" },
    { documentUUID: "uuid-2", documentTitle: "Installation Guide.pdf" }
  ]
}
```

**Time**: 5-15ms (single database query with joins)

#### Stage 3: Load Conversation History

**Location**: [app/lib/chat.server.ts](app/lib/chat.server.ts) - `getChatMessages()`

**What happens**:
1. Query database for previous messages in this chat
2. Load last 10 messages (to fit in context window)
3. Format as `{ role: 'user' | 'assistant', content: string }[]`

**Database query**:
```sql
SELECT messageUser, messagesystem, messageCreated
FROM messages
WHERE messageChat = ?
ORDER BY messageCreated ASC
LIMIT 10
```

**Data retrieved**:
```typescript
[
  { role: 'user', content: 'What are the system requirements?' },
  { role: 'assistant', content: 'The system requires 8GB RAM minimum...' },
  { role: 'user', content: 'How do I install the software?' }  // Current message
]
```

**Time**: 3-8ms (indexed query)

#### Stage 4: RAG Retrieval Pipeline

**Location**: [app/lib/document.server.ts](app/lib/document.server.ts) - `buildRAGContext()`

This is the core of the RAG system. Multiple steps happen here:

##### Stage 4a: Generate Query Embedding

**What happens**:
1. Take user's current message
2. Optionally: Weight it 2x in conversation context (current message is most important)
3. Send to Ollama's `/api/embed` endpoint
4. Receive 768-dimensional vector

**API call**:
```typescript
POST http://localhost:11434/api/embed
{
  "model": "nomic-embed-text:latest",
  "input": "How do I install the software?"
}
```

**Response**:
```typescript
{
  "embeddings": [
    [0.023, -0.145, 0.089, ..., 0.012]  // 768 numbers
  ]
}
```

**Time**: 50-150ms (depends on Ollama performance)

**Cache check**: LRU cache checked first (key = first 1000 chars). If hit: <1ms

##### Stage 4b: Vector Similarity Search

**Location**: [app/lib/db.server.ts](app/lib/db.server.ts) - `searchVectorData()`

**What happens**:
1. Query MariaDB with cosine similarity function
2. Compare query embedding against ALL chunk embeddings in selected documents
3. Calculate similarity score for each chunk (0.0 to 1.0)
4. Sort by similarity descending

**Database query**:
```sql
SELECT
  dc.chunkContent,
  dc.chunkMetadata,
  d.documentTitle,
  (1 - VEC_DISTANCE_COSINE(dc.chunkEmbedding, VEC_FromText(?))) AS similarity
FROM document_chunks dc
INNER JOIN documents d ON dc.chunkDocumentId = d.documentId
WHERE d.documentUUID IN (?, ?, ...)  -- Selected documents only
ORDER BY similarity DESC
```

**Explanation of similarity calculation**:
- `VEC_DISTANCE_COSINE()` returns distance (0 = identical, 2 = opposite)
- `1 - distance` converts to similarity (1 = identical, -1 = opposite)
- Higher similarity = more relevant chunk

**Time**: 50-200ms (depends on number of chunks - MariaDB vector index makes this fast)

##### Stage 4c: Filter by Similarity Threshold

**What happens**:
1. Filter results where similarity >= configured threshold (e.g., 0.3)
2. Take top N chunks (e.g., 5) based on model's `ragMaxChunks` setting
3. This ensures only relevant context is included

**Example filtering**:
```typescript
// Results from database:
[
  { similarity: 0.842, content: "To install, download installer..." },  // ✅ Included
  { similarity: 0.756, content: "System requirements: 8GB RAM..." },    // ✅ Included
  { similarity: 0.623, content: "Troubleshooting: If install fails..." }, // ✅ Included
  { similarity: 0.412, content: "API documentation for developers..." }, // ✅ Included
  { similarity: 0.287, content: "Company history and mission..." },      // ❌ Below threshold
]

// After filtering (threshold=0.3) and limiting (maxChunks=5):
Top 4 chunks included in context
```

**Time**: <1ms (in-memory filtering)

##### Stage 4d: Format Context with Metadata

**Location**: [app/lib/document.server.ts](app/lib/document.server.ts) - `formatRAGContext()`

**What happens**:
1. For each chunk, extract metadata (page number, section, heading hierarchy)
2. Format as markdown with clear source attribution
3. Add instructions for LLM on how to use context
4. Calculate average similarity score for confidence tracking

**Formatted output**:
```markdown
You have access to the following relevant information from the user's documents.
Use this context to answer their question accurately. Cite sources using [1], [2] notation.

---

Source [1]: Installation Guide.pdf (Page 12)
Section: Software Installation > Prerequisites

To install the software, first ensure you meet the system requirements:
- 8GB RAM minimum (16GB recommended)
- Windows 10 or later
- 2GB free disk space

Download the installer from our website and run the .exe file...

---

Source [2]: Installation Guide.pdf (Page 13)
Section: Software Installation > Installation Steps

1. Run the downloaded installer
2. Accept the license agreement
3. Choose installation directory
4. Click "Install" and wait for completion
5. Restart your computer when prompted

---

[End of retrieved context]

When answering, cite sources like this: "According to the installation guide [1]..."
```

**Metadata extracted**:
```typescript
{
  chunks: 4,
  avgSimilarity: 0.658,
  sources: [
    { document: "Installation Guide.pdf", page: 12, section: "Prerequisites" },
    { document: "Installation Guide.pdf", page: 13, section: "Installation Steps" }
  ]
}
```

**Time**: 1-3ms (string formatting)

#### Stage 5: Build Complete System Prompt

**Location**: [app/lib/intelligent-chat.server.ts](app/lib/intelligent-chat.server.ts) - Lines 123-125

**What happens**:
1. Start with model's custom system prompt (or default)
2. Append conversation summary (if multi-turn chat)
3. Append RAG context from Stage 4
4. Result is a complete prompt that guides the LLM

**Custom system prompt** (from model config):
```
You are a helpful technical support assistant with access to documentation.
When answering questions, cite relevant information from the provided context.
Be concise and professional.
```

**Conversation summary** (if enabled):
```
Conversation context: The user previously asked about system requirements
and was informed that 8GB RAM minimum is needed.
```

**Final combined prompt**:
```
You are a helpful technical support assistant with access to documentation.
When answering questions, cite relevant information from the provided context.
Be concise and professional.

Conversation context: The user previously asked about system requirements
and was informed that 8GB RAM minimum is needed.

You have access to the following relevant information from the user's documents.
Use this context to answer their question accurately. Cite sources using [1], [2] notation.

---

Source [1]: Installation Guide.pdf (Page 12)
[... full RAG context from Stage 4 ...]
```

**Time**: <1ms (string concatenation)

#### Stage 6: Construct Messages Array

**Location**: [app/lib/intelligent-chat.server.ts](app/lib/intelligent-chat.server.ts) - Lines 198-202

**What happens**:
1. Build array of messages in OpenAI-compatible format
2. Include system prompt, conversation history, and current message
3. Limit history to last 10 messages to fit in context window

**Messages array**:
```typescript
[
  {
    role: "system",
    content: "[Full system prompt from Stage 5]"
  },
  {
    role: "user",
    content: "What are the system requirements?"
  },
  {
    role: "assistant",
    content: "The system requires 8GB RAM minimum..."
  },
  {
    role: "user",
    content: "How do I install the software?"
  }
]
```

**Token count estimation**:
- System prompt + RAG context: ~2,000-4,000 tokens
- Conversation history (10 messages): ~500-1,500 tokens
- Current message: ~20-100 tokens
- **Total input**: ~2,500-5,500 tokens (well within 16K context window)

**Time**: <1ms (array construction)

#### Stage 7: Send to Ollama API

**Location**: [app/lib/intelligent-chat.server.ts](app/lib/intelligent-chat.server.ts) - Lines 204-219

**What happens**:
1. POST to Ollama's `/api/chat` endpoint
2. Request streaming response for real-time UI updates
3. Include model parameters (temperature, top_p, num_ctx)

**API call**:
```typescript
POST http://localhost:11434/api/chat
{
  "model": "llama3.2:3b",
  "messages": [/* array from Stage 6 */],
  "stream": true,
  "options": {
    "temperature": 0.7,
    "top_p": 0.9,
    "num_ctx": 16384
  }
}
```

**Time**: 100-500ms until first token (depends on model size and hardware)

#### Stage 8: Stream Response Tokens

**Location**: [app/lib/intelligent-chat.server.ts](app/lib/intelligent-chat.server.ts) - Lines 317-347

**What happens**:
1. Ollama sends response as Server-Sent Events (SSE) stream
2. Each event contains one or more tokens
3. Tokens are yielded to the UI in real-time
4. User sees response appear word-by-word

**Stream format**:
```json
{"message":{"role":"assistant","content":"To"}}
{"message":{"role":"assistant","content":" install"}}
{"message":{"role":"assistant","content":" the"}}
{"message":{"role":"assistant","content":" software"}}
{"message":{"role":"assistant","content":","}}
{"message":{"role":"assistant","content":" follow"}}
// ... continues until complete
{"done":true}
```

**Streaming speed**:
- Small model (1-3B params): 30-80 tokens/second
- Medium model (7-13B params): 10-30 tokens/second
- Large model (30B+ params): 3-10 tokens/second

**Total generation time** (for 200 token response):
- Small model: 2.5-7 seconds
- Medium model: 7-20 seconds

#### Stage 9: Display in UI

**Location**: [app/routes/chats/detail.tsx](app/routes/chats/detail.tsx) - Lines 200-250

**What happens**:
1. React component receives streamed tokens
2. Appends each token to current response text
3. Re-renders UI to show growing response
4. User sees natural, typewriter-style output

**UI state updates**:
```typescript
// Initial state
response = ""

// After first chunk
response = "To"

// After second chunk
response = "To install"

// After third chunk
response = "To install the"

// ... continues until complete
response = "To install the software, follow these steps:\n\n1. Download..."
```

**Time**: Real-time as tokens arrive (no delay)

#### Stage 10: Add Citations

**Location**: [app/lib/intelligent-chat.server.ts](app/lib/intelligent-chat.server.ts) - Lines 350-357

**What happens** (if citations enabled):
1. After response streaming completes
2. Append formatted source citations
3. Shows user which documents were used

**Citation format**:
```markdown
---

**Sources:**
[1] Installation Guide.pdf - Page 12 (Software Installation > Prerequisites)
[2] Installation Guide.pdf - Page 13 (Software Installation > Installation Steps)
```

**Time**: <1ms (appended after stream completes)

#### Stage 11: Save to Database

**Location**: [app/lib/chat.server.ts](app/lib/chat.server.ts) - `insertMessage()`

**What happens**:
1. Complete response is saved to messages table
2. Both user message and assistant response are stored
3. Timestamp recorded for ordering

**Database insert**:
```sql
INSERT INTO messages (messageChat, messageUser, messagesystem, messageCreated)
VALUES
  (?, 'How do I install the software?', NULL, NOW()),
  (?, NULL, 'To install the software, follow...', NOW())
```

**Time**: 5-15ms (two inserts with transaction)

#### Stage 12: Update Chat History

**Location**: [app/routes/chats/detail.tsx](app/routes/chats/detail.tsx) - Remix revalidation

**What happens**:
1. React Router automatically revalidates loader data
2. Chat history re-fetched from database
3. UI updates to show new messages in conversation
4. Chat is ready for next message

**Time**: 10-30ms (re-fetch and re-render)

### Complete Timing Breakdown

For a typical chat interaction with RAG enabled:

| Stage | Operation | Time | Cumulative |
|-------|-----------|------|------------|
| 1 | User message submission | <10ms | 10ms |
| 2 | Load model configuration | 5-15ms | 25ms |
| 3 | Load conversation history | 3-8ms | 33ms |
| 4a | Generate query embedding | 50-150ms | 183ms |
| 4b | Vector similarity search | 50-200ms | 383ms |
| 4c | Filter by threshold | <1ms | 384ms |
| 4d | Format context | 1-3ms | 387ms |
| 5 | Build system prompt | <1ms | 388ms |
| 6 | Construct messages array | <1ms | 389ms |
| 7 | Send to Ollama | 100-500ms | 889ms |
| 8 | Generate response (200 tokens) | 2,500-7,000ms | 7,889ms |
| 9 | Display in UI | Real-time | - |
| 10 | Add citations | <1ms | 7,890ms |
| 11 | Save to database | 5-15ms | 7,905ms |
| 12 | Update chat history | 10-30ms | 7,935ms |

**Total time to first token**: ~400-900ms (Stages 1-7)
**Total time to complete response**: ~8 seconds (for 200 token response on small model)

### Performance Optimisations in the Pipeline

1. **Embedding cache**: Repeated queries hit cache (<1ms vs 50-150ms)
2. **Parallel batch embedding**: Document ingestion 5-10x faster
3. **MariaDB vector index**: Fast similarity search even with thousands of chunks
4. **Streaming responses**: User sees output immediately, doesn't wait for completion
5. **Limited conversation history**: Only last 10 messages loaded (keeps DB query fast)
6. **Weighted query embedding**: Current message weighted 2x for better relevance
7. **Similarity threshold**: Filters out irrelevant chunks, reduces LLM context size

### Error Handling at Each Stage

The system includes circuit breakers and error handling:

- **Stage 2-4**: If DB connection fails → Return error message to user
- **Stage 4a**: If embedding fails → Retry once, then fall back to keyword search
- **Stage 4b**: If vector search fails → Fall back to full-text search
- **Stage 7**: If Ollama connection fails → Circuit breaker trips after 3 failures
- **Stage 8**: If streaming fails → Buffer and retry, or return partial response

**Circuit breaker configuration**:
```typescript
{
  failureThreshold: 3,    // Trip after 3 failures
  successThreshold: 2,    // Reset after 2 successes
  timeout: 30000          // 30 second timeout
}
```

This ensures the application degrades gracefully rather than crashing completely.

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

## Intelligent RAG Features

The application includes a sophisticated set of intelligent RAG features designed to improve retrieval accuracy, response quality, and professional output formatting. These features can be enabled per-model via the Custom Model CMS.

### Core Intelligence Features

#### 1. HyDE (Hypothetical Document Embeddings)

**Purpose**: Improves retrieval accuracy by 30-50% for complex queries.

**How it works**:
1. Generate a hypothetical answer to the user's question using the LLM
2. Embed the hypothetical answer instead of the raw query
3. Search for document chunks similar to the hypothetical answer
4. Documents that would contain the answer are more similar than documents matching just query keywords

**Example**:
```
User query: "How do I reset my password?"

Standard retrieval: Searches for chunks containing "reset" and "password"
HyDE retrieval: Generates "To reset your password, navigate to Settings..."
                Then searches for chunks similar to that explanation
```

**Implementation**: [app/lib/intelligent-rag.server.ts](app/lib/intelligent-rag.server.ts) - `generateHypotheticalAnswer()`

**Performance gain**: Better matches for how-to questions and conceptual queries

#### 2. Query Decomposition

**Purpose**: Breaks complex multi-part questions into focused sub-queries for comprehensive answers.

**How it works**:
1. LLM analyses the user's question
2. Decomposes it into 2-4 atomic sub-questions
3. Retrieves relevant chunks for each sub-question independently
4. Combines and de-duplicates results before sending to LLM

**Example**:
```
User query: "What are the system requirements and how do I install the software?"

Decomposed into:
1. "What are the system requirements?"
2. "How do I install the software?"

Each sub-query retrieves targeted chunks, ensuring both aspects are covered
```

**Implementation**: [app/lib/intelligent-rag.server.ts](app/lib/intelligent-rag.server.ts) - `decomposeQuery()`

**Performance gain**: Ensures complex questions get comprehensive context

#### 3. Context Compression

**Purpose**: Removes irrelevant sentences from retrieved chunks to fit 2-3x more relevant content in the context window.

**How it works**:
1. Retrieve chunks using standard vector search
2. For each chunk, extract only sentences relevant to the query
3. Remove filler content, tangential information, and repetition
4. Preserve core facts and critical context

**Example**:
```
Original chunk (180 words):
"Our company was founded in 1995 in London. Over the years we've grown to serve...
[lots of background]...To install the software, first download the installer from
our website. Then run the .exe file and follow the on-screen prompts..."

Compressed chunk (45 words):
"To install the software, first download the installer from our website. Then run
the .exe file and follow the on-screen prompts..."
```

**Implementation**: [app/lib/intelligent-rag.server.ts](app/lib/intelligent-rag.server.ts) - `compressContext()`

**Performance gain**: More relevant information fits in the same token budget

#### 4. Entity Tracking

**Purpose**: Maintains conversation context by tracking mentioned topics, concepts, and entities across messages.

**How it works**:
1. Extract named entities (people, places, products, concepts) from conversation history
2. Weight recent entities higher than older ones
3. Use entity list to inform retrieval (boost chunks mentioning tracked entities)
4. Helps LLM maintain coherent multi-turn conversations

**Example**:
```
User: "Tell me about the authentication system"
System: [Tracks: "authentication", "auth system"]

User: "How do I configure it?"
System: [Knows "it" = "authentication system", retrieves auth configuration docs]
```

**Implementation**: [app/lib/intelligent-rag.server.ts](app/lib/intelligent-rag.server.ts) - `extractEntities()`

**Performance gain**: Better context continuity in multi-turn conversations

### Quality and Accuracy Features

#### 5. Citation System

**Purpose**: Adds inline [1], [2] style citations to responses with source attribution.

**How it works**:
1. Each retrieved chunk includes document name and page number metadata
2. LLM is instructed to add citation markers when using information from sources
3. System appends a "Sources" section at the end with full references

**Example output**:
```
According to the installation guide, you need 8GB RAM minimum [1] and
16GB is recommended for optimal performance [2].

Sources:
[1] Installation Guide - Page 3 (System Requirements)
[2] Installation Guide - Page 3 (Recommendations)
```

**Implementation**: [app/lib/rag-enhanced.server.ts](app/lib/rag-enhanced.server.ts) - `buildEnhancedRAGContext()`

**Professional use case**: Essential for compliance, education, and professional advisory applications

#### 6. Confidence Scoring

**Purpose**: Calculates high/medium/low confidence levels for answer quality and relevance.

**How it works**:
1. Analyse retrieved chunk similarity scores
2. Check for hallucination indicators (generic phrases, hedging language)
3. Verify answer relevance to the query
4. Assign confidence level based on evidence strength

**Confidence criteria**:
- **High**: Average similarity > 0.7, specific facts cited, no hedging
- **Medium**: Average similarity 0.5-0.7, some relevant information, minor hedging
- **Low**: Average similarity < 0.5, mostly generic information, heavy hedging

**Implementation**: [app/lib/intelligent-rag.server.ts](app/lib/intelligent-rag.server.ts) - `validateAnswer()`

**Use case**: Helps users judge reliability of AI responses, especially for critical decisions

### Response Enhancement Features

#### 7. Professional Formatting

**Purpose**: Enhances responses with proper markdown structure, code blocks, and formatting.

**How it works**:
1. Detect code snippets and wrap in proper markdown code blocks
2. Format lists, headings, and tables consistently
3. Add emphasis (bold, italic) for key concepts
4. Ensure consistent spacing and hierarchy

**Implementation**: [app/lib/response-formatter.ts](app/lib/response-formatter.ts) - `enhanceResponse()`

#### 8. Executive Summaries

**Purpose**: Adds brief summaries for long responses (300+ words).

**Example**:
```
**Summary**: To install the software, download the installer, run it, and follow
the prompts. Requires 8GB RAM and Windows 10+.

[Full detailed response follows...]
```

**Use case**: Allows users to quickly grasp the answer before reading details

#### 9. Follow-up Suggestions

**Purpose**: Suggests relevant follow-up questions based on conversation context.

**How it works**:
1. Analyse entities mentioned in the current response
2. Identify common next questions for that topic
3. Generate 2-3 contextually relevant follow-up questions

**Example**:
```
[Response about password reset process]

You might also want to know:
- How do I enable two-factor authentication?
- What should I do if I don't receive the reset email?
- How often should I change my password?
```

**Implementation**: [app/lib/response-formatter.ts](app/lib/response-formatter.ts)

#### 10. Smart Disclaimers

**Purpose**: Auto-adds appropriate disclaimers based on topic (legal, medical, financial, security).

**Topic detection**:
- **Legal**: Contract, liability, rights, court, law
- **Medical**: Symptoms, diagnosis, treatment, medicine
- **Financial**: Investment, tax, loan, financial advice
- **Security**: Password, encryption, vulnerability, exploit

**Example disclaimer**:
```
[Response about password security]

Note: This information is for educational purposes. Always follow your
organisation's security policies and consult your IT security team for
specific guidance.
```

**Implementation**: [app/lib/response-formatter.ts](app/lib/response-formatter.ts)

### Intelligent RAG Data Flow

```mermaid
graph TD
    A[USER QUERY PROCESSING] --> A1[User Message]
    A1 --> A2[Entity Extraction<br/>track conversation topics]
    A2 --> A3[Query Decomposition<br/>if complex]
    A3 --> A4[HyDE Generation<br/>optional, for better retrieval]

    A4 --> B[INTELLIGENT RETRIEVAL]
    B --> B1[Enhanced Query]
    B1 --> B2[Multi-Query Vector Search]
    B2 --> B3[Hybrid Search<br/>vector + keyword]
    B3 --> B4[Re-rank Results]
    B4 --> B5[Filter by Similarity Threshold]
    B5 --> B6[Context Compression<br/>remove irrelevant]

    B6 --> C[RESPONSE GENERATION]
    C --> C1[Custom System Prompt +<br/>Compressed Context +<br/>Entity History]
    C1 --> C2[Send to Ollama LLM]
    C2 --> C3[Stream Response]
    C3 --> C4[Add Citations 1, 2]
    C4 --> C5[Calculate Confidence Score]
    C5 --> C6[Validate Answer Quality]

    C6 --> D[RESPONSE ENHANCEMENT]
    D --> D1[Professional Formatting]
    D1 --> D2[Add Executive Summary<br/>if long]
    D2 --> D3[Add Follow-up Suggestions]
    D3 --> D4[Add Smart Disclaimers<br/>if needed]
    D4 --> D5[Append Source Citations]

    style A fill:#2d3748,stroke:#4299e1,stroke-width:3px,color:#fff
    style B fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style C fill:#2d3748,stroke:#48bb78,stroke-width:3px,color:#fff
    style D fill:#2d3748,stroke:#9f7aea,stroke-width:3px,color:#fff
```

### Configuration

Intelligent RAG features are configured per-model via the Custom Model CMS:

1. Navigate to **Models** → Edit Model
2. Scroll to **Intelligent RAG Features** section
3. Enable/disable features individually based on your use case

**Recommended configurations**:

**Professional Advisory (e.g., legal, medical, safeguarding)**:
- HyDE: ON
- Query Decomposition: ON
- Context Compression: ON
- Citations: ON
- Confidence Scoring: ON
- Smart Disclaimers: ON
- Follow-up Suggestions: OFF (keep responses focused)
- Executive Summary: OFF (professionals read full detail)

**General Knowledge Base**:
- HyDE: ON
- Query Decomposition: ON
- Context Compression: ON
- Citations: ON
- Confidence Scoring: ON
- Smart Disclaimers: OFF
- Follow-up Suggestions: ON
- Executive Summary: ON (for long technical docs)

**Code Documentation Assistant**:
- HyDE: OFF (code queries are usually specific)
- Query Decomposition: ON
- Context Compression: OFF (preserve all code context)
- Citations: ON
- Confidence Scoring: OFF
- Smart Disclaimers: OFF
- Follow-up Suggestions: ON
- Executive Summary: OFF

**Performance considerations**:
- HyDE adds 1 LLM call before retrieval (~200-500ms overhead)
- Query Decomposition adds 1 LLM call (~300-700ms overhead)
- Context Compression adds 1 LLM call per chunk (~50-150ms per chunk)
- Other features add minimal latency (<50ms total)

For best performance on slower hardware, disable HyDE and Query Decomposition. The quality improvement is most noticeable for complex, conceptual queries.

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

```mermaid
graph TB
    subgraph INGESTION["📄 DOCUMENT INGESTION PIPELINE"]
        A1[USER UPLOADS DOCUMENT] --> A2[routes/library/new.tsx<br/>Handle File Upload<br/>Accept: .pdf, .txt, .md, .js, .py, etc.<br/>Validate file size and type]
        A2 --> A3[lib/document.server.ts<br/>Convert to Semantic Markdown<br/>PDF → pdf2md extraction<br/>Plain text → Heuristic heading detection<br/>Code/Markdown → Direct storage]
        A3 --> A4[lib/document.server.ts<br/>Chunk with Hierarchy<br/>chunkMarkdown: Respect headings, track hierarchy<br/>chunkText: Sentence-based with 50 char overlap<br/>chunkCode: Preserve function/class boundaries<br/>Max 300 chars per chunk]
        A4 --> A5[lib/document.server.ts<br/>Generate Embeddings Parallel<br/>Batch size: 10 concurrent requests<br/>Model: nomic-embed-text:latest 768 dims<br/>LRU cache: 500 max, 15-min TTL<br/>5-10x faster than sequential]
        A5 --> A6[schema/documents.sql<br/>Store in MariaDB<br/>documents table: metadata + semantic markdown<br/>document_chunks table: chunks + VECTOR 768<br/>Auto-create vector index]
    end

    subgraph RETRIEVAL["🔍 RAG RETRIEVAL PIPELINE"]
        B1[USER ASKS QUESTION] --> B2[routes/chats/detail.tsx<br/>Calculate Dynamic Chunk Limit<br/>availableTokens = 16384 * 0.7 - system - history - msg<br/>chunkLimit = max 3, min 10]
        B2 --> B3[lib/document.server.ts<br/>Build Weighted Query<br/>Current message x2 weight<br/>+ Last 3 user messages<br/>Limit to ~500 words]
        B3 --> B4[lib/document.server.ts<br/>Generate Query Embedding<br/>Check LRU cache first 40-140x faster if hit<br/>POST to Ollama /api/embed<br/>Returns 768-dimensional vector]
        B4 --> B5[lib/document.server.ts<br/>Vector Similarity Search<br/>VEC_DISTANCE_COSINE chunkEmbedding, queryVec<br/>Filter: documentUUID IN selected docs<br/>Order: similarity DESC<br/>Limit: dynamicChunkLimit 3-10]
        B5 --> B6[lib/document.server.ts<br/>Filter by Similarity Threshold<br/>Reject chunks with similarity < 0.3<br/>Return empty context if no relevant chunks]
        B6 --> B7[lib/document.server.ts<br/>Format RAG Context<br/>Markdown format with metadata<br/>Include: page, section, hierarchy, relevance %<br/>Add citation instructions for LLM]
    end

    subgraph GENERATION["💬 RESPONSE GENERATION PIPELINE"]
        C1[lib/chat.ts<br/>Build Message Array<br/>System: prompt + RAG context combined<br/>History: recent messages in token budget<br/>User: current message]
        C2[hooks/useOllama.ts<br/>Send to Ollama Streaming<br/>POST to localhost:11434/api/chat<br/>stream: true newline-delimited JSON<br/>Read response via ReadableStream]
        C3[routes/chats/detail.tsx<br/>Display Streaming Response<br/>Buffer incomplete words for clean display<br/>Update UI progressively as tokens arrive<br/>Show typing indicator while streaming]
        C4[lib/chat.server.ts<br/>Save Message Pair to Database<br/>User message + assistant response<br/>Persist for conversation history<br/>Used for context in future queries]
    end

    A6 -.->|Documents Available| B1
    B7 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4

    style INGESTION fill:#2d3748,stroke:#4299e1,stroke-width:3px,color:#fff
    style RETRIEVAL fill:#2d3748,stroke:#ed8936,stroke-width:3px,color:#fff
    style GENERATION fill:#2d3748,stroke:#48bb78,stroke-width:3px,color:#fff
    style A1 fill:#1a202c,stroke:#4299e1,stroke-width:2px,color:#fff
    style B1 fill:#1a202c,stroke:#ed8936,stroke-width:2px,color:#fff
    style C4 fill:#1a202c,stroke:#9f7aea,stroke-width:2px,color:#fff
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
