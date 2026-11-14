export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file within the workspace. Returns numbered lines.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file to read.'
          },
          start_line: {
            type: 'integer',
            description: 'Optional starting line number (1-based).'
          },
          end_line: {
            type: 'integer',
            description: 'Optional ending line number (inclusive).'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create a new file or completely overwrite an existing file with the provided content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file to write.'
          },
          content: {
            type: 'string',
            description: 'Full text content to write.'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Surgically replace an exact target snippet in an existing file with replacement text. Safer and faster than full file overwrites.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file to edit.'
          },
          target: {
            type: 'string',
            description: 'The exact string snippet inside the file to be replaced.'
          },
          replacement: {
            type: 'string',
            description: 'The new replacement snippet.'
          }
        },
        required: ['path', 'target', 'replacement']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command (e.g. tests, build, git status, npm install) in the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command string to execute.'
          },
          working_dir: {
            type: 'string',
            description: 'Optional subdirectory to run the command in.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories in a given folder up to a specified depth.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path (defaults to root .).'
          },
          max_depth: {
            type: 'integer',
            description: 'Maximum traversal depth (default 2).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for text or regex across workspace files.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text or pattern to search for.'
          },
          dir_path: {
            type: 'string',
            description: 'Directory path to search in (defaults to .).'
          }
        },
        required: ['query']
      }
    }
  }
];
