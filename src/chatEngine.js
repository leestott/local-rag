/**
 * Foundry Local chat engine.
 * Connects to the local Foundry service (dynamic port),
 * performs RAG retrieval, and generates responses.
 */
import { OpenAI } from "openai";
import { FoundryLocalManager } from "foundry-local-sdk";
import { VectorStore } from "./vectorStore.js";
import { config } from "./config.js";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_COMPACT } from "./prompts.js";

export class ChatEngine {
  constructor() {
    this.openai = null;
    this.modelId = null;
    this.store = null;
    this.compactMode = false;
  }

  /**
   * Initialize the engine: start Foundry Local, load model, open vector store.
   */
  async init() {
    console.log("[ChatEngine] Initializing Foundry Local...");

    // Start Foundry Local service and load model (handles dynamic port)
    const manager = new FoundryLocalManager();
    const modelInfo = await manager.init(config.model);
    this.modelId = modelInfo.id;

    console.log(`[ChatEngine] Model loaded: ${this.modelId}`);
    console.log(`[ChatEngine] Endpoint: ${manager.endpoint}`);

    // Create OpenAI client pointed at local Foundry service
    this.openai = new OpenAI({
      baseURL: manager.endpoint,
      apiKey: manager.apiKey,
    });

    // Open the local vector store
    this.store = new VectorStore(config.dbPath);
    const count = this.store.count();
    console.log(`[ChatEngine] Vector store ready: ${count} chunks indexed.`);

    if (count === 0) {
      console.warn("[ChatEngine] WARNING: No documents ingested. Run 'npm run ingest' first.");
    }
  }

  /** Expose the vector store for direct operations (e.g. upload ingestion). */
  getStore() {
    return this.store;
  }

  /**
   * Set compact mode for extreme latency / edge devices.
   */
  setCompactMode(enabled) {
    this.compactMode = enabled;
    console.log(`[ChatEngine] Compact mode: ${enabled ? "ON" : "OFF"}`);
  }

  /**
   * Retrieve relevant context from the local knowledge base.
   */
  retrieve(query) {
    const topK = this.compactMode ? Math.min(config.topK, 3) : config.topK;
    return this.store.search(query, topK);
  }

  /**
   * Format retrieved chunks into a context block for the prompt.
   */
  _buildContext(chunks) {
    if (chunks.length === 0) {
      return "No relevant documents found in local knowledge base.";
    }

    return chunks
      .map(
        (c, i) =>
          `--- Document ${i + 1}: ${c.title} [${c.category}] ---\n${c.content}`
      )
      .join("\n\n");
  }

  /**
   * Generate a response for a user query (non-streaming).
   */
  async query(userMessage, history = []) {
    // 1. Retrieve relevant chunks
    const chunks = this.retrieve(userMessage);
    const context = this._buildContext(chunks);

    // 2. Build messages array
    const systemPrompt = this.compactMode ? SYSTEM_PROMPT_COMPACT : SYSTEM_PROMPT;
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Retrieved context from local knowledge base:\n\n${context}`,
      },
      ...history,
      { role: "user", content: userMessage },
    ];

    // 3. Call the local model
    const response = await this.openai.chat.completions.create({
      model: this.modelId,
      messages,
      temperature: 0.1,      // Low temperature for deterministic, safety-critical responses
      max_tokens: this.compactMode ? 512 : 1024,
    });

    return {
      text: response.choices[0].message.content,
      sources: chunks.map((c) => ({
        title: c.title,
        category: c.category,
        docId: c.doc_id,
        score: Math.round(c.score * 100) / 100,
      })),
    };
  }

  /**
   * Generate a streaming response for a user query.
   * Returns an async iterable of text chunks.
   */
  async *queryStream(userMessage, history = []) {
    // 1. Retrieve relevant chunks
    const chunks = this.retrieve(userMessage);
    const context = this._buildContext(chunks);

    // 2. Build messages array
    const systemPrompt = this.compactMode ? SYSTEM_PROMPT_COMPACT : SYSTEM_PROMPT;
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Retrieved context from local knowledge base:\n\n${context}`,
      },
      ...history,
      { role: "user", content: userMessage },
    ];

    // 3. Stream from the local model
    const stream = await this.openai.chat.completions.create({
      model: this.modelId,
      messages,
      temperature: 0.1,
      max_tokens: this.compactMode ? 512 : 1024,
      stream: true,
    });

    // Yield sources metadata first
    yield {
      type: "sources",
      data: chunks.map((c) => ({
        title: c.title,
        category: c.category,
        docId: c.doc_id,
        score: Math.round(c.score * 100) / 100,
      })),
    };

    // Yield text chunks
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { type: "text", data: content };
      }
    }
  }

  close() {
    if (this.store) this.store.close();
  }
}
