import { readFile } from "node:fs/promises";

// A "task" fully describes what to automate on a site. Adding a new site means
// adding one of these (as JSON), never touching the engine code.
export type FieldFill = {
  /** Free-text hint matched against the page's fields (e.g. "email", "full name"). */
  match: string;
  /** Value to type / option to select / checkbox state. */
  value: string;
};

export type Task = {
  /** Optional human-friendly name for logs. */
  name?: string;
  /** Page to automate. */
  url: string;
  /** Explicit fields to fill. If omitted/empty, the agent auto-fills every field. */
  fields?: FieldFill[];
  /** Click a submit button after filling. */
  submit?: boolean;
  /** Hint used to find the submit control (default "submit"). */
  submitMatch?: string;
};

export async function loadTask(filePath: string): Promise<Task> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`Could not read task file: ${filePath}`);
  }

  let task: Task;
  try {
    task = JSON.parse(raw) as Task;
  } catch (error) {
    throw new Error(
      `Task file ${filePath} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!task.url || typeof task.url !== "string") {
    throw new Error(`Task file ${filePath} is missing a "url" string`);
  }
  if (task.fields) {
    if (!Array.isArray(task.fields)) {
      throw new Error(`Task file ${filePath}: "fields" must be an array`);
    }
    for (const [index, field] of task.fields.entries()) {
      if (typeof field?.match !== "string" || typeof field?.value !== "string") {
        throw new Error(
          `Task file ${filePath}: fields[${index}] must have string "match" and "value"`,
        );
      }
    }
  }
  return task;
}
