import type { Workflow } from '@imagen-ps/core-engine';

export { providerGenerateWorkflow } from './provider-generate.js';
export { providerEditWorkflow } from './provider-edit.js';

import { providerGenerateWorkflow } from './provider-generate.js';
import { providerEditWorkflow } from './provider-edit.js';

/** 当前阶段稳定公开的 builtin workflow 集合。 */
export const builtinWorkflows: readonly Workflow[] = Object.freeze([
  providerGenerateWorkflow,
  providerEditWorkflow,
]);
