# Architecture

## Goal

Take a natural-language task and complete it in a real browser autonomously, using
an LLM that reasons and acts in a loop. A web dashboard shows the live browser and
every decision. It is a mini-version of Browser Use / BrowserMind.

## The agent loop (ReAct)

Each step:

1. **Observe** — `BrowserController.observe()` runs Set-of-Marks in the page:
   number every visible interactive element, draw a numbered overlay, and produce
   (a) a text list for the model and (b) a screenshot for the human.
2. **Reason + Act** — the text observation + history go to `qwen3-coder` via the
   OpenAI-compatible Ollama endpoint with a list of tools. The model returns ONE
   tool call (e.g. `type(id=2, "jane@…")`).
3. **Execute** — the loop maps the tool call onto `BrowserController`, which acts
   through the seven required low-level tools. The textual result is fed back.
4. Repeat until the model calls `finish`, or `MAX_STEPS` is hit.

Every transition is emitted as an event (`observation`, `thought`, `action`,
`final`) into a `RunStore`, which fans them out to the frontend over SSE.

## Why text Set-of-Marks (not vision)

BrowserMind streams screenshots to a vision model. `qwen3-coder` is a text/code
model with strong tool-calling but no image input, so the model reasons over a
**textual** Set-of-Marks (`[id] <tag> label`). The screenshot (with the same marks
drawn on it) is streamed only to the human dashboard. This plays to the model's
strengths and is how many DOM/accessibility-tree browser agents work.

## The seven required tools

`BrowserController` exposes them and they do the real work:
`open_browser`, `navigate_to_url`, `take_screenshot`, `click_on_screen(x,y)`,
`send_keys`, `scroll`, `double_click`. The model never touches Playwright; its
high-level actions resolve a mark id to coordinates and call these — e.g.
`click(id)` → look up the mark's center → `click_on_screen(x,y)`;
`type(id,text)` → click + select-all + `send_keys`.

## Components

- **frontend** (React + Vite): task input, live screenshot viewport, telemetry log;
  subscribes to `/api/runs/:id/stream` (SSE).
- **server** (Express): `POST /api/run`, SSE stream, stop, health; serves the built UI.
- **RunStore**: in-memory runs, event history (for SSE replay), stop flag.
- **agent/loop**: the ReAct orchestration.
- **agent/tools + prompts**: the tool schemas and the system/observation prompts.
- **browser/controller + setOfMarks**: Playwright control and in-page element marking.
- **llm/ollamaClient**: Ollama Cloud via OpenAI-compatible API + native tool calling;
  **mockClient/factory** provide a scripted offline mode for keyless demos.

## Key design decisions

- **No hardcoding**: elements are discovered every step via Set-of-Marks; the agent
  works on any site from a plain-English task.
- **Set-of-Marks as a string**: the in-page routine is shipped as a string to
  `page.evaluate`, so the tsx/esbuild `__name` keep-names helper is not injected into
  browser code (which would throw `__name is not defined`).
- **Coordinate-based actions**: clicks/typing go through `click_on_screen(x,y)` +
  `send_keys`, satisfying the required tools and matching the visual Set-of-Marks model.
- **Swappable LLM**: an `LlmClient` interface decouples the loop from any SDK, enabling
  the deterministic mock used for offline tests.
- **Error handling**: navigation/idle timeouts are caught; a failed tool returns an
  error string the model can react to; stale mark ids raise a clear "re-observe" error;
  `MAX_STEPS` bounds runaway loops.

## Request flow

```
UI "Run" → POST /api/run → RunStore.create → runAgent(...) (async)
        → loop emits events → RunStore.emit → SSE → UI updates live
UI "Stop" → POST /api/runs/:id/stop → loop checks shouldStop() between steps
```
