import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { SecurityGuardrail } from '../src/security/guardrail.js';
import { CheckpointManager } from '../src/tools/checkpoint.js';
import { FileOperations } from '../src/tools/file_ops.js';
import { ShellOperations } from '../src/tools/shell_ops.js';
import { ModelRouter } from '../src/providers/router.js';
import { VibWebsStore } from '../src/storage/vibwebs_store.js';

const workspaceRoot = process.cwd();
const testDir = path.join(workspaceRoot, '.test_tmp');

async function runTests() {
  console.log('\n🧪 Running Kiln Test Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // Clean test dir
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const guardrail = new SecurityGuardrail(workspaceRoot);
  const checkpoint = new CheckpointManager(workspaceRoot);
  const fileOps = new FileOperations(workspaceRoot, guardrail, checkpoint);
  const shellOps = new ShellOperations(workspaceRoot, guardrail, { executionMode: 'AUTO' });

  // 1. Guardrail Tests
  test('Guardrail: Blocks reading .env files', () => {
    const res = guardrail.isPathAllowed('.env');
    assert.strictEqual(res.safe, false);
  });

  test('Guardrail: Blocks reading id_rsa keys', () => {
    const res = guardrail.isPathAllowed('id_rsa');
    assert.strictEqual(res.safe, false);
  });

  test('Guardrail: Allows normal code files', () => {
    const res = guardrail.isPathAllowed('src/index.js');
    assert.strictEqual(res.safe, true);
  });

  test('Guardrail: Redacts API keys from output', () => {
    const sensitive = 'Error with key sk-12345678901234567890abcdef and Bearer 123456789012345678901234567890';
    const scrubbed = guardrail.redactSecrets(sensitive);
    assert.ok(!scrubbed.includes('sk-12345678901234567890abcdef'));
    assert.ok(scrubbed.includes('[REDACTED_API_KEY]'));
  });

  test('Guardrail: Blocks dangerous shell commands', () => {
    const check1 = guardrail.isCommandAllowed('rm -rf /');
    assert.strictEqual(check1.safe, false);
    const check2 = guardrail.isCommandAllowed('del /s /q c:\\');
    assert.strictEqual(check2.safe, false);
  });

  // 2. File Operations Tests
  test('FileOps: write_file and read_file', () => {
    const p = '.test_tmp/sample.txt';
    const writeRes = fileOps.writeFile(p, 'line 1\nline 2\nline 3');
    assert.ok(writeRes.includes('[SUCCESS]'));

    const readRes = fileOps.readFile(p);
    assert.ok(readRes.includes('1 | line 1'));
    assert.ok(readRes.includes('3 | line 3'));
  });

  test('FileOps: edit_file surgical search & replace', () => {
    const p = '.test_tmp/sample.txt';
    const editRes = fileOps.editFile(p, 'line 2', 'line TWO modified');
    assert.ok(editRes.includes('[SUCCESS]'));

    const readRes = fileOps.readFile(p);
    assert.ok(readRes.includes('line TWO modified'));
    assert.ok(!readRes.includes('line 2\n'));
  });

  test('FileOps: edit_file fuzzy line matching with indentation differences', () => {
    const p = '.test_tmp/indent.js';
    fileOps.writeFile(p, 'function test() {\n    return 42;\n}');
    // Model passes snippet with 2 spaces instead of 4
    const editRes = fileOps.editFile(p, '  return 42;', '    return 100;');
    assert.ok(editRes.includes('[SUCCESS]'));

    const readRes = fileOps.readFile(p);
    assert.ok(readRes.includes('100'));
  });

  // 3. Checkpoint & Undo Tests
  test('Checkpoint: /undo restores modified file', () => {
    const p = '.test_tmp/undo_test.txt';
    fileOps.writeFile(p, 'ORIGINAL CONTENT');
    fileOps.editFile(p, 'ORIGINAL', 'MUTATED');

    const undoRes = checkpoint.undoLastChange();
    assert.ok(undoRes.success);

    const content = fs.readFileSync(path.resolve(workspaceRoot, p), 'utf8');
    assert.strictEqual(content, 'ORIGINAL CONTENT');
  });

  test('Checkpoint: /undo deletes newly created file', () => {
    const p = '.test_tmp/to_delete.txt';
    fileOps.writeFile(p, 'Brand new file');
    assert.ok(fs.existsSync(path.resolve(workspaceRoot, p)));

    const undoRes = checkpoint.undoLastChange();
    assert.ok(undoRes.success);
    assert.ok(!fs.existsSync(path.resolve(workspaceRoot, p)));
  });

  // 4. Shell Operations Tests
  await asyncTest('ShellOps: Runs safe commands and captures output', async () => {
    const out = await shellOps.runCommand('node -v');
    assert.ok(out.includes('v'));
  });

  // 5. Failover Router Tests
  test('Router: Correctly orders providers and prioritizes active providers', () => {
    const router = new ModelRouter({
      NVIDIA_API_KEY: 'test-nv-key',
      OPENROUTER_API_KEY: 'test-or-key',
      GROQ_API_KEY: 'test-groq-key'
    });
    const providers = router.getActiveProviders();
    assert.ok(providers.length >= 4);
    assert.strictEqual(providers[0].id, 'groq-qwen');
    assert.ok(providers.some(p => p.id === 'openrouter-nemotron'));
    assert.ok(providers.some(p => p.id === 'local-ollama'));
  });

  // 6. Native VibWebs Storage Engine Tests
  test('VibWebsStore: Registers and isolates projects independently', () => {
    const customTestStoreDir = path.join(testDir, 'test_vibwebs_store');
    const store = new VibWebsStore(customTestStoreDir);

    const proj = store.registerProject('D:\\test-vib-proj');
    assert.strictEqual(proj.name, 'test-vib-proj');
    const projects = store.getProjects();
    assert.strictEqual(projects.length, 1);
  });

  test('VibWebsStore: Appends sequential turns to transcript.jsonl and reads messages', () => {
    const customTestStoreDir = path.join(testDir, 'test_vibwebs_store');
    const store = new VibWebsStore(customTestStoreDir);

    const convo = store.createConversation({
      workspaceRoot: 'D:\\test-vib-proj',
      title: 'Initial Convo'
    });
    assert.ok(convo.id.startsWith('vib_'));

    store.appendTurn(convo.id, { role: 'user', content: 'Create a website' });
    store.appendTurn(convo.id, { role: 'assistant', content: 'Creating website now' });

    const messages = store.getConversationMessages(convo.id);
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].role, 'user');
    assert.strictEqual(messages[0].content, 'Create a website');
    assert.strictEqual(messages[1].role, 'assistant');
    assert.strictEqual(messages[1].content, 'Creating website now');

    const tree = store.getEnrichedProjectsTree('D:\\test-vib-proj');
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].conversations.length, 1);
  });

  // 7. AgentLoop Grounding and Workspace Isolation Test
  test('AgentLoop: Dynamically anchors to active workspace and updates on switch', async () => {
    const { AgentLoop } = await import('../src/agent/loop.js');
    const { ToolRegistry } = await import('../src/tools/registry.js');
    const router = new ModelRouter({});
    const toolRegistry = new ToolRegistry({ workspaceRoot: 'D:\\equality-share' });
    const agent = new AgentLoop({
      router,
      toolRegistry,
      guardrail,
      workspaceRoot: 'D:\\equality-share'
    });

    // Verify initial prompt anchors to equality-share
    const prompt1 = agent.getSystemPrompt();
    assert.ok(prompt1.includes('Project Name: "equality-share"'));
    assert.ok(prompt1.includes('Absolute Workspace Path: "D:\\equality-share"'));
    assert.ok(prompt1.includes('When asked "what is name of folder"'));

    // Switch workspace to another project
    agent.setWorkspaceRoot('D:\\opencode-vedio-etc');
    const prompt2 = agent.getSystemPrompt();
    assert.ok(prompt2.includes('Project Name: "opencode-vedio-etc"'));
    assert.ok(prompt2.includes('Absolute Workspace Path: "D:\\opencode-vedio-etc"'));
  });

  // 8. Conversation Retrieval API Test
  test('Storage: Correctly retrieves messages and metadata for conversation', () => {
    const store = new VibWebsStore(path.join(testDir, '.test_vibwebs'));
    const convo = store.createConversation({
      workspaceRoot: 'D:\\equality-share',
      title: 'UI UX improvements'
    });
    store.appendTurn(convo.id, { role: 'user', content: 'Improve my UI' });
    store.appendTurn(convo.id, { role: 'assistant', content: 'Here are the UI improvements' });

    const msgs = store.getConversationMessages(convo.id);
    assert.strictEqual(msgs.length, 2);
    assert.strictEqual(msgs[0].content, 'Improve my UI');
    assert.strictEqual(msgs[1].content, 'Here are the UI improvements');

    const index = store.getConversationsIndex();
    const meta = index.find(c => c.id === convo.id);
    assert.strictEqual(meta.title, 'UI UX improvements');
    assert.strictEqual(meta.workspaceRoot, 'D:\\equality-share');
  });

  // Clean test dir
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log(`\n========================================`);
  console.log(`Tests Completed: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
