import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SET_OF_MARKS_SCRIPT } from "./setOfMarks.js";
import type { Mark, Observation } from "./types.js";

const VIEWPORT = { width: 1280, height: 800 };

/**
 * Owns the Playwright browser and exposes the seven required low-level tools
 * plus a Set-of-Marks observation used by the AI agent. The agent never touches
 * Playwright directly — it calls clickMark/typeIntoMark, which resolve a mark id
 * to coordinates and act through the required coordinate tools.
 */
export class BrowserController {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private marks = new Map<number, Mark>();

  constructor(
    private readonly opts: { headless: boolean; slowMoMs: number },
  ) {}

  // ---- Required browser tools ----

  async open_browser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.opts.headless,
      slowMo: this.opts.slowMoMs,
    });
    this.context = await this.browser.newContext({ viewport: VIEWPORT });
    this.page = await this.context.newPage();
  }

  async navigate_to_url(url: string): Promise<void> {
    const page = this.requirePage();
    // Only add a scheme when the URL has none (preserve file://, http://, etc.).
    const target = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  }

  async take_screenshot(): Promise<string> {
    const page = this.requirePage();
    const buffer = await page.screenshot({ type: "png" });
    return buffer.toString("base64");
  }

  async click_on_screen(x: number, y: number): Promise<void> {
    await this.requirePage().mouse.click(x, y);
  }

  async double_click(x: number, y: number): Promise<void> {
    await this.requirePage().mouse.dblclick(x, y);
  }

  async send_keys(text: string): Promise<void> {
    await this.requirePage().keyboard.type(text);
  }

  async scroll(deltaY = 600): Promise<void> {
    await this.requirePage().mouse.wheel(0, deltaY);
  }

  // ---- Set-of-Marks observation ----

  /** Detect interactive elements, number them, overlay badges, and snapshot. */
  async observe(): Promise<Observation> {
    const page = this.requirePage();
    await page.waitForTimeout(250);

    const marks = (await page.evaluate(SET_OF_MARKS_SCRIPT)) as Mark[];
    this.marks = new Map(marks.map((m) => [m.id, m]));

    const screenshot = await this.take_screenshot();
    const url = page.url();
    const title = await page.title().catch(() => "");
    const { scrollY, scrollHeight } = await page.evaluate(() => ({
      scrollY: Math.round(window.scrollY),
      scrollHeight: Math.round(document.documentElement.scrollHeight),
    }));

    const text = marks.length
      ? marks
          .map((m) => {
            const value = m.value ? ` value="${truncate(m.value, 40)}"` : "";
            return `[${m.id}] <${m.tag}${m.type && m.type !== m.tag ? ` type=${m.type}` : ""}>${value} ${truncate(
              m.label,
              80,
            )}`;
          })
          .join("\n")
      : "(no interactive elements detected)";

    return { url, title, marks, text, screenshot, scrollY, scrollHeight };
  }

  getMark(id: number): Mark | undefined {
    return this.marks.get(id);
  }

  /** Click an element by its mark id, via the coordinate tool. */
  async clickMark(id: number): Promise<string> {
    const mark = this.requireMark(id);
    await this.click_on_screen(mark.x, mark.y);
    await this.requirePage().waitForTimeout(400);
    return `clicked [${id}] ${truncate(mark.label, 60)}`;
  }

  async doubleClickMark(id: number): Promise<string> {
    const mark = this.requireMark(id);
    await this.double_click(mark.x, mark.y);
    return `double-clicked [${id}] ${truncate(mark.label, 60)}`;
  }

  /** Focus an element by mark id, clear it, and type text. */
  async typeIntoMark(id: number, text: string): Promise<string> {
    const mark = this.requireMark(id);
    const page = this.requirePage();
    await this.click_on_screen(mark.x, mark.y);
    await page.keyboard.press("ControlOrMeta+A").catch(() => undefined);
    await page.keyboard.press("Delete").catch(() => undefined);
    await this.send_keys(text);
    return `typed "${truncate(text, 40)}" into [${id}] ${truncate(mark.label, 50)}`;
  }

  async pressKey(key: string): Promise<string> {
    await this.requirePage().keyboard.press(key);
    return `pressed ${key}`;
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }

  private requireMark(id: number): Mark {
    const mark = this.marks.get(id);
    if (!mark) throw new Error(`No element with mark id ${id}. Re-observe the page first.`);
    return mark;
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("Browser is not open. Call open_browser first.");
    return this.page;
  }
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
