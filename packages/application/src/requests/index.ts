import type { Workflow } from '@imagen-ps/core-engine';
import { providerEditWorkflow } from './provider-edit.js';
import { providerGenerateWorkflow } from './provider-generate.js';

export { providerEditWorkflow } from './provider-edit.js';
export { providerGenerateWorkflow } from './provider-generate.js';

/** 当前 application 层稳定公开的 builtin workflow 集合。 */
export const builtinWorkflows: readonly Workflow[] = Object.freeze([
  providerGenerateWorkflow,
  providerEditWorkflow,
]);
