import {
  listLocalCatalogModels,
  resolveImageModelRule,
  validateImageModelCatalog,
} from '../dist/contract/image-model-capability.js';

const errors = validateImageModelCatalog();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`catalog-error: ${error}`);
  }
  process.exitCode = 1;
} else {
  for (const providerId of ['image-endpoint', 'chat-image']) {
    const models = listLocalCatalogModels(providerId);
    console.log(`${providerId}: ${models.map((model) => model.id).join(', ')}`);
    for (const model of models) {
      const resolved = resolveImageModelRule({ providerId, capabilityModelId: model.id });
      console.log(`  - ${model.id} -> ${resolved.ruleId} (${resolved.matchKind}) brand=${resolved.capability.brand ?? 'none'}`);
    }
  }
}
