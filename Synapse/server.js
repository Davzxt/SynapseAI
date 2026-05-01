import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const adminEmail = process.env.ADMIN_EMAIL || 'parreiracarvalhod@gmail.com';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

const groqModels = [
  { id: 'llama-3.3-70b-versatile', tier: 'deep', strengths: ['analysis', 'planning', 'coding', 'long-form'] },
  { id: 'llama-3.1-8b-instant', tier: 'fast', strengths: ['chat', 'speed', 'routing'] },
  { id: 'mixtral-8x7b-32768', tier: 'balanced', strengths: ['reasoning', 'summaries', 'agents'] },
  { id: 'gemma2-9b-it', tier: 'fast', strengths: ['concise', 'classification', 'review'] },
  { id: 'qwen-qwq-32b', tier: 'deep', strengths: ['math', 'logic', 'debate'] },
  { id: 'deepseek-r1-distill-llama-70b', tier: 'deep', strengths: ['reasoning', 'self-review'] }
];

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeText(value, max = 12000) {
  return String(value || '').replace(/\u0000/g, '').slice(0, max).trim();
}

function selectModel(prompt, mode = 'fast', role = 'orchestrator') {
  const text = prompt.toLowerCase();
  if (mode === 'fast') return 'llama-3.1-8b-instant';
  if (role.includes('review') || text.includes('melhore') || text.includes('critique')) return 'deepseek-r1-distill-llama-70b';
  if (text.includes('codigo') || text.includes('arquitetura') || text.includes('planeje')) return 'llama-3.3-70b-versatile';
  if (text.includes('debate') || text.includes('matematica') || text.includes('logica')) return 'qwen-qwq-32b';
  return 'mixtral-8x7b-32768';
}

function makeAgents(prompt, mode = 'deep') {
  if (mode === 'fast') {
    return [{ role: 'executor', task: 'Responder diretamente com foco em velocidade.', memory: [], model: selectModel(prompt, 'fast') }];
  }

  const base = [
    ['arquiteto', 'Decompor o objetivo, mapear riscos e criar uma estrategia.'],
    ['pesquisador', 'Extrair requisitos, contexto e lacunas importantes.'],
    ['executor', 'Produzir a resposta principal com passos acionaveis.'],
    ['critico', 'Encontrar falhas, contradicoes e pontos fracos.'],
    ['sintetizador', 'Combinar as melhores partes em uma resposta final clara.']
  ];

  if (prompt.toLowerCase().includes('debate')) {
    base.splice(3, 0, ['oponente', 'Defender uma alternativa e tensionar premissas.']);
  }

  return base.map(([role, task]) => ({
    role,
    task,
    memory: [],
    model: selectModel(prompt, mode, role)
  }));
}

async function callGroq({ model, messages, temperature = 0.4 }) {
  if (!process.env.GROQ_API_KEY) {
    return {
      simulated: true,
      content: 'Modo simulado ativo: configure GROQ_API_KEY no .env para respostas reais via Groq.'
    };
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: 1400 })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Groq respondeu ${response.status}: ${details.slice(0, 500)}`);
  }

  const data = await response.json();
  return { content: data.choices?.[0]?.message?.content || 'Sem conteudo retornado.' };
}

async function logEvent(userId, type, payload) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from('logs').insert({ user_id: userId || null, type, payload });
}

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl,
    supabaseAnonKey,
    adminEmail,
    models: groqModels.map(({ id, tier, strengths }) => ({ id, tier, strengths }))
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const prompt = sanitizeText(req.body.prompt);
    const mode = req.body.mode === 'deep' ? 'deep' : 'fast';
    const debate = Boolean(req.body.debate);
    const userId = sanitizeText(req.body.userId, 128);
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];

    if (!prompt) return res.status(400).json({ error: 'Prompt vazio.' });

    const agents = makeAgents(`${prompt} ${debate ? 'debate' : ''}`, mode);
    const agentRuns = await Promise.all(agents.map(async (agent) => {
      const system = [
        `Voce e um agente Synapse AI com papel: ${agent.role}.`,
        `Tarefa: ${agent.task}`,
        'Responda em pt-BR, de forma objetiva, sem emojis, com raciocinio util e verificavel.'
      ].join('\n');

      const messages = [
        { role: 'system', content: system },
        ...history.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: sanitizeText(item.content, 2000) })),
        { role: 'user', content: prompt }
      ];

      const output = await callGroq({ model: agent.model, messages, temperature: agent.role === 'critico' ? 0.2 : 0.45 });
      return { ...agent, status: 'complete', output: output.content, simulated: output.simulated || false };
    }));

    const synthesisModel = selectModel(prompt, mode, 'reviewer');
    const synthesis = await callGroq({
      model: synthesisModel,
      temperature: 0.25,
      messages: [
        { role: 'system', content: 'Voce e o sintetizador final do Synapse AI. Combine os agentes, remova repeticoes, corrija erros e entregue a melhor resposta em pt-BR.' },
        { role: 'user', content: JSON.stringify({ prompt, agentRuns }, null, 2).slice(0, 18000) }
      ]
    });

    const review = await callGroq({
      model: selectModel(prompt, mode, 'reviewer'),
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Revise a resposta final. Se houver melhoria clara, aplique. Caso contrario, preserve.' },
        { role: 'user', content: synthesis.content }
      ]
    });

    await logEvent(userId, 'chat.completed', { mode, debate, agents: agentRuns.map(({ role, model }) => ({ role, model })) });
    res.json({ agents: agentRuns, answer: review.content, model: synthesisModel });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro inesperado.' });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  const email = sanitizeText(req.body.email, 320).toLowerCase();
  if (email !== adminEmail.toLowerCase()) return res.status(403).json({ error: 'Acesso negado.' });
  if (!supabaseAdmin) return res.status(501).json({ error: 'Configure SUPABASE_SERVICE_ROLE_KEY para escrita admin pelo backend.' });

  const key = sanitizeText(req.body.key, 120);
  const value = req.body.value || {};
  const { error } = await supabaseAdmin.from('system_settings').upsert({ key, value, updated_by: email });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Synapse AI rodando em http://localhost:${port}`);
});
