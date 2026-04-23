/**
 * Dispatch a provider invocation through the runtime boundary.
 *
 * INTENT: Keep provider execution behind a narrow engine-owned contract
 * INPUT: providerDispatcher, providerId, input
 * OUTPUT: Frozen ProviderResult
 * SIDE EFFECT: None
 * FAILURE: Throws explicit error from provider dispatcher or invariant guards
 */

import { assertSerializable, deepFreeze } from "./invariants.js";
import type { ProviderResult } from "./types/provider.js";
import type { ProviderDispatcher } from "./types/runtime.js";

export async function dispatchProvider(args: {
  readonly providerDispatcher: ProviderDispatcher;
  readonly providerId: string;
  readonly input: unknown;
}): Promise<ProviderResult> {
  const result = await args.providerDispatcher.invoke({
    providerId: args.providerId,
    input: args.input,
  });

  assertSerializable(`provider:${args.providerId}.output`, result.output);
  return deepFreeze({
    output: result.output,
    assets: [...result.assets],
    ...(result.diagnostics !== undefined && { diagnostics: { ...result.diagnostics } }),
  });
}
