/**
 * VibWebs Studio - Antigravity Clone Client Logic
 * Matches the exact Antigravity Hub layout, Projects Directory tree with conversation topics,
 * Native Computer Folder Browser Dialog (C:\, D:\, E:\, any folder), and Model Selectors.
 */

let ws = null;
let activeWorkspaceRoot = 'd:\\opencode-vedio-etc';
let activeTopicName = 'YouTube Video Explanation And Feasibility';
let selectedBrowserFolderPath = null;
let currentBrowserParentDir = null;

// DOM Elements
const sidebarPane = document.getElementById('sidebarPane');
const rightPanel = document.getElementById('rightPanel');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const toggleRightNavBtn = document.getElementById('toggleRightNavBtn');
const toggleEditorBtn = document.getElementById('toggleEditorBtn');
const closeRightPanelBtn = document.getElementById('closeRightPanelBtn');
const resizerLeft = document.getElementById('resizerLeft');
const resizerRight = document.getElementById('resizerRight');

const bcProjectName = document.getElementById('bcProjectName');
const bcTopicName = document.getElementById('bcTopicName');
const projectsContainer = document.getElementById('projectsContainer');
const messagesContainer = document.getElementById('messagesContainer');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const modelName = document.getElementById('modelName');
const modelTierBadge = document.getElementById('modelTierBadge');
const modelPickerPill = document.getElementById('modelPickerPill');
const modelDropdownMenu = document.getElementById('modelDropdownMenu');
const modelOptionsList = document.getElementById('modelOptionsList');
const newConvoBtn = document.getElementById('newConvoBtn');

// Human Permission Confirmation Modal Elements
const confirmModal = document.getElementById('confirmModal');
const confirmCmdText = document.getElementById('confirmCmdText');
const approveBtn = document.getElementById('approveBtn');
const rejectBtn = document.getElementById('rejectBtn');
let activeConfirmId = null;

// Folder Browser Modal
const folderBrowserModal = document.getElementById('folderBrowserModal');
const browseComputerBtn = document.getElementById('browseComputerBtn');
const closeBrowserModalBtn = document.getElementById('closeBrowserModalBtn');
const browserCancelBtn = document.getElementById('browserCancelBtn');
const browserSelectBtn = document.getElementById('browserSelectBtn');
const browserItemsGrid = document.getElementById('browserItemsGrid');
const browserCurrentPathInput = document.getElementById('browserCurrentPathInput');
const browserUpBtn = document.getElementById('browserUpBtn');
const browserGoPathBtn = document.getElementById('browserGoPathBtn');
const browserSelectedPath = document.getElementById('browserSelectedPath');

// WebSocket Init
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    appendTerminalLine('Connected to VibWebs Local Runtime daemon');
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (err) {
      console.error('WS Parse Error:', err);
    }
  };
}

let currentActiveConversationId = null;
let cachedProjects = [];
let cachedConversations = [];
let cachedProviders = [];

// Turbo Execution Mode Elements
const btnTurbo = document.getElementById('btnTurbo');
const turboIcon = document.getElementById('turboIcon');
const turboText = document.getElementById('turboText');
let currentExecutionMode = 'CONFIRM';

function updateExecutionMode(mode) {
  currentExecutionMode = mode;
  if (!btnTurbo) return;
  if (mode === 'AUTO') {
    btnTurbo.classList.add('turbo-active');
    if (turboIcon) turboIcon.textContent = '⚡';
    if (turboText) turboText.textContent = 'Turbo (Auto)';
    btnTurbo.title = 'Execution Mode: Turbo (Autonomous execution without confirmation prompts)';
  } else {
    btnTurbo.classList.remove('turbo-active');
    if (turboIcon) turboIcon.textContent = '🔒';
    if (turboText) turboText.textContent = 'Safe (Confirm)';
    btnTurbo.title = 'Execution Mode: Safe (Asks for confirmation before shell commands)';
  }
}

if (btnTurbo) {
  btnTurbo.addEventListener('click', () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'toggle_mode' }));
    }
  });
}

function showLiveThinking(label = 'VibWebs AI is thinking and analyzing...') {
  hideLiveThinking();
  const indicator = document.createElement('div');
  indicator.className = 'chat-turn assistant-turn thinking-turn';
  indicator.id = 'liveThinkingTurn';
  indicator.innerHTML = `
    <div class="thinking-pill">
      <span class="thinking-spinner"></span>
      <span class="thinking-text" id="liveThinkingText">${escapeHtml(label)}</span>
    </div>
  `;
  messagesContainer.appendChild(indicator);
  scrollToBottom();
}

function updateLiveThinking(label) {
  const el = document.getElementById('liveThinkingText');
  if (el) {
    el.textContent = label;
    scrollToBottom();
  } else {
    showLiveThinking(label);
  }
}

function hideLiveThinking() {
  const el = document.getElementById('liveThinkingTurn');
  if (el) el.remove();
}

function setSendButtonLoading(isLoading) {
  if (!sendBtn) return;
  if (isLoading) {
    sendBtn.classList.add('loading');
    sendBtn.innerHTML = '<span class="spinner-small"></span>';
    sendBtn.disabled = true;
  } else {
    sendBtn.classList.remove('loading');
    sendBtn.innerHTML = '<span class="square-stop">■</span>';
    sendBtn.disabled = false;
  }
}

function renderErrorMessage(msg) {
  const turn = document.createElement('div');
  turn.className = 'chat-turn error-turn';
  turn.innerHTML = `
    <div class="error-bubble">
      <span>⚠️</span>
      <span>${escapeHtml(msg)}</span>
    </div>
  `;
  messagesContainer.appendChild(turn);
  scrollToBottom();
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'init':
      cachedProjects = data.projects || [];
      cachedConversations = data.conversations || [];
      cachedProviders = data.providers || [];
      currentActiveConversationId = data.activeConversationId;
      renderProjectsSidebar(cachedProjects, data.workspaceRoot, cachedConversations);
      if (data.workspaceRoot) updateBreadcrumbs(data.workspaceRoot);
      if (data.currentModel) updateModelDisplay(data.currentModel);
      renderModelDropdownOptions(cachedProviders, data.currentModel);
      if (data.executionMode) updateExecutionMode(data.executionMode);
      if (data.activeMessages && data.activeMessages.length > 0) {
        renderStoredMessages(data.activeMessages);
      }
      loadFiles();
      break;

    case 'agent_status':
      if (data.status === 'working') {
        updateLiveThinking(data.message || 'Thinking...');
        setSendButtonLoading(true);
      } else if (data.status === 'tool_running') {
        const detail = data.args?.path ? ` (${data.args.path})` : (data.args?.command ? ` (${data.args.command})` : '');
        updateLiveThinking(`⚡ Running: ${data.tool}${detail}`);
      } else if (data.status === 'idle') {
        hideLiveThinking();
        setSendButtonLoading(false);
      }
      break;

    case 'step':
      handleAgentStep(data.step);
      break;

    case 'confirm_prompt':
      activeConfirmId = data.confirmId;
      if (confirmCmdText) {
        confirmCmdText.textContent = data.command.startsWith('$') ? data.command : `$ ${data.command}`;
      }
      if (confirmModal) confirmModal.classList.remove('hidden');
      updateLiveThinking(`⚠️ Waiting for permission: ${data.command}`);
      break;

    case 'confirm_closed':
      if (confirmModal) confirmModal.classList.add('hidden');
      activeConfirmId = null;
      updateLiveThinking('Permission resolved. Resuming execution...');
      break;

    case 'mode_update':
      updateExecutionMode(data.mode);
      break;

    case 'model_updated':
      updateModelDisplay(data.currentModel);
      renderModelDropdownOptions(cachedProviders, data.currentModel);
      break;

    case 'workspace_changed':
      cachedProjects = data.projects || cachedProjects;
      cachedConversations = data.conversations || [];
      currentActiveConversationId = data.activeConversationId;
      updateBreadcrumbs(data.workspaceRoot);
      renderProjectsSidebar(cachedProjects, data.workspaceRoot, cachedConversations);
      loadFiles();
      break;

    case 'conversations_list_updated':
      cachedConversations = data.conversations || [];
      renderProjectsSidebar(cachedProjects, activeWorkspaceRoot, cachedConversations);
      break;

    case 'conversation_switched':
      currentActiveConversationId = data.conversationId;
      cachedConversations = data.conversations || cachedConversations;
      if (bcTopicName) bcTopicName.textContent = data.title || 'Conversation';
      renderProjectsSidebar(cachedProjects, activeWorkspaceRoot, cachedConversations);
      renderStoredMessages(data.messages || []);
      break;

    case 'response':
      hideLiveThinking();
      setSendButtonLoading(false);
      renderAssistantResponse(data.content);
      loadFiles();
      break;

    case 'error':
      hideLiveThinking();
      setSendButtonLoading(false);
      renderErrorMessage(data.message || 'An error occurred during execution.');
      break;
  }
}

function renderStoredMessages(messages) {
  messagesContainer.innerHTML = '';
  if (!messages || messages.length === 0) return;
  messages.forEach((m, idx) => {
    if (m.role === 'user') {
      renderUserTurn(m.content, m.timestamp);
    } else if (m.role === 'assistant') {
      const showDiff = idx === 1;
      renderAssistantResponse(m.content, { showDiff, timestamp: m.timestamp });
    }
  });
}

function updateBreadcrumbs(root) {
  activeWorkspaceRoot = root;
  const name = root.split(/[\\/]/).filter(Boolean).pop() || root;
  if (bcProjectName) bcProjectName.textContent = name;
}

// Render Projects List in Antigravity Style with Multi-Conversation History
function renderProjectsSidebar(projects, activePath, conversations = []) {
  if (!projectsContainer) return;
  projectsContainer.innerHTML = '';

  const normActive = (activePath || '').toLowerCase().replace(/\\/g, '/');

  projects.forEach(p => {
    const pNorm = (p.path || '').toLowerCase().replace(/\\/g, '/');
    const isProjectActive = normActive === pNorm;

    const group = document.createElement('div');
    group.className = 'project-group';

    const header = document.createElement('div');
    header.className = `project-folder-header ${isProjectActive ? 'active' : ''}`;
    header.innerHTML = `
      <div class="folder-title-left" title="${escapeHtml(p.path)}">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${escapeHtml(p.name)}</span>
      </div>
    `;

    header.addEventListener('click', () => {
      switchWorkspace(p.path);
    });

    group.appendChild(header);

    // Collect all conversations for this project
    let projectConvos = [];
    if (isProjectActive && conversations && conversations.length > 0) {
      projectConvos = conversations;
    } else if (p.conversations && p.conversations.length > 0) {
      projectConvos = p.conversations;
    }

    if (projectConvos.length > 0) {
      projectConvos.forEach(c => {
        const isCurrentConvo = isProjectActive && (
          c.id === currentActiveConversationId ||
          (bcTopicName && bcTopicName.textContent.trim().toLowerCase() === c.title.trim().toLowerCase())
        );

        const convo = document.createElement('div');
        convo.className = `conversation-subitem ${isCurrentConvo ? 'active' : ''}`;
        
        const rightBadge = isCurrentConvo 
          ? '<span class="convo-handle">⋮⋮</span>' 
          : `<span class="convo-time">${c.timeAgo || (c.updatedAt ? timeAgo(c.updatedAt) : '>')}</span>`;

        convo.innerHTML = `
          <span class="convo-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
          ${rightBadge}
        `;

        convo.addEventListener('click', (e) => {
          e.stopPropagation();
          currentActiveConversationId = c.id;
          if (bcWorkspaceName) bcWorkspaceName.textContent = p.name;
          if (bcTopicName) bcTopicName.textContent = c.title;

          if (ws) {
            ws.send(JSON.stringify({
              type: 'switch_conversation',
              conversationId: c.id,
              title: c.title,
              workspacePath: p.path
            }));
          }
        });

        group.appendChild(convo);
      });
    }

    projectsContainer.appendChild(group);
  });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d`;
}

async function switchWorkspace(targetPath) {
  try {
    const res = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath })
    });
    const data = await res.json();
    if (data.success) {
      updateBreadcrumbs(data.workspaceRoot);
      await loadProjects();
      await loadFiles();
    }
  } catch (err) {
    alert('Failed to switch workspace: ' + err.message);
  }
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    renderProjectsSidebar(data.projects, data.activeWorkspace);
  } catch {}
}

// COMPUTER FOLDER BROWSER MODAL (Browse C:\, D:\, E:\, etc.)
async function openFolderBrowser(targetDir = '') {
  folderBrowserModal.classList.remove('hidden');
  await navigateFolderBrowser(targetDir);
}

async function navigateFolderBrowser(dir) {
  browserItemsGrid.innerHTML = '<div class="loading-state">Loading folders...</div>';
  browserCurrentPathInput.value = dir || 'Computer (Root Drives)';
  selectedBrowserFolderPath = dir || null;
  browserSelectedPath.textContent = dir || 'None (Select a folder)';

  try {
    const url = dir ? `/api/browse-folders?dir=${encodeURIComponent(dir)}` : '/api/browse-folders';
    const res = await fetch(url);
    const data = await res.json();

    currentBrowserParentDir = data.parentDir;
    browserUpBtn.disabled = !data.parentDir && dir !== '';

    renderBrowserItems(data.folders);
  } catch (err) {
    browserItemsGrid.innerHTML = `<div class="loading-state">Error: ${err.message}</div>`;
  }
}

function renderBrowserItems(folders) {
  browserItemsGrid.innerHTML = '';
  if (!folders || folders.length === 0) {
    browserItemsGrid.innerHTML = '<div class="loading-state">No folders inside this directory</div>';
    return;
  }

  folders.forEach(item => {
    const el = document.createElement('div');
    el.className = 'folder-grid-item';
    const icon = item.isDrive ? '💾' : '📁';
    el.innerHTML = `<span>${icon}</span><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</span>`;

    // Single click: select folder
    el.addEventListener('click', () => {
      document.querySelectorAll('.folder-grid-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      selectedBrowserFolderPath = item.path;
      browserSelectedPath.textContent = item.path;
    });

    // Double click: open folder
    el.addEventListener('dblclick', () => {
      navigateFolderBrowser(item.path);
    });

    browserItemsGrid.appendChild(el);
  });
}

// Browser Modal Action Buttons
if (browseComputerBtn) browseComputerBtn.addEventListener('click', () => openFolderBrowser('D:\\'));
if (closeBrowserModalBtn) closeBrowserModalBtn.addEventListener('click', () => folderBrowserModal.classList.add('hidden'));
if (browserCancelBtn) browserCancelBtn.addEventListener('click', () => folderBrowserModal.classList.add('hidden'));

if (browserUpBtn) {
  browserUpBtn.addEventListener('click', () => {
    navigateFolderBrowser(currentBrowserParentDir || '');
  });
}

if (browserGoPathBtn) {
  browserGoPathBtn.addEventListener('click', () => {
    navigateFolderBrowser(browserCurrentPathInput.value.trim());
  });
}

browserCurrentPathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') navigateFolderBrowser(browserCurrentPathInput.value.trim());
});

if (browserSelectBtn) {
  browserSelectBtn.addEventListener('click', async () => {
    if (!selectedBrowserFolderPath) {
      alert('Please click on a folder to select it');
      return;
    }
    folderBrowserModal.classList.add('hidden');
    await switchWorkspace(selectedBrowserFolderPath);
  });
}

// New Conversation button
if (newConvoBtn) {
  newConvoBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
    if (ws) ws.send(JSON.stringify({ type: 'new_conversation' }));
    if (bcTopicName) bcTopicName.textContent = 'New Conversation';
  });
}

// Sidebar & Panel Toggle
if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    sidebarPane.classList.toggle('hidden');
    resizerLeft.style.display = sidebarPane.classList.contains('hidden') ? 'none' : 'block';
  });
}

if (toggleRightNavBtn) {
  toggleRightNavBtn.addEventListener('click', () => {
    rightPanel.classList.toggle('hidden');
    resizerRight.style.display = rightPanel.classList.contains('hidden') ? 'none' : 'block';
  });
}

if (closeRightPanelBtn) {
  closeRightPanelBtn.addEventListener('click', () => {
    rightPanel.classList.add('hidden');
    resizerRight.style.display = 'none';
  });
}

// Right Panel Tab Navigation
window.switchRightTab = function(tabName) {
  rightPanel.classList.remove('hidden');
  resizerRight.style.display = 'block';

  document.querySelectorAll('.panel-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
  });

  const tabBodies = {
    'overview': document.getElementById('tabOverview'),
    'files': document.getElementById('tabFiles'),
    'terminal': document.getElementById('tabTerminal'),
    'review': document.getElementById('tabReview')
  };

  Object.keys(tabBodies).forEach(k => {
    if (tabBodies[k]) tabBodies[k].classList.toggle('hidden', k !== tabName);
  });
};

document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchRightTab(tab.getAttribute('data-tab'));
  });
});

// Chat Turns & Execution
function sendMessage() {
  const text = promptInput.value.trim();
  if (!text || !ws) return;

  renderUserTurn(text);
  promptInput.value = '';
  promptInput.style.height = 'auto';

  showLiveThinking('VibWebs AI is thinking and analyzing...');
  setSendButtonLoading(true);

  ws.send(JSON.stringify({ type: 'user_prompt', content: text }));
}

sendBtn.addEventListener('click', sendMessage);
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function renderUserTurn(text, timestamp) {
  const turn = document.createElement('div');
  turn.className = 'chat-turn user-turn';
  turn.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
  messagesContainer.appendChild(turn);
  scrollToBottom();
}

let currentRunningPill = null;

function handleAgentStep(step) {
  const toolName = step.tool || step.name || (step.args ? Object.keys(step.args)[0] : 'action');

  if (step.type === 'tool_call') {
    let detail = '';
    if (step.args) {
      if (step.args.path) detail = `: ${step.args.path}`;
      else if (step.args.command || step.args.cmd) detail = `: ${step.args.command || step.args.cmd}`;
    }
    updateLiveThinking(`⚡ Running: ${toolName}${detail}`);
  } else if (step.type === 'tool_result') {
    updateLiveThinking(`✔ Finished ${toolName}, preparing next step...`);
  } else if (step.type === 'thinking') {
    updateLiveThinking('VibWebs AI is formulating response...');
  }
}

function renderAssistantResponse(content, options = {}) {
  const turn = document.createElement('div');
  turn.className = 'chat-turn assistant-turn';

  const diffHtml = options.showDiff ? `
    <div class="diff-stat-card">
      <span>4 files changed</span>
      <span class="added">+353</span>
      <span class="removed">-75</span>
      <span style="color:#666f7d; cursor:pointer;">&gt;</span>
      <button class="btn-review-pill" onclick="switchRightTab('review')">Review</button>
    </div>
  ` : '';

  const timeLabel = options.timestamp ? timeAgo(options.timestamp) : '2h ago';

  turn.innerHTML = `
    ${diffHtml}
    <div class="assistant-bubble">${formatMarkdown(content)}</div>
    <div class="assistant-footer">
      <span class="footer-time">${timeLabel}</span>
      <div class="footer-actions">
        <button class="btn-icon-subtle" title="Copy response" onclick="navigator.clipboard.writeText(this.closest('.chat-turn').querySelector('.assistant-bubble').innerText)">📋</button>
        <button class="btn-icon-subtle" title="Good response">👍</button>
        <button class="btn-icon-subtle" title="Bad response">👎</button>
      </div>
    </div>
  `;
  messagesContainer.appendChild(turn);
  scrollToBottom();
}

// Resizers
function initResizers() {
  let isResizingLeft = false;
  let isResizingRight = false;

  resizerLeft.addEventListener('mousedown', () => {
    isResizingLeft = true;
    resizerLeft.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
  });

  resizerRight.addEventListener('mousedown', () => {
    isResizingRight = true;
    resizerRight.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (isResizingLeft) {
      const w = Math.max(180, Math.min(420, e.clientX));
      sidebarPane.style.width = `${w}px`;
    } else if (isResizingRight) {
      const w = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
      rightPanel.style.width = `${w}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    isResizingLeft = false;
    isResizingRight = false;
    resizerLeft.classList.remove('resizing');
    resizerRight.classList.remove('resizing');
    document.body.style.cursor = '';
  });
}

// File Tree for Right Panel
async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    const data = await res.json();
    const tree = document.getElementById('fileTree');
    if (!tree) return;
    tree.innerHTML = '';
    (data.tree || []).forEach(item => {
      const el = document.createElement('div');
      el.style.padding = '4px 8px';
      el.style.fontSize = '11px';
      el.style.color = '#8b949e';
      el.innerHTML = `${item.type === 'directory' ? '📁' : '📄'} ${escapeHtml(item.name)}`;
      tree.appendChild(el);
    });
  } catch {}
}

function appendTerminalLine(text) {
  const term = document.getElementById('terminalOutput');
  if (!term) return;
  const line = document.createElement('div');
  line.className = 'terminal-line';
  line.textContent = text;
  term.appendChild(line);
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarkdown(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// Human Confirmation Modal Listeners
if (approveBtn) {
  approveBtn.addEventListener('click', () => {
    if (confirmModal) confirmModal.classList.add('hidden');
    if (ws) {
      ws.send(JSON.stringify({
        type: 'confirm_response',
        confirmId: activeConfirmId,
        approved: true
      }));
    }
  });
}

if (rejectBtn) {
  rejectBtn.addEventListener('click', () => {
    if (confirmModal) confirmModal.classList.add('hidden');
    if (ws) {
      ws.send(JSON.stringify({
        type: 'confirm_response',
        confirmId: activeConfirmId,
        approved: false
      }));
    }
  });
}

// Keyboard shortcuts for Confirmation: Enter to Approve, Esc to Reject
document.addEventListener('keydown', (e) => {
  if (confirmModal && !confirmModal.classList.contains('hidden')) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (approveBtn) approveBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (rejectBtn) rejectBtn.click();
    }
  }
});

// Model Picker Dropdown Helpers
function updateModelDisplay(modelString) {
  if (!modelName) return;
  modelName.textContent = modelString || 'Gemini 3.8 Flash';
  if (modelTierBadge) {
    const s = (modelString || '').toLowerCase();
    if (s.includes('flash') || s.includes('lightning') || s.includes('coder')) {
      modelTierBadge.textContent = 'Fast ⚡';
    } else if (s.includes('120b') || s.includes('super') || s.includes('pro')) {
      modelTierBadge.textContent = 'Pro 🌟';
    } else {
      modelTierBadge.textContent = 'Medium ⚡';
    }
  }
}

function renderModelDropdownOptions(providers, currentModelName) {
  if (!modelOptionsList) return;
  modelOptionsList.innerHTML = '';

  const defaultList = [
    { name: 'Groq (Qwen 3.8 27B Coder)', id: 'groq-qwen', model: 'qwen/qwen3.8-27b', badge: 'fast' },
    { name: 'Groq (OpenAI GPT-OSS 120B)', id: 'groq-gpt', model: 'openai/gpt-oss-120b', badge: 'pro' },
    { name: 'OpenRouter (Nemotron 3.5 Lightning)', id: 'openrouter-nemotron', model: 'nvidia/nemotron-3.5-lightning:free', badge: 'free' },
    { name: 'OpenRouter (Ernie 5.5 Flash)', id: 'openrouter-ernie', model: 'baidu/ernie-5.5-flash-preview:free', badge: 'free' },
    { name: 'NVIDIA NIM (DeepSeek V4.1 Flash)', id: 'nvidia-deepseek', model: 'deepseek-ai/deepseek-v4.1-flash', badge: 'fast' },
    { name: 'Local Ollama (Offline)', id: 'ollama-local', model: 'qwen2.5-coder:7b', badge: 'fast' }
  ];

  const list = (providers && providers.length > 0) ? providers : defaultList;

  list.forEach(p => {
    const isSelected = currentModelName && (
      currentModelName.toLowerCase().includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(currentModelName.toLowerCase())
    );

    const item = document.createElement('div');
    item.className = `model-option-item ${isSelected ? 'active' : ''}`;
    item.innerHTML = `
      <div class="model-opt-info">
        <span class="model-opt-name">${escapeHtml(p.name)}</span>
        <span class="model-opt-sub">${escapeHtml(p.model || '')}</span>
      </div>
      <div class="model-opt-right">
        <span class="model-badge ${p.badge || 'free'}">${(p.badge || 'ACTIVE').toUpperCase()}</span>
        <span class="model-opt-check">${isSelected ? '✔' : ''}</span>
      </div>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      updateModelDisplay(p.name);
      if (modelDropdownMenu) modelDropdownMenu.classList.add('hidden');
      if (ws) {
        ws.send(JSON.stringify({
          type: 'switch_model',
          modelName: p.name,
          providerId: p.id
        }));
      }
    });

    modelOptionsList.appendChild(item);
  });
}

if (modelPickerPill) {
  modelPickerPill.addEventListener('click', (e) => {
    e.stopPropagation();
    if (modelDropdownMenu) {
      modelDropdownMenu.classList.toggle('hidden');
    }
  });
}

// Close model dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (modelDropdownMenu && !modelDropdownMenu.contains(e.target) && !modelPickerPill.contains(e.target)) {
    modelDropdownMenu.classList.add('hidden');
  }
});

// Start
connectWebSocket();
initResizers();
loadProjects();
