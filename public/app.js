let supabaseClient = null;
let session = null;
let config = {};

const state = {
  messages: [],
  conversations: [],
  activeConversationId: null,
  folders: [],
  customAgents: [],
  selectedFolderId: 'all',
  marketplace: []
};

const $ = (id) => document.getElementById(id);
const on = (id, event, handler) => {
  const node = $(id);
  if (node) node.addEventListener(event, handler);
};

async function boot() {
  config = await loadConfig();
  if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    session = data.session;
    supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      refreshSessionUi();
      if (session) enterApp(false);
    });
  }

  bindUi();
  loadLocalState();
  await loadMarketplace();
  refreshSessionUi();
  renderAll();
}

async function loadConfig() {
  try {
    return await fetch('/api/config').then((response) => response.json());
  } catch (_error) {
    return { supabaseUrl: '', supabaseAnonKey: '', adminEmail: 'parreiracarvalhod@gmail.com' };
  }
}

function bindUi() {
  on('landingLoginBtn', 'click', () => focusAuth());
  on('landingRegisterBtn', 'click', () => focusAuth());
  on('startFreeBtn', 'click', () => focusAuth());
  on('landingAuthLoginBtn', 'click', () => landingAuth('login'));
  on('landingAuthRegisterBtn', 'click', () => landingAuth('register'));
  on('chatForm', 'submit', sendMessage);
  on('prompt', 'keydown', handlePromptKeys);
  on('loginBtn', 'click', login);
  on('registerBtn', 'click', register);
  on('logoutBtn', 'click', logout);
  on('exportBtn', 'click', exportConversations);
  on('newChatBtn', 'click', newConversation);
  on('missionForm', 'submit', createMission);
  on('agentForm', 'submit', saveCustomAgent);
  on('newFolderBtn', 'click', createFolder);
  on('createAgentBtn', 'click', () => $('agentName').focus());
  on('publishAgentBtn', 'click', publishFirstAgent);
  on('donateBtn', 'click', donate);
  on('heroDonateBtn', 'click', () => {
    if (!session) return focusAuth();
    showTab('donate');
  });
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });
}

function focusAuth() {
  $('landingAuth').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('landingEmail').focus();
}

function isAuthenticated() {
  return Boolean(session);
}

function enterApp() {
  if (!isAuthenticated()) return focusAuth();
  $('landing').classList.add('hidden');
  document.querySelector('.shell').classList.add('active');
  showTab('chat', true);
}

function showTab(id, skipAuth = false) {
  if (!skipAuth && !isAuthenticated()) return focusAuth();
  $('landing').classList.add('hidden');
  document.querySelector('.shell').classList.add('active');
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === id));
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === id));
}

function refreshSessionUi() {
  const email = session?.user?.email || '';
  const isAdmin = email.toLowerCase() === (config.adminEmail || '').toLowerCase();
  $('sessionLabel').textContent = email || 'offline';
  $('logoutBtn').classList.toggle('hidden', !session);
  document.querySelectorAll('.admin-only').forEach((node) => node.classList.toggle('hidden', !isAdmin));
}

async function landingAuth(action) {
  $('email').value = $('landingEmail').value;
  $('password').value = $('landingPassword').value;
  if (action === 'login') await login();
  else await register();
}

async function login() {
  if (!supabaseClient) return setAuthStatus('Supabase precisa estar configurado no deploy.');
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
  if (error) return setAuthStatus(error.message);
  enterApp();
}

async function register() {
  if (!supabaseClient) return setAuthStatus('Supabase precisa estar configurado no deploy.');
  const { error } = await supabaseClient.auth.signUp({ email: $('email').value, password: $('password').value });
  setAuthStatus(error ? error.message : 'Conta criada. Confirme o email se o Supabase pedir.');
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  session = null;
  document.querySelector('.shell').classList.remove('active');
  $('landing').classList.remove('hidden');
  refreshSessionUi();
}

function setAuthStatus(text) {
  $('landingAuthStatus').textContent = text;
  notify(text);
}

async function sendMessage(event) {
  event.preventDefault();
  if (!isAuthenticated()) return focusAuth();
  const prompt = $('prompt').value.trim();
  if (!prompt) return;
  $('prompt').value = '';
  addMessage('user', prompt);
  addMessage('assistant', 'Thinking...', true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        mode: $('deepMode').checked ? 'deep' : 'fast',
        debate: $('debateMode').checked,
        history: state.messages.slice(-10),
        userId: session.user.id
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha no chat.');
    state.messages = state.messages.filter((message) => !message.pending);
    renderAgents(data.agents || []);
    addMessage('assistant', data.answer);
    await persistConversation(prompt, data.answer, data.agents || []);
  } catch (error) {
    state.messages = state.messages.filter((message) => !message.pending);
    addMessage('assistant', `Erro: ${error.message}`);
  }
}

function handlePromptKeys(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('chatForm').requestSubmit();
  }
}

function addMessage(role, content, pending = false) {
  state.messages.push({ role, content, pending, at: new Date().toISOString() });
  saveActiveConversation();
  renderMessages();
  renderHistory();
}

function renderMessages() {
  if (!state.messages.length) {
    $('messages').innerHTML = '<article class="message assistant"><small>SYN-CORE</small>Oi! Tudo bem? Como posso ajudar voce hoje?</article>';
    return;
  }
  $('messages').innerHTML = state.messages.map((message) => `
    <article class="message ${message.role}">
      <small>${message.role === 'assistant' ? 'SYN-CORE' : 'voce'}${message.pending ? ' / thinking' : ''}</small>
      ${escapeHtml(message.content)}
    </article>
  `).join('');
  $('messages').scrollTop = $('messages').scrollHeight;
}

function renderAgents(agents) {
  $('agentList').innerHTML = agents.map((agent) => `
    <div class="agent-item">
      <strong>${escapeHtml(agent.role)}</strong>
      <small>${escapeHtml(agent.model || 'router')}</small>
      <span>${escapeHtml(agent.task || 'executing')}</span>
    </div>
  `).join('') || '<small>sem agentes ativos</small>';
}

function loadLocalState() {
  state.conversations = JSON.parse(localStorage.getItem('synapse.conversations') || '[]');
  state.folders = JSON.parse(localStorage.getItem('synapse.agentFolders') || '[]');
  state.customAgents = JSON.parse(localStorage.getItem('synapse.customAgents') || '[]');
  if (!state.conversations.length) state.conversations.push({ id: crypto.randomUUID(), title: 'Nova conversa', messages: [], updatedAt: new Date().toISOString() });
  if (!state.folders.length) state.folders = [{ id: 'default', name: 'Meus agentes' }, { id: 'research', name: 'Pesquisa' }, { id: 'build', name: 'Build' }];
  state.activeConversationId = state.conversations[0].id;
  state.messages = state.conversations[0].messages || [];
}

function persistLocalState() {
  localStorage.setItem('synapse.conversations', JSON.stringify(state.conversations.slice(0, 40)));
  localStorage.setItem('synapse.agentFolders', JSON.stringify(state.folders));
  localStorage.setItem('synapse.customAgents', JSON.stringify(state.customAgents));
}

function saveActiveConversation() {
  const active = state.conversations.find((item) => item.id === state.activeConversationId);
  if (!active) return;
  active.messages = state.messages.filter((message) => !message.pending);
  active.title = active.messages.find((message) => message.role === 'user')?.content.slice(0, 42) || 'Nova conversa';
  active.updatedAt = new Date().toISOString();
  state.conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  persistLocalState();
}

function newConversation() {
  const conversation = { id: crypto.randomUUID(), title: 'Nova conversa', messages: [], updatedAt: new Date().toISOString() };
  state.conversations.unshift(conversation);
  state.activeConversationId = conversation.id;
  state.messages = [];
  persistLocalState();
  renderMessages();
  renderHistory();
  showTab('chat');
}

function openConversation(id) {
  const conversation = state.conversations.find((item) => item.id === id);
  if (!conversation) return;
  state.activeConversationId = id;
  state.messages = conversation.messages || [];
  renderMessages();
  renderHistory();
  showTab('chat');
}

function renderHistory() {
  $('historyList').innerHTML = state.conversations.map((item) => `
    <button class="history-item ${item.id === state.activeConversationId ? 'active' : ''}" data-conversation="${item.id}">${escapeHtml(item.title)}</button>
  `).join('');
  document.querySelectorAll('[data-conversation]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.conversation)));
}

async function persistConversation(prompt, answer, agents) {
  if (!supabaseClient || !session) return;
  await supabaseClient.from('conversations').insert({ user_id: session.user.id, prompt, answer, agent_trace: agents });
}

function createMission(event) {
  event.preventDefault();
  const title = $('missionTitle').value.trim();
  if (!title) return;
  $('missionTitle').value = '';
  $('missionList').insertAdjacentHTML('afterbegin', `
    <article class="mission">
      <strong>${escapeHtml(title)}</strong>
      <small>0% / Analyze > Decompose > Execute > Review > Deliver</small>
      <div class="bar"><span style="width:0%"></span></div>
    </article>
  `);
}

function saveCustomAgent(event) {
  event.preventDefault();
  const name = $('agentName').value.trim();
  const role = $('agentRole').value.trim();
  const prompt = $('agentPrompt').value.trim();
  const folderId = $('agentFolder').value || 'default';
  if (!name || !role || !prompt) return notify('Preencha nome, role e prompt.');
  state.customAgents.unshift({ id: crypto.randomUUID(), name, role, prompt, folderId, createdAt: new Date().toISOString() });
  $('agentName').value = '';
  $('agentRole').value = '';
  $('agentPrompt').value = '';
  persistLocalState();
  renderAgentWorkspace();
  notify('Agente criado.');
}

function createFolder() {
  const name = window.prompt('Nome da pasta');
  if (!name) return;
  state.folders.push({ id: crypto.randomUUID(), name: name.slice(0, 40) });
  persistLocalState();
  renderAgentWorkspace();
}

function renderAgentWorkspace() {
  const folders = [{ id: 'all', name: 'Todos' }, ...state.folders];
  $('folderList').innerHTML = folders.map((folder) => `
    <button class="folder-item ${state.selectedFolderId === folder.id ? 'active' : ''}" data-folder="${folder.id}">${escapeHtml(folder.name)}</button>
  `).join('');
  $('agentFolder').innerHTML = state.folders.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join('');
  const visible = state.selectedFolderId === 'all' ? state.customAgents : state.customAgents.filter((agent) => agent.folderId === state.selectedFolderId);
  $('agentLibrary').innerHTML = visible.map((agent) => `
    <article class="agent-card">
      <strong>${escapeHtml(agent.name)}</strong>
      <small>${escapeHtml(agent.role)} / ${escapeHtml(folderName(agent.folderId))}</small>
      <span>${escapeHtml(agent.prompt)}</span>
      <div class="row">
        <button data-use-agent="${agent.id}">use</button>
        <button data-publish-agent="${agent.id}">post</button>
      </div>
    </article>
  `).join('') || '<small>Nenhum agente criado.</small>';
  document.querySelectorAll('[data-folder]').forEach((button) => button.addEventListener('click', () => {
    state.selectedFolderId = button.dataset.folder;
    renderAgentWorkspace();
  }));
  document.querySelectorAll('[data-use-agent]').forEach((button) => button.addEventListener('click', () => useAgent(button.dataset.useAgent)));
  document.querySelectorAll('[data-publish-agent]').forEach((button) => button.addEventListener('click', () => publishAgent(button.dataset.publishAgent)));
}

function folderName(id) {
  return state.folders.find((folder) => folder.id === id)?.name || 'Sem pasta';
}

function useAgent(id) {
  const agent = state.customAgents.find((item) => item.id === id);
  if (!agent) return;
  $('prompt').value = `Use o agente ${agent.name} (${agent.role}). Regras: ${agent.prompt}\n\n`;
  showTab('chat');
  $('prompt').focus();
}

async function loadMarketplace() {
  if (supabaseClient) {
    const { data } = await supabaseClient.from('agent_marketplace').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) state.marketplace = data;
  }
  if (!state.marketplace.length) {
    state.marketplace = [
      { id: 'starter-architect', name: 'System Architect', role: 'architect', prompt: 'Planeja sistemas e quebra tarefas complexas.', downloads: 0 },
      { id: 'starter-reviewer', name: 'Output Reviewer', role: 'reviewer', prompt: 'Revisa respostas, encontra falhas e melhora clareza.', downloads: 0 }
    ];
  }
}

function renderMarketplace() {
  $('marketGrid').innerHTML = state.marketplace.map((agent) => `
    <article class="market-card">
      <strong>${escapeHtml(agent.name)}</strong>
      <small>${escapeHtml(agent.role)} / downloads ${agent.downloads || 0}</small>
      <span>${escapeHtml(agent.prompt)}</span>
      <button data-download-agent="${agent.id}">download</button>
    </article>
  `).join('');
  document.querySelectorAll('[data-download-agent]').forEach((button) => button.addEventListener('click', () => downloadAgent(button.dataset.downloadAgent)));
}

function publishFirstAgent() {
  const agent = state.customAgents[0];
  if (!agent) return notify('Crie um agente primeiro.');
  publishAgent(agent.id);
}

async function publishAgent(id) {
  if (!session) return focusAuth();
  const agent = state.customAgents.find((item) => item.id === id);
  if (!agent) return;
  const payload = { user_id: session.user.id, name: agent.name, role: agent.role, prompt: agent.prompt, downloads: 0 };
  if (supabaseClient) await supabaseClient.from('agent_marketplace').insert(payload);
  state.marketplace.unshift({ ...payload, id: crypto.randomUUID() });
  renderMarketplace();
  showTab('marketplace');
  notify('Agente publicado.');
}

async function downloadAgent(id) {
  const agent = state.marketplace.find((item) => String(item.id) === String(id));
  if (!agent) return;
  state.customAgents.unshift({ id: crypto.randomUUID(), name: agent.name, role: agent.role, prompt: agent.prompt, folderId: 'default', createdAt: new Date().toISOString() });
  if (supabaseClient && typeof agent.id === 'string' && agent.id.includes('-')) {
    await supabaseClient.from('agent_marketplace').update({ downloads: (agent.downloads || 0) + 1 }).eq('id', agent.id);
  }
  agent.downloads = (agent.downloads || 0) + 1;
  persistLocalState();
  renderAgentWorkspace();
  renderMarketplace();
  notify('Agente baixado.');
}

async function donate() {
  if (!session) return focusAuth();
  $('donateStatus').textContent = 'criando checkout...';
  try {
    const response = await fetch('/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 100, label: 'Synapse AI Supporter' }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao criar checkout.');
    window.location.href = data.url;
  } catch (error) {
    $('donateStatus').textContent = error.message;
  }
}

function exportConversations() {
  const blob = new Blob([JSON.stringify(state.messages, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'synapse-conversation.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function notify(text) {
  $('systemStatus').textContent = text;
  setTimeout(() => { $('systemStatus').textContent = session ? 'online' : 'locked'; }, 3000);
}

function renderAll() {
  renderMessages();
  renderHistory();
  renderAgentWorkspace();
  renderMarketplace();
  renderAgents([]);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
