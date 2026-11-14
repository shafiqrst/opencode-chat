import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { VibWebsStore } from '../storage/vibwebs_store.js';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export class WebStudioServer {
  constructor({ workspaceRoot, agent, router, shellOps, checkpointManager, guardrail, port = 3000 }) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.agent = agent;
    this.router = router;
    this.shellOps = shellOps;
    this.checkpointManager = checkpointManager;
    this.guardrail = guardrail;
    this.port = port;
    this.publicDir = path.join(path.resolve(process.cwd()), 'public');
    this.pendingConfirmations = new Map(); // confirmId -> resolve callback
    this.wss = null;
    this.server = null;

    // Dedicated Native VibWebs Storage Engine
    this.store = new VibWebsStore();
    this.store.registerProject(this.workspaceRoot);

    const convos = this.store.getConversationsForWorkspace(this.workspaceRoot);
    if (convos.length > 0) {
      this.activeConversationId = convos[0].id;
    } else {
      const initConvo = this.store.createConversation({
        workspaceRoot: this.workspaceRoot,
        title: 'VibWebs Assistant'
      });
      this.activeConversationId = initConvo.id;
    }
  }

  getActiveMessages() {
    return this.store.getConversationMessages(this.activeConversationId);
  }

  getConversationsForWorkspace(wsRoot) {
    return this.store.getConversationsForWorkspace(wsRoot);
  }

  saveMessageToActiveConvo(msgObj) {
    return this.store.appendTurn(this.activeConversationId, msgObj);
  }

  loadProjectsList() {
    return this.store.getEnrichedProjectsTree(this.workspaceRoot);
  }

  requestConfirmation(command) {
    return new Promise((resolve) => {
      const confirmId = 'confirm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      
      const timer = setTimeout(() => {
        if (this.pendingConfirmations.has(confirmId)) {
          console.log(`Confirmation for command "${command}" timed out after 60s, rejecting.`);
          this.pendingConfirmations.delete(confirmId);
          this.broadcast({ type: 'confirm_closed', confirmId, approved: false });
          resolve(false);
        }
      }, 60000);

      this.pendingConfirmations.set(confirmId, (approved) => {
        clearTimeout(timer);
        resolve(approved);
      });

      this.broadcast({
        type: 'confirm_prompt',
        command,
        confirmId
      });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      // 1. Hook into shellOps confirmation callback
      this.shellOps.confirmCallback = (command) => this.requestConfirmation(command);

      // 2. Hook into router failover alert callback
      const originalFailover = this.router.onFailoverCallback;
      this.router.onFailoverCallback = (info) => {
        if (originalFailover) originalFailover(info);
        this.broadcast({
          type: 'failover_alert',
          ...info
        });
      };

      // 3. Create HTTP server
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // 4. Attach WebSocket Server
      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', (ws) => {
        // Send initial state
        ws.send(JSON.stringify({
          type: 'init',
          executionMode: this.shellOps.executionMode,
          currentModel: this.router.getCurrentProvider()?.name,
          workspaceRoot: this.workspaceRoot,
          workspaceName: path.basename(this.workspaceRoot) || this.workspaceRoot,
          projects: this.store.getEnrichedProjectsTree(this.workspaceRoot),
          conversations: this.store.getConversationsForWorkspace(this.workspaceRoot),
          activeConversationId: this.activeConversationId,
          activeMessages: this.getActiveMessages(),
          providers: this.router.getActiveProviders()
        }));

        ws.on('message', async (message) => {
          try {
            const data = JSON.parse(message);
            await this.handleClientMessage(ws, data);
          } catch (err) {
            console.error('WS Error:', err);
          }
        });
      });

      const tryListen = (portToTry) => {
        this.port = portToTry;
        this.server.removeAllListeners('error');
        this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${this.port} is busy, auto-switching to port ${this.port + 1}...`);
            tryListen(this.port + 1);
          } else {
            reject(err);
          }
        });

        this.server.listen(this.port, () => {
          resolve(this.port);
        });
      };

      tryListen(this.port);
    });
  }

  broadcast(data) {
    if (!this.wss) return;
    const msg = JSON.stringify(data);
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(msg);
      }
    });
  }

  async handleClientMessage(ws, data) {
    if (data.type === 'confirm_response') {
      let resolver = this.pendingConfirmations.get(data.confirmId);
      if (!resolver && this.pendingConfirmations.size > 0) {
        const [firstKey, firstVal] = this.pendingConfirmations.entries().next().value;
        resolver = firstVal;
        this.pendingConfirmations.delete(firstKey);
      } else if (resolver) {
        this.pendingConfirmations.delete(data.confirmId);
      }
      if (resolver) {
        resolver(Boolean(data.approved));
      }
      this.broadcast({
        type: 'confirm_closed',
        confirmId: data.confirmId,
        approved: Boolean(data.approved)
      });
      return;
    }

    if (data.type === 'switch_model') {
      const p = this.router.setProviderByName(data.modelName || data.providerId);
      if (p) {
        this.broadcast({
          type: 'model_updated',
          currentModel: p.name,
          model: p.model,
          providerId: p.id
        });
      }
      return;
    }

    if (data.type === 'toggle_mode') {
      const nextMode = this.shellOps.executionMode === 'CONFIRM' ? 'AUTO' : 'CONFIRM';
      this.shellOps.setExecutionMode(nextMode);
      this.broadcast({ type: 'mode_update', mode: nextMode });
      return;
    }

    if (data.type === 'new_conversation') {
      const newConvo = this.store.createConversation({
        workspaceRoot: this.workspaceRoot,
        title: 'New Conversation',
        model: this.router.getCurrentProvider()?.name
      });
      this.activeConversationId = newConvo.id;
      this.agent.reset();
      this.broadcast({
        type: 'conversation_switched',
        conversationId: this.activeConversationId,
        title: 'New Conversation',
        workspaceRoot: this.workspaceRoot,
        messages: [],
        conversations: this.store.getConversationsForWorkspace(this.workspaceRoot),
        projects: this.store.getEnrichedProjectsTree(this.workspaceRoot)
      });
      return;
    }

    if (data.type === 'switch_conversation') {
      const convoId = data.conversationId;
      if (data.workspacePath && path.resolve(data.workspacePath).toLowerCase() !== path.resolve(this.workspaceRoot).toLowerCase()) {
        this.switchWorkspace(data.workspacePath);
      }
      this.activeConversationId = convoId;
      const messages = this.store.getConversationMessages(convoId);

      this.agent.reset();
      if (messages.length > 0) {
        this.agent.loadHistory(messages);
      }

      this.broadcast({
        type: 'conversation_switched',
        conversationId: this.activeConversationId,
        title: data.title || 'Conversation',
        workspaceRoot: this.workspaceRoot,
        messages,
        conversations: this.store.getConversationsForWorkspace(this.workspaceRoot),
        projects: this.store.getEnrichedProjectsTree(this.workspaceRoot)
      });
      return;
    }

    if (data.type === 'clear_context') {
      this.agent.reset();
      ws.send(JSON.stringify({ type: 'response', content: 'Conversation context cleared.' }));
      return;
    }

    if (data.type === 'user_prompt') {
      const prompt = data.content.trim();
      this.saveMessageToActiveConvo({ role: 'user', content: prompt, timestamp: Date.now() });

      // Handle slash commands
      if (prompt.startsWith('/undo')) {
        const res = this.checkpointManager.undoLastChange();
        this.broadcast({
          type: 'response',
          content: res.message,
          providerUsed: 'Kiln System'
        });
        this.broadcast({
          type: 'checkpoint_update',
          history: this.checkpointManager.history
        });
        return;
      }

      if (prompt.startsWith('/mode')) {
        const nextMode = this.shellOps.executionMode === 'CONFIRM' ? 'AUTO' : 'CONFIRM';
        this.shellOps.setExecutionMode(nextMode);
        this.broadcast({ type: 'mode_update', mode: nextMode });
        this.broadcast({ type: 'response', content: `Execution mode switched to: ${nextMode}`, providerUsed: 'Kiln System' });
        return;
      }

      if (prompt.startsWith('/models')) {
        const listStr = this.router.getActiveProviders()
          .map((p, i) => `${i + 1}. **${p.name}** (${p.model})`)
          .join('\n');
        this.broadcast({ type: 'response', content: `### Active Model Failover Priority:\n${listStr}`, providerUsed: 'Kiln System' });
        return;
      }

      if (prompt.startsWith('/clear')) {
        this.agent.reset();
        this.broadcast({ type: 'response', content: 'Conversation context reset.', providerUsed: 'Kiln System' });
        return;
      }

      // Normal Agent Execution Turn
      try {
        this.broadcast({
          type: 'agent_status',
          status: 'working',
          message: 'VibWebs AI is thinking...'
        });

        const originalStepCallback = this.agent.onStepUpdate;
        this.agent.onStepUpdate = (step) => {
          if (originalStepCallback) originalStepCallback(step);
          this.broadcast({ type: 'step', step });
          if (step.type === 'tool_call') {
            this.broadcast({
              type: 'agent_status',
              status: 'tool_running',
              tool: step.tool || step.name,
              args: step.args
            });
          }
        };

        const result = await this.agent.runTurn(prompt);

        this.broadcast({
          type: 'agent_status',
          status: 'idle'
        });

        this.saveMessageToActiveConvo({
          role: 'assistant',
          content: result.response,
          providerUsed: result.providerUsed,
          timestamp: Date.now()
        });

        this.broadcast({
          type: 'response',
          content: result.response,
          providerUsed: result.providerUsed
        });

        this.broadcast({
          type: 'conversations_list_updated',
          conversations: this.getConversationsForWorkspace(this.workspaceRoot)
        });

        this.broadcast({
          type: 'checkpoint_update',
          history: this.checkpointManager.history
        });
      } catch (err) {
        console.error('Agent execution error:', err);
        this.broadcast({
          type: 'agent_status',
          status: 'idle'
        });
        this.broadcast({
          type: 'error',
          message: err.message
        });
      }
    }
  }

  handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // API: Get conversation messages
    if (url.pathname === '/api/conversation' && req.method === 'GET') {
      const convoId = url.searchParams.get('id') || this.activeConversationId;
      const messages = this.store.getConversationMessages(convoId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        id: convoId,
        title: 'Conversation',
        messages
      }));
    }

    // API: Get projects list
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        activeWorkspace: this.workspaceRoot,
        projects: this.store.getEnrichedProjectsTree(this.workspaceRoot)
      }));
    }

    // API: Remove project from list
    if (url.pathname === '/api/projects/remove' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { path: pPath } = JSON.parse(body);
          this.store.removeProject(pPath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, projects: this.store.getEnrichedProjectsTree(this.workspaceRoot) }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: System Drives and Folders Browser (Navigate anywhere in computer)
    if (url.pathname === '/api/browse-folders' && req.method === 'GET') {
      const targetDir = url.searchParams.get('dir');
      try {
        // If no directory specified, return root computer drives (C:\, D:\, etc.)
        if (!targetDir) {
          const drives = [];
          for (let i = 67; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const driveRoot = `${letter}:\\`;
            try {
              if (fs.existsSync(driveRoot)) {
                drives.push({
                  name: `Local Disk (${letter}:)`,
                  path: driveRoot,
                  isDrive: true
                });
              }
            } catch {}
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            currentDir: '',
            parentDir: null,
            folders: drives
          }));
        }

        // List folders inside targetDir
        const resolved = path.resolve(targetDir);
        if (!fs.existsSync(resolved)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `Directory not found: ${targetDir}` }));
        }

        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const folders = [];
        for (const entry of entries) {
          // Skip hidden system / recycle bin folders
          if (entry.name.startsWith('$') || entry.name.startsWith('.')) continue;
          if (entry.isDirectory()) {
            folders.push({
              name: entry.name,
              path: path.join(resolved, entry.name),
              isDrive: false
            });
          }
        }

        folders.sort((a, b) => a.name.localeCompare(b.name));

        const parent = path.dirname(resolved);
        const parentDir = parent && parent !== resolved ? parent : null;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          currentDir: resolved,
          parentDir,
          folders
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // API: Switch or set active workspace root directory
    if (url.pathname === '/api/workspace' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { path: newPath } = JSON.parse(body);
          if (!newPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing path' }));
          }
          const updated = this.switchWorkspace(newPath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, workspaceRoot: updated, workspaceName: path.basename(updated) || updated }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: Get current workspace
    if (url.pathname === '/api/workspace' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        workspaceRoot: this.workspaceRoot,
        workspaceName: path.basename(this.workspaceRoot) || this.workspaceRoot
      }));
    }

    // API: List files as hierarchical tree
    if (url.pathname === '/api/files') {
      const getTree = (dir, depth = 0) => {
        if (depth > 4) return [];
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const items = [];
          for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.kiln') continue;
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(this.workspaceRoot, fullPath);
            if (entry.isDirectory()) {
              items.push({
                name: entry.name,
                path: relPath,
                type: 'directory',
                children: getTree(fullPath, depth + 1)
              });
            } else {
              items.push({
                name: entry.name,
                path: relPath,
                type: 'file'
              });
            }
          }
          return items.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
          });
        } catch {
          return [];
        }
      };

      const tree = getTree(this.workspaceRoot);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ tree }));
    }

    // API: Preview file
    if (url.pathname === '/api/file') {
      const targetPath = url.searchParams.get('path');
      if (!targetPath) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Missing path' }));
      }
      const check = this.guardrail.isPathAllowed(targetPath);
      if (!check.safe) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: check.reason }));
      }
      try {
        const full = path.resolve(this.workspaceRoot, targetPath);
        const content = fs.readFileSync(full, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ content: content.slice(0, 10000) }));
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // API: Create new file or folder
    if (url.pathname === '/api/create' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { path: targetPath, type = 'file' } = JSON.parse(body);
          if (!targetPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing path' }));
          }

          const check = this.guardrail.isPathAllowed(targetPath);
          if (!check.safe) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: check.reason }));
          }

          const full = path.resolve(this.workspaceRoot, targetPath);
          if (type === 'directory') {
            fs.mkdirSync(full, { recursive: true });
          } else {
            const dir = path.dirname(full);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (!fs.existsSync(full)) fs.writeFileSync(full, '', 'utf8');
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, path: targetPath }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: Save/Update file
    if (url.pathname === '/api/file' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { path: targetPath, content } = JSON.parse(body);
          if (!targetPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing path' }));
          }

          const check = this.guardrail.isPathAllowed(targetPath);
          if (!check.safe) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: check.reason }));
          }

          const full = path.resolve(this.workspaceRoot, targetPath);
          this.checkpointManager.recordChange(targetPath, 'modify');
          fs.writeFileSync(full, content, 'utf8');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Static Assets
    let filePath = path.join(this.publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(500);
          res.end('Server Error: ' + err.code);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  }

  switchWorkspace(newRoot) {
    const resolved = path.resolve(newRoot);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    this.workspaceRoot = resolved;
    this.guardrail.setWorkspaceRoot(resolved);
    this.shellOps.setWorkspaceRoot(resolved);
    this.checkpointManager.setWorkspaceRoot(resolved);
    if (this.agent) {
      if (typeof this.agent.setWorkspaceRoot === 'function') {
        this.agent.setWorkspaceRoot(resolved);
      }
      if (this.agent.toolRegistry && this.agent.toolRegistry.fileOps) {
        this.agent.toolRegistry.fileOps.setWorkspaceRoot(resolved);
      }
    }

    this.store.registerProject(resolved);
    const convos = this.store.getConversationsForWorkspace(resolved);
    if (convos.length > 0) {
      this.activeConversationId = convos[0].id;
    } else {
      const newConvo = this.store.createConversation({
        workspaceRoot: resolved,
        title: 'New Conversation'
      });
      this.activeConversationId = newConvo.id;
    }

    const messages = this.store.getConversationMessages(this.activeConversationId);
    this.agent.reset();
    if (messages.length > 0) {
      this.agent.loadHistory(messages);
    }

    this.broadcast({
      type: 'workspace_changed',
      workspaceRoot: this.workspaceRoot,
      workspaceName: path.basename(this.workspaceRoot) || this.workspaceRoot,
      projects: this.store.getEnrichedProjectsTree(this.workspaceRoot),
      conversations: this.store.getConversationsForWorkspace(this.workspaceRoot),
      activeConversationId: this.activeConversationId,
      messages
    });
    return this.workspaceRoot;
  }

  stop() {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close();
      }
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
