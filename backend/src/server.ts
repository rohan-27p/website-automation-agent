import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { runAgent } from "./agent/loop.js";
import { BrowserController } from "./browser/controller.js";
import { config } from "./config.js";
import { createLlm } from "./llm/factory.js";
import { runStore } from "./runStore.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: config.modelId,
    hasApiKey: Boolean(config.ollamaApiKey),
    headless: config.headless,
  });
});

// Start a new agent run. Returns immediately with a runId; progress streams via SSE.
app.post("/api/run", (req, res) => {
  const task = String(req.body?.task ?? "").trim();
  if (!task) {
    res.status(400).json({ error: "Body must include a non-empty 'task'." });
    return;
  }
  if (!config.ollamaApiKey && !config.mockLlm) {
    res.status(400).json({ error: "OLLAMA_API_KEY is not set. Add it to backend/.env (or set MOCK_LLM=1)." });
    return;
  }

  const run = runStore.create(task);
  const controller = new BrowserController({ headless: config.headless, slowMoMs: config.slowMoMs });
  const llm = createLlm();

  void runAgent({
    task,
    controller,
    llm,
    maxSteps: config.maxSteps,
    emit: (event) => runStore.emit(run.id, event),
    shouldStop: () => runStore.get(run.id)?.stopRequested ?? false,
  });

  res.json({ runId: run.id });
});

// Server-Sent Events: replay history, then stream live events until the run ends.
app.get("/api/runs/:id/stream", (req, res) => {
  const run = runStore.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Unknown run id." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  for (const event of run.events) send(event);

  const terminal = new Set(["done", "error", "stopped"]);
  if (run.status !== "running") {
    res.end();
    return;
  }

  const unsubscribe = runStore.subscribe(run.id, (event) => {
    send(event);
    if (event.type === "status" && terminal.has(event.status)) res.end();
  });

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.post("/api/runs/:id/stop", (req, res) => {
  const run = runStore.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Unknown run id." });
    return;
  }
  runStore.requestStop(run.id);
  res.json({ ok: true });
});

app.get("/api/runs/:id", (req, res) => {
  const run = runStore.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Unknown run id." });
    return;
  }
  res.json({ id: run.id, task: run.task, status: run.status, events: run.events });
});

// Serve the built frontend if present (production single-process deployment).
const frontendDist = path.resolve(fileURLToPath(new URL("../../frontend/dist", import.meta.url)));
app.use(express.static(frontendDist));

app.listen(config.port, () => {
  console.log(`[browser-mind] backend on http://localhost:${config.port}`);
  console.log(`[browser-mind] model=${config.modelId} headless=${config.headless} apiKey=${config.ollamaApiKey ? "set" : "MISSING"}`);
});
