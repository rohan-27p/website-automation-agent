// Generic, site-agnostic field matching.
// Nothing here knows about any specific website or field name. A "field" is
// scored against a free-text hint by comparing the hint to whatever descriptive
// attributes the page exposes (label, placeholder, name, aria-label, id, ...).

export type FieldDescriptor = {
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  role?: string;
  text?: string;
  type?: string;
  tagName?: string;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

/**
 * Score how well a detected field matches a free-text hint (0..1).
 * No field names are hardcoded; we just compare the hint to every descriptor
 * the page gave us and keep the strongest signal.
 */
export function scoreField(descriptor: FieldDescriptor, hint: string): number {
  const hintNorm = normalize(hint);
  if (!hintNorm) return 0;
  const hintTokens = tokens(hint);

  const descriptors = [
    descriptor.label,
    descriptor.ariaLabel,
    descriptor.placeholder,
    descriptor.name,
    descriptor.id,
    descriptor.role,
    descriptor.text,
  ].filter((value): value is string => Boolean(value));

  let best = 0;
  for (const raw of descriptors) {
    const dNorm = normalize(raw);
    if (!dNorm) continue;

    let score = 0;
    if (dNorm === hintNorm) {
      score = 1;
    } else if (dNorm.includes(hintNorm) || hintNorm.includes(dNorm)) {
      score = 0.8;
    } else {
      const descTokens = new Set(tokens(raw));
      const overlap = hintTokens.filter((token) => descTokens.has(token)).length;
      if (overlap > 0) score = 0.5 * (overlap / hintTokens.length);
    }
    best = Math.max(best, score);
  }
  return best;
}

/**
 * Produce a type-appropriate dummy value for auto-fill mode, derived only from
 * the field's own type/attributes — still no site-specific knowledge.
 */
export function dummyValue(descriptor: FieldDescriptor): string {
  const type = (descriptor.type ?? "").toLowerCase();
  const hintSource = normalize(
    [descriptor.label, descriptor.name, descriptor.placeholder, descriptor.id]
      .filter(Boolean)
      .join(" "),
  );

  if (type === "email" || /email/.test(hintSource)) return "test@example.com";
  if (type === "tel" || /phone|tel|mobile/.test(hintSource)) return "+15551234567";
  if (type === "number") return "42";
  if (type === "url" || /url|website|link/.test(hintSource)) return "https://example.com";
  if (type === "date") return "2026-01-01";
  if (type === "time") return "12:00";
  if (type === "password") return "Password123!";
  if (type === "checkbox" || type === "radio") return "true";
  if (descriptor.tagName === "textarea" || /description|message|comment|bio|about/.test(hintSource)) {
    return "Sample text entered automatically by the website automation agent.";
  }
  return "Sample Text";
}
