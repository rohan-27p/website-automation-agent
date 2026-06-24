import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AgentConfig } from "./config.js";
import { dummyValue, scoreField } from "./fieldMatcher.js";
import type { FieldFill } from "./task.js";
import { Logger } from "./logger.js";

export type DetectedField = {
  /** Stable selector injected at detection time so we can re-locate this exact element. */
  selector: string;
  tagName: string;
  type: string;
  label: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  role?: string;
  text?: string;
  visible: boolean;
  box?: { x: number; y: number; width: number; height: number } | null;
};

export type FillResult = {
  match: string;
  matched: boolean;
  label?: string;
  score?: number;
  value?: string;
};

const NON_FILLABLE_TYPES = new Set([
  "hidden",
  "submit",
  "button",
  "image",
  "reset",
  "file",
]);

// Minimum confidence before we accept a fuzzy match. Below this we skip the
// field rather than risk typing into the wrong element.
const MATCH_THRESHOLD = 0.25;

export class BrowserAgent {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(
    private readonly config: AgentConfig,
    private readonly logger = new Logger(),
  ) {}

  // ---- Required browser tools -------------------------------------------------

  async open_browser(): Promise<Page> {
    this.logger.info("Opening browser", {
      headless: this.config.headless,
      slowMoMs: this.config.slowMoMs,
    });

    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMoMs,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    this.page = await this.context.newPage();
    return this.page;
  }

  async navigate_to_url(url: string): Promise<void> {
    const page = this.requirePage();
    this.logger.info("Navigating to URL", { url });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {
      this.logger.warn("Network idle wait timed out; continuing after DOM load");
    });
  }

  async take_screenshot(name = "browser-state"): Promise<string> {
    const page = this.requirePage();
    await mkdir(this.config.screenshotDir, { recursive: true });
    const screenshotPath = path.join(
      this.config.screenshotDir,
      `${Date.now()}-${name}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    this.logger.info("Captured screenshot", { screenshotPath });
    return screenshotPath;
  }

  async click_on_screen(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    this.logger.info("Clicking coordinates", { x, y });
    await page.mouse.click(x, y);
  }

  async double_click(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    this.logger.info("Double-clicking coordinates", { x, y });
    await page.mouse.dblclick(x, y);
  }

  async send_keys(text: string): Promise<void> {
    const page = this.requirePage();
    this.logger.info("Sending keys", { length: text.length });
    await page.keyboard.type(text);
  }

  async scroll(deltaY = 600): Promise<void> {
    const page = this.requirePage();
    this.logger.info("Scrolling page", { deltaY });
    await page.mouse.wheel(0, deltaY);
  }

  // ---- Generic form understanding --------------------------------------------

  /**
   * Discover every fillable element on the current page. Works on any site:
   * we read each element's own descriptive attributes and tag it with a unique
   * `data-agent-id` so it can be re-located precisely later.
   */
  async detectFormElements(): Promise<DetectedField[]> {
    const page = this.requirePage();
    this.logger.info("Detecting form fields");

    const fields = await page
      .locator("input, textarea, select, [contenteditable='true']")
      .evaluateAll((elements) =>
        elements.map((element, index) => {
          const el = element as HTMLElement;
          const input = element as HTMLInputElement;
          const agentId = `af-${index}`;
          el.setAttribute("data-agent-id", agentId);

          const tagName = element.tagName.toLowerCase();
          const type = (
            input.getAttribute?.("type") ||
            (tagName === "textarea" ? "textarea" : tagName === "select" ? "select" : "text")
          ).toLowerCase();
          const rect = el.getBoundingClientRect();
          const labelText =
            input.labels && input.labels[0]?.textContent
              ? input.labels[0].textContent.trim()
              : "";

          return {
            selector: `[data-agent-id="${agentId}"]`,
            tagName,
            type,
            label:
              el.getAttribute("aria-label") ||
              labelText ||
              input.placeholder ||
              input.name ||
              el.id ||
              `field-${index + 1}`,
            ariaLabel: el.getAttribute("aria-label") || undefined,
            placeholder: input.placeholder || undefined,
            name: input.name || undefined,
            id: el.id || undefined,
            role: el.getAttribute("role") || undefined,
            text: el.textContent ? el.textContent.trim().slice(0, 80) : undefined,
            visible: Boolean(rect.width && rect.height),
            box:
              rect.width && rect.height
                ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                : null,
          };
        }),
      );

    const fillable = fields.filter((field) => !NON_FILLABLE_TYPES.has(field.type));
    this.logger.info("Detected fields", {
      total: fields.length,
      fillable: fillable.length,
    });
    return fillable;
  }

  /**
   * Fill an explicit set of fields. Each requested field is matched to the
   * best-scoring detected element; no field names are hardcoded.
   */
  async fillForm(fields: FieldFill[]): Promise<FillResult[]> {
    const candidates = (await this.detectFormElements()).filter((c) => c.visible);
    const used = new Set<string>();
    const results: FillResult[] = [];

    for (const field of fields) {
      const ranked = candidates
        .filter((c) => !used.has(c.selector))
        .map((c) => ({ candidate: c, score: scoreField(c, field.match) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best || best.score < MATCH_THRESHOLD) {
        this.logger.warn("No confident match for field", {
          match: field.match,
          bestScore: best?.score ?? 0,
        });
        results.push({ match: field.match, matched: false, score: best?.score ?? 0 });
        continue;
      }

      used.add(best.candidate.selector);
      this.logger.info("Matched field", {
        match: field.match,
        label: best.candidate.label,
        selector: best.candidate.selector,
        score: Number(best.score.toFixed(2)),
      });
      await this.fillCandidate(best.candidate, field.value);
      results.push({
        match: field.match,
        matched: true,
        label: best.candidate.label,
        score: Number(best.score.toFixed(2)),
        value: field.value,
      });
    }

    return results;
  }

  /**
   * Zero-config mode: fill every detected field with a type-appropriate dummy
   * value. Useful for smoke-testing the agent against an unknown site.
   */
  async autoFill(): Promise<FillResult[]> {
    const candidates = (await this.detectFormElements()).filter((c) => c.visible);
    const results: FillResult[] = [];

    for (const candidate of candidates) {
      const value = dummyValue(candidate);
      try {
        await this.fillCandidate(candidate, value);
        results.push({ match: candidate.label, matched: true, label: candidate.label, value });
      } catch (error) {
        this.logger.warn("Auto-fill failed for field", {
          selector: candidate.selector,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({ match: candidate.label, matched: false, label: candidate.label });
      }
    }
    return results;
  }

  /** Click a submit control found by a free-text hint. Returns whether it clicked. */
  async submit(match = "submit"): Promise<boolean> {
    const page = this.requirePage();
    const pattern = new RegExp(match, "i");
    const strategies = [
      page.getByRole("button", { name: pattern }).first(),
      page.locator("input[type='submit']").first(),
      page.locator("button[type='submit']").first(),
    ];

    for (const locator of strategies) {
      try {
        await locator.waitFor({ state: "visible", timeout: 2_000 });
        this.logger.info("Submitting form");
        await locator.click();
        return true;
      } catch {
        // try next strategy
      }
    }
    this.logger.warn("No submit control found", { match });
    return false;
  }

  async close(): Promise<void> {
    this.logger.info("Closing browser");
    await this.context?.close();
    await this.browser?.close();
  }

  // ---- Internals --------------------------------------------------------------

  /** Fill a single detected element, with a coordinate-based fallback. */
  private async fillCandidate(field: DetectedField, value: string): Promise<void> {
    const page = this.requirePage();
    const locator = page.locator(field.selector).first();

    try {
      await locator.waitFor({ state: "visible", timeout: 3_000 });

      if (field.tagName === "select") {
        await locator
          .selectOption({ label: value })
          .catch(() => locator.selectOption(value));
        return;
      }

      if (field.type === "checkbox" || field.type === "radio") {
        const truthy = ["1", "true", "yes", "on", "checked"].includes(value.toLowerCase());
        if (truthy) await locator.check();
        else await locator.uncheck().catch(() => undefined);
        return;
      }

      await locator.fill(value);
      return;
    } catch {
      this.logger.warn("Direct fill failed; trying coordinate fallback", {
        selector: field.selector,
      });
    }

    if (field.box) {
      const centerX = field.box.x + field.box.width / 2;
      const centerY = field.box.y + field.box.height / 2;
      await this.click_on_screen(centerX, centerY);
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await this.send_keys(value);
      return;
    }

    throw new Error(`Could not fill field (${field.label})`);
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error("Browser is not open. Call open_browser first.");
    }
    return this.page;
  }
}
