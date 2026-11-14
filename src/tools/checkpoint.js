import fs from 'fs';
import path from 'path';

export class CheckpointManager {
  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.history = [];
    this.historyDir = path.join(this.workspaceRoot, '.kiln', 'history');
  }

  setWorkspaceRoot(newRoot) {
    this.workspaceRoot = path.resolve(newRoot);
    this.historyDir = path.join(this.workspaceRoot, '.kiln', 'history');
  }

  init() {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  /**
   * Save a snapshot of a file before modification.
   */
  recordPreModification(filePath) {
    this.init();
    const resolved = path.resolve(this.workspaceRoot, filePath);
    const exists = fs.existsSync(resolved);
    const content = exists ? fs.readFileSync(resolved, 'utf8') : null;

    const entry = {
      timestamp: Date.now(),
      filePath: resolved,
      relative: path.relative(this.workspaceRoot, resolved),
      existedBefore: exists,
      previousContent: content,
    };

    this.history.push(entry);
    return entry;
  }

  /**
   * Revert the most recent file change.
   */
  undoLastChange() {
    if (this.history.length === 0) {
      return { success: false, message: 'No recorded actions to undo.' };
    }

    const last = this.history.pop();
    try {
      if (!last.existedBefore) {
        if (fs.existsSync(last.filePath)) {
          fs.unlinkSync(last.filePath);
          return { success: true, message: `Reverted creation: deleted "${last.relative}".` };
        }
      } else {
        fs.writeFileSync(last.filePath, last.previousContent, 'utf8');
        return { success: true, message: `Reverted modification: restored "${last.relative}".` };
      }
    } catch (err) {
      return { success: false, message: `Failed to undo: ${err.message}` };
    }
    return { success: true, message: `Reverted "${last.relative}".` };
  }

  getHistoryCount() {
    return this.history.length;
  }
}
