import path from 'path';

export class AgentLoop {
  constructor({ router, toolRegistry, guardrail, workspaceRoot, onStepUpdate }) {
    this.router = router;
    this.toolRegistry = toolRegistry;
    this.guardrail = guardrail;
    this.workspaceRoot = path.resolve(workspaceRoot || process.cwd());
    this.onStepUpdate = onStepUpdate || (() => {});
    this.messages = [];
    this.reset();
  }

  setWorkspaceRoot(newRoot) {
    if (!newRoot) return;
    this.workspaceRoot = path.resolve(newRoot);
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0].content = this.getSystemPrompt();
    }
  }

  getSystemPrompt() {
    const ws = this.workspaceRoot;
    const projName = path.basename(ws) || ws;

    return `You are VibWebs AI, an elite autonomous software engineering assistant operating directly on the local filesystem.

ACTIVE PROJECT CONTEXT:
- Project Name: "${projName}"
- Absolute Workspace Path: "${ws}"

CORE BEHAVIOR RULES (ACTION OVER WORDS):
1. YOU ARE AN AUTONOMOUS CODING AGENT, NOT JUST A CONVERSATIONAL BOT:
   When the user asks you to "improve", "fix", "update", "create", "check", "start", or "integrate" anything in the folder or project, you MUST NOT respond with purely theoretical essays, tutorials, or generic advice.
   You MUST invoke your available tools ('list_dir', 'read_file', 'edit_file', 'write_file', 'run_command', 'search_files') to inspect the actual code on disk, plan the concrete changes, edit or create the files, and execute verification commands.

2. EFFICIENCY & LOOP PREVENTION (CRITICAL):
   - NEVER call 'list_dir' repeatedly on the same path or directory you already listed in previous steps. Once you see the files in a folder, proceed directly to reading ('read_file') or modifying ('edit_file'/'write_file') the target files.
   - Do not loop through infinite discovery calls. Gather what you need in 1-3 tool calls, make the necessary file updates, run tests/verification with 'run_command', and then present your final answer.
   - Once your intended file edits or verification tasks are complete, DO NOT invoke unnecessary extra tools. Immediately return a concise, clear final message summarizing the work done.

3. ABSOLUTE GROUNDING & ZERO HALLUCINATION:
   - You are running inside "${ws}".
   - When asked "what is name of folder" or "which project is this", clearly state that the active project is "${projName}" at "${ws}".
   - When asked "list all files in folder", call 'list_dir' on "${ws}" to show the actual directory listing. Never make up or guess file names without inspecting first.

4. SAFETY & HYGIENE:
   - Never inspect or exfiltrate .env files, private SSH keys, or secrets.
   - Prefer surgical search-and-replace edits over full file rewrites.`;
  }

  reset() {
    this.messages = [
      { role: 'system', content: this.getSystemPrompt() }
    ];
  }

  loadHistory(messages) {
    const sysMsg = { role: 'system', content: this.getSystemPrompt() };
    if (Array.isArray(messages) && messages.length > 0) {
      // Filter out any prior system messages and ensure the grounded system prompt is always index 0
      const userAndAssistant = messages.filter(m => m.role !== 'system');
      this.messages = [sysMsg, ...userAndAssistant];
    } else {
      this.messages = [sysMsg];
    }
  }

  getMessages() {
    return this.messages;
  }

  async runTurn(userInput) {
    // Ensure system prompt is always at messages[0] with current workspace
    if (this.messages.length === 0 || this.messages[0].role !== 'system') {
      this.messages.unshift({ role: 'system', content: this.getSystemPrompt() });
    } else {
      this.messages[0].content = this.getSystemPrompt();
    }

    // 1. Sanitize user input
    const cleanInput = this.guardrail.redactSecrets(userInput);
    this.messages.push({ role: 'user', content: cleanInput });

    let isDone = false;
    let turnIterations = 0;
    const maxIterations = 25; // Prevents infinite loops
    let finalAssistantResponse = '';

    while (!isDone && turnIterations < maxIterations) {
      turnIterations++;

      this.onStepUpdate({
        type: 'thinking',
        iteration: turnIterations,
        provider: this.router.getCurrentProvider()?.name
      });

      // 2. Request completion from router with auto-failover
      const response = await this.router.chatCompletion({
        messages: this.messages,
        tools: this.toolRegistry.getDefinitions()
      });

      const assistantMsg = {
        role: 'assistant',
        content: response.content || null
      };

      if (response.tool_calls && response.tool_calls.length > 0) {
        assistantMsg.tool_calls = response.tool_calls;
      }

      this.messages.push(assistantMsg);

      // 3. Check if model invoked tools
      if (response.tool_calls && response.tool_calls.length > 0) {
        let repeatedCallsCount = 0;
        for (const call of response.tool_calls) {
          const fnName = call.function.name;
          let fnArgs = {};
          try {
            fnArgs = JSON.parse(call.function.arguments || '{}');
          } catch {
            fnArgs = {};
          }

          // Loop-detection: Check if identical tool call was made in the previous turn step
          const recentToolCalls = this.messages.filter(m => m.role === 'tool').slice(-3);
          const isIdenticalRepeat = recentToolCalls.some(m => m.name === fnName && m.content && (fnArgs.path && m.content.includes(path.basename(fnArgs.path))));
          if (fnName === 'list_dir' && isIdenticalRepeat) {
            repeatedCallsCount++;
          }

          this.onStepUpdate({
            type: 'tool_call',
            tool: fnName,
            name: fnName,
            args: fnArgs
          });

          // Execute tool
          let result;
          if (fnName === 'list_dir' && repeatedCallsCount >= 2) {
            result = `[Notice: Directory '${fnArgs.path || this.workspaceRoot}' was already listed in previous step. Do not call list_dir again; proceed to read_file or edit_file directly.]`;
          } else {
            result = await this.toolRegistry.execute(fnName, fnArgs);
          }

          // Scrub any secrets from tool result
          const cleanResult = this.guardrail.redactSecrets(String(result));

          this.onStepUpdate({
            type: 'tool_result',
            tool: fnName,
            name: fnName,
            outputSnippet: cleanResult.slice(0, 150),
            result: cleanResult
          });

          this.messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: fnName,
            content: cleanResult
          });
        }
      } else {
        // Model provided final text answer
        finalAssistantResponse = response.content;
        isDone = true;
      }

      // Compact context if conversation history grows too large
      this.compactContextIfNeeded();
    }

    if (!isDone && turnIterations >= maxIterations) {
      finalAssistantResponse += '\n\n[VibWebs Notice: Maximum turn step limit reached to prevent token budget overflow.]';
    }

    return {
      response: finalAssistantResponse,
      steps: turnIterations,
      providerUsed: this.router.getCurrentProvider()?.name
    };
  }

  compactContextIfNeeded() {
    // Keep context clean to avoid Groq's 7,000-8,000 token-per-minute ceiling:
    // If messages exceed 12 entries or tool output is large, trim older tool responses
    if (this.messages.length > 12) {
      for (let i = 1; i < this.messages.length - 4; i++) {
        if (this.messages[i].role === 'tool' && this.messages[i].content && this.messages[i].content.length > 250) {
          this.messages[i].content = this.messages[i].content.slice(0, 150) + '\n... [Older step output compressed to stay under rate limits] ...';
        }
      }
    }

    // If total message list exceeds 24 entries, keep system prompt + first user turn + last 12 entries
    if (this.messages.length > 24) {
      const sys = this.messages[0];
      const initialUser = this.messages.find((m, idx) => idx > 0 && m.role === 'user');
      const recent = this.messages.slice(-12);
      this.messages = [sys, initialUser, ...recent].filter(Boolean);
    }
  }
}
