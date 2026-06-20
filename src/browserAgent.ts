import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AgentConfig } from "./config.js";
import { Logger } from "./logger.js";

export type ElementCandidate = {
  label: string;
  selector: string;
  role?: string;
  placeholder?: string;
  text?: string;
  box?: { x: number; y: number; width: number; height: number } | null;
};

export class BrowserAgent {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(
    private readonly config: AgentConfig,
    private readonly logger = new Logger(),
  ) {}

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

  async detectFormElements(): Promise<ElementCandidate[]> {
    const page = this.requirePage();
    this.logger.info("Detecting candidate form elements");

    const candidates = await page.locator("input, textarea, [contenteditable='true']").evaluateAll(
      (elements) =>
        elements.map((element, index) => {
          const htmlElement = element as HTMLElement;
          const input = element as HTMLInputElement | HTMLTextAreaElement;
          const id = htmlElement.id ? `#${CSS.escape(htmlElement.id)}` : "";
          const name = input.name ? `[name="${CSS.escape(input.name)}"]` : "";
          const selector = id || name || `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
          const rect = htmlElement.getBoundingClientRect();

          return {
            label:
              htmlElement.getAttribute("aria-label") ||
              input.labels?.[0]?.textContent?.trim() ||
              input.placeholder ||
              input.name ||
              htmlElement.id ||
              `field-${index + 1}`,
            selector,
            role: htmlElement.getAttribute("role") || undefined,
            placeholder: input.placeholder || undefined,
            text: htmlElement.textContent?.trim() || undefined,
            box: rect.width && rect.height
              ? {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                }
              : null,
          };
        }),
    );

    this.logger.info("Detected form candidates", { count: candidates.length, candidates });
    return candidates;
  }

  async fillTargetForm(name: string, description: string): Promise<void> {
    const page = this.requirePage();

    await this.detectFormElements();
    await this.fillField("name", name);
    await this.fillField("description", description);

    this.logger.info("Target form filled successfully");
  }

  async close(): Promise<void> {
    this.logger.info("Closing browser");
    await this.context?.close();
    await this.browser?.close();
  }

  private async fillField(fieldName: "name" | "description", value: string): Promise<void> {
    const page = this.requirePage();
    const label = fieldName === "name" ? "Name" : "Description";
    const selectors: Array<{ name: string; locate: () => ReturnType<Page["locator"]> }> =
      fieldName === "name"
        ? [
            { name: "exact label: Name", locate: () => page.getByLabel(/^name$/i).first() },
            { name: "label: Bug Title", locate: () => page.getByLabel(/bug title|title/i).first() },
            { name: "placeholder: title/name", locate: () => page.getByPlaceholder(/title|name/i).first() },
            { name: "attribute: name", locate: () => page.locator("input[name='name' i]").first() },
            { name: "first text input", locate: () => page.locator("input:not([type]), input[type='text']").first() },
          ]
        : [
            { name: "label: Description", locate: () => page.getByLabel(/description/i).first() },
            { name: "placeholder: Description", locate: () => page.getByPlaceholder(/description/i).first() },
            { name: "attribute: description", locate: () => page.locator("textarea[name*='description' i]").first() },
            { name: "first textarea", locate: () => page.locator("textarea").first() },
          ];

    for (const strategy of selectors) {
      const locator = strategy.locate();
      try {
        await locator.waitFor({ state: "visible", timeout: 2_500 });
        this.logger.info("Filling field using locator strategy", {
          field: label,
          strategy: strategy.name,
        });
        await locator.fill(value);
        return;
      } catch {
        this.logger.warn("Locator strategy failed", {
          field: label,
          strategy: strategy.name,
        });
      }
    }

    const candidate = (await this.detectFormElements()).find((item) =>
      item.label.toLowerCase().includes(fieldName),
    );

    if (!candidate?.box) {
      throw new Error(`Could not find a visible ${label} field`);
    }

    const centerX = candidate.box.x + candidate.box.width / 2;
    const centerY = candidate.box.y + candidate.box.height / 2;
    this.logger.info("Falling back to coordinate click", {
      field: label,
      x: centerX,
      y: centerY,
    });
    await this.click_on_screen(centerX, centerY);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await this.send_keys(value);
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error("Browser is not open. Call open_browser first.");
    }
    return this.page;
  }
}
