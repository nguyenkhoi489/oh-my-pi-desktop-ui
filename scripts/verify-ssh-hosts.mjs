/**
 * Verification Suite: SSH Hosts Management (Phase 12)
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  validateHostName,
  buildSshArgs,
  listSshHosts,
  addSshHost,
  removeSshHost,
} from '../electron/ssh-hosts.ts';
import { expandHomeDir } from '../electron/launch-args.ts';
import { vi } from '../shared/i18n/vi.ts';
import { en } from '../shared/i18n/en.ts';

let passCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('=== Running verify-ssh-hosts.mjs ===');

const tmpDir = path.join(os.tmpdir(), `omp-test-ssh-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // Test 1: validateHostName validation
  test('validateHostName validates valid and invalid host names', () => {
    assert.strictEqual(validateHostName('prod-server'), true);
    assert.strictEqual(validateHostName('host.sub.domain'), true);
    assert.strictEqual(validateHostName('node_1'), true);
    assert.strictEqual(validateHostName('dev-123'), true);
    assert.strictEqual(validateHostName('box.io'), true);

    assert.strictEqual(validateHostName(''), false);
    assert.strictEqual(validateHostName('   '), false);
    assert.strictEqual(validateHostName('host name'), false);
    assert.strictEqual(validateHostName('host!'), false);
    assert.strictEqual(validateHostName('user@host'), false);
    assert.strictEqual(validateHostName(null), false);
    assert.strictEqual(validateHostName(undefined), false);
  });

  // Test 2: buildSshArgs list behavior
  test('buildSshArgs builds list arguments', () => {
    const args1 = buildSshArgs('list');
    assert.deepStrictEqual(args1, ['ssh', 'list', '--json']);

    const args2 = buildSshArgs('list', { profile: 'custom-profile' });
    assert.deepStrictEqual(args2, ['--profile=custom-profile', 'ssh', 'list', '--json']);
  });

  // Test 3: buildSshArgs add behavior
  test('buildSshArgs builds add arguments with flags and expansion', () => {
    const args1 = buildSshArgs('add', {
      name: 'test-host',
      input: {
        host: '1.2.3.4',
        scope: 'project',
      },
    });
    assert.deepStrictEqual(args1, [
      'ssh',
      'add',
      'test-host',
      '--host=1.2.3.4',
      '--scope=project',
      '--json',
    ]);

    const args2 = buildSshArgs('add', {
      profile: 'p1',
      input: {
        name: 'prod-box',
        host: 'api.example.com',
        user: 'admin',
        port: 2222,
        key: '~/.ssh/test_key',
        desc: 'Production server',
        compat: true,
        scope: 'user',
      },
    });

    const expectedKey = expandHomeDir('~/.ssh/test_key');
    assert.strictEqual(args2[0], '--profile=p1');
    assert.strictEqual(args2[1], 'ssh');
    assert.strictEqual(args2[2], 'add');
    assert.strictEqual(args2[3], 'prod-box');
    assert.ok(args2.includes('--host=api.example.com'));
    assert.ok(args2.includes('--user=admin'));
    assert.ok(args2.includes('--port=2222'));
    assert.ok(args2.includes(`--key=${expectedKey}`));
    assert.ok(args2.includes('--desc=Production server'));
    assert.ok(args2.includes('--compat'));
    assert.ok(args2.includes('--scope=user'));
    assert.ok(args2.includes('--json'));
  });

  // Test 4: buildSshArgs remove behavior
  test('buildSshArgs builds remove arguments', () => {
    const args1 = buildSshArgs('remove', { name: 'test-host', scope: 'project' });
    assert.deepStrictEqual(args1, [
      'ssh',
      'remove',
      'test-host',
      '--scope=project',
      '--json',
    ]);

    const args2 = buildSshArgs('remove', {
      name: 'user-host',
      scope: 'user',
      profile: 'p2',
    });
    assert.deepStrictEqual(args2, [
      '--profile=p2',
      'ssh',
      'remove',
      'user-host',
      '--scope=user',
      '--json',
    ]);
  });

  // Test 5: Input validation in addSshHost
  await asyncTest('addSshHost validates inputs before executing CLI', async () => {
    const resInvalidName = await addSshHost('omp', tmpDir, {
      name: 'invalid name!',
      host: '1.2.3.4',
      scope: 'project',
    });
    assert.strictEqual(resInvalidName.success, false);
    assert.ok(resInvalidName.error.includes('chữ cái, số'));

    const resEmptyHost = await addSshHost('omp', tmpDir, {
      name: 'valid-name',
      host: '   ',
      scope: 'project',
    });
    assert.strictEqual(resEmptyHost.success, false);
    assert.ok(resEmptyHost.error.includes('Địa chỉ host'));

    const resInvalidPort = await addSshHost('omp', tmpDir, {
      name: 'valid-name',
      host: '1.2.3.4',
      port: 70000,
      scope: 'project',
    });
    assert.strictEqual(resInvalidPort.success, false);
    assert.ok(resInvalidPort.error.includes('1 đến 65535'));

    const resInvalidScope = await addSshHost('omp', tmpDir, {
      name: 'valid-name',
      host: '1.2.3.4',
      scope: 'invalid_scope',
    });
    assert.strictEqual(resInvalidScope.success, false);
    assert.ok(resInvalidScope.error.includes('project'));

    const resNonExistentKey = await addSshHost('omp', tmpDir, {
      name: 'valid-name',
      host: '1.2.3.4',
      key: '/non/existent/path/to/private.key',
      scope: 'project',
    });
    assert.strictEqual(resNonExistentKey.success, false);
    assert.ok(resNonExistentKey.error.includes('không tồn tại'));
  });

  // Test 6: Input validation in removeSshHost
  await asyncTest('removeSshHost validates inputs before executing CLI', async () => {
    const resInvalidName = await removeSshHost('omp', tmpDir, 'bad name!', 'project');
    assert.strictEqual(resInvalidName.success, false);
    assert.ok(resInvalidName.error.includes('không hợp lệ'));

    const resInvalidScope = await removeSshHost('omp', tmpDir, 'valid-name', 'invalid_scope');
    assert.strictEqual(resInvalidScope.success, false);
    assert.ok(resInvalidScope.error.includes('project'));
  });

  // Test 7: Live CLI roundtrip in temporary directory
  await asyncTest('Live roundtrip: list, add, verify in list, duplicate error, remove', async () => {
    // Initial list in empty tmpDir
    const initialList = await listSshHosts('omp', tmpDir);
    assert.strictEqual(initialList.success, true);
    assert.ok(initialList.data);
    assert.deepStrictEqual(initialList.data.project, {});

    // Create a mock key file
    const mockKeyFile = path.join(tmpDir, 'mock_rsa.key');
    fs.writeFileSync(mockKeyFile, 'MOCK PRIVATE KEY DATA');

    // Add host
    const addResult = await addSshHost('omp', tmpDir, {
      name: 'live-test-box',
      host: '192.168.1.50',
      user: 'deployer',
      port: 2200,
      key: mockKeyFile,
      desc: 'Live test integration box',
      compat: true,
      scope: 'project',
    });
    assert.strictEqual(addResult.success, true);
    assert.ok(addResult.message);

    // List again and verify entry
    const afterAddList = await listSshHosts('omp', tmpDir);
    assert.strictEqual(afterAddList.success, true);
    const projectHosts = afterAddList.data.project;
    assert.ok(projectHosts['live-test-box'], 'Added host must appear in project hosts');
    assert.strictEqual(projectHosts['live-test-box'].host, '192.168.1.50');
    assert.strictEqual(projectHosts['live-test-box'].username, 'deployer');
    assert.strictEqual(projectHosts['live-test-box'].port, 2200);
    assert.strictEqual(projectHosts['live-test-box'].keyPath, mockKeyFile);
    assert.strictEqual(projectHosts['live-test-box'].description, 'Live test integration box');
    assert.strictEqual(projectHosts['live-test-box'].compat, true);

    // Duplicate add should return failure
    const dupAddResult = await addSshHost('omp', tmpDir, {
      name: 'live-test-box',
      host: '192.168.1.51',
      scope: 'project',
    });
    assert.strictEqual(dupAddResult.success, false);
    assert.ok(dupAddResult.error.includes('already exists'));

    // Remove host
    const removeResult = await removeSshHost('omp', tmpDir, 'live-test-box', 'project');
    assert.strictEqual(removeResult.success, true);

    // List again and verify removal
    const afterRemoveList = await listSshHosts('omp', tmpDir);
    assert.strictEqual(afterRemoveList.success, true);
    assert.strictEqual(afterRemoveList.data.project['live-test-box'], undefined);

    // Removing non-existent host should return error
    const removeNonExistent = await removeSshHost('omp', tmpDir, 'live-test-box', 'project');
    assert.strictEqual(removeNonExistent.success, false);
    assert.ok(removeNonExistent.error.includes('not found'));
  });

  // Test 8: Contract pinning across layers
  test('IPC channel names and API contracts are pinned across layers', () => {
    const mainContent = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf8');
    const preloadContent = fs.readFileSync(path.join(process.cwd(), 'electron/preload.ts'), 'utf8');
    const electronTypesContent = fs.readFileSync(path.join(process.cwd(), 'electron/types.ts'), 'utf8');
    const srcTypesContent = fs.readFileSync(path.join(process.cwd(), 'src/types/index.ts'), 'utf8');
    const useOmpRpcContent = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useOmpRpc.ts'), 'utf8');
    const opsModalContent = fs.readFileSync(path.join(process.cwd(), 'src/components/Modals/OpsModal.tsx'), 'utf8');
    const sshTabContent = fs.readFileSync(path.join(process.cwd(), 'src/components/Modals/ops/SshTab.tsx'), 'utf8');

    // IPC channels
    assert.ok(mainContent.includes("'omp:ssh-list'"), 'main.ts must handle omp:ssh-list');
    assert.ok(mainContent.includes("'omp:ssh-add'"), 'main.ts must handle omp:ssh-add');
    assert.ok(mainContent.includes("'omp:ssh-remove'"), 'main.ts must handle omp:ssh-remove');

    // Preload exposure
    assert.ok(preloadContent.includes("listSshHosts: () => ipcRenderer.invoke('omp:ssh-list')"), 'preload must expose listSshHosts');
    assert.ok(preloadContent.includes("addSshHost: (input: SshHostAddInput) => ipcRenderer.invoke('omp:ssh-add', input)"), 'preload must expose addSshHost');
    assert.ok(preloadContent.includes("removeSshHost: (name: string, scope: 'project' | 'user') =>"), 'preload must expose removeSshHost');

    // ElectronAPI interface
    assert.ok(electronTypesContent.includes('listSshHosts: () => Promise<SshHostsListResponse>'), 'electron/types.ts must define listSshHosts');
    assert.ok(srcTypesContent.includes('listSshHosts?: () => Promise<SshHostsListResponse>'), 'src/types/index.ts must define listSshHosts');

    // Hook exposure
    assert.ok(useOmpRpcContent.includes('listSshHosts,'), 'useOmpRpc must export listSshHosts');
    assert.ok(useOmpRpcContent.includes('addSshHost,'), 'useOmpRpc must export addSshHost');
    assert.ok(useOmpRpcContent.includes('removeSshHost,'), 'useOmpRpc must export removeSshHost');

    // OpsModal integration
    assert.ok(opsModalContent.includes("<SshTab"), 'OpsModal.tsx must render SshTab');
    assert.ok(opsModalContent.includes("activeTab === 'ssh'"), 'OpsModal.tsx must switch to ssh tab');

    // SshTab component
    assert.ok(sshTabContent.includes('export const SshTab: React.FC<SshTabProps>'), 'SshTab must export SshTab');
  });

  // Test 9: i18n parity check for SSH keys
  test('SSH i18n keys are synchronized between vi and en', () => {
    const sshKeys = Object.keys(vi).filter((k) => k.startsWith('ops.ssh.') || k === 'ops.tab.ssh');
    assert.ok(sshKeys.length >= 30, `Must have at least 30 SSH i18n keys, found ${sshKeys.length}`);

    for (const key of sshKeys) {
      assert.ok(vi[key], `vi dictionary missing key ${key}`);
      assert.ok(en[key], `en dictionary missing key ${key}`);
    }
  });

  console.log(`\n====================================================`);
  console.log(`SSH Hosts Verification: ${passCount} passed, 0 failed.`);
  console.log(`====================================================\n`);
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore tmp dir cleanup error
  }
}
