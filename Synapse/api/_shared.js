export const adminEmail = process.env.ADMIN_EMAIL || 'parreiracarvalhod@gmail.com';

export const groqModels = [
  { id: 'llama-3.3-70b-versatile', tier: 'deep', strengths: ['analysis', 'planning', 'coding', 'long-form'] },
  { id: 'llama-3.1-8b-instant', tier: 'fast', strengths: ['chat', 'speed', 'routing'] },
  { id: 'mixtral-8x7b-32768', tier: 'balanced', strengths: ['reasoning', 'summaries', 'agents'] },
  { id: 'gemma2-9b-it', tier: 'fast', strengths: ['concise', 'classification', 'review'] },
  { id: 'qwen-qwq-32b', tier: 'deep', strengths: ['math', 'logic', 'debate'] },
  { id: 'deepseek-r1-distill-llama-70b', tier: 'deep', strengths: ['reasoning', 'self-review'] }
];

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function sanitizeText(value, max = 12000) {
  return String(value || '').replace(/\u0000/g, '').slice(0, max).trim();
}

export function selectModel(prompt, mode = 'fast', role = 'orchestrator') {
  const text = prompt.toLowerCase();
  if (mode === 'fast') return 'llama-3.1-8b-instant';
  if (role.includes('review') || text.includes('melhore') || text.includes('critique')) return 'deepseek-r1-distill-llama-70b';
  if (text.includes('codigo') || text.includes('arquitetura') || text.includes('planeje')) return 'llama-3.3-70b-versatile';
  if (text.includes('debate') || text.includes('matematica') || text.includes('logica')) return 'qwen-qwq-32b';
  return 'mixtral-8x7b-32768';
}

export function makeAgents(prompt, mode = 'deep') {
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

export async function callGroq({ model, messages, temperature = 0.4 }) {
  if (!process.env.GROQ_API_KEY) {
    return {
      simulated: true,
      content: 'Modo simulado ativo: configure GROQ_API_KEY nas variaveis de ambiente da Vercel.'
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
