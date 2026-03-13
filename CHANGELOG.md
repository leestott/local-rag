# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-03-13

### Breaking Changes

- **Foundry Local SDK v0.9**: Replaced the legacy `FoundryLocalManager().init()` + `openai` client pattern with the new `FoundryLocalManager.create()` + `catalog.getModel()` + `model.createChatClient()` SDK API. The `openai` npm package is no longer a dependency.

### Added

- **Hardware-optimised model selection**: the SDK automatically selects the best model variant for the current hardware (GPU, NPU, or CPU).
- **Model download progress**: visual progress bar in the UI when the model is downloaded for the first time, streamed via SSE (`/api/status` endpoint).
- **Init status streaming**: the web UI connects to `/api/status` on load and displays real-time model initialisation status (downloading, loading, ready).
- **Server starts immediately**: the Express server now listens before the model finishes loading, so the UI is accessible during initialisation.
- **VectorStore inverted index**: retrieval now uses an in-memory inverted index for sub-millisecond candidate filtering instead of brute-force scanning all rows.
- **VectorStore row cache**: parsed TF-IDF maps are cached in memory after first access, eliminating repeated JSON parsing on every query.
- **Prepared SQL statements**: all database queries use pre-compiled prepared statements for reduced overhead.
- **Mobile 380px breakpoint**: added a narrow-screen breakpoint that abbreviates the header title and adjusts touch targets for very small devices.
- **Touch target improvements**: all interactive elements now have `min-height: 44-48px` and `touch-action: manipulation` for better mobile usability.
- **RAG vs CAG comparison**: the blog post now includes a comparison table between RAG and CAG patterns, referencing the [local-cag](https://github.com/leestott/local-cag) companion sample.
- **UK English blog post**: rewrote the blog post entirely in UK English with no em dashes.

### Changed

- **`foundry-local-sdk`** bumped from `^0.3.0` to `^0.9.0`.
- **Removed `openai` dependency**: chat completions now use the native SDK `chatClient.completeChat()` and `chatClient.completeStreamingChat()` methods directly.
- **Streaming format**: streaming responses now consume the SDK's callback-based streaming API instead of the OpenAI stream format.
- **Model unload on close**: `ChatEngine.close()` now calls `model.unload()` for clean shutdown.
- **README**: updated Foundry Local code samples to use the new SDK API, removed CLI-only references.
- **Blog post**: updated code samples, added performance optimisation section, added CAG comparison.
- **Screenshots**: recaptured all 6 UI screenshots at desktop HD (1920x1080) and mobile (375x812) resolutions using Playwright.

### Removed

- **`openai` npm package**: no longer needed; the Foundry Local SDK provides its own chat client.
- **CLI-only instructions**: removed `foundry model list` tips that implied CLI usage was required.

## [1.0.0] - 2026-03-01

### Added

- Initial release.
- Offline RAG support agent for gas field inspection and maintenance engineers.
- Foundry Local integration with Phi-3.5 Mini Instruct.
- TF-IDF + cosine similarity retrieval with SQLite vector store.
- Document ingestion pipeline with YAML front-matter parsing and overlapping chunks.
- Express server with streaming (SSE) and non-streaming chat endpoints.
- Document upload endpoint with runtime ingestion.
- Mobile-responsive, high-contrast web UI with quick-action buttons.
- Safety-first system prompts (full and compact/edge modes).
- 20 gas engineering reference documents.
- Unit and integration tests (Node.js built-in test runner).
