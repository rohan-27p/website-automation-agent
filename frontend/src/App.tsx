import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, RunStatus } from "./types.js";

type Entry = {
  key: string;
  step: number;
  kind: "thought" | "action" | "log" | "final";
  title: string;
  detail?: string;
};

const SAMPLE_TASKS = [
  "Go to https://www.selenium.dev/selenium/web/web-form.html and fill in the text input and the textarea, then submit.",
  "Open https://duckduckgo.com and search for 'playwright automation'.",
  "Go to https://news.ycombinator.com and tell me the title of the top story.",
];

export function App() {
  const [task, setTask] = useState(SAMPLE_TASKS[0]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [marksCount, setMarksCount] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [final, setFinal] = useState<{ success: boolean; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [entries]);

  const pushEntry = useCallback((entry: Omit<Entry, "key">) => {
    setEntries((prev) => [...prev, { ...entry, key: `${prev.length}-${entry.kind}` }]);
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "status":
          setStatus(event.status);
          break;
        case "observation":
          setScreenshot(event.screenshot);
          setPageUrl(event.url);
          setPageTitle(event.title);
          setMarksCount(event.marksCount);
          break;
        case "thought":
          pushEntry({ step: event.step, kind: "thought", title: event.content });
          break;
        case "action":
          pushEntry({
            step: event.step,
            kind: "action",
            title: `${event.name}(${formatArgs(event.args)})`,
            detail: event.result,
          });
          break;
        case "log":
          pushEntry({ step: 0, kind: "log", title: `[${event.level}] ${event.message}` });
          break;
        case "final":
          setFinal({ success: event.success, summary: event.summary });
          pushEntry({ step: 0, kind: "final", title: event.summary });
          break;
      }
    },
    [pushEntry],
  );

  const stopStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!task.trim() || status === "running") return;
    setEntries([]);
    setFinal(null);
    setError(null);
    setScreenshot(null);
    setStatus("running");

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start run");

      setRunId(data.runId);
      stopStream();
      const es = new EventSource(`/api/runs/${data.runId}/stream`);
      esRef.current = es;
      es.onmessage = (msg) => handleEvent(JSON.parse(msg.data) as AgentEvent);
      es.onerror = () => stopStream();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [task, status, handleEvent, stopStream]);

  const stop = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/runs/${runId}/stop`, { method: "POST" }).catch(() => undefined);
  }, [runId]);

  useEffect(() => () => stopStream(), [stopStream]);

  const running = status === "running";

  return (
    <div className="app">
      <header className="header">
        <h1>
          Browser<span className="accent">Mind</span>
        </h1>
        <p>AI web automation — Ollama Cloud · qwen3-coder · ReAct loop · Set-of-Marks</p>
      </header>

      <div className="grid">
        <section className="viewport">
          <div className="viewport-bar">
            <span className={`dot ${status}`} />
            <span className="url" title={pageUrl}>
              {pageUrl || "about:blank"}
            </span>
            <span className="marks">{marksCount} marks</span>
          </div>
          {screenshot ? (
            <img alt={pageTitle} src={`data:image/png;base64,${screenshot}`} />
          ) : (
            <div className="placeholder">
              {running ? "Launching browser…" : "The live browser view appears here while the agent works."}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="controls">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe a task in plain English…"
              rows={3}
              disabled={running}
            />
            <div className="row">
              <select
                disabled={running}
                value=""
                onChange={(e) => e.target.value && setTask(e.target.value)}
              >
                <option value="">Insert a sample task…</option>
                {SAMPLE_TASKS.map((sample) => (
                  <option key={sample} value={sample}>
                    {sample.slice(0, 60)}…
                  </option>
                ))}
              </select>
              {running ? (
                <button className="stop" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button className="run" onClick={start} disabled={!task.trim()}>
                  Run agent
                </button>
              )}
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          {final && (
            <div className={`final ${final.success ? "ok" : "fail"}`}>
              <strong>{final.success ? "✓ Completed" : "✗ Finished"}</strong> {final.summary}
            </div>
          )}

          <div className="log" ref={logRef}>
            {entries.length === 0 && <div className="empty">Telemetry will stream here…</div>}
            {entries.map((entry) => (
              <div key={entry.key} className={`entry ${entry.kind}`}>
                {entry.step > 0 && <span className="step">#{entry.step}</span>}
                <span className="kind">{entry.kind}</span>
                <div className="body">
                  <div className="title">{entry.title}</div>
                  {entry.detail && <div className="detail">{entry.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? `"${value}"` : value}`)
    .join(", ");
}
