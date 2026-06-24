import "dotenv/config";

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  // LLM (Ollama Cloud, OpenAI-compatible endpoint)
  ollamaApiKey: process.env.OLLAMA_API_KEY ?? "",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "https://ollama.com/v1",
  modelId: process.env.MODEL_ID ?? "qwen3-coder:480b-cloud",

  // Agent
  maxSteps: readNumber(process.env.MAX_STEPS, 20),
  // Offline demo: scripted mock LLM, no API key/network required.
  mockLlm: readBoolean(process.env.MOCK_LLM, false),

  // Browser
  headless: readBoolean(process.env.HEADLESS_BROWSER, false),
  slowMoMs: readNumber(process.env.BROWSER_SLOW_MO_MS, 100),

  // Server
  port: readNumber(process.env.PORT, 8787),
};

export type AppConfig = typeof config;
