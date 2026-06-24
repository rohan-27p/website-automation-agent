# BrowserMind — AI Web Automation Agent

An autonomous web-automation agent that takes a **plain-English task** and drives a
real browser to complete it. An LLM (**Ollama Cloud · `qwen3-coder:480b`**) runs a
**ReAct loop**: it observes the page as a numbered **Set-of-Marks**, reasons, calls a
tool, sees the result, and repeats — until the task is done. A React dashboard streams
the live browser view (with the marks overlaid) and a step-by-step telemetry log.

> Mini-version of tools like Browser Use / BrowserMind, built for Assignment 04.

## What it does

- You type: *"Go to the contact page and fill in my name and email."*
- The agent: opens a browser → screenshots & numbers every clickable element →
  the model picks `type(id=1, "Jane Doe")`, `type(id=2, "jane@…")`, … → repeats →
  calls `finish` with a summary.
- You watch it happen live in the browser dashboard.

## Architecture

```
                       ┌────────────────── frontend (React + Vite) ──────────────────┐
                       │  task box · live screenshot (marks overlaid) · telemetry log │
                       └───────────────▲───────────────────────┬─────────────────────┘
                            SSE events  │                       │ POST /api/run
                       ┌───────────────┴───────────────────────▼─────────────────────┐
                       │                    backend (Express)                         │
                       │  RunStore (events + SSE)        ReAct agent loop             │
                       │                                   │                          │
                       │      ┌──── observe ───────────────┘                          │
                       │      ▼                                                        │
                       │  BrowserController ──► Set-of-Marks (number elements)         │
                       │   (7 required tools)        │                                 │
                       │      ▲                       ▼ textual marks + screenshot      │
                       │      │   tool call    OllamaClient ──► qwen3-coder (tools)     │
                       │      └────────────────────┘                                   │
                       └──────────────────────────────────────────────────────────────┘
```

**The seven required browser tools** live on `BrowserController` and do the real work:
`open_browser`, `navigate_to_url`, `take_screenshot`, `click_on_screen(x,y)`,
`send_keys`, `scroll`, `double_click`. The model's high-level actions map onto them —
e.g. `click(id)` resolves the mark's box and calls `click_on_screen(x,y)`.

**Set-of-Marks** (`backend/src/browser/setOfMarks.ts`) runs in the page: it finds every
visible interactive element, numbers it, draws a pink numbered box (visible in the
streamed screenshot), and returns a text list the model reads:
`[1] <input> Full Name`, `[7] <button> Send Message`. Because `qwen3-coder` is a
text/code model, the model reasons over this **text** list (not the image); the
screenshot is for the human.

## Setup

Two packages: `backend/` (agent + API) and `frontend/` (dashboard).

```bash
# 1) Backend
cd backend
npm install
npm run install:browsers          # Playwright Chromium
copy .env.example .env             # then edit .env

# 2) Frontend
cd ../frontend
npm install
```

Edit `backend/.env`:

```
OLLAMA_API_KEY=...your Ollama Cloud key...   # https://ollama.com → Settings → Keys
OLLAMA_BASE_URL=https://ollama.com/v1
MODEL_ID=qwen3-coder:480b-cloud
MAX_STEPS=20
HEADLESS_BROWSER=false
PORT=8787
```

## Run

Two terminals:

```bash
# Terminal 1 — backend API + agent
cd backend && npm run dev          # http://localhost:8787

# Terminal 2 — dashboard
cd frontend && npm run dev         # http://localhost:5173
```

Open **http://localhost:5173**, type a task, click **Run agent**, and watch the live
view + telemetry. `HEADLESS_BROWSER=false` also pops the real Chromium window.

### Use it on any site

Just describe the goal in the task box. Examples:

- `Go to https://www.selenium.dev/selenium/web/web-form.html and fill the text input and textarea, then submit.`
- `Open https://duckduckgo.com and search for "playwright automation".`
- `Go to https://news.ycombinator.com and tell me the title of the top story.`

Nothing is hardcoded per-site — the agent discovers elements via Set-of-Marks every step.

## Try it without an API key (offline demo)

A scripted **mock** mode drives the bundled sample form so you can see the whole
dashboard — live screenshots with marks + telemetry — with no key or network:

```bash
cd backend
# PowerShell:  $env:MOCK_LLM='1'; npm run dev
# bash:        MOCK_LLM=1 npm run dev
```

Then run any task in the UI (the mock ignores the text and fills the demo form).

## Verify / test

```bash
cd backend
npm run check          # typecheck
npm run mock           # offline: full ReAct loop vs the sample form (no key)
npx tsx src/llm/probe.ts      # one live call: confirms Ollama tool calling works
npx tsx src/agent/realRun.ts  # real qwen3-coder fills the sample form end-to-end
```

## Configuration (`backend/.env`)

| Var | Meaning |
|---|---|
| `OLLAMA_API_KEY` | Ollama Cloud key (required unless `MOCK_LLM=1`) |
| `OLLAMA_BASE_URL` | OpenAI-compatible endpoint, default `https://ollama.com/v1` |
| `MODEL_ID` | default `qwen3-coder:480b-cloud` |
| `MAX_STEPS` | safety cap on agent steps (default 20) |
| `HEADLESS_BROWSER` | `false` shows the real window |
| `MOCK_LLM` | `1` = offline scripted demo, no key needed |
| `PORT` | backend port (default 8787) |

## API (backend)

- `POST /api/run` `{ task }` → `{ runId }` — start a run.
- `GET  /api/runs/:id/stream` → SSE stream of agent events (observations/actions/final).
- `POST /api/runs/:id/stop` — request stop.
- `GET  /api/runs/:id` — full event history (JSON).
- `GET  /api/health` — model + key status.

## Project structure

```
backend/
  src/
    server.ts            Express API + SSE
    runStore.ts          in-memory runs + event fan-out
    config.ts            env config
    browser/
      controller.ts      7 required tools + observe()
      setOfMarks.ts      in-page element numbering + overlay (string, no bundler helpers)
      types.ts
    llm/
      ollamaClient.ts    Ollama Cloud (OpenAI-compatible) + tool calling
      mockClient.ts      scripted offline client
      factory.ts         real vs mock selection
      types.ts
    agent/
      loop.ts            the ReAct loop
      tools.ts           tool schemas the model may call
      prompts.ts         system prompt + observation rendering
      events.ts          streamed event types
      mockRun.ts/realRun.ts  offline + live test harnesses
frontend/
  src/App.tsx            dashboard (task box, live viewport, telemetry)
  src/styles.css
tasks/fixtures/          sample form used by the offline tests
```

> A standalone non-AI CLI from an earlier iteration still lives in `src/` (commands
> `run`/`inspect`/`tools`). The AI agent above supersedes it.
