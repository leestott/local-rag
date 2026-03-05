import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_COMPACT } from "../src/prompts.js";

describe("config", () => {
  it("has required model setting", () => {
    assert.ok(config.model, "model must be defined");
    assert.equal(typeof config.model, "string");
  });

  it("has valid RAG settings", () => {
    assert.ok(config.chunkSize > 0, "chunkSize must be positive");
    assert.ok(config.chunkOverlap >= 0, "chunkOverlap must be non-negative");
    assert.ok(config.chunkOverlap < config.chunkSize, "overlap must be less than chunk size");
    assert.ok(config.topK > 0, "topK must be positive");
  });

  it("has valid server settings", () => {
    assert.ok(config.port > 0 && config.port < 65536, "port must be valid");
    assert.equal(config.host, "127.0.0.1", "host should be localhost");
  });

  it("has docsDir and dbPath as absolute paths", () => {
    assert.ok(config.docsDir.includes("docs"), "docsDir should include 'docs'");
    assert.ok(config.dbPath.includes("rag.db"), "dbPath should include 'rag.db'");
  });

  it("has publicDir defined", () => {
    assert.ok(config.publicDir, "publicDir must be defined");
    assert.ok(config.publicDir.includes("public"), "publicDir should include 'public'");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    assert.equal(typeof SYSTEM_PROMPT, "string");
    assert.ok(SYSTEM_PROMPT.length > 100, "full prompt should be substantial");
  });

  it("mentions safety", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes("safety"), "prompt must emphasise safety");
  });

  it("mentions offline/local operation", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes("offline") || lower.includes("on-device") || lower.includes("local"),
      "prompt must mention offline operation");
  });

  it("instructs not to hallucinate", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes("hallucinate") || lower.includes("not available in the local"),
      "prompt must discourage hallucination");
  });

  it("instructs structured response format", () => {
    assert.ok(SYSTEM_PROMPT.includes("Summary") && SYSTEM_PROMPT.includes("Safety"),
      "prompt should specify response sections");
  });
});

describe("SYSTEM_PROMPT_COMPACT", () => {
  it("is a non-empty string", () => {
    assert.equal(typeof SYSTEM_PROMPT_COMPACT, "string");
    assert.ok(SYSTEM_PROMPT_COMPACT.length > 20);
  });

  it("is shorter than the full prompt", () => {
    assert.ok(SYSTEM_PROMPT_COMPACT.length < SYSTEM_PROMPT.length,
      "compact prompt should be shorter");
  });

  it("still mentions safety", () => {
    assert.ok(SYSTEM_PROMPT_COMPACT.toLowerCase().includes("safety"));
  });
});
