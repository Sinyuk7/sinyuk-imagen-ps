/**
 * Unified output utilities for CLI commands.
 * All automation commands output JSON to stdout/stderr.
 */

/**
 * Write a successful result to stdout as JSON and exit with code 0.
 */
export function success(data: unknown): never {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

/**
 * Write an error to stderr as JSON and exit with code 1.
 */
export function error(message: string): never {
  process.stderr.write(JSON.stringify({ error: message }) + '\n');
  process.exit(1);
}
