#!/usr/bin/env node

/**
 * Kiln Web Studio Entry Point
 * Starts the local Web Studio server and launches your default browser.
 */

import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'node:child_process';
import { SecurityGuardrail } from '../src/security/guardrail.js';
import { CheckpointManager } from '../src/tools/checkpoint.js';
import { FileOperations } from '../src/tools/file_ops.js';
import { ShellOperations } from '../src/tools/shell_ops.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { ModelRouter } from '../src/providers/router.js';
import { AgentLoop } from '../src/agent/loop.js';
import { WebStudioServer } from '../src/ui/web_server.js';

// Load .env
dotenv.config();

const workspaceRoot = process.cwd();
const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const guardrail = new SecurityGuardrail(workspaceRoot);
  const checkpointManager = new CheckpointManager(workspaceRoot);
  const fileOps = new FileOperations(workspaceRoot, guardrail, checkpointManager);

  let webServerInstance = null;

  // Confirmation callback passes through the web server to the client's browser modal
  const shellOps = new ShellOperations(workspaceRoot, guardrail, {
    executionMode: 'CONFIRM',
    confirmCallback: async (command) => {
      if (webServerInstance) {
        return await webServerInstance.requestConfirmation(command);
      }
      return false;
    }
  });

  const toolRegistry = new ToolRegistry(fileOps, shellOps);

  const router = new ModelRouter({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
    FREELLMAPI_BASE_URL: process.env.FREELLMAPI_BASE_URL,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    onFailover: (info) => {
      if (webServerInstance) {
        webServerInstance.broadcast({ type: 'failover', info });
      }
    }
  });

  const agent = new AgentLoop({
    router,
    toolRegistry,
    guardrail,
    workspaceRoot,
    onStepUpdate: (step) => {
      if (webServerInstance) {
        webServerInstance.broadcast({ type: 'step', step });
      }
    }
  });

  webServerInstance = new WebStudioServer({
    workspaceRoot,
    agent,
    router,
    shellOps,
    checkpointManager,
    guardrail,
    port: PORT
  });

  try {
    const startedPort = await webServerInstance.start();
    const url = `http://localhost:${startedPort}`;

    console.log(`\n======================================================`);
    console.log(`  ⚡ VibWebs Studio is LIVE at: ${url}`);
    console.log(`  Active Models : ${router.getActiveProviders().map(p => p.name).join(', ') || 'None (check .env)'}`);
    console.log(`  UI Features   : Interactive Terminal, File & Folder Explorer,`);
    console.log(`                  Real-time Tool Execution, Human Confirmation Modal`);
    console.log(`======================================================\n`);

    // Auto-launch default browser
    const startCmd = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;

    exec(startCmd, (err) => {
      if (err) {
        console.log(`Tip: Open your browser at ${url}`);
      }
    });

    const shutdown = async () => {
      console.log('\nShutting down Kiln Web Studio...');
      await webServerInstance.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start Kiln Web Studio:', err.message);
    process.exit(1);
  }
}

main();
