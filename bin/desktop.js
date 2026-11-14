#!/usr/bin/env node

/**
 * VibWebs Studio Launcher
 * Starts server and launches standalone native desktop app window.
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

dotenv.config();

const workspaceRoot = process.cwd();
const BASE_PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  const guardrail = new SecurityGuardrail(workspaceRoot);
  const checkpointManager = new CheckpointManager(workspaceRoot);
  const fileOps = new FileOperations(workspaceRoot, guardrail, checkpointManager);

  let webServerInstance = null;

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
    port: BASE_PORT
  });

  try {
    const startedPort = await webServerInstance.start();
    const url = `http://localhost:${startedPort}`;

    console.log(`\n======================================================`);
    console.log(`  ⚡ VibWebs Studio Desktop is Running at: ${url}`);
    console.log(`  Port: ${startedPort} (Auto-allocated)`);
    console.log(`  Active Models : ${router.getActiveProviders().map(p => p.name).join(', ') || 'None (check .env)'}`);
    console.log(`======================================================\n`);

    // Launch in native App Mode (Edge, Chrome, or default browser)
    if (process.platform === 'win32') {
      const launchApp = `powershell -NoProfile -Command "Start-Process msedge -ArgumentList '--app=${url} --window-size=1440,900' -ErrorAction SilentlyContinue; if (!$?) { Start-Process chrome -ArgumentList '--app=${url} --window-size=1440,900' -ErrorAction SilentlyContinue } if (!$?) { Start-Process '${url}' }"`;
      exec(launchApp);
    } else if (process.platform === 'darwin') {
      exec(`open -a "Google Chrome" --args --app="${url}" || open "${url}"`);
    } else {
      exec(`google-chrome --app="${url}" || xdg-open "${url}"`);
    }

    const shutdown = async () => {
      console.log('\nShutting down VibWebs Studio Desktop...');
      await webServerInstance.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start VibWebs Studio Desktop:', err.message);
    process.exit(1);
  }
}

main();
