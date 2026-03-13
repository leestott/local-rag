# Building Your First Local RAG Application with Foundry Local

*A developer's guide to building an offline, mobile-responsive AI support agent using Retrieval-Augmented Generation, the Foundry Local SDK, and JavaScript.*

---

Imagine you are a gas field engineer standing beside a pipeline in a remote location. There is no Wi-Fi, no mobile signal, and you need a safety procedure right now. What do you do?

This is the exact problem that inspired this project: a **fully offline RAG-powered support agent** that runs entirely on your machine. No cloud. No API keys. No outbound network calls. Just a local language model, a local vector store, and your own documents, all accessible from a browser on any device.

In this post, you will learn how it works, how to build your own, and the key architectural decisions behind it. If you have ever wanted to build an AI application that runs locally and answers questions grounded in your own data, this is the place to start.

![Landing page of the Gas Field Support Agent](screenshots/01-landing-page.png)

## What is RAG and Why Does It Matter?

**Retrieval-Augmented Generation (RAG)** is a pattern that makes AI models genuinely useful for domain-specific tasks. Rather than hoping the model "knows" the answer from its training data, you:

1. **Retrieve** relevant chunks from your own documents
2. **Augment** the model's prompt with those chunks as context
3. **Generate** a response grounded in your actual data

The result is fewer hallucinations, traceable answers, and an AI that works with *your* content rather than relying on general knowledge.

If you are building internal tools, customer support bots, field manuals, or knowledge bases, RAG is the pattern you want.

### RAG vs CAG: Two Approaches to Grounding

This project uses **RAG**, but there is a complementary pattern called **Context-Augmented Generation (CAG)** that is worth understanding. The [local-cag sample](https://github.com/leestott/local-cag) demonstrates the CAG approach using the same Foundry Local stack.

| | RAG (this project) | CAG |
|---|---|---|
| **How context is provided** | Retrieved dynamically per query from a vector store | Entire document set loaded into the context window upfront |
| **Best for** | Large or growing document collections | Small, stable document sets that fit in the model's context |
| **Retrieval step** | TF-IDF or embedding search selects the top-K chunks | No retrieval needed; all content is always available |
| **Accuracy trade-off** | Depends on retrieval quality; may miss relevant chunks | All information is visible to the model, but long contexts can dilute focus |
| **Scalability** | Scales to thousands of documents | Limited by the model's context window size |
| **When to choose** | Your documents change frequently, are large, or you need precise sourcing | You have a small, curated set of documents and want maximum simplicity |

Both samples share the same Foundry Local runtime, Express server, and mobile-responsive UI. The difference is in how context reaches the model. If you are building a knowledge base for a handful of documents, start with CAG. If you need to scale or want fine-grained source attribution, choose RAG.

You can find both samples at:
- **RAG**: [github.com/leestott/local-rag](https://github.com/leestott/local-rag)
- **CAG**: [github.com/leestott/local-cag](https://github.com/leestott/local-cag)

## The Stack

This project is intentionally simple. No frameworks, no build steps, no Docker:

| Layer | Technology | Why |
|-------|-----------|-----|
| **AI Model** | [Foundry Local](https://foundrylocal.ai) + Phi-3.5 Mini | Runs locally via the SDK, no GPU needed |
| **Backend** | Node.js + Express | Lightweight, fast, widely understood |
| **Vector Store** | SQLite (via `better-sqlite3`) | Zero infrastructure, single file on disk |
| **Retrieval** | TF-IDF + cosine similarity | No embedding model required, fully offline |
| **Frontend** | Single HTML file with inline CSS | No build step, mobile-responsive, field-ready |

The total dependency footprint is just three npm packages: `express`, `foundry-local-sdk`, and `better-sqlite3`.

## Getting Started

### Prerequisites

You need two things:

1. **Node.js 20+** from [nodejs.org](https://nodejs.org/)
2. **Foundry Local**, Microsoft's on-device AI runtime:
   ```
   winget install Microsoft.FoundryLocal
   ```

The SDK will automatically download the Phi-3.5 Mini model (approximately 2 GB) the first time you run the application.

### Setup

```bash
git clone https://github.com/leestott/local-rag.git
cd local-rag
npm install
npm run ingest   # Index the 20 gas engineering documents
npm start        # Start the server (loads the model via the SDK)
```

Open `http://127.0.0.1:3000` and start chatting.

## Architecture Overview

![Architecture Diagram](screenshots/07-architecture-diagram.png)

The system has five layers, all running on a single machine:

- **Client Layer**: a single HTML file served by Express, with quick-action buttons and a responsive chat interface
- **Server Layer**: Express.js handles API routes for chat (streaming and non-streaming), document upload, and health checks
- **RAG Pipeline**: the chat engine orchestrates retrieval and generation, the chunker handles TF-IDF vectorisation, and the prompts module provides safety-first system instructions
- **Data Layer**: SQLite stores document chunks and their TF-IDF vectors; documents live as `.md` files in the `docs/` folder
- **AI Layer**: Foundry Local runs Phi-3.5 Mini Instruct on CPU or NPU, managed entirely through the JavaScript SDK

## How the RAG Pipeline Works

Let us trace what happens when a user asks: **"How do I detect a gas leak?"**

![RAG Query Flow](screenshots/08-rag-flow-sequence.png)

### Step 1: Document Ingestion

Before any queries happen, you run `npm run ingest`. This script:

1. Reads every `.md` file from the `docs/` folder
2. Parses optional YAML front-matter (title, category, ID)
3. Splits each document into overlapping chunks (approximately 200 tokens each, with 25-token overlap)
4. Computes a TF-IDF vector for each chunk
5. Stores everything in `data/rag.db` (SQLite)

The overlap ensures that no information falls between the cracks of two chunks.

### Step 2: Query to Retrieval

When the user sends "How do I detect a gas leak?", the server:

1. Converts the question into a TF-IDF vector
2. Uses an inverted index to find candidate chunks that share terms with the query
3. Scores candidates using cosine similarity and returns the top 3

For 20 documents with approximately 200 chunks, retrieval executes in under 1 ms thanks to the inverted index.

### Step 3: Prompt Construction

The retrieved chunks are injected into the prompt alongside the system instructions:

```
System: You are an offline gas field support agent. Safety-first...
Context:
  [Chunk 1: Gas Leak Detection, Safety Warnings...]
  [Chunk 2: Gas Leak Detection, Step-by-step...]
  [Chunk 3: Purging Procedures, Related safety...]
User: How do I detect a gas leak?
```

### Step 4: Generation and Streaming

The prompt is sent to the local model via the Foundry Local SDK's native chat client. The response streams back token by token through Server-Sent Events (SSE) to the browser:

![Chat response showing safety warnings and step-by-step guidance](screenshots/03-chat-response.png)

Every response includes expandable source references with relevance scores, so you can verify exactly which documents the AI used:

![Sources panel with document names and similarity scores](screenshots/04-sources-panel.png)

## Foundry Local: Your On-Device AI Runtime

[Foundry Local](https://foundrylocal.ai) is what makes the "offline" part possible. It is a local runtime from Microsoft that:

- Runs small language models (SLMs) on CPU or NPU with no GPU required
- Manages model discovery, downloading, and lifecycle through the SDK
- Provides a native chat client for completions and streaming
- Works entirely offline once the model is cached

The integration code using the latest SDK is clean and direct:

```js
import { FoundryLocalManager } from "foundry-local-sdk";

// Create the manager and discover models via the catalog
const manager = FoundryLocalManager.create();
const model = manager.catalog.getModel("phi-3.5-mini");
await model.load();

// Create a native chat client
const chatClient = model.createChatClient();
const response = await chatClient.completeChat([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "How do I detect a gas leak?" }
]);

console.log(response.choices[0].message.content);
```

The SDK handles everything: service lifecycle, model discovery, hardware-optimised inference, and streaming. There is no need to configure ports, manage processes, or install separate CLI tools.

## Why TF-IDF Instead of Embeddings?

Most RAG tutorials use embedding models for retrieval. We chose TF-IDF for this project because:

1. **Fully offline**: no embedding model to download or run
2. **Zero latency**: vectorisation is instantaneous (it is just maths on word frequencies)
3. **Good enough**: for a curated collection of 20 domain-specific documents, TF-IDF with cosine similarity retrieves the right chunks reliably
4. **Transparent**: you can inspect the vocabulary and weights, unlike neural embeddings

For larger collections (thousands of documents) or when semantic similarity matters more than keyword overlap, you would want to swap in an embedding model. But for this use case, TF-IDF keeps the stack simple and dependency-free.

### Performance Optimisations

The vector store includes several optimisations for fast retrieval:

- **Inverted index**: maps terms to chunk IDs, so only chunks sharing at least one query term are scored
- **In-memory row cache**: parsed TF-IDF maps are kept in memory after first access, avoiding repeated JSON parsing and database reads
- **Prepared statements**: all SQL queries are prepared once and reused

These bring retrieval time down to sub-millisecond for typical query loads.

## Building a Mobile-Responsive Field UI

Field engineers use this application on phones and tablets, often wearing gloves. The UI is designed for harsh conditions:

- **Dark, high-contrast theme** with large text (18px base)
- **Large touch targets** (minimum 44px) for gloved operation
- **Quick-action buttons** for common questions, no typing needed
- **Responsive layout** that works from 320px to 1920px and beyond

| Desktop | Mobile |
|---------|--------|
| ![Desktop view](screenshots/01-landing-page.png) | ![Mobile view](screenshots/02-mobile-view.png) |

The mobile view horizontally scrolls the quick-action bar and adjusts text sizes:

![Mobile chat in action](screenshots/06-mobile-chat.png)

The UI adapts across three breakpoints: 900px for tablets, 600px for mobiles, and 380px for narrow screens. All interactive elements meet minimum touch target sizes recommended by WCAG guidelines.

## Runtime Document Upload

Users can upload new documents without restarting the server:

![Upload document modal](screenshots/05-upload-document.png)

The upload endpoint (`POST /api/upload`) receives the markdown content, chunks it, computes TF-IDF vectors, and inserts the chunks into SQLite, all in memory with no restart needed. The new document is immediately available for retrieval.

## Safety-First Prompting

For safety-critical domains like gas field operations, the system prompt is engineered to:

1. **Always surface safety warnings first**, before any procedural steps
2. **Never hallucinate** procedures, measurements, or legal requirements
3. **Cite sources** so every response references the specific document and section
4. **Fail gracefully**: if the information is not in the RAG database, the agent says so explicitly

```
Format: Summary > Safety Warnings > Step-by-step Guidance > Reference
```

This pattern transfers to any safety-critical domain: medical devices, electrical work, aviation maintenance, chemical handling.

## Adapting This for Your Own Domain

This project is a **scenario sample** designed to be forked and adapted. Here is how to make it yours:

### 1. Replace the Documents

Delete the gas engineering docs in `docs/` and add your own `.md` files. The ingestion pipeline handles any markdown content with optional YAML front-matter:

```markdown
---
title: Troubleshooting Widget Errors
category: Support
id: KB-001
---

# Troubleshooting Widget Errors
...your content here...
```

### 2. Edit the System Prompt

Open `src/prompts.js` and rewrite the system prompt for your domain:

```js
export const SYSTEM_PROMPT = `You are an offline support agent for [YOUR DOMAIN].

Rules:
- Only answer using the retrieved context
- If the answer is not in the context, say so
- Use structured responses: Summary > Details > Reference
`;
```

### 3. Tune the Retrieval

In `src/config.js`:
- `chunkSize: 200`: smaller chunks give more precise retrieval, less context per chunk
- `chunkOverlap: 25`: prevents information falling between chunks
- `topK: 3`: how many chunks to retrieve per query (more gives more context but slower generation)

### 4. Swap the Model

Change `config.model` in `src/config.js` to any model available in the Foundry Local catalog. Smaller models give faster responses on constrained devices; larger models give better quality.

## Running Tests

The project includes unit tests using the built-in Node.js test runner:

```bash
npm test
```

Tests cover the chunker, vector store, configuration, and server endpoints with no extra test framework needed.

## What to Build Next

Some ideas for extending this project:

- **Embedding-based retrieval**: use a local embedding model for better semantic matching
- **Conversation memory**: persist chat history across sessions
- **Multi-modal support**: add image-based queries (for example, photographing a fault code)
- **PWA packaging**: make it installable as a standalone application on mobile devices
- **Hybrid retrieval**: combine TF-IDF keyword search with semantic embeddings for best results
- **Try the CAG approach**: compare with the [local-cag sample](https://github.com/leestott/local-cag) to see which pattern suits your use case

## Summary

Building a local RAG application does not require a PhD in machine learning or a cloud budget. With Foundry Local, Node.js, and SQLite, you can create a fully offline, mobile-responsive AI agent that answers questions grounded in your own documents.

The key takeaways:

1. **RAG = Retrieve + Augment + Generate**: ground your AI in real documents
2. **Foundry Local** makes local AI accessible with a simple SDK, no GPU required
3. **TF-IDF + SQLite** is a viable vector store for small-to-medium document collections
4. **Mobile-first design** matters for field applications
5. **Safety-first prompting** is essential for critical domains
6. **RAG vs CAG**: choose based on your document size and update frequency

Clone the repository, swap in your own documents, and start building.

---

*This project is open source under the MIT licence. It is a scenario sample for learning and experimentation, not production medical or safety advice.*
