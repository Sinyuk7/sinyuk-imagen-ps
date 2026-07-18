import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateWorkflowContractDocuments } from '../contract/runtime-validator.mjs';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(packageRoot, 'contract', 'workflow-contract.schema.json');
const fixturesPath = join(packageRoot, 'contract', 'contract-fixtures.json');
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const fixtures = JSON.parse(await readFile(fixturesPath, 'utf8'));
const parserModule = await import(pathToFileURL(join(packageRoot, 'dist', 'src', 'contract', 'parser.js')).href);

const expected = fixtures.cases.map((fixture) => ({ id: fixture.id, valid: fixture.valid }));
const javascript = fixtures.cases.map((fixture) => ({
  id: fixture.id,
  valid: validateWorkflowContractDocuments(fixture.binding, fixture.type, schema).ok,
}));
const typescript = fixtures.cases.map((fixture) => {
  try {
    parserModule.parseComfyUiWorkflowContract(fixture.binding, fixture.type);
    return { id: fixture.id, valid: true };
  } catch {
    return { id: fixture.id, valid: false };
  }
});
const python = spawnSync('python3', [
  join(packageRoot, 'contract', 'runtime_validator.py'),
  schemaPath,
  fixturesPath,
], { encoding: 'utf8' });
if (python.status !== 0) {
  throw new Error(`Python contract conformance failed with status ${String(python.status)}.`);
}
const pythonResults = JSON.parse(python.stdout);

for (const [name, results] of Object.entries({ typescript, javascript, python: pythonResults })) {
  if (JSON.stringify(results) !== JSON.stringify(expected)) {
    throw new Error(`${name} contract conformance drifted from fixture expectations.`);
  }
}
