/**
 * Local vector store backed by SQLite.
 * Stores document chunks and their term-frequency vectors for offline RAG retrieval.
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { termFrequency, cosineSimilarity } from "./chunker.js";

export class VectorStore {
  constructor(dbPath) {
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL,
        title TEXT,
        category TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        tf_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_doc_id ON chunks(doc_id);
    `);
  }

  /** Remove all existing chunks (for fresh re-ingestion). */
  clear() {
    this.db.exec("DELETE FROM chunks");
  }

  /** Insert a single chunk. */
  insert(docId, title, category, chunkIndex, content) {
    const tf = termFrequency(content);
    const tfJson = JSON.stringify([...tf]);
    this.db.prepare(
      "INSERT INTO chunks (doc_id, title, category, chunk_index, content, tf_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(docId, title, category, chunkIndex, content, tfJson);
  }

  /** Retrieve top-K most relevant chunks for a query. */
  search(query, topK = 5) {
    const queryTf = termFrequency(query);
    const rows = this.db.prepare("SELECT * FROM chunks").all();

    const scored = rows.map((row) => {
      const chunkTf = new Map(JSON.parse(row.tf_json));
      const score = cosineSimilarity(queryTf, chunkTf);
      return { ...row, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter((r) => r.score > 0);
  }

  /** Remove all chunks for a specific document. */
  removeByDocId(docId) {
    this.db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(docId);
  }

  /** Get total chunk count. */
  count() {
    return this.db.prepare("SELECT COUNT(*) as cnt FROM chunks").get().cnt;
  }

  /** List distinct documents in the store. */
  listDocs() {
    return this.db.prepare(
      "SELECT doc_id, title, category, COUNT(*) as chunks FROM chunks GROUP BY doc_id ORDER BY title"
    ).all();
  }

  close() {
    this.db.close();
  }
}
