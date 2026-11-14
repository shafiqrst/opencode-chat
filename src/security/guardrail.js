import fs from 'fs';
import path from 'path';

// Sensitive patterns that are ALWAYS blocked from reading or writing
const DEFAULT_BLOCKED_PATTERNS = [
  /\.env(\..+)?$/i,
  /\.(pem|key|pfx|pkcs12)$/i,
  /(id_rsa|id_ed25519)(\.pub)?$/i,
  /(credentials|client_secret|service_account).*?\.json$/i,
  /password/i,
  /secret/i,
];

// Dangerous shell commands that are forbidden by default
const FORBIDDEN_COMMANDS = [
  /\brm\s+-[a-z]*r[a-z]*\s+[\/\\]/i,
  /\bdel\s+(\/[a-z]\s+)*c:[\/\\]/i,
  /\brmdir\s+(\/[a-z]\s+)*c:[\/\\]/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bdrop\s+database\b/i,
  /\bshutdown\b/i,
];

// API Key and token regex scrubbers
const SECRET_REDACTION_REGEXES = [
  // OpenAI / DeepSeek / Anthropic style sk- keys
  { regex: /sk-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_API_KEY]' },
  // GitHub Personal Access Tokens
  { regex: /gh[pousr]-[a-zA-Z0-9]{36,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  // Bearer tokens
  { regex: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // AWS Access Key ID
  { regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, replacement: '[REDACTED_AWS_KEY]' },
  // Private Key Blocks
  { regex: /-----BEGIN\s+([A-Z\s]+)?PRIVATE KEY-----[\s\S]*?-----END\s+([A-Z\s]+)?PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
];

export class SecurityGuardrail {
  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.customIgnoreRules = this.loadAgentIgnore();
  }

  setWorkspaceRoot(newRoot) {
    this.workspaceRoot = path.resolve(newRoot);
    this.customIgnoreRules = this.loadAgentIgnore();
  }

  loadAgentIgnore() {
    const ignorePath = path.join(this.workspaceRoot, '.agentignore');
    if (!fs.existsSync(ignorePath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(ignorePath, 'utf8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    } catch {
      return [];
    }
  }

  /**
   * Checks whether a file path is safe to access.
   * Returns { safe: boolean, reason?: string }
   */
  isPathAllowed(targetPath) {
    const resolved = path.resolve(this.workspaceRoot, targetPath);
    const basename = path.basename(resolved);
    const relative = path.relative(this.workspaceRoot, resolved);

    // Prevent directory traversal outside workspace
    if (relative.startsWith('..') && !path.isAbsolute(targetPath)) {
      return { safe: false, reason: `Path "${targetPath}" escapes workspace root.` };
    }

    // Check built-in sensitive patterns
    for (const pattern of DEFAULT_BLOCKED_PATTERNS) {
      if (pattern.test(basename) || pattern.test(relative)) {
        return {
          safe: false,
          reason: `Access blocked: "${basename}" matches security guardrail for sensitive credentials/keys.`
        };
      }
    }

    // Check .agentignore rules
    for (const rule of this.customIgnoreRules) {
      const cleanRule = rule.replace(/\/$/, '');
      if (relative.includes(cleanRule) || basename === cleanRule) {
        return {
          safe: false,
          reason: `Access blocked: "${basename}" matches rule "${rule}" in .agentignore.`
        };
      }
    }

    return { safe: true };
  }

  /**
   * Checks whether a shell command is dangerous.
   */
  isCommandAllowed(command) {
    for (const forbidden of FORBIDDEN_COMMANDS) {
      if (forbidden.test(command)) {
        return {
          safe: false,
          reason: `Command execution blocked: detected high-risk destructive command pattern.`
        };
      }
    }
    return { safe: true };
  }

  /**
   * Scrubs API keys, passwords, and sensitive tokens from text before sending to LLM.
   */
  redactSecrets(text) {
    if (typeof text !== 'string') return text;
    let sanitized = text;
    for (const { regex, replacement } of SECRET_REDACTION_REGEXES) {
      sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized;
  }
}
