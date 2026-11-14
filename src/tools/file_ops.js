import fs from 'fs';
import path from 'path';

export class FileOperations {
  constructor(workspaceRoot, guardrail, checkpointManager, sshManager = null) {
    this.workspaceRoot = workspaceRoot ? (workspaceRoot.startsWith('ssh://') ? workspaceRoot : path.resolve(workspaceRoot)) : process.cwd();
    this.guardrail = guardrail;
    this.checkpointManager = checkpointManager;
    this.sshManager = sshManager;
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

  resolve(p) {
    if (this.isRemote()) {
      return p.startsWith('/') ? p : `/${p}`;
    }
    return path.resolve(this.workspaceRoot, p);
  }

  readFile(filePath, startLine = 1, endLine = null) {
    const check = this.guardrail.isPathAllowed(filePath);
    if (!check.safe) return `[SECURITY ERROR] ${check.reason}`;

    if (this.isRemote() && this.sshManager && this.sshManager.isConnected) {
      return (async () => {
        try {
          const content = await this.sshManager.readFile(filePath);
          const lines = content.split('\n');
          const total = lines.length;
          const start = Math.max(1, parseInt(startLine, 10) || 1);
          const end = endLine ? Math.min(total, parseInt(endLine, 10)) : Math.min(total, start + 799);
          const sliced = lines.slice(start - 1, end);
          const numbered = sliced.map((line, idx) => `${start + idx} | ${line}`).join('\n');
          return `[REMOTE FILE: ${filePath} (lines ${start}-${end} of ${total})]\n${numbered}`;
        } catch (err) {
          return `[ERROR] Remote read failed: ${err.message}`;
        }
      })();
    }

    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return `[ERROR] File "${filePath}" does not exist.`;
    }

    try {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        return `[ERROR] "${filePath}" is a directory. Use list_dir instead.`;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const total = lines.length;

      const start = Math.max(1, parseInt(startLine, 10) || 1);
      const end = endLine ? Math.min(total, parseInt(endLine, 10)) : Math.min(total, start + 799);

      const sliced = lines.slice(start - 1, end);
      const numbered = sliced.map((line, idx) => `${start + idx} | ${line}`).join('\n');

      return `[FILE: ${filePath} (lines ${start}-${end} of ${total})]\n${numbered}`;
    } catch (err) {
      return `[ERROR] Reading file: ${err.message}`;
    }
  }

  writeFile(filePath, content) {
    const check = this.guardrail.isPathAllowed(filePath);
    if (!check.safe) return `[SECURITY ERROR] ${check.reason}`;

    if (this.isRemote() && this.sshManager && this.sshManager.isConnected) {
      return (async () => {
        try {
          await this.sshManager.writeFile(filePath, content);
          const lines = content.split('\n').length;
          return `[REMOTE SUCCESS] Wrote ${lines} lines to remote "${filePath}".`;
        } catch (err) {
          return `[ERROR] Remote write failed: ${err.message}`;
        }
      })();
    }

    const fullPath = this.resolve(filePath);
    try {
      this.checkpointManager.recordPreModification(fullPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf8');
      const lines = content.split('\n').length;
      return `[SUCCESS] Wrote ${lines} lines to "${filePath}".`;
    } catch (err) {
      return `[ERROR] Writing file: ${err.message}`;
    }
  }

  editFile(filePath, target, replacement) {
    const check = this.guardrail.isPathAllowed(filePath);
    if (!check.safe) return `[SECURITY ERROR] ${check.reason}`;

    if (this.isRemote() && this.sshManager && this.sshManager.isConnected) {
      return (async () => {
        try {
          const original = await this.sshManager.readFile(filePath);
          if (original.includes(target)) {
            const updated = original.replace(target, replacement);
            await this.sshManager.writeFile(filePath, updated);
            return `[REMOTE SUCCESS] Exact match replaced in remote "${filePath}".`;
          }
          const normOrig = original.replace(/\r\n/g, '\n');
          const normTarget = target.replace(/\r\n/g, '\n');
          if (normOrig.includes(normTarget)) {
            const normRepl = replacement.replace(/\r\n/g, '\n');
            const updated = normOrig.replace(normTarget, normRepl);
            await this.sshManager.writeFile(filePath, updated);
            return `[REMOTE SUCCESS] Replaced in remote "${filePath}" (normalized line-endings).`;
          }
          return `[ERROR] Target string not found in remote "${filePath}".`;
        } catch (err) {
          return `[ERROR] Remote edit failed: ${err.message}`;
        }
      })();
    }

    const fullPath = this.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      return `[ERROR] Cannot edit non-existent file "${filePath}". Use write_file to create it.`;
    }

    try {
      const original = fs.readFileSync(fullPath, 'utf8');

      // 1. Try exact match
      if (original.includes(target)) {
        this.checkpointManager.recordPreModification(fullPath);
        const updated = original.replace(target, replacement);
        fs.writeFileSync(fullPath, updated, 'utf8');
        return `[SUCCESS] Exact match replaced in "${filePath}".`;
      }

      // 2. Try normalized CRLF / LF match
      const normOrig = original.replace(/\r\n/g, '\n');
      const normTarget = target.replace(/\r\n/g, '\n');
      if (normOrig.includes(normTarget)) {
        this.checkpointManager.recordPreModification(fullPath);
        const normRepl = replacement.replace(/\r\n/g, '\n');
        const updated = normOrig.replace(normTarget, normRepl);
        fs.writeFileSync(fullPath, updated, 'utf8');
        return `[SUCCESS] Replaced in "${filePath}" (normalized line-endings).`;
      }

      // 3. Fallback: Trimmed line matching
      const targetLines = normTarget.trim().split('\n').map(l => l.trim());
      const origLines = normOrig.split('\n');

      let matchStartIndex = -1;
      for (let i = 0; i <= origLines.length - targetLines.length; i++) {
        let allMatch = true;
        for (let j = 0; j < targetLines.length; j++) {
          if (origLines[i + j].trim() !== targetLines[j]) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          matchStartIndex = i;
          break;
        }
      }

      if (matchStartIndex !== -1) {
        this.checkpointManager.recordPreModification(fullPath);
        origLines.splice(matchStartIndex, targetLines.length, replacement);
        fs.writeFileSync(fullPath, origLines.join('\n'), 'utf8');
        return `[SUCCESS] Replaced in "${filePath}" (fuzzy line match).`;
      }

      return `[ERROR] Target snippet not found in "${filePath}". Please verify the snippet using read_file.`;
    } catch (err) {
      return `[ERROR] Editing file: ${err.message}`;
    }
  }

  listDir(dirPath = '.', maxDepth = 2) {
    if (this.isRemote() && this.sshManager && this.sshManager.isConnected) {
      return (async () => {
        try {
          const entries = await this.sshManager.listDir(dirPath === '.' ? null : dirPath);
          return `[REMOTE DIRECTORY: ${dirPath}]\n` + entries.map(e => `${e.isDirectory ? '📁 ' : '📄 '}${e.name}`).join('\n');
        } catch (err) {
          return `[ERROR] Remote listing failed: ${err.message}`;
        }
      })();
    }
    const fullPath = this.resolve(dirPath);
    if (!fs.existsSync(fullPath)) {
      return `[ERROR] Directory "${dirPath}" does not exist.`;
    }

    try {
      const results = [];
      const scan = (current, depth) => {
        if (depth > maxDepth) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.kiln') {
            continue;
          }
          const rel = path.relative(this.workspaceRoot, path.join(current, entry.name));
          if (entry.isDirectory()) {
            results.push(`📁 ${rel}/`);
            scan(path.join(current, entry.name), depth + 1);
          } else {
            results.push(`📄 ${rel}`);
          }
        }
      };

      scan(fullPath, 1);
      return results.length > 0 ? results.join('\n') : '(empty directory)';
    } catch (err) {
      return `[ERROR] Listing directory: ${err.message}`;
    }
  }

  searchFiles(query, dirPath = '.') {
    const fullPath = this.resolve(dirPath);
    if (!fs.existsSync(fullPath)) {
      return `[ERROR] Directory "${dirPath}" does not exist.`;
    }

    try {
      const matches = [];
      const search = (current) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.kiln') {
            continue;
          }
          const p = path.join(current, entry.name);
          if (entry.isDirectory()) {
            search(p);
          } else {
            const check = this.guardrail.isPathAllowed(p);
            if (!check.safe) continue;
            try {
              const text = fs.readFileSync(p, 'utf8');
              const lines = text.split('\n');
              lines.forEach((l, idx) => {
                if (l.toLowerCase().includes(query.toLowerCase())) {
                  const rel = path.relative(this.workspaceRoot, p);
                  matches.push(`${rel}:${idx + 1}: ${l.trim()}`);
                }
              });
            } catch {
              // skip binary or unreadable files
            }
          }
        }
      };

      search(fullPath);
      if (matches.length === 0) return `No matches found for "${query}".`;
      return matches.slice(0, 100).join('\n') + (matches.length > 100 ? `\n... [${matches.length - 100} more matches]` : '');
    } catch (err) {
      return `[ERROR] Search failed: ${err.message}`;
    }
  }
}
