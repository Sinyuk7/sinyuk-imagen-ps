import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateWorkflowContractDocuments } from '../generated/runtime-validator.mjs';

const root = new URL('../generated/', import.meta.url);

test('copied schema digest and JS/Python fixture decisions match canonical manifest', async () => {
  const [schemaBytes, fixtureBytes, manifestBytes, compatibilityBytes] = await Promise.all([
    readFile(new URL('workflow-contract.schema.json', root)),
    readFile(new URL('contract-fixtures.json', root)),
    readFile(new URL('contract-manifest.json', root)),
    readFile(new URL('compatibility.json', root)),
  ]);
  const schema = JSON.parse(schemaBytes);
  const fixtures = JSON.parse(fixtureBytes);
  const manifest = JSON.parse(manifestBytes);
  const compatibility = JSON.parse(compatibilityBytes);
  const digest = createHash('sha256').update(schemaBytes).digest('hex');
  assert.equal(digest, manifest.schemaSha256);
  assert.equal(digest, compatibility.contractSchemaSha256);
  assert.equal(compatibility.contractSchemaVersion, manifest.schemaVersion);

  const jsResults = fixtures.cases.map((fixture) => ({
    id: fixture.id,
    valid: validateWorkflowContractDocuments(fixture.binding, fixture.type, schema).ok,
  }));
  assert.deepEqual(
    jsResults,
    fixtures.cases.map(({ id, valid }) => ({ id, valid })),
  );

  const python = spawnSync(
    'python3',
    [
      new URL('runtime_validator.py', root).pathname,
      new URL('workflow-contract.schema.json', root).pathname,
      new URL('contract-fixtures.json', root).pathname,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), jsResults);
});

test('browser validator copy remains byte-identical', async () => {
  const [canonical, browser] = await Promise.all([
    readFile(new URL('runtime-validator.mjs', root)),
    readFile(new URL('../web/generated/runtime-validator.mjs', import.meta.url)),
  ]);
  assert.deepEqual(browser, canonical);
});
