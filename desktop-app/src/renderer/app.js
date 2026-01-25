// Apex Drive - Renderer Process

const { apexDrive } = window;

// State
let currentUser = null;
let matters = [];
let activityLog = [];

// DOM Elements
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const settingsModal = document.getElementById('settings-modal');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load config
  const config = await apexDrive.getConfig();
  
  // Set default API URL if stored
  if (config.apiUrl) {
    document.getElementById('api-url').value = config.apiUrl;
  }
  
  // Check login status
  if (config.isLoggedIn) {
    showMainPage();
    loadDashboard();
  }
  
  // Setup event listeners
  setupEventListeners();
  setupSyncListeners();
});

function setupEventListeners() {
  // Login form
  loginForm.addEventListener('submit', handleLogin);
  
  // Navigation tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Sync buttons
  document.getElementById('sync-now-btn').addEventListener('click', handleSyncNow);
  document.getElementById('open-folder-btn').addEventListener('click', () => apexDrive.openSyncFolder());
  
  // Settings
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('change-folder-btn').addEventListener('click', handleChangeFolder);
  document.getElementById('auto-sync-toggle').addEventListener('change', handleAutoSyncToggle);
  document.getElementById('sync-interval').addEventListener('change', handleSyncIntervalChange);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  
  // Matter search
  document.getElementById('matter-search').addEventListener('input', handleMatterSearch);
}

function setupSyncListeners() {
  apexDrive.onSyncStatus((data) => {
    updateSyncIndicator(data.syncing ? 'syncing' : 'success');
    if (data.stats) {
      updateSyncStats(data.stats);
    }
  });
  
  apexDrive.onSyncError((error) => {
    updateSyncIndicator('error');
    addActivityLog('error', `Sync error: ${error}`);
  });
  
  apexDrive.onFileSynced((file) => {
    addActivityLog(file.action, file.name);
  });
  
  apexDrive.onNavigate((page) => {
    if (page === 'settings') {
      openSettings();
    }
  });
}

// Login Handler
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const apiUrl = document.getElementById('api-url').value;
  
  // Show loading
  loginBtn.disabled = true;
  loginBtn.querySelector('.btn-text').style.display = 'none';
  loginBtn.querySelector('.btn-loader').style.display = 'inline-flex';
  loginError.textContent = '';
  
  try {
    const result = await apexDrive.login(email, password, apiUrl);
    
    if (result.success) {
      currentUser = result.user;
      showMainPage();
      loadDashboard();
    } else {
      loginError.textContent = result.error || 'Login failed';
    }
  } catch (error) {
    loginError.textContent = error.message || 'Connection failed';
  } finally {
    loginBtn.disabled = false;
    loginBtn.querySelector('.btn-text').style.display = 'inline';
    loginBtn.querySelector('.btn-loader').style.display = 'none';
  }
}

function showMainPage() {
  loginPage.classList.remove('active');
  mainPage.classList.add('active');
}

function showLoginPage() {
  mainPage.classList.remove('active');
  loginPage.classList.add('active');
}

// Dashboard
async function loadDashboard() {
  // Load user name
  if (currentUser) {
    document.getElementById('user-name').textContent = 
      `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email;
  }
  
  // Load sync status
  const status = await apexDrive.getSyncStatus();
  if (status.lastSync) {
    document.getElementById('stat-last-sync').textContent = formatTime(new Date(status.lastSync));
  }
  
  // Load matters
  await loadMatters();
  
  // Load config for settings
  const config = await apexDrive.getConfig();
  document.getElementById('sync-folder-path').value = config.syncFolder;
  document.getElementById('auto-sync-toggle').checked = config.autoSync;
  document.getElementById('sync-interval').value = String(config.syncInterval);
}

async function loadMatters() {
  matters = await apexDrive.getMatters();
  
  // Update stats
  document.getElementById('stat-matters').textContent = matters.length;
  
  // Count total documents
  let totalDocs = 0;
  for (const matter of matters) {
    const docs = await apexDrive.getDocuments(matter.id);
    matter.documentCount = docs.length;
    totalDocs += docs.length;
  }
  document.getElementById('stat-documents').textContent = totalDocs;
  
  // Render matters list
  renderMatters(matters);
}

function renderMatters(mattersToRender) {
  const list = document.getElementById('matters-list');
  
  if (mattersToRender.length === 0) {
    list.innerHTML = '<li class="loading-item">No matters found</li>';
    return;
  }
  
  list.innerHTML = mattersToRender.map(matter => `
    <li class="matter-item" data-id="${matter.id}" data-name="${matter.name}">
      <div class="matter-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="matter-info">
        <div class="matter-name">${escapeHtml(matter.name)}</div>
        <div class="matter-number">${matter.number || 'No number'}</div>
      </div>
      <div class="matter-docs">${matter.documentCount || 0} docs</div>
    </li>
  `).join('');
  
  // Add click handlers
  list.querySelectorAll('.matter-item').forEach(item => {
    item.addEventListener('click', () => {
      apexDrive.openMatterFolder(item.dataset.name);
    });
  });
}

// Tab Navigation
function switchTab(tabName) {
  // Update nav
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
}

// Sync
async function handleSyncNow() {
  const btn = document.getElementById('sync-now-btn');
  btn.disabled = true;
  
  updateSyncIndicator('syncing');
  await apexDrive.syncNow();
  
  btn.disabled = false;
}

function updateSyncIndicator(state) {
  const indicator = document.getElementById('sync-indicator');
  const text = document.getElementById('sync-status-text');
  
  indicator.className = 'sync-indicator ' + state;
  
  switch (state) {
    case 'syncing':
      text.textContent = 'Syncing...';
      break;
    case 'success':
      text.textContent = 'Synced';
      break;
    case 'error':
      text.textContent = 'Error';
      break;
    default:
      text.textContent = 'Idle';
  }
}

function updateSyncStats(stats) {
  document.getElementById('stat-last-sync').textContent = formatTime(new Date());
  
  // Reload matters to get updated counts
  loadMatters();
}

// Activity Log
function addActivityLog(action, name) {
  const time = new Date();
  activityLog.unshift({ action, name, time });
  
  // Keep last 100
  if (activityLog.length > 100) {
    activityLog.pop();
  }
  
  // Update recent activity (overview tab)
  renderRecentActivity();
  
  // Update full log (activity tab)
  renderActivityLog();
}

function renderRecentActivity() {
  const list = document.getElementById('recent-activity');
  const recent = activityLog.slice(0, 5);
  
  if (recent.length === 0) {
    list.innerHTML = '<li class="activity-item empty">No recent activity</li>';
    return;
  }
  
  list.innerHTML = recent.map(item => `
    <li class="activity-item">
      <div class="activity-icon ${item.action}">
        ${item.action === 'downloaded' ? 
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' :
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
        }
      </div>
      <div class="activity-details">
        <div class="activity-name">${escapeHtml(item.name)}</div>
        <div class="activity-time">${formatTime(item.time)}</div>
      </div>
    </li>
  `).join('');
}

function renderActivityLog() {
  const list = document.getElementById('activity-log');
  
  if (activityLog.length === 0) {
    list.innerHTML = '<li class="activity-item empty">No activity yet</li>';
    return;
  }
  
  list.innerHTML = activityLog.map(item => `
    <li class="activity-item">
      <div class="activity-icon ${item.action}">
        ${item.action === 'downloaded' ? 
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' :
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
        }
      </div>
      <div class="activity-details">
        <div class="activity-name">${escapeHtml(item.name)}</div>
        <div class="activity-time">${formatTime(item.time)}</div>
      </div>
    </li>
  `).join('');
}

// Settings
function openSettings() {
  settingsModal.classList.add('active');
}

function closeSettings() {
  settingsModal.classList.remove('active');
}

async function handleChangeFolder() {
  const newPath = await apexDrive.selectFolder();
  if (newPath) {
    document.getElementById('sync-folder-path').value = newPath;
    await apexDrive.setConfig({ syncFolder: newPath });
  }
}

async function handleAutoSyncToggle(e) {
  await apexDrive.setConfig({ autoSync: e.target.checked });
}

async function handleSyncIntervalChange(e) {
  await apexDrive.setConfig({ syncInterval: parseInt(e.target.value) });
}

async function handleLogout() {
  await apexDrive.logout();
  currentUser = null;
  matters = [];
  activityLog = [];
  showLoginPage();
}

// Matter Search
function handleMatterSearch(e) {
  const query = e.target.value.toLowerCase();
  const filtered = matters.filter(m => 
    m.name.toLowerCase().includes(query) ||
    (m.number && m.number.toLowerCase().includes(query))
  );
  renderMatters(filtered);
}

// Utilities
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Click outside modal to close
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettings();
  }
});
