import { AGENT_TOOLS } from './definitions.js';

export class ToolRegistry {
  constructor(fileOps, shellOps) {
    this.fileOps = fileOps;
    this.shellOps = shellOps;
  }

  getDefinitions() {
    return AGENT_TOOLS;
  }

  async execute(name, args) {
    try {
      switch (name) {
        case 'read_file':
          return this.fileOps.readFile(args.path, args.start_line, args.end_line);

        case 'write_file':
          return this.fileOps.writeFile(args.path, args.content);

        case 'edit_file':
          return this.fileOps.editFile(args.path, args.target, args.replacement);

        case 'run_command':
          return await this.shellOps.runCommand(args.command, args.working_dir);

        case 'list_dir':
          return this.fileOps.listDir(args.path, args.max_depth);

        case 'search_files':
          return this.fileOps.searchFiles(args.query, args.dir_path);

        default:
          return `[ERROR] Unknown tool: "${name}"`;
      }
    } catch (err) {
      return `[ERROR executing ${name}]: ${err.message}`;
    }
  }
}
