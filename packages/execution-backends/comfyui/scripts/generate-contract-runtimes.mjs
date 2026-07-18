import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contractRoot = join(packageRoot, 'contract');
const templateRoot = join(packageRoot, 'scripts', 'templates');
const checking = process.argv.includes('--check');

const schemaBytes = await readFile(join(contractRoot, 'workflow-contract.schema.json'));
const schemaSha256 = createHash('sha256').update(schemaBytes).digest('hex');
const workflowContractSchema = JSON.parse(schemaBytes.toString('utf8'));

const compatibility = {
  protocolVersion: 1,
  bridgeVersion: '1.0.0',
  frontendVersion: '1.45.20',
  coreVersion: '0.27.1',
  contractSchemaVersion: 1,
  contractSchemaSha256: schemaSha256,
};

const manifest = {
  schemaVersion: 1,
  bindingClassId: 'ImagenWorkflowBindingContract',
  typeClassId: 'ImagenWorkflowTypeContract',
  schemaSha256,
};

const outputs = new Map([
  [
    join(contractRoot, 'canonical-data.mjs'),
    Buffer.from(
      `function deepFreeze(value) {\n  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {\n    Object.freeze(value);\n    for (const child of Object.values(value)) deepFreeze(child);\n  }\n  return value;\n}\n`
      + `/** Canonical workflow contract JSON schema。 */\nexport const workflowContractSchema = deepFreeze(${JSON.stringify(workflowContractSchema)});\n`
      + `/** Canonical contract manifest。 */\nexport const contractManifest = deepFreeze(${JSON.stringify(manifest)});\n`
      + `/** Pinned Bridge compatibility tuple。 */\nexport const bridgeCompatibility = deepFreeze(${JSON.stringify(compatibility)});\n`,
    ),
  ],
  [
    join(contractRoot, 'runtime-validator.mjs'),
    await readFile(join(templateRoot, 'runtime-validator.mjs')),
  ],
  [
    join(contractRoot, 'runtime_validator.py'),
    await readFile(join(templateRoot, 'runtime_validator.py')),
  ],
  [
    join(contractRoot, 'contract-manifest.json'),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  ],
  [
    join(contractRoot, 'compatibility.json'),
    Buffer.from(`${JSON.stringify(compatibility, null, 2)}\n`),
  ],
]);

await mkdir(contractRoot, { recursive: true });
const drift = [];
for (const [path, expected] of outputs) {
  if (checking) {
    let actual;
    try {
      actual = await readFile(path);
    } catch {
      actual = undefined;
    }
    if (actual === undefined || !actual.equals(expected)) drift.push(path);
  } else {
    await writeFile(path, expected);
  }
}

if (drift.length > 0) {
  throw new Error(`Generated ComfyUI contract artifacts are stale: ${drift.join(', ')}`);
}
