/**
 * Cross-capability invariant guards.
 *
 * INTENT: Runtime-enforceable checks for architectural boundaries.
 * INPUT: Values to verify
 * OUTPUT: Throws on violation
 * SIDE EFFECT: None
 * FAILURE: Throws TypeError with descriptive message
 *
 * see: design.md § Cross-Capability Invariants
 */

/**
 * Assert that a value is serializable (clone-safe).
 *
 * Workflow outputs crossing shared package boundaries MUST be clone-safe.
 * Rejects functions, symbols, Map/Set, class instances, and cyclic references.
 */
export function assertSerializable(label: string, value: unknown): void {
  const seen = new Set<unknown>();
  check(value, label);

  function check(v: unknown, path: string): void {
    // Primitives are always serializable
    if (v === null || v === undefined) return;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return;

    // Non-serializable primitives
    if (t === "function" || t === "symbol" || t === "bigint") {
      throw new TypeError(
        `Invariant violation: ${path} is a ${t}, which is not serializable.`,
      );
    }

    // Must be an object from here
    if (t !== "object") {
      throw new TypeError(
        `Invariant violation: ${path} has unexpected type "${t}".`,
      );
    }

    // Cycle detection
    if (seen.has(v)) {
      throw new TypeError(
        `Invariant violation: ${path} contains a cyclic reference.`,
      );
    }
    seen.add(v);

    // Only plain objects and arrays are clone-safe
    const proto = Object.getPrototypeOf(v);
    const isPlain = proto === Object.prototype || proto === null;
    const isArray = Array.isArray(v);

    if (!isPlain && !isArray) {
      const name = (v as object).constructor?.name ?? "unknown";
      throw new TypeError(
        `Invariant violation: ${path} is a ${name} instance, which is not serializable. ` +
          `Only plain objects and arrays are allowed.`,
      );
    }

    if (isArray) {
      for (let i = 0; i < (v as unknown[]).length; i++) {
        check((v as unknown[])[i], `${path}[${i}]`);
      }
    } else {
      for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
        check(val, `${path}.${key}`);
      }
    }

    seen.delete(v);
  }
}

/**
 * Deep-freeze an object to enforce immutability at step boundaries.
 *
 * Provider invocation MUST NOT mutate original validated input.
 * Step inputs are treated as immutable values.
 * Cycle-safe: tracks visited objects to avoid infinite recursion.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;

  const seen = new WeakSet<object>();
  freeze(obj as object);
  return obj;

  function freeze(o: object): void {
    if (seen.has(o)) return;
    seen.add(o);
    Object.freeze(o);
    for (const value of Object.values(o as Record<string, unknown>)) {
      if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        freeze(value as object);
      }
    }
  }
}