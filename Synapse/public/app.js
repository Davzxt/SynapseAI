let supabaseClient = null;
let session = null;
let config = {};
const state = {
  messages: [],
  missions: [],
  agents: [],
  world: { tick: 0, entities: [], structures: [] }
};

const $ = (id) => document.getElementById(id);

async function boot() {
  config = await fetch('/api/config').then((r) => r.json());
  if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    session = data.session;
    supabaseClient.auth.onAuthStateChange((_event, next) => {
      session = next;
      refreshSessionUi();
    });
  }
  seedWorld();
  bindUi();
  refreshSessionUi();
  renderMessages();
  renderAgents([]);
  renderSuggestions();
  renderWorld();
  setInterval(cycleWorld, 2400);
  $('systemStatus').textContent = 'online';
}

function bindUi() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });
  $('chatForm').addEventListener('submit', sendMessage);
  $('loginBtn').addEventListener('click', login);
  $('registerBtn').addEventListener('click', register);
  $('logoutBtn').addEventListener('click', logout);
  $('exportBtn').addEventListener('click', exportConversations);
  $('worldOpenBtn').addEventListener('click', () => showTab('world'));
  $('spawnAgentBtn').addEventListener('click', () => {
    spawnWorldAgent();
    renderWorld();
  });
  $('saveWorldBtn').addEventListener('click', saveWorld);
  $('missionForm').addEventListener('submit', createMission);
  $('saveDirectiveBtn').addEventListener('click', saveDirective);
}

function showTab(id) {
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === id));
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === id));
  if (id === 'world') renderWorld();
}

function refreshSessionUi() {
  const email = session?.user?.email || '';
  const isAdmin = email.toLowerCase() === (config.adminEmail || '').toLowerCase();
  $('sessionLabel').textContent = email || 'offline';
  $('logoutBtn').classList.toggle('hidden', !session);
  document.querySelectorAll('.admin-only').forEach((node) => node.classList.toggle('hidden', !isAdmin));
}

async function login() {
  if (!supabaseClient) return notify('Supabase nao configurado.');
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
  if (error) notify(error.message);
}

async function register() {
  if (!supabaseClient) return notify('Supabase nao configurado.');
  const { error } = await supabaseClient.auth.signUp({ email: $('email').value, password: $('password').value });
  notify(error ? error.message : 'Conta criada. Verifique o email se confirmacao estiver ativa.');
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
}

async function sendMessage(event) {
  event.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt) return;
  $('prompt').value = '';
  addMessage('user', prompt);
  const mode = $('deepMode').checked ? 'deep' : 'fast';
  const debate = $('debateMode').checked;

  renderAgents([{ role: 'orchestrator', task: 'Criando agentes...', status: 'running', model: 'router' }]);
  addMessage('assistant', 'Creating agent...\nExecuting task...\nCombining parallel outputs...', true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        mode,
        debate,
        history: state.messages.slice(-8),
        userId: session?.user?.id || null
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha no chat.');
    state.messages = state.messages.filter((msg) => !msg.pending);
    renderAgents(data.agents || []);
    addMessage('assistant', data.answer);
    persistConversation(prompt, data.answer, data.agents || []);
  } catch (error) {
    state.messages = state.messages.filter((msg) => !msg.pending);
    addMessage('assistant', `Erro: ${error.message}`);
  }
}

function addMessage(role, content, pending = false) {
  state.messages.push({ role, content, pending, at: new Date().toISOString() });
  renderMessages();
}

function renderMessages() {
  $('messages').innerHTML = state.messages.map((msg) => `
    <article class="message ${msg.role}">
      <small>${msg.role}${msg.pending ? ' / streaming simulated' : ''}</small>
      ${escapeHtml(msg.content)}
    </article>
  `).join('');
  $('messages').scrollTop = $('messages').scrollHeight;
}

function renderAgents(agents) {
  state.agents = agents;
  $('agentList').innerHTML = agents.map((agent) => `
    <div class="agent-item">
      <strong>${escapeHtml(agent.role)}</strong>
      <small>${escapeHtml(agent.model || 'model-router')}</small>
      <span>${escapeHtml(agent.task || 'Executing task...')}</span>
      <small>${escapeHtml(agent.status || 'complete')}</small>
    </div>
  `).join('') || '<small>aguardando missao</small>';
}

function renderSuggestions() {
  const suggestions = ['enhance prompt', 'create mission', 'compare answers', 'summarize context', 'open arena'];
  $('suggestions').innerHTML = suggestions.map((item) => `<button type="button">${item}</button>`).join('');
}

async function persistConversation(prompt, answer, agents) {
  if (!supabaseClient || !session) return;
  await supabaseClient.from('conversations').insert({
    user_id: session.user.id,
    prompt,
    answer,
    agent_trace: agents
  });
}

function createMission(event) {
  event.preventDefault();
  const title = $('missionTitle').value.trim();
  if (!title) return;
  $('missionTitle').value = '';
  state.missions.unshift({
    id: crypto.randomUUID(),
    title,
    progress: 0,
    steps: ['Analyze', 'Decompose', 'Execute', 'Review', 'Deliver']
  });
  renderMissions();
}

function renderMissions() {
  $('missionList').innerHTML = state.missions.map((mission) => `
    <article class="mission">
      <strong>${escapeHtml(mission.title)}</strong>
      <small>${mission.progress}% / ${mission.steps.join(' > ')}</small>
      <div class="bar"><span style="width:${mission.progress}%"></span></div>
    </article>
  `).join('');
}

function seedWorld() {
  for (let i = 0; i < 10; i += 1) spawnWorldAgent();
}

function spawnWorldAgent() {
  state.world.entities.push({
    id: crypto.randomUUID(),
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - .5) * .015,
    vy: (Math.random() - .5) * .015,
    role: ['architect', 'builder', 'scout', 'critic'][Math.floor(Math.random() * 4)]
  });
}

function cycleWorld() {
  state.world.tick += 1;
  for (const entity of state.world.entities) {
    entity.x = clamp(entity.x + entity.vx, .03, .97);
    entity.y = clamp(entity.y + entity.vy, .05, .95);
    if (entity.x <= .03 || entity.x >= .97) entity.vx *= -1;
    if (entity.y <= .05 || entity.y >= .95) entity.vy *= -1;
  }
  if (state.world.tick % 5 === 0 && state.world.structures.length < 28) {
    state.world.structures.push({ x: Math.random(), y: Math.random(), size: 10 + Math.random() * 28 });
  }
  renderWorld();
}

function renderWorld() {
  drawWorld($('worldCanvas'));
  drawWorld($('miniWorld'));
  $('worldLog').textContent = [
    `tick: ${state.world.tick}`,
    `agents: ${state.world.entities.length}`,
    `structures: ${state.world.structures.length}`,
    'cycle: move > build > store'
  ].join('\n');
}

function drawWorld(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  for (const item of state.world.structures) {
    const x = item.x * w;
    const y = item.y * h;
    ctx.strokeRect(x - item.size / 2, y - item.size / 2, item.size, item.size);
  }
  for (const entity of state.world.entities) {
    const x = entity.x * w;
    const y = entity.y * h;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + entity.vx * 900, y + entity.vy * 900);
    ctx.stroke();
  }
}

async function saveWorld() {
  if (!supabaseClient || !session) return notify('Faca login para salvar o mundo.');
  const { error } = await supabaseClient.from('world_states').insert({ user_id: session.user.id, state: state.world });
  notify(error ? error.message : 'World state salvo.');
}

async function saveDirective() {
  const email = session?.user?.email || '';
  if (email.toLowerCase() !== (config.adminEmail || '').toLowerCase()) return notify('Acesso admin negado.');
  const response = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, key: 'ai_directive', value: { directive: $('aiDirective').value } })
  });
  const data = await response.json();
  notify(response.ok ? 'Configuracao salva.' : data.error);
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
  setTimeout(() => { $('systemStatus').textContent = 'online'; }, 3000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

boot();
