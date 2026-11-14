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
      if (data.messages && Array.isArray(data.messages)) {
        renderStoredMessages(data.messages);
      } else {
        messagesContainer.innerHTML = '';
      }
      loadFiles();
      break;

    case 'conversations_list_updated':
      cachedConversations = data.conversations || [];
      renderProjectsSidebar(cachedProjects, activeWorkspaceRoot, cachedConversations);
      break;

    case 'conversation_switched':
      currentActiveConversationId = data.conversationId;
      cachedConversations = data.conversations || cachedConversations;
      if (data.workspaceRoot) updateBreadcrumbs(data.workspaceRoot);
      if (bcTopicName) bcTopicName.textContent = data.title || 'Conversation';
      renderProjectsSidebar(cachedProjects, activeWorkspaceRoot, cachedConversations);
      renderStoredMessages(data.messages || []);
      break;

    case 'failover_alert':
      const waitNotice = data.retrySeconds ? ` (waiting ~${data.retrySeconds}s for reset)` : '';
      appendTerminalLine(`⚡ Model Failover: Switched from ${data.previous?.name || 'current model'} to ${data.next?.name || 'next model'}. Reason: ${data.reason || 'Rate limit'}${waitNotice}`);
      updateLiveThinking(`⚡ Switched to ${data.next?.name || 'next model'} (${data.reason || 'rate limit'})`);
      if (data.next?.name) {
        updateModelDisplay(data.next.name);
        renderModelDropdownOptions(cachedProviders, data.next.name);
      }
      break;

    case 'response':
      hideLiveThinking();
      setSendButtonLoading(false);
      renderAssistantResponse(data.content, {
        providerUsed: data.providerUsed,
        steps: [...currentTurnExecutionSteps]
      });
      currentTurnExecutionSteps = [];
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
      renderAssistantResponse(m.content, {
        showDiff,
        timestamp: m.timestamp,
        providerUsed: m.providerUsed,
        steps: m.steps || []
      });
    }
  });
}

function updateBreadcrumbs(root) {
  activeWorkspaceRoot = root || '';
  let name = root || '';
  if (name.startsWith('ssh://')) {
    const parts = name.replace(/^ssh:\/\/[^@]+@/, '').split(/[:/]/).filter(Boolean);
    name = '🌐 ' + (parts[parts.length - 1] || parts[0] || 'remote-ssh');
  } else {
    name = name.split(/[\\/]/).filter(Boolean).pop() || name;
  }
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

    const isRemoteSSH = p.path && p.path.startsWith('ssh://');
    const folderIcon = isRemoteSSH ? '🌐' : '📁';
    const remoteBadge = isRemoteSSH ? '<span style="font-size:10px; color:#58a6ff; margin-left:auto; font-family:var(--ag-font-mono);">SSH</span>' : '';

    const header = document.createElement('div');
    header.className = `project-folder-header ${isProjectActive ? 'active' : ''}`;
    header.innerHTML = `
      <div class="folder-title-left" title="${escapeHtml(p.path)}" style="width: 100%; display: flex; align-items: center; gap: 6px;">
        <span class="folder-icon">${folderIcon}</span>
        <span class="folder-name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.name)}</span>
        ${remoteBadge}
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
          openConversation(c.id, c.title, p.path);
        });

        group.appendChild(convo);
      });
    }

    projectsContainer.appendChild(group);
  });
}

// Open and load a conversation directly
async function openConversation(convoId, convoTitle, workspacePath) {
  if (!convoId) return;
  currentActiveConversationId = convoId;

  if (convoTitle && bcTopicName) bcTopicName.textContent = convoTitle;
  if (workspacePath) {
    updateBreadcrumbs(workspacePath);
  }

  // Highlight in sidebar immediately
  renderProjectsSidebar(cachedProjects, activeWorkspaceRoot, cachedConversations);

  // 1. Fetch messages directly via REST API for instant, reliable loading
  try {
    const res = await fetch(`/api/conversation?id=${encodeURIComponent(convoId)}`);
    const data = await res.json();
    if (data && Array.isArray(data.messages)) {
      renderStoredMessages(data.messages);
      if (data.title && bcTopicName) bcTopicName.textContent = data.title;
      if (data.workspaceRoot) updateBreadcrumbs(data.workspaceRoot);
    }
  } catch (err) {
    console.error('Failed to load conversation messages:', err);
  }

  // 2. Notify backend daemon over WebSocket to load history into agent memory
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: 'switch_conversation',
        conversationId: convoId,
        title: convoTitle,
        workspacePath: workspacePath
      }));
    } catch (err) {
      console.warn('WS switch_conversation error:', err);
    }
  }
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
      currentActiveConversationId = data.activeConversationId;
      if (data.messages && Array.isArray(data.messages)) {
        renderStoredMessages(data.messages);
      } else {
        messagesContainer.innerHTML = '';
      }
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

// Topbar Options Menu Handlers
const topbarMenuBtn = document.getElementById('topbarMenuBtn');
const topbarMenuDropdown = document.getElementById('topbarMenuDropdown');
const menuConnectSshBtn = document.getElementById('menuConnectSshBtn');
const menuBrowseFolderBtn = document.getElementById('menuBrowseFolderBtn');
const menuClearConvoBtn = document.getElementById('menuClearConvoBtn');

if (topbarMenuBtn && topbarMenuDropdown) {
  topbarMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    topbarMenuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!topbarMenuDropdown.contains(e.target) && e.target !== topbarMenuBtn) {
      topbarMenuDropdown.classList.add('hidden');
    }
  });
}

if (menuConnectSshBtn) {
  menuConnectSshBtn.addEventListener('click', () => {
    topbarMenuDropdown?.classList.add('hidden');
    if (sshModal) {
      sshModal.classList.remove('hidden');
      if (sshStatusMsg) sshStatusMsg.textContent = '';
    }
  });
}

if (menuBrowseFolderBtn) {
  menuBrowseFolderBtn.addEventListener('click', () => {
    topbarMenuDropdown?.classList.add('hidden');
    openFolderBrowser('D:\\');
  });
}

if (menuClearConvoBtn) {
  menuClearConvoBtn.addEventListener('click', () => {
    topbarMenuDropdown?.classList.add('hidden');
    messagesContainer.innerHTML = '';
    if (ws) ws.send(JSON.stringify({ type: 'new_conversation' }));
  });
}

// Remote SSH Connection Handlers
const connectSshBtn = document.getElementById('connectSshBtn');
const sshModal = document.getElementById('sshModal');
const closeSshModalBtn = document.getElementById('closeSshModalBtn');
const sshCancelBtn = document.getElementById('sshCancelBtn');
const sshConnectSubmitBtn = document.getElementById('sshConnectSubmitBtn');
const sshHostInput = document.getElementById('sshHostInput');
const sshPortInput = document.getElementById('sshPortInput');
const sshUserInput = document.getElementById('sshUserInput');
const sshPasswordInput = document.getElementById('sshPasswordInput');
const sshKeyPathInput = document.getElementById('sshKeyPathInput');
const sshRemotePathInput = document.getElementById('sshRemotePathInput');
const sshStatusMsg = document.getElementById('sshStatusMsg');

if (connectSshBtn) {
  connectSshBtn.addEventListener('click', () => {
    if (sshModal) {
      sshModal.classList.remove('hidden');
      if (sshStatusMsg) sshStatusMsg.textContent = '';
    }
  });
}

if (closeSshModalBtn) closeSshModalBtn.addEventListener('click', () => sshModal?.classList.add('hidden'));
if (sshCancelBtn) sshCancelBtn.addEventListener('click', () => sshModal?.classList.add('hidden'));

if (sshConnectSubmitBtn) {
  sshConnectSubmitBtn.addEventListener('click', async () => {
    const host = sshHostInput?.value.trim();
    const port = sshPortInput?.value.trim() || '22';
    const username = sshUserInput?.value.trim();
    const password = sshPasswordInput?.value || '';
    const privateKeyPath = sshKeyPathInput?.value.trim() || '';
    const remotePath = sshRemotePathInput?.value.trim() || '/';

    if (!host || !username) {
      if (sshStatusMsg) {
        sshStatusMsg.textContent = '⚠️ Host and Username are required.';
        sshStatusMsg.style.color = '#f85149';
      }
      return;
    }

    if (sshStatusMsg) {
      sshStatusMsg.textContent = `Connecting to ${username}@${host}:${port}...`;
      sshStatusMsg.style.color = '#58a6ff';
    }
    sshConnectSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/ssh/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, username, password, privateKeyPath, remotePath })
      });
      const data = await res.json();
      sshConnectSubmitBtn.disabled = false;

      if (data.success) {
        if (sshModal) sshModal.classList.add('hidden');
        appendTerminalLine(`✔ Connected to remote SSH workspace: ${data.uri}`);
        await switchWorkspace(data.uri);
      } else {
        if (sshStatusMsg) {
          sshStatusMsg.textContent = `❌ Connection failed: ${data.error || 'Unknown error'}`;
          sshStatusMsg.style.color = '#f85149';
        }
      }
    } catch (err) {
      sshConnectSubmitBtn.disabled = false;
      if (sshStatusMsg) {
        sshStatusMsg.textContent = `❌ Network error: ${err.message}`;
        sshStatusMsg.style.color = '#f85149';
      }
    }
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
// Slash Commands & Input Auto-Grow
const slashPopup = document.getElementById('slashCommandsPopup');
const slashMenuTriggerBtn = document.getElementById('slashMenuTriggerBtn');

if (slashMenuTriggerBtn && slashPopup) {
  slashMenuTriggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    slashPopup.classList.toggle('hidden');
    if (!slashPopup.classList.contains('hidden')) {
      document.querySelectorAll('.slash-item').forEach(item => {
        item.style.display = 'flex';
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (slashPopup && !slashPopup.contains(e.target) && e.target !== slashMenuTriggerBtn) {
      slashPopup.classList.add('hidden');
    }
  });
}

if (promptInput) {
  promptInput.addEventListener('input', () => {
    // Auto-grow height up to 180px
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';

    const val = promptInput.value;
    if (val.startsWith('/') && slashPopup) {
      slashPopup.classList.remove('hidden');
      const query = val.toLowerCase().slice(1);
      document.querySelectorAll('.slash-item').forEach(item => {
        const cmd = (item.getAttribute('data-cmd') || '').toLowerCase();
        if (cmd.includes(query)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      });
    } else if (slashPopup) {
      slashPopup.classList.add('hidden');
    }
  });

  promptInput.addEventListener('keydown', (e) => {
    if (slashPopup && !slashPopup.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        slashPopup.classList.add('hidden');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (slashPopup) slashPopup.classList.add('hidden');
      sendMessage();
    }
  });
}

document.querySelectorAll('.slash-item').forEach(item => {
  item.addEventListener('click', () => {
    const cmd = item.getAttribute('data-cmd');
    if (cmd && promptInput) {
      promptInput.value = cmd + ' ';
      promptInput.focus();
      if (slashPopup) slashPopup.classList.add('hidden');
    }
  });
});

function renderUserTurn(text, timestamp) {
  const turn = document.createElement('div');
  turn.className = 'chat-turn user-turn';
  turn.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
  messagesContainer.appendChild(turn);
  scrollToBottom();
}

let currentRunningPill = null;
let currentTurnExecutionSteps = [];

function handleAgentStep(step) {
  const toolName = step.tool || step.name || (step.args ? Object.keys(step.args)[0] : 'action');

  if (step.type === 'tool_call') {
    let detail = '';
    if (step.args) {
      if (step.args.path) detail = `: ${step.args.path}`;
      else if (step.args.command || step.args.cmd) detail = `: ${step.args.command || step.args.cmd}`;
    }
    const label = `Ran ${toolName}${detail}`;
    currentTurnExecutionSteps.push({ icon: '⚡', label });
    updateLiveThinking(`⚡ Running: ${toolName}${detail}`);
  } else if (step.type === 'tool_result') {
    currentTurnExecutionSteps.push({ icon: '✔', label: `Completed ${toolName} execution` });
    updateLiveThinking(`✔ Finished ${toolName}, preparing next step...`);
  } else if (step.type === 'thinking') {
    currentTurnExecutionSteps.push({ icon: '💭', label: 'Analyzing codebase and formulating plan' });
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

  const steps = options.steps || [];
  let traceHtml = '';
  if (steps && steps.length > 0) {
    const stepCount = steps.filter(s => s.icon === '⚡' || s.icon === '✔').length || steps.length;
    traceHtml = `
      <details class="execution-trace-accordion">
        <summary class="trace-summary">
          <span class="trace-icon">⚡</span>
          <span class="trace-title">Execution steps (${stepCount} action${stepCount === 1 ? '' : 's'})</span>
          <span class="trace-arrow">▾</span>
        </summary>
        <div class="trace-steps-list">
          ${steps.map(s => `
            <div class="trace-step-item">
              <span class="trace-item-icon">${s.icon}</span>
              <span class="trace-item-label">${escapeHtml(s.label)}</span>
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  const timeLabel = options.timestamp ? timeAgo(options.timestamp) : 'Just now';
  const modelBadge = options.providerUsed ? `
    <span class="footer-model-badge" title="AI Provider used for this turn">
      <span class="badge-dot">●</span> ${escapeHtml(options.providerUsed)}
    </span>
  ` : '';

  turn.innerHTML = `
    ${diffHtml}
    ${traceHtml}
    <div class="assistant-bubble">${formatMarkdown(content)}</div>
    <div class="assistant-footer">
      <div class="footer-meta">
        ${modelBadge}
        <span class="footer-time">${timeLabel}</span>
      </div>
      <div class="footer-actions">
        <button class="btn-icon-subtle copy-turn-btn" title="Copy response markdown" onclick="copyTurnResponse(this)">
          <span class="btn-icon">📋</span>
          <span class="btn-label">Copy</span>
        </button>
        <button class="btn-icon-subtle retry-turn-btn" title="Regenerate this turn" onclick="retryLastTurn(this)">
          <span class="btn-icon">🔄</span>
          <span class="btn-label">Retry</span>
        </button>
        <button class="btn-icon-subtle thumb-btn" title="Good response" onclick="toggleThumb(this, 'up')">👍</button>
        <button class="btn-icon-subtle thumb-btn" title="Bad response" onclick="toggleThumb(this, 'down')">👎</button>
      </div>
    </div>
  `;
  messagesContainer.appendChild(turn);
  scrollToBottom();
}

window.copyTurnResponse = function(btn) {
  const turn = btn.closest('.chat-turn');
  if (!turn) return;
  const bubble = turn.querySelector('.assistant-bubble');
  if (!bubble) return;

  navigator.clipboard.writeText(bubble.innerText).then(() => {
    const label = btn.querySelector('.btn-label');
    if (label) {
      const orig = label.textContent;
      label.textContent = 'Copied!';
      btn.classList.add('btn-success');
      setTimeout(() => {
        label.textContent = orig;
        btn.classList.remove('btn-success');
      }, 2000);
    }
  }).catch(() => {});
};

window.retryLastTurn = function(btn) {
  const turn = btn.closest('.chat-turn');
  if (!turn) return;
  // Find preceding user turn
  let prev = turn.previousElementSibling;
  while (prev && !prev.classList.contains('user-turn')) {
    prev = prev.previousElementSibling;
  }
  if (prev) {
    const bubble = prev.querySelector('.user-bubble');
    if (bubble && promptInput) {
      promptInput.value = bubble.innerText.trim();
      promptInput.focus();
      sendMessage();
    }
  }
};

window.toggleThumb = function(btn, type) {
  const parent = btn.parentElement;
  const allThumbs = parent.querySelectorAll('.thumb-btn');
  const wasActive = btn.classList.contains(`thumb-active-${type}`);

  allThumbs.forEach(t => {
    t.classList.remove('thumb-active-up', 'thumb-active-down');
  });

  if (!wasActive) {
    btn.classList.add(`thumb-active-${type}`);
  }
};

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

// Setup Marked Markdown Renderer with Syntax Highlighting and Copy Buttons
function setupMarkedRenderer() {
  if (typeof marked === 'undefined') return null;

  const renderer = new marked.Renderer();

  // Custom Code Block with Header and Copy Button
  renderer.code = function(arg1, arg2) {
    const text = typeof arg1 === 'object' && arg1 !== null ? (arg1.text || '') : String(arg1 || '');
    const language = typeof arg1 === 'object' && arg1 !== null ? (arg1.lang || '') : String(arg2 || '');
    let highlighted = text;

    if (typeof hljs !== 'undefined') {
      try {
        if (language && hljs.getLanguage(language)) {
          highlighted = hljs.highlight(text, { language }).value;
        } else {
          highlighted = hljs.highlightAuto(text).value;
        }
      } catch (e) {
        highlighted = escapeHtml(text);
      }
    } else {
      highlighted = escapeHtml(text);
    }

    const displayLang = (language || 'code').toUpperCase();
    return `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="code-lang-tag">${escapeHtml(displayLang)}</span>
          <button class="code-copy-btn" onclick="copyCodeBlock(this)">📋 Copy</button>
        </div>
        <pre><code class="hljs ${escapeHtml(language)}">${highlighted}</code></pre>
      </div>
    `;
  };

  // Custom Responsive Tables
  renderer.table = function(arg1, arg2) {
    if (typeof arg1 === 'string') {
      return `<div class="table-responsive"><table class="markdown-table"><thead>${arg1}</thead><tbody>${arg2 || ''}</tbody></table></div>`;
    }
    const header = arg1?.header;
    const rows = arg1?.rows;
    let headerHtml = '';
    if (Array.isArray(header)) {
      headerHtml = '<thead><tr>';
      header.forEach(cell => {
        headerHtml += `<th>${cell.text || cell}</th>`;
      });
      headerHtml += '</tr></thead>';
    }

    let rowsHtml = '';
    if (Array.isArray(rows)) {
      rowsHtml = '<tbody>';
      rows.forEach(row => {
        rowsHtml += '<tr>';
        if (Array.isArray(row)) {
          row.forEach(cell => {
            rowsHtml += `<td>${cell.text || cell}</td>`;
          });
        }
        rowsHtml += '</tr>';
      });
      rowsHtml += '</tbody>';
    }

    return `
      <div class="table-responsive">
        <table class="markdown-table">
          ${headerHtml}
          ${rowsHtml}
        </table>
      </div>
    `;
  };

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: true
  });

  return marked;
}

window.copyCodeBlock = function(btn) {
  const container = btn.closest('.code-block-container');
  if (!container) return;
  const codeEl = container.querySelector('pre code');
  if (!codeEl) return;
  const text = codeEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✔ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {});
};

function formatMarkdown(text) {
  if (!text) return '';
  if (typeof marked !== 'undefined') {
    try {
      setupMarkedRenderer();
      return marked.parse(text);
    } catch (err) {
      console.warn('Marked parsing error, falling back:', err);
    }
  }

  // Enhanced Fallback Parser
  return escapeHtml(text)
    .replace(/^### (.*$)/gim, '<h3 style="font-size:15px; margin:10px 0 4px; font-weight:600; color:#f0f6fc;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size:17px; margin:12px 0 6px; font-weight:700; color:#f0f6fc;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="font-size:19px; margin:14px 0 8px; font-weight:700; color:#f0f6fc;">$1</h1>')
    .replace(/```([\s\S]*?)```/g, '<div class="code-block-container"><pre><code>$1</code></pre></div>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
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

  const list = (providers && providers.length > 0) ? providers : cachedProviders;

  list.forEach(p => {
    const isSelected = currentModelName && (
      currentModelName.toLowerCase().includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(currentModelName.toLowerCase())
    );

    const inCooldown = Boolean(p.inCooldown || (p.cooldownRemaining && p.cooldownRemaining > 0));
    const remainingSec = p.cooldownRemaining || 0;

    let badgeText = 'ACTIVE';
    let badgeClass = 'badge-active';

    if (inCooldown && remainingSec > 0) {
      if (remainingSec >= 3600) {
        const hours = Math.round(remainingSec / 3600);
        badgeText = `WAIT ~${hours}h`;
      } else if (remainingSec >= 60) {
        const mins = Math.ceil(remainingSec / 60);
        badgeText = `WAIT ${mins}m`;
      } else {
        badgeText = `WAIT ${remainingSec}s`;
      }
      badgeClass = 'badge-cooldown';
    } else if (inCooldown) {
      badgeText = 'RESETTING';
      badgeClass = 'badge-cooldown';
    } else if (p.badge) {
      badgeText = p.badge.toUpperCase();
    }

    const item = document.createElement('div');
    item.className = `model-option-item ${isSelected ? 'active' : ''} ${inCooldown ? 'item-cooldown' : ''}`;
    item.innerHTML = `
      <div class="model-opt-info">
        <span class="model-opt-name">${escapeHtml(p.name)}</span>
        <span class="model-opt-sub">${escapeHtml(p.model || '')}</span>
      </div>
      <div class="model-opt-right">
        <span class="model-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
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

// Refresh models status and cooldown timers when opening dropdown
async function refreshModelStatusList() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (data && Array.isArray(data.providers)) {
      cachedProviders = data.providers;
      renderModelDropdownOptions(data.providers, data.currentModel || modelName?.textContent);
    }
  } catch {}
}

if (modelPickerPill) {
  modelPickerPill.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (modelDropdownMenu) {
      const willOpen = modelDropdownMenu.classList.contains('hidden');
      if (willOpen) {
        await refreshModelStatusList();
      }
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
