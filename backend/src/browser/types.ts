export type Mark = {
  /** Stable integer the LLM uses to refer to this element. */
  id: number;
  tag: string;
  type: string;
  /** Best human-readable description (label, text, aria-label, placeholder, name). */
  label: string;
  /** Current value for inputs, if any. */
  value?: string;
  /** Center coordinates (viewport pixels) used by the coordinate-based tools. */
  x: number;
  y: number;
  box: { x: number; y: number; width: number; height: number };
};

export type Observation = {
  url: string;
  title: string;
  marks: Mark[];
  /** Textual Set-of-Marks the LLM reasons over. */
  text: string;
  /** PNG screenshot (base64, no data: prefix) with marks overlaid, for the UI. */
  screenshot: string;
  scrollY: number;
  scrollHeight: number;
};
