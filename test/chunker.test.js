import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontMatter,
  chunkText,
  termFrequency,
  cosineSimilarity,
} from "../src/chunker.js";

// ── parseFrontMatter ──

describe("parseFrontMatter", () => {
  it("parses YAML front-matter and returns meta + body", () => {
    const input = `---
title: Gas Leak Detection
category: Inspection Procedures
id: DOC-IP-001
---

# Gas Leak Detection

Step one of the procedure.`;

    const { meta, body } = parseFrontMatter(input);
    assert.equal(meta.title, "Gas Leak Detection");
    assert.equal(meta.category, "Inspection Procedures");
    assert.equal(meta.id, "DOC-IP-001");
    assert.ok(body.includes("# Gas Leak Detection"));
    assert.ok(body.includes("Step one"));
  });

  it("returns empty meta and full text when no front-matter", () => {
    const input = "# Just a heading\n\nSome body text.";
    const { meta, body } = parseFrontMatter(input);
    assert.deepEqual(meta, {});
    assert.equal(body, input);
  });

  it("handles front-matter with colons in values", () => {
    const input = `---
title: Valve Types: Gate and Ball
category: Equipment
---

Body text.`;
    const { meta, body } = parseFrontMatter(input);
    assert.equal(meta.title, "Valve Types: Gate and Ball");
    assert.ok(body.includes("Body text."));
  });
});

// ── chunkText ──

describe("chunkText", () => {
  it("returns single chunk when text is shorter than maxTokens", () => {
    const text = "short document with few words";
    const chunks = chunkText(text, 400, 50);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], text);
  });

  it("splits long text into overlapping chunks", () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text, 30, 5);

    assert.ok(chunks.length > 1, "should produce multiple chunks");
    // Each chunk (except possibly last) should have ≤ maxTokens words
    for (const chunk of chunks) {
      assert.ok(chunk.split(/\s+/).length <= 30);
    }
  });

  it("maintains overlap between consecutive chunks", () => {
    const words = Array.from({ length: 60 }, (_, i) => `w${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text, 20, 5);

    // Last 5 words of chunk 0 should appear at start of chunk 1
    const chunk0Words = chunks[0].split(/\s+/);
    const chunk1Words = chunks[1].split(/\s+/);
    const overlap = chunk0Words.slice(-5);
    const start1 = chunk1Words.slice(0, 5);
    assert.deepEqual(overlap, start1);
  });

  it("handles empty or whitespace-only text", () => {
    const chunks = chunkText("   ", 400, 50);
    assert.equal(chunks.length, 1);
  });
});

// ── termFrequency ──

describe("termFrequency", () => {
  it("counts term frequency correctly", () => {
    const tf = termFrequency("gas gas leak leak leak valve");
    assert.equal(tf.get("gas"), 2);
    assert.equal(tf.get("leak"), 3);
    assert.equal(tf.get("valve"), 1);
  });

  it("lowercases all terms", () => {
    const tf = termFrequency("Gas GAS gas");
    assert.equal(tf.get("gas"), 3);
    assert.equal(tf.has("Gas"), false);
  });

  it("strips single-character tokens", () => {
    const tf = termFrequency("a b gas c leak");
    assert.equal(tf.has("a"), false);
    assert.equal(tf.has("b"), false);
    assert.equal(tf.get("gas"), 1);
  });

  it("returns empty map for empty input", () => {
    const tf = termFrequency("");
    assert.equal(tf.size, 0);
  });
});

// ── cosineSimilarity ──

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = new Map([["gas", 2], ["leak", 3]]);
    const sim = cosineSimilarity(a, a);
    assert.ok(Math.abs(sim - 1) < 1e-9);
  });

  it("returns 0 for completely disjoint vectors", () => {
    const a = new Map([["gas", 1]]);
    const b = new Map([["valve", 1]]);
    assert.equal(cosineSimilarity(a, b), 0);
  });

  it("returns value between 0 and 1 for partially overlapping vectors", () => {
    const a = new Map([["gas", 2], ["leak", 1]]);
    const b = new Map([["gas", 1], ["valve", 3]]);
    const sim = cosineSimilarity(a, b);
    assert.ok(sim > 0 && sim < 1);
  });

  it("returns 0 when either vector is empty", () => {
    const a = new Map();
    const b = new Map([["gas", 1]]);
    assert.equal(cosineSimilarity(a, b), 0);
    assert.equal(cosineSimilarity(b, a), 0);
  });
});
