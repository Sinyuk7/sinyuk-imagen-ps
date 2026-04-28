import * as fs from 'node:fs';

/**
 * Parse input that can be either a JSON string or a @file reference.
 * - If input starts with '@', read the file path and parse as JSON.
 * - Otherwise, parse the string directly as JSON.
 *
 * @throws Error if JSON parsing fails or file cannot be read.
 */
export function parseJsonInput(input: string): unknown {
  let raw: string;

  if (input.startsWith('@')) {
    const filePath = input.slice(1);
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read file "${filePath}": ${msg}`);
    }
  } else {
    raw = input;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw.slice(0, 100)}`);
  }
}
