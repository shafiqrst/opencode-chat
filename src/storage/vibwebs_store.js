import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * VibWebs Storage Engine
 * Manages VibWebs native project registry, conversation transcripts (transcript.jsonl),
 * and checkpoints independently, modeled after enterprise AI agent backend architecture.
 */
export class VibWebsStore {
  constructor(customBaseDir = null) {
    this.baseDir = customBaseDir || path.join(os.homedir(), '.vibwebs');
    this.brainDir = path.join(this.baseDir, 'brain');
    this.projectsFile = path.join(this.baseDir, 'projects.json');
    this.indexFile = path.join(this.baseDir, 'conversations_index.json');

    this.ensureDirectories();
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
      if (!fs.existsSync(this.brainDir)) fs.mkdirSync(this.brainDir, { recursive: true });
    } catch (err) {
      console.error('Failed to initialize VibWebs storage directories:', err);
    }
  }

  // --- PROJECTS MANAGEMENT ---

  getProjects() {
    try {
      if (fs.existsSync(this.projectsFile)) {
        return JSON.parse(fs.readFileSync(this.projectsFile, 'utf8'));
      }
    } catch {}
    return [];
  }

  registerProject(workspacePath) {
    if (!workspacePath) return null;
    const normPath = path.resolve(workspacePath);
    const projectName = path.basename(normPath) || normPath;
    const projects = this.getProjects();

    let existing = projects.find(p => path.resolve(p.path).toLowerCase() === normPath.toLowerCase());
    if (!existing) {
      existing = {
        name: projectName,
        path: normPath,
        createdAt: Date.now(),
        lastOpened: Date.now()
      };
      projects.unshift(existing);
    } else {
      existing.lastOpened = Date.now();
    }

    try {
      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save projects registry:', err);
    }

    return existing;
  }

  removeProject(workspacePath) {
    const normPath = path.resolve(workspacePath).toLowerCase();
    const projects = this.getProjects().filter(p => path.resolve(p.path).toLowerCase() !== normPath);
    try {
      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2), 'utf8');
    } catch {}
    return projects;
  }

  // --- CONVERSATIONS INDEX ---

  getConversationsIndex() {
    try {
      if (fs.existsSync(this.indexFile)) {
        return JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      }
    } catch {}
    return [];
  }

  saveConversationsIndex(index) {
    try {
      fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save conversations index:', err);
    }
  }

  getConversationsForWorkspace(workspacePath) {
    if (!workspacePath) return [];
    const normPath = path.resolve(workspacePath).toLowerCase();
    const all = this.getConversationsIndex();
    return all.filter(c => path.resolve(c.workspaceRoot).toLowerCase() === normPath)
              .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  // --- CONVERSATION TRANSCRIPT & TURNS ---

  getConversationDir(conversationId) {
    const dir = path.join(this.brainDir, conversationId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getTranscriptPath(conversationId) {
    return path.join(this.getConversationDir(conversationId), 'transcript.jsonl');
  }

  getMetadataPath(conversationId) {
    return path.join(this.getConversationDir(conversationId), 'metadata.json');
  }

  createConversation({ workspaceRoot, title = 'New Conversation', model = null }) {
    const id = 'vib_' + crypto.randomUUID();
    const normWorkspace = path.resolve(workspaceRoot);
    const projectName = path.basename(normWorkspace) || normWorkspace;
    const now = Date.now();

    const meta = {
      id,
      workspaceRoot: normWorkspace,
      projectName,
      title,
      model,
      createdAt: now,
      updatedAt: now,
      turnsCount: 0
    };

    // 1. Write metadata
    fs.writeFileSync(this.getMetadataPath(id), JSON.stringify(meta, null, 2), 'utf8');

    // 2. Touch transcript.jsonl
    fs.writeFileSync(this.getTranscriptPath(id), '', 'utf8');

    // 3. Update conversations index
    const index = this.getConversationsIndex();
    index.unshift(meta);
    this.saveConversationsIndex(index);

    // 4. Ensure project is registered
    this.registerProject(normWorkspace);

    return meta;
  }

  appendTurn(conversationId, turnObj) {
    const transcriptPath = this.getTranscriptPath(conversationId);
    const entry = {
      step_index: Date.now(),
      created_at: new Date().toISOString(),
      ...turnObj
    };

    fs.appendFileSync(transcriptPath, JSON.stringify(entry) + '\n', 'utf8');

    // Update conversation metadata & index
    const metaPath = this.getMetadataPath(conversationId);
    let meta = null;
    try {
      if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch {}

    if (!meta) {
      meta = {
        id: conversationId,
        workspaceRoot: process.cwd(),
        title: turnObj.role === 'user' ? turnObj.content.slice(0, 45).trim() : 'Conversation',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        turnsCount: 0
      };
    }

    meta.updatedAt = Date.now();
    meta.turnsCount = (meta.turnsCount || 0) + 1;

    // Auto-generate title from first user message if still default
    if (turnObj.type === 'USER_INPUT' || turnObj.role === 'user') {
      const text = (turnObj.content || '').replace(/<[^>]+>/g, '').trim();
      if (text && (!meta.title || meta.title === 'New Conversation' || meta.title === 'Conversation')) {
        meta.title = text.slice(0, 50).trim();
      }
    }

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    // Update in index
    const index = this.getConversationsIndex();
    const idx = index.findIndex(c => c.id === conversationId);
    if (idx !== -1) {
      index[idx] = { ...index[idx], ...meta };
    } else {
      index.unshift(meta);
    }
    this.saveConversationsIndex(index);

    return meta;
  }

  getConversationMessages(conversationId) {
    const transcriptPath = this.getTranscriptPath(conversationId);
    if (!fs.existsSync(transcriptPath)) return [];

    try {
      const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n').filter(Boolean);
      const messages = [];

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.role && obj.content) {
            messages.push({
              role: obj.role,
              content: obj.content,
              timestamp: obj.timestamp || (obj.created_at ? new Date(obj.created_at).getTime() : Date.now())
            });
          } else if (obj.type === 'USER_INPUT' && obj.content) {
            messages.push({
              role: 'user',
              content: obj.content,
              timestamp: obj.created_at ? new Date(obj.created_at).getTime() : Date.now()
            });
          } else if (obj.type === 'PLANNER_RESPONSE' && obj.content) {
            messages.push({
              role: 'assistant',
              content: obj.content,
              timestamp: obj.created_at ? new Date(obj.created_at).getTime() : Date.now()
            });
          }
        } catch {}
      }

      return messages;
    } catch (err) {
      console.error(`Failed to read transcript for ${conversationId}:`, err);
      return [];
    }
  }

  getEnrichedProjectsTree(activeWorkspaceRoot) {
    const projects = this.getProjects();
    const index = this.getConversationsIndex();

    // Ensure active workspace is included
    if (activeWorkspaceRoot) {
      const normActive = path.resolve(activeWorkspaceRoot);
      if (!projects.some(p => path.resolve(p.path).toLowerCase() === normActive.toLowerCase())) {
        projects.unshift({
          name: path.basename(normActive) || normActive,
          path: normActive,
          createdAt: Date.now(),
          lastOpened: Date.now()
        });
      }
    }

    return projects.map(p => {
      const pNorm = path.resolve(p.path).toLowerCase();
      const convos = index.filter(c => path.resolve(c.workspaceRoot).toLowerCase() === pNorm)
                          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      return {
        name: p.name,
        path: p.path,
        lastOpened: p.lastOpened,
        conversations: convos.map(c => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
          turnsCount: c.turnsCount
        }))
      };
    });
  }
}
