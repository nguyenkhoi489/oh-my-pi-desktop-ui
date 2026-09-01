/**
 * Verification Suite: Provider & Custom LLM Management (Phase 8)
 *
 * Requirements:
 * 1. parseModelsYaml parses real-shape models.yml fixture (preserves id, baseUrl, api, apiKey, authHeader, compat, models).
 * 2. serializeModelsYaml roundtrips cleanly without losing fields.
 * 3. readModelsConfig handles existing, missing (ENOENT), and unwritable (EACCES) files.
 * 4. writeModelsConfig creates .bak backup before writing and validates YAML integrity.
 * 5. writeModelsConfig handles EACCES gracefully with `sudo chown $USER` guidance.
 * 6. parseLoginProvidersJson parses `omp auth-broker list --json` output.
 * 7. Env var check sets hasEnvVar correctly without ever exposing the secret key value.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseModelsYaml,
  serializeModelsYaml,
  readModelsConfig,
  writeModelsConfig,
  parseLoginProvidersJson,
} from '../electron/models-config.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ PASSED: ${message}`);
    passed++;
  }
}

console.log('=== Starting Provider & Custom LLM Verification Suite (Phase 8) ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-provider-test-'));
const testModelsYamlPath = path.join(tempDir, 'models.yml');

const REAL_MODELS_YML_FIXTURE = `providers:
  nguyenkhoi-lmstudio-local:
    baseUrl: http://127.0.0.1:8040/v1
    api: openai-completions
    apiKey: LMSTUDIO_API_KEY
    authHeader: true
    compat:
      supportsUsageInStreaming: false
    models:
      - id: gemini-3.7-flash-tiered
        name: Gemini 3.7 Flash Tiered
        contextWindow: 300000
        maxTokens: 65536
  nguyenkhoi-lmstudio-prod:
    baseUrl: https://lmstudio.nguyenkhoi.dev/v1
    api: openai-completions
    apiKey: LMSTUDIO_API_KEY_PROD
    authHeader: true
    compat:
      supportsUsageInStreaming: false
    models:
      - id: gemini-3.7-flash-tiered
        name: Gemini 3.7 Flash Tiered
        contextWindow: 300000
`;

try {
  // ----------------------------------------------------
  // Test 1: parseModelsYaml fixture parsing
  // ----------------------------------------------------
  console.log('[Test 1] parseModelsYaml fixture parsing');
  {
    const providers = parseModelsYaml(REAL_MODELS_YML_FIXTURE);
    assert(Array.isArray(providers), 'parseModelsYaml returns an array');
    assert(providers.length === 2, 'Parsed exactly 2 providers');

    const local = providers.find((p) => p.id === 'nguyenkhoi-lmstudio-local');
    assert(Boolean(local), 'Found local provider');
    assert(local.baseUrl === 'http://127.0.0.1:8040/v1', 'Local baseUrl matches');
    assert(local.api === 'openai-completions', 'Local api is openai-completions');
    assert(local.apiKey === 'LMSTUDIO_API_KEY', 'Local apiKey env var name matches');
    assert(local.authHeader === true, 'Local authHeader is true');
    assert(local.compat?.supportsUsageInStreaming === false, 'Local compat matches');
    assert(Array.isArray(local.models) && local.models.length === 1, 'Local has 1 model');
    assert(local.models[0].id === 'gemini-3.7-flash-tiered', 'Model ID matches');
    assert(local.models[0].name === 'Gemini 3.7 Flash Tiered', 'Model name matches');
    assert(local.models[0].contextWindow === 300000, 'Model contextWindow matches');
    assert(local.models[0].maxTokens === 65536, 'Model maxTokens matches');

    const prod = providers.find((p) => p.id === 'nguyenkhoi-lmstudio-prod');
    assert(Boolean(prod), 'Found prod provider');
    assert(prod.baseUrl === 'https://lmstudio.nguyenkhoi.dev/v1', 'Prod baseUrl matches');
    assert(prod.apiKey === 'LMSTUDIO_API_KEY_PROD', 'Prod apiKey env var name matches');

    // Empty/Corrupted inputs
    assert(parseModelsYaml('').length === 0, 'Empty string returns empty array');
    assert(parseModelsYaml('   ').length === 0, 'Whitespace returns empty array');
    assert(parseModelsYaml('invalid: yaml: [').length === 0, 'Corrupted yaml returns empty array without crash');
    assert(parseModelsYaml('hello: world').length === 0, 'Yaml without providers returns empty array');
  }

  // ----------------------------------------------------
  // Test 2: serializeModelsYaml roundtrip
  // ----------------------------------------------------
  console.log('\n[Test 2] serializeModelsYaml roundtrip');
  {
    const originalProviders = parseModelsYaml(REAL_MODELS_YML_FIXTURE);
    const yamlString = serializeModelsYaml(originalProviders);

    assert(typeof yamlString === 'string' && yamlString.length > 0, 'serializeModelsYaml returns non-empty string');
    assert(yamlString.includes('nguyenkhoi-lmstudio-local:'), 'Serialized YAML includes local provider key');
    assert(yamlString.includes('nguyenkhoi-lmstudio-prod:'), 'Serialized YAML includes prod provider key');
    assert(yamlString.includes('baseUrl: http://127.0.0.1:8040/v1'), 'Serialized YAML includes baseUrl');

    const roundtrip = parseModelsYaml(yamlString);
    assert(roundtrip.length === 2, 'Roundtrip parsed exactly 2 providers');
    assert(roundtrip[0].id === originalProviders[0].id, 'Roundtrip provider 0 ID matches');
    assert(roundtrip[0].baseUrl === originalProviders[0].baseUrl, 'Roundtrip provider 0 baseUrl matches');
    assert(roundtrip[0].models?.[0]?.contextWindow === 300000, 'Roundtrip model contextWindow preserved');
    assert(roundtrip[0].models?.[0]?.maxTokens === 65536, 'Roundtrip model maxTokens preserved');
  }

  // ----------------------------------------------------
  // Test 3: readModelsConfig (missing vs existing)
  // ----------------------------------------------------
  console.log('\n[Test 3] readModelsConfig (missing vs existing)');
  {
    const nonExistentPath = path.join(tempDir, 'non-existent-models.yml');
    const missingRes = await readModelsConfig(nonExistentPath);
    assert(missingRes.providers.length === 0, 'Missing file returns empty providers array');
    assert(missingRes.isWritable === true, 'Missing file in writable dir is marked writable');
    assert(!missingRes.error, 'No error on missing file (clean default)');

    // Write fixture file to disk
    fs.writeFileSync(testModelsYamlPath, REAL_MODELS_YML_FIXTURE, 'utf-8');
    const existingRes = await readModelsConfig(testModelsYamlPath);
    assert(existingRes.providers.length === 2, 'Existing file returns 2 providers');
    assert(existingRes.isWritable === true, 'Existing file is writable');
    assert(existingRes.filePath === testModelsYamlPath, 'Returns correct filePath');
  }

  // ----------------------------------------------------
  // Test 4: writeModelsConfig & .bak creation
  // ----------------------------------------------------
  console.log('\n[Test 4] writeModelsConfig & .bak backup');
  {
    const providersToSave = [
      {
        id: 'test-custom-ollama',
        baseUrl: 'http://localhost:11434/v1',
        api: 'openai-completions',
        apiKey: 'OLLAMA_API_KEY',
        authHeader: false,
        models: [
          { id: 'llama3:8b', name: 'Llama 3 8B', contextWindow: 8192 },
        ],
      },
    ];

    const writeRes = await writeModelsConfig(providersToSave, testModelsYamlPath);
    assert(writeRes.success === true, 'writeModelsConfig succeeds');
    assert(fs.existsSync(testModelsYamlPath), 'Target models.yml exists after write');
    assert(fs.existsSync(`${testModelsYamlPath}.bak`), 'Backup .bak file created successfully');

    // Verify .bak has original fixture content
    const bakContent = fs.readFileSync(`${testModelsYamlPath}.bak`, 'utf-8');
    assert(bakContent.includes('nguyenkhoi-lmstudio-local'), 'Backup file preserves previous content');

    // Verify new file has updated content
    const readBack = await readModelsConfig(testModelsYamlPath);
    assert(readBack.providers.length === 1, 'Read back returns 1 provider');
    assert(readBack.providers[0].id === 'test-custom-ollama', 'Updated provider id matches');
    assert(readBack.providers[0].models?.[0].id === 'llama3:8b', 'Updated model id matches');
  }

  // ----------------------------------------------------
  // Test 5: EACCES Permission handling & sudo chown guidance
  // ----------------------------------------------------
  console.log('\n[Test 5] EACCES Permission handling & sudo chown guidance');
  {
    const readOnlyPath = path.join(tempDir, 'readonly-models.yml');
    fs.writeFileSync(readOnlyPath, REAL_MODELS_YML_FIXTURE, { mode: 0o444 });

    const readRes = await readModelsConfig(readOnlyPath);
    assert(readRes.providers.length === 2, 'Read-only file still readable');
    assert(readRes.isWritable === false, 'Read-only file detected as not writable');
    assert(
      readRes.error?.includes('sudo chown $USER'),
      'Read error contains sudo chown $USER guidance'
    );

    const writeRes = await writeModelsConfig([], readOnlyPath);
    assert(writeRes.success === false, 'Write to read-only file fails');
    assert(
      writeRes.error?.includes('sudo chown $USER'),
      'Write error contains sudo chown $USER guidance'
    );

    // Restore permissions for cleanup
    fs.chmodSync(readOnlyPath, 0o644);
  }

  // ----------------------------------------------------
  // Test 6: parseLoginProvidersJson
  // ----------------------------------------------------
  console.log('\n[Test 6] parseLoginProvidersJson');
  {
    const sampleAuthBrokerOutput = JSON.stringify([
      { id: 'openai-codex', name: 'ChatGPT Plus/Pro (Codex Subscription)' },
      { id: 'anthropic', name: 'Anthropic (Claude Pro/Max)' },
      { id: 'github-copilot', name: 'GitHub Copilot' },
      { id: 'cursor', name: 'Cursor (Claude, GPT, etc.)' },
    ]);

    const parsed = parseLoginProvidersJson(sampleAuthBrokerOutput);
    assert(Array.isArray(parsed) && parsed.length === 4, 'Parsed 4 login providers');
    assert(parsed[0].id === 'openai-codex', 'Provider 0 id matches');
    assert(parsed[0].name === 'ChatGPT Plus/Pro (Codex Subscription)', 'Provider 0 name matches');

    // Corrupted JSON
    assert(parseLoginProvidersJson('not a json').length === 0, 'Corrupted string returns empty array');
    assert(parseLoginProvidersJson('{}').length === 0, 'Non-array returns empty array');
  }

  // ----------------------------------------------------
  // Test 7: Env Var check & Secret Exposure Prevention
  // ----------------------------------------------------
  console.log('\n[Test 7] Env Var check & Secret Exposure Prevention');
  {
    const secretKey = 'super-secret-key-abcdef-123456';
    process.env.TEST_MY_ENV_VAR_SET = secretKey;
    delete process.env.TEST_MY_ENV_VAR_UNSET;

    const testYaml = `providers:
  env-test-provider:
    baseUrl: http://127.0.0.1:8000/v1
    apiKey: TEST_MY_ENV_VAR_SET
  unset-test-provider:
    baseUrl: http://127.0.0.1:8000/v1
    apiKey: TEST_MY_ENV_VAR_UNSET
  no-key-provider:
    baseUrl: http://127.0.0.1:8000/v1
`;

    const parsed = parseModelsYaml(testYaml);
    assert(parsed.length === 3, 'Parsed 3 test providers');

    const setProv = parsed.find((p) => p.id === 'env-test-provider');
    assert(setProv?.hasEnvVar === true, 'hasEnvVar is true when env var exists in process.env');

    const unsetProv = parsed.find((p) => p.id === 'unset-test-provider');
    assert(unsetProv?.hasEnvVar === false, 'hasEnvVar is false when env var is missing');

    const noKeyProv = parsed.find((p) => p.id === 'no-key-provider');
    assert(noKeyProv?.hasEnvVar === false, 'hasEnvVar is false when no apiKey is specified');

    // CRITICAL SECURITY ASSERTION: Secret key value is NEVER leaked into the object or serialized output!
    const jsonRepresentation = JSON.stringify(parsed);
    assert(
      !jsonRepresentation.includes(secretKey),
      'Parsed config object NEVER contains the secret API key value'
    );

    const serialized = serializeModelsYaml(parsed);
    assert(
      !serialized.includes(secretKey),
      'Serialized YAML NEVER contains the secret API key value'
    );

    delete process.env.TEST_MY_ENV_VAR_SET;
  }

  console.log('\n====================================================');
  console.log(`Provider Config Verification Complete: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}
