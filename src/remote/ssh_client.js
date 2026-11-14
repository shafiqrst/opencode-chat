import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

/**
 * VibWebs Remote SSH Manager
 * Handles persistent SSH/SFTP sessions for remote folder browsing,
 * surgical file edits, and remote command execution.
 */
export class RemoteSSHManager {
  constructor() {
    this.client = null;
    this.sftp = null;
    this.config = null;
    this.isConnected = false;
  }

  /**
   * Connect to a remote SSH server
   * @param {Object} options - { host, port, username, password, privateKeyPath, remotePath }
   */
  async connect(options) {
    if (this.isConnected) {
      await this.disconnect();
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();
      const sshConfig = {
        host: options.host,
        port: parseInt(options.port, 10) || 22,
        username: options.username,
        readyTimeout: 20000
      };

      if (options.password) {
        sshConfig.password = options.password;
      } else if (options.privateKeyPath) {
        try {
          const resolvedKey = path.resolve(options.privateKeyPath);
          sshConfig.privateKey = fs.readFileSync(resolvedKey);
        } catch (err) {
          return reject(new Error(`Failed to read private key at ${options.privateKeyPath}: ${err.message}`));
        }
      }

      conn.on('ready', () => {
        this.client = conn;
        this.config = {
          host: options.host,
          port: sshConfig.port,
          username: options.username,
          remotePath: options.remotePath || '/'
        };

        // Initialize SFTP
        conn.sftp((err, sftp) => {
          if (err) {
            this.disconnect();
            return reject(new Error(`SSH connected but SFTP failed: ${err.message}`));
          }
          this.sftp = sftp;
          this.isConnected = true;
          resolve({
            success: true,
            uri: `ssh://${options.username}@${options.host}:${sshConfig.port}${this.config.remotePath}`,
            config: this.config
          });
        });
      });

      conn.on('error', (err) => {
        this.isConnected = false;
        reject(err);
      });

      conn.on('close', () => {
        this.isConnected = false;
        this.client = null;
        this.sftp = null;
      });

      try {
        conn.connect(sshConfig);
      } catch (err) {
        reject(err);
      }
    });
  }

  async disconnect() {
    if (this.sftp) {
      try { this.sftp.end(); } catch {}
      this.sftp = null;
    }
    if (this.client) {
      try { this.client.end(); } catch {}
      this.client = null;
    }
    this.isConnected = false;
    this.config = null;
  }

  /**
   * List files and folders in a remote directory
   */
  async listDir(remotePath = null) {
    if (!this.isConnected || !this.sftp) {
      throw new Error('Remote SSH session is not connected.');
    }
    const target = remotePath || this.config.remotePath;

    return new Promise((resolve, reject) => {
      this.sftp.readdir(target, (err, list) => {
        if (err) return reject(err);
        const entries = list.map(item => ({
          name: item.filename,
          isDirectory: item.attrs.isDirectory(),
          size: item.attrs.size,
          mtime: item.attrs.mtime * 1000
        }));
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        resolve(entries);
      });
    });
  }

  /**
   * Read file content from remote SSH server
   */
  async readFile(remoteFilePath) {
    if (!this.isConnected || !this.sftp) {
      throw new Error('Remote SSH session is not connected.');
    }

    return new Promise((resolve, reject) => {
      const stream = this.sftp.createReadStream(remoteFilePath);
      let data = '';
      stream.on('data', chunk => { data += chunk; });
      stream.on('end', () => resolve(data));
      stream.on('error', err => reject(err));
    });
  }

  /**
   * Write file content to remote SSH server
   */
  async writeFile(remoteFilePath, content) {
    if (!this.isConnected || !this.sftp) {
      throw new Error('Remote SSH session is not connected.');
    }

    return new Promise((resolve, reject) => {
      const stream = this.sftp.createWriteStream(remoteFilePath);
      stream.on('finish', () => resolve({ success: true, path: remoteFilePath }));
      stream.on('error', err => reject(err));
      stream.end(content, 'utf8');
    });
  }

  /**
   * Execute shell command on remote server in the project directory
   */
  async runCommand(command, workingDir = null) {
    if (!this.isConnected || !this.client) {
      throw new Error('Remote SSH session is not connected.');
    }
    const dir = workingDir || this.config.remotePath;
    const fullCmd = dir ? `cd "${dir}" && ${command}` : command;

    return new Promise((resolve, reject) => {
      this.client.exec(fullCmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';

        stream.on('data', data => { stdout += data.toString(); });
        stream.stderr.on('data', data => { stderr += data.toString(); });
        stream.on('close', (code, signal) => {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code,
            signal
          });
        });
      });
    });
  }
}
