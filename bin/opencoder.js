#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecurityGuardrail } from '../src/security/guardrail.js';
import { CheckpointManager } from '../src/tools/checkpoint.js';
import { FileOperations } from '../src/tools/file_ops.js';
import { ShellOperations } from '../src/tools/shell_ops.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { ModelRouter } from '../src/providers/router.js';
import { AgentLoop } from '../src/agent/loop.js';
import { TerminalUI, C } from '../src/ui/cli.js';

// Load .env from workspace root
dotenv.config();

const workspaceRoot = process.cwd();
const args = process.argv.slice(2);
let initialMode = process.env.EXECUTION_MODE || (args.includes('--auto') ? 'AUTO' : 'CONFIRM');

async function main() {
  const ui = new TerminalUI();
  const guardrail = new SecurityGuardrail(workspaceRoot);
  const checkpointManager = new CheckpointManager(workspaceRoot);
  const fileOps = new FileOperations(workspaceRoot, guardrail, checkpointManager);

  const shellOps = new ShellOperations(workspaceRoot, guardrail, {
    executionMode: initialMode,
    confirmCallback: async (cmd) => await ui.promptConfirmation(cmd)
  });

  const toolRegistry = new ToolRegistry(fileOps, shellOps);

  const router = new ModelRouter({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    onFailover: (info) => ui.printFailoverAlert(info)
  });

  const agent = new AgentLoop({
    router,
    toolRegistry,
    guardrail,
    workspaceRoot,
    onStepUpdate: (step) => ui.printStep(step)
  });

  ui.printBanner(router.getActiveProviders(), shellOps.executionMode);

  while (true) {
    const input = await ui.promptUser();

    if (!input) continue;

    // Handle slash commands
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '/exit' || cmd === '/quit') {
        console.log(`\n${C.green}Goodbye!${C.reset}\n`);
        ui.close();
        process.exit(0);
      }

      if (cmd === '/undo') {
        const res = checkpointManager.undoLastChange();
        console.log(`\n${res.success ? C.green : C.red}${res.message}${C.reset}\n`);
        continue;
      }

      if (cmd === '/mode') {
        const nextMode = shellOps.executionMode === 'CONFIRM' ? 'AUTO' : 'CONFIRM';
        shellOps.setExecutionMode(nextMode);
        console.log(`\n${C.yellow}Execution mode switched to: ${C.bold}${nextMode}${C.reset}\n`);
        continue;
      }

      if (cmd === '/clear') {
        agent.reset();
        console.log(`\n${C.green}Conversation context reset.${C.reset}\n`);
        continue;
      }

      if (cmd === '/history') {
        console.log(`\n${C.cyan}Total undo checkpoints recorded: ${checkpointManager.getHistoryCount()}${C.reset}\n`);
        continue;
      }

      if (cmd === '/models') {
        console.log(`\n${C.bold}Active Failover Provider Order:${C.reset}`);
        router.getActiveProviders().forEach((p, i) => {
          const inCooldown = router.isProviderInCooldown(p);
          const remaining = router.getCooldownRemainingSeconds(p);
          const statusStr = inCooldown
            ? `${C.yellow}[Rate-Limited: resets in ${remaining}s]${C.reset}`
            : `${C.green}[Ready]${C.reset}`;
          console.log(`  ${i + 1}. ${p.name} (${p.model}) - ${statusStr}`);
        });
        console.log('');
        continue;
      }

      if (cmd === '/help') {
        console.log(`\n${C.bold}Available Commands:${C.reset}`);
        console.log(`  ${C.cyan}/undo${C.reset}    - Revert the last file change made by the agent`);
        console.log(`  ${C.cyan}/mode${C.reset}    - Toggle between CONFIRM (safe prompt) and AUTO (fast execution)`);
        console.log(`  ${C.cyan}/models${C.reset}  - View active AI model providers and failover chain`);
        console.log(`  ${C.cyan}/history${C.reset} - View file modification checkpoints`);
        console.log(`  ${C.cyan}/clear${C.reset}   - Clear conversation context and start fresh`);
        console.log(`  ${C.cyan}/exit${C.reset}    - Exit Kiln Agent\n`);
        continue;
      }

      console.log(`\n${C.red}Unknown command: ${cmd}. Type /help for available options.${C.reset}\n`);
      continue;
    }

    try {
      const result = await agent.runTurn(input);
      ui.printResponse(result.response);
    } catch (err) {
      console.log(`\n${C.red}Error:${C.reset} ${err.message}\n`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal agent error:', err);
  process.exit(1);
});
