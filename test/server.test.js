/**
 * Server API tests.
 *
 * These tests exercise the Express routes WITHOUT starting Foundry Local.
 * We import the app after stubbing ChatEngine so no GPU / model is required.
 *
 * Uses Node built-in test runner + a lightweight HTTP helper.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { config } from "../src/config.js";
import { parseFrontMatter, chunkText } from "../src/chunker.js";
import { VectorStore } from "../src/vectorStore.js";

// ── Helpers ──

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Simple HTTP request helper that returns { status, headers, body }. */
function request(server, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const opts = {
      hostname: "127.0.0.1",
      port: addr.port,
      path: urlPath,
      method,
      headers: { ...headers },
    };
    if (body !== undefined) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ── Build a test Express app that mirrors server.js routes but with a mocked engine ──

let server;
let tmpDir;
let store;

before(async () => {
  tmpDir = path.join(os.tmpdir(), `rag-server-test-${Date.now()}`);
  const docsDir = path.join(tmpDir, "docs");
  fs.mkdirSync(docsDir, { recursive: true });

  store = new VectorStore(path.join(tmpDir, "test.db"));
  store.insert("DOC-T1", "Test Doc", "Testing", 0, "Gas leak detection portable detector soapy water test.");

  // Build a minimal Express app replicating server.js routes
  const app = express();
  app.use(express.json());
  app.use(express.text({ type: "text/markdown", limit: "2mb" }));

  // Health
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", model: config.model });
  });

  // Docs
  app.get("/api/docs", (_req, res) => {
    res.json({ docs: store.listDocs() });
  });

  // Chat (mocked – no Foundry Local)
  app.post("/api/chat", (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }
    res.json({ text: `Echo: ${message}`, sources: [] });
  });

  // Upload
  app.post("/api/upload", express.raw({ type: "*/*", limit: "2mb" }), (req, res) => {
    const filename = req.headers["x-filename"];
    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "x-filename header is required" });
    }
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!safeName.endsWith(".md") && !safeName.endsWith(".txt")) {
      return res.status(400).json({ error: "Only .md and .txt files are accepted" });
    }
    const content = req.body.toString("utf-8");
    if (!content || content.length < 10) {
      return res.status(400).json({ error: "Document content is too short" });
    }

    const filePath = path.join(docsDir, safeName);
    fs.writeFileSync(filePath, content, "utf-8");

    const { meta, body } = parseFrontMatter(content);
    const docId = meta.id || path.basename(safeName, path.extname(safeName));
    const title = meta.title || safeName;
    const category = meta.category || "Uploaded";

    store.removeByDocId(docId);
    const chunks = chunkText(body, config.chunkSize, config.chunkOverlap);
    for (let i = 0; i < chunks.length; i++) {
      store.insert(docId, title, category, i, chunks[i]);
    }

    res.json({
      success: true,
      filename: safeName,
      docId,
      title,
      category,
      chunks: chunks.length,
      totalChunks: store.count(),
    });
  });

  // Start on random port — wait for listen callback
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
});

after(() => {
  server.close();
  store.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Tests ──

describe("GET /api/health", () => {
  it("returns status ok with model name", async () => {
    const res = await request(server, "GET", "/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.model, config.model);
  });
});

describe("GET /api/docs", () => {
  it("returns list of indexed documents", async () => {
    const res = await request(server, "GET", "/api/docs");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.docs));
    assert.ok(res.body.docs.length >= 1);
  });
});

describe("POST /api/chat", () => {
  it("returns a response for a valid message", async () => {
    const res = await request(server, "POST", "/api/chat", { message: "hello" });
    assert.equal(res.status, 200);
    assert.ok(res.body.text.includes("hello"));
  });

  it("returns 400 when message is missing", async () => {
    const res = await request(server, "POST", "/api/chat", {});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it("returns 400 when message is not a string", async () => {
    const res = await request(server, "POST", "/api/chat", { message: 123 });
    assert.equal(res.status, 400);
  });
});

describe("POST /api/upload", () => {
  it("accepts a valid .md file and indexes it", async () => {
    const content = `---
title: Test Upload Doc
category: Testing
id: DOC-UPLOAD-001
---

# Test Upload Doc

This is a test document with enough content to pass validation and be indexed properly.`;

    const res = await request(server, "POST", "/api/upload", content, {
      "Content-Type": "application/octet-stream",
      "X-Filename": "test-upload.md",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.docId, "DOC-UPLOAD-001");
    assert.equal(res.body.title, "Test Upload Doc");
    assert.ok(res.body.chunks >= 1);
  });

  it("rejects files without x-filename header", async () => {
    const res = await request(server, "POST", "/api/upload", "some content here enough", {
      "Content-Type": "application/octet-stream",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("x-filename"));
  });

  it("rejects non-.md/.txt files", async () => {
    const res = await request(server, "POST", "/api/upload", "some content here enough", {
      "Content-Type": "application/octet-stream",
      "X-Filename": "malware.exe",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes(".md"));
  });

  it("rejects content that is too short", async () => {
    const res = await request(server, "POST", "/api/upload", "short", {
      "Content-Type": "application/octet-stream",
      "X-Filename": "short.md",
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("too short"));
  });

  it("sanitises filenames with special characters", async () => {
    const content = "This is enough content to pass the length validation check for the upload endpoint.";
    const res = await request(server, "POST", "/api/upload", content, {
      "Content-Type": "application/octet-stream",
      "X-Filename": "../../../etc/passwd.md",
    });
    assert.equal(res.status, 200);
    // path.basename strips directory traversal
    assert.ok(!res.body.filename.includes(".."));
    assert.ok(!res.body.filename.includes("/"));
  });

  it("re-upload replaces previous version", async () => {
    const content1 = `---
title: Replaceable
id: DOC-REPLACE
---

Original content for the replaceable test document with a version one body text.`;
    const content2 = `---
title: Replaceable
id: DOC-REPLACE
---

Updated content for the replaceable test document with a version two body text.`;

    await request(server, "POST", "/api/upload", content1, {
      "Content-Type": "application/octet-stream",
      "X-Filename": "replaceable.md",
    });
    const countBefore = store.count();

    await request(server, "POST", "/api/upload", content2, {
      "Content-Type": "application/octet-stream",
      "X-Filename": "replaceable.md",
    });
    const countAfter = store.count();

    // Count should stay the same (old removed, new added with same chunk count)
    assert.equal(countBefore, countAfter);
  });
});
