# Build a Fully Offline RAG App with Foundry Local — No Cloud Required

*A hands-on guide to building a mobile-responsive, on-device AI support agent using Retrieval-Augmented Generation, JavaScript, and Foundry Local.*

---

You've probably heard the AI pitch: "just call our API." But what happens when you're a gas field engineer standing next to a pipeline in the middle of nowhere — no Wi-Fi, no cell signal, and a procedure you need right now?

That's the scenario that motivated this project: a **fully offline RAG-powered support agent** that runs entirely on a laptop. No cloud. No API keys. No outbound network calls. Just a local model, a local vector store, and 20 gas engineering documents — all accessible from a browser on any device.

In this post, I'll walk you through how it works, how to build your own, and the architectural decisions that make it all fit together.

![Landing page of the Gas Field Support Agent](screenshots/01-landing-page.png)

## What is RAG and Why Should You Care?

**Retrieval-Augmented Generation (RAG)** is a pattern that makes AI models useful for domain-specific tasks. Instead of hoping the model "knows" the answer from training, you:

1. **Retrieve** relevant chunks from your own documents
2. **Augment** the model's prompt with those chunks as context
3. **Generate** a response grounded in your actual data

The result: fewer hallucinations, traceable answers, and an AI that works with *your* content.

If you're building internal tools, customer support bots, field manuals, or knowledge bases — RAG is the pattern you want.

## The Stack

This project is intentionally simple. No frameworks, no build steps, no Docker:

| Layer | Technology | Why |
|-------|-----------|-----|
| **AI Model** | [Foundry Local](https://foundrylocal.ai) + Phi-3.5 Mini | Runs locally, OpenAI-compatible API, no GPU needed |
| **Backend** | Node.js + Express | Lightweight, fast, everyone knows it |
| **Vector Store** | SQLite (via `better-sqlite3`) | Zero infrastructure, single file on disk |
| **Retrieval** | TF-IDF + cosine similarity | No embedding model required, fully offline |
| **Frontend** | Single HTML file with inline CSS | No build step, mobile-responsive, field-ready |

The total dependency footprint is four npm packages: `express`, `openai`, `foundry-local-sdk`, and `better-sqlite3`.

## Getting Started

### Prerequisites

You need two things:

1. **Node.js 20+** — [nodejs.org](https://nodejs.org/)
2. **Foundry Local** — Microsoft's on-device AI runtime:
   ```
   winget install Microsoft.FoundryLocal
   ```

Foundry Local will auto-download the Phi-3.5 Mini model (~2 GB) the first time you run the app.

### Setup

```bash
git clone https://github.com/microsoft/LOCAL-RAG.git
cd LOCAL-RAG
npm install
npm run ingest   # Index the 20 gas engineering documents
npm start        # Start the server + Foundry Local
```

Open `http://127.0.0.1:3000` and start chatting.

## Architecture Overview

![Architecture Diagram](screenshots/07-architecture-diagram.png)

The system has five layers — all running on a single machine:

- **Client Layer** — A single HTML file served by Express, with quick-action buttons and a responsive chat interface
- **Server Layer** — Express.js handles API routes for chat (streaming + non-streaming), document upload, and health checks
- **RAG Pipeline** — The chat engine orchestrates retrieval and generation, the chunker handles TF-IDF vectorisation, and the prompts module provides safety-first system instructions
- **Data Layer** — SQLite stores document chunks and their TF-IDF vectors; documents live as `.md` files in the `docs/` folder
- **AI Layer** — Foundry Local runs Phi-3.5 Mini Instruct on CPU/NPU, exposing an OpenAI-compatible API on a dynamic port

## How the RAG Pipeline Works

Let's trace what happens when a user asks: **"How do I detect a gas leak?"**

![RAG Query Flow — Sequence Diagram](screenshots/08-rag-flow-sequence.png)

### Step 1: Document Ingestion

Before any queries happen, you run `npm run ingest`. This script:

1. Reads every `.md` file from the `docs/` folder
2. Parses optional YAML front-matter (title, category, ID)
3. Splits each document into overlapping chunks (~200 tokens each, with 25-token overlap)
4. Computes a TF-IDF vector for each chunk
5. Stores everything in `data/rag.db` (SQLite)

```
docs/01-gas-leak-detection.md
  → Chunk 1: "Gas Leak Detection – Safety Warnings: Ensure all ignition..."
  → Chunk 2: "...sources are eliminated. Step-by-step: 1. Perform visual..."
  → Chunk 3: "...inspection of all joints. 2. Check calibration date..."
```

The overlap ensures that no information falls between the cracks of two chunks.

### Step 2: Query → Retrieval

When the user sends "How do I detect a gas leak?", the server:

1. Converts the question into a TF-IDF vector (using the same vocabulary built during ingestion)
2. Compares that vector against every stored chunk using cosine similarity
3. Returns the top 3 most relevant chunks

This is a brute-force search over SQLite — no fancy ANN index needed at this scale. For 20 documents with ~200 chunks total, it executes in under 10ms.

### Step 3: Prompt Construction

The retrieved chunks are injected into the prompt alongside the system instructions:

```
System: You are an offline gas field support agent. Safety-first...
Context:
  [Chunk 1: Gas Leak Detection – Safety Warnings...]
  [Chunk 2: Gas Leak Detection – Step-by-step...]
  [Chunk 3: Purging Procedures – Related safety...]
User: How do I detect a gas leak?
```

### Step 4: Generation + Streaming

The prompt is sent to the local Foundry Local model via the OpenAI-compatible API. The response streams back token-by-token through Server-Sent Events (SSE) to the browser:

![Chat response showing safety warnings and step-by-step guidance](screenshots/03-chat-response.png)

Every response includes expandable source references with relevance scores, so you can verify exactly which documents the AI used:

![Sources panel with document names and similarity scores](screenshots/04-sources-panel.png)

## Foundry Local: Your Local AI Runtime

[Foundry Local](https://foundrylocal.ai) is what makes the "offline" part possible. It's a local runtime from Microsoft that:

- Runs small language models (SLMs) on CPU or NPU — no GPU required
- Exposes an **OpenAI-compatible API** at `http://127.0.0.1:<dynamic-port>/v1`
- Manages model downloads, caching, and lifecycle automatically
- Works through the `foundry-local-sdk` npm package

The integration code is minimal:

```js
import { FoundryLocalManager } from "foundry-local-sdk";
import { OpenAI } from "openai";

// Start Foundry Local and load the model
const manager = new FoundryLocalManager();
const modelInfo = await manager.init("phi-3.5-mini");

// Use the standard OpenAI client — just point it at the local endpoint
const client = new OpenAI({
  baseURL: manager.endpoint,
  apiKey: manager.apiKey,
});

// Chat completions work exactly like the cloud API
const stream = await client.chat.completions.create({
  model: modelInfo.id,
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "How do I detect a gas leak?" }
  ],
  stream: true,
});
```

Because Foundry Local uses the OpenAI API format, any code you write here can be ported to Azure OpenAI or OpenAI's cloud API with a single config change.

## Why TF-IDF Instead of Embeddings?

Most RAG tutorials use embedding models (like OpenAI's `text-embedding-3-small` or open-source alternatives) for retrieval. We chose TF-IDF for this project because:

1. **Fully offline** — no embedding model to download or run
2. **Zero latency** — vectorization is instantaneous (it's just math on word frequencies)
3. **Good enough** — for a curated collection of 20 domain-specific documents, TF-IDF with cosine similarity retrieves the right chunks reliably
4. **Transparent** — you can inspect the vocabulary and weights, unlike neural embeddings

For larger collections (thousands of documents) or when semantic similarity matters more than keyword overlap, you'd want to swap in an embedding model. But for this use case, TF-IDF keeps the stack simple and dependency-free.

## Building a Mobile-Responsive Field UI

Field engineers use this app on phones and tablets — often wearing gloves. The UI is designed for harsh conditions:

- **Dark, high-contrast theme** with large text (18px base)
- **Large touch targets** (minimum 48px) for gloved operation
- **Quick-action buttons** for common questions — no typing needed
- **Responsive layout** that works from 320px to 1920px+

| Desktop | Mobile |
|---------|--------|
| ![Desktop view](screenshots/01-landing-page.png) | ![Mobile view](screenshots/02-mobile-view.png) |

The mobile view horizontally scrolls the quick-action bar and adjusts text sizes:

![Mobile chat in action](screenshots/06-mobile-chat.png)

The entire frontend is a single `index.html` file — no React, no build step, no bundler. This is intentional: it keeps the project accessible to beginners and makes it easy to deploy to any static file server.

### Responsive CSS Approach

The key responsive breakpoints:

```css
/* Tablet: 900px */
@media (max-width: 900px) {
  .message { max-width: 95%; }
  .quick-btn { padding: 6px 10px; font-size: 0.78rem; }
}

/* Mobile: 600px */
@media (max-width: 600px) {
  html { font-size: 16px; }
  .message { max-width: 98%; padding: 10px 14px; }
  #quick-actions {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
  }
}
```

## Runtime Document Upload

Users can upload new documents without restarting the server:

![Upload document modal](screenshots/05-upload-document.png)

The upload endpoint (`POST /api/upload`) receives the markdown content, chunks it, computes TF-IDF vectors, and inserts the chunks into SQLite — all in memory, no restart needed. The new document is immediately available for retrieval.

## Safety-First Prompting

For safety-critical domains like gas field operations, the system prompt is engineered to:

1. **Always surface safety warnings first** — before any procedural steps
2. **Never hallucinate** procedures, measurements, or legal requirements
3. **Cite sources** — every response references the specific document and section
4. **Fail gracefully** — if the information isn't in the RAG database, the agent says so explicitly

```
Format: Summary → Safety Warnings → Step-by-step Guidance → Reference
```

This pattern is transferable to any safety-critical domain: medical devices, electrical work, aviation maintenance, chemical handling.

## Adapting This for Your Own Domain

This project is a **scenario sample** — it's designed to be forked and adapted. Here's how to make it yours:

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

Open `src/prompts.js` and rewrite the system prompt for your domain. The structure works for any support/knowledge base scenario:

```js
export const SYSTEM_PROMPT = `You are an offline support agent for [YOUR DOMAIN].

Rules:
- Only answer using the retrieved context
- If the answer isn't in the context, say so
- Use structured responses: Summary → Details → Reference
`;
```

### 3. Tune the Retrieval

In `src/config.js`:
- `chunkSize: 200` — smaller chunks = more precise retrieval, less context per chunk
- `chunkOverlap: 25` — prevents information from falling between chunks
- `topK: 3` — how many chunks to retrieve per query (more = more context but slower)

### 4. Swap the Model

Change `config.model` to any model supported by Foundry Local:

```bash
foundry model list   # See available models
```

Smaller models = faster responses on constrained devices. Larger models = better quality.

## Running Tests

The project includes unit tests using the built-in Node.js test runner:

```bash
npm test
```

Tests cover the chunker, vector store, configuration, and server endpoints — no extra test framework needed.

## What's Next?

Some ideas for extending this project:

- **Add embedding-based retrieval** using a local embedding model for better semantic matching
- **Conversation memory** — persist chat history across sessions
- **Multi-modal support** — add image-based queries (e.g., photographing a fault code)
- **PWA packaging** — make it installable as a standalone app on mobile devices
- **Hybrid retrieval** — combine TF-IDF keyword search with semantic embeddings for best results

## Summary

Building a local RAG application doesn't require a PhD in machine learning or a cloud budget. With Foundry Local, Node.js, and SQLite, you can create a fully offline, mobile-responsive AI agent that answers questions grounded in your own documents.

The key takeaways:

1. **RAG = Retrieve + Augment + Generate** — ground your AI in real documents
2. **Foundry Local** makes local AI accessible — OpenAI-compatible API, no GPU required
3. **TF-IDF + SQLite** is a viable vector store for small-to-medium document collections
4. **Mobile-first design** matters for field applications
5. **Safety-first prompting** is essential for critical domains

Clone the repo, swap in your own documents, and start building.

---

*This project is open source under the MIT license. It's a scenario sample for learning and experimentation — not production medical/safety advice.*
