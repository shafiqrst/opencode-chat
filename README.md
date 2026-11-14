# ⚡ OpenCode Chat (Kiln Coding Agent)

> **Autonomous Full-Stack AI Coding Assistant with Multi-Model Auto-Failover, Surgical File Tools, and Built-in Security Guardrails.**

OpenCode Chat is an open-source, privacy-focused coding agent built to run on **100% free AI models** without sacrificing speed or reliability. It actively solves the two major pain points of free tiers: **HTTP 429 rate-limit crashes** (via intelligent provider failover) and **data leakage** (via hard `.agentignore` shields and automatic credential redaction).

---

## 🌟 Key Capabilities

### 1. 🔄 Multi-Model Auto-Failover Router
When a free provider reaches its rate limit (`429`) or encounters server overload (`503`), OpenCode Chat **instantly and silently switches to the next configured model in milliseconds**, continuing your workflow without interruption.
* **Failover Cascade Order**:
  1. **Google Gemini (Free 2.0 / 1.5 Flash)** — 1M+ token context & high-speed reasoning.
  2. **Groq (Free LPUs)** — Ultra-low latency inference on Qwen 2.5 Coder & GPT-OSS.
  3. **OpenRouter (Free Tier)** — Nemotron 3.5, Ernie 5.5 Flash, Qwen Coder.
  4. **NVIDIA NIM (Free Tier)** — DeepSeek V4.1 / V3 and Llama 3.3 70B.
  5. **Local Ollama (100% Offline)** — Zero internet fallback when offline.

### 2. 🛡️ Security & Privacy Guardrails
* **`.agentignore` Enforcement:** Hard-blocks the AI agent from ever viewing `.env`, `.pem`, `id_rsa`, `credentials.json`, tokens, or database configs.
* **Secret Redactor:** Automatically strips API keys (`sk-...`), GitHub personal access tokens, AWS keys, and Bearer headers from terminal logs and file diffs before transmitting to the model.
* **Human-in-the-Loop Confirmation:** Prompts for explicit approval (`y/N` in CLI or approval card in Web UI) before executing destructive shell commands (`rm`, `format`, `git push --force`).

### 3. 🎯 Surgical Code Editing
* `edit_file`: Precise search-and-replace targeting specific snippets, with fuzzy whitespace-tolerant fallback. Avoids context bloat and prevents accidental full-file rewrites.
* `read_file`: Line-numbered, windowed reads for large files.
* `write_file`: Automatic parent directory resolution and atomic creation.
* `run_command`: Sandboxed command runner with timeout and output truncation.

### 4. ⏪ Instant Rollback (`/undo`)
Every file change is automatically snapshotted in `.kiln/history/`. Typing `/undo` immediately reverts the agent's last modification without relying on git stashes.

---

## 🚀 Quick Start Guide

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/shafiqrst/opencode-chat.git
cd opencode-chat
npm install
```

### 2. Configure Free API Keys
Copy the template configuration:
```bash
# Windows
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

Open `.env` and add any of the free API keys:
* **Google Gemini (Recommended)**: [aistudio.google.com](https://aistudio.google.com)
* **Groq**: [console.groq.com/keys](https://console.groq.com/keys)
* **OpenRouter**: [openrouter.ai/keys](https://openrouter.ai/keys)
* **NVIDIA NIM**: [build.nvidia.com](https://build.nvidia.com)

*(Note: Even with no cloud keys, you can run offline with Ollama on `http://localhost:11434/v1`)*

### 3. Run OpenCode Chat

#### Option A: 🌐 Web Studio (Recommended)
Launches the browser-based interactive dashboard with real-time terminal output, diff visualizer, and approval modal:
```bash
npm run web
```
Opens automatically at `http://localhost:3000`.

#### Option B: 🖥️ Desktop Native App
Launches as a standalone native desktop app (using native Chrome or Edge shell without browser URL bars):
```bash
npm run desktop
```

#### Option C: 💻 Interactive CLI
```bash
npm start
```
Run in autonomous mode (skips confirmations for safe commands):
```bash
node bin/opencoder.js --auto
```

---

## 🧪 Running Tests
Verify all tools, guardrails, and failover router:
```bash
npm test
```
All 14 unit and integration tests run in under 2 seconds.

---

## 📁 Repository Structure
```
opencode-chat/
├── bin/
│   ├── opencoder.js    # CLI entry point
│   ├── web.js          # Web Studio launcher
│   └── desktop.js      # Native desktop app launcher
├── src/
│   ├── agent/          # Autonomous perceive-plan-act loop
│   ├── providers/      # Multi-model router with auto-failover
│   ├── security/       # Guardrail (.agentignore & secret redactor)
│   ├── storage/        # Project and conversation persistence
│   ├── tools/          # File operations, shell runner, undo checkpoints
│   └── ui/             # Web server & WebSocket terminal
├── tests/              # Test suite (runner.js)
├── .agentignore        # Privacy rules
├── .env.example        # Environment variable template
└── package.json
```

---

## 📄 License
MIT License. Free and open source for personal and commercial use.
