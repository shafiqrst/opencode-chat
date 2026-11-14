import { exec } from 'child_process';
import path from 'path';

export class ShellOperations {
  constructor(workspaceRoot, guardrail, options = {}) {
    this.workspaceRoot = typeof workspaceRoot === 'string' && workspaceRoot.startsWith('ssh://') ? workspaceRoot : path.resolve(workspaceRoot);
    this.guardrail = guardrail;
    this.executionMode = options.executionMode || 'CONFIRM'; // 'AUTO' or 'CONFIRM'
    this.confirmCallback = options.confirmCallback || null;
    this.sshManager = options.sshManager || null;
  }

  setWorkspaceRoot(newRoot) {
    if (typeof newRoot === 'string' && newRoot.startsWith('ssh://')) {
      this.workspaceRoot = newRoot;
    } else {
      this.workspaceRoot = path.resolve(newRoot);
    }
  }

  setSSHManager(sshManager) {
    this.sshManager = sshManager;
  }

  isRemote() {
    return (typeof this.workspaceRoot === 'string' && this.workspaceRoot.startsWith('ssh://')) ||
           (this.sshManager && this.sshManager.isConnected);
  }

  setExecutionMode(mode) {
    this.executionMode = mode;
  }

  async runCommand(command, workingDir = '.') {
    // 1. Guardrail validation
    const check = this.guardrail.isCommandAllowed(command);
    if (!check.safe) {
      return `[SECURITY REJECTED] ${check.reason}`;
    }

    // 2. Ask user for confirmation if in CONFIRM mode
    if (this.executionMode === 'CONFIRM' && this.confirmCallback) {
      const allowed = await this.confirmCallback(command);
      if (!allowed) {
        return `[CANCELLED] Execution denied by user: "${command}"`;
      }
    }

    // 3. Remote SSH Execution
    if (this.isRemote() && this.sshManager && this.sshManager.isConnected) {
      try {
        const res = await this.sshManager.runCommand(command, workingDir === '.' ? null : workingDir);
        let output = res.stdout;
        if (res.stderr) output += (output ? '\n[STDERR]\n' : '') + res.stderr;
        if (res.exitCode !== 0) output += `\n[REMOTE EXIT CODE ${res.exitCode}]`;
        return output || '[Remote command completed with no output]';
      } catch (err) {
        return `[ERROR] Remote command failed: ${err.message}`;
      }
    }

    const cwd = path.resolve(this.workspaceRoot, workingDir);

    return new Promise((resolve) => {
      const timeoutMs = 30000; // 30 second limit
      exec(command, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        let output = '';

        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n[STDERR]\n' : '') + stderr;

        if (error) {
          if (error.killed) {
            output += `\n[ERROR] Command timed out after ${timeoutMs / 1000} seconds.`;
          } else {
            output += `\n[EXIT CODE ${error.code || 1}] ${error.message}`;
          }
        }

        // Scrub sensitive tokens before returning to LLM
        output = this.guardrail.redactSecrets(output);

        // Truncate if output is excessively long (to save context budget)
        const lines = output.split('\n');
        if (lines.length > 150) {
          const truncated = lines.slice(0, 80).join('\n') +
            `\n... [TRUNCATED ${lines.length - 120} LINES] ...\n` +
            lines.slice(-40).join('\n');
          return resolve(truncated.trim() || '(command finished with no output)');
        }

        resolve(output.trim() || '(command finished with no output)');
      });
    });
  }
}
