import { callGroq, makeAgents, sanitizeText, selectModel, sendJson } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metodo nao permitido.' });

  try {
    const prompt = sanitizeText(req.body?.prompt);
    const mode = req.body?.mode === 'deep' ? 'deep' : 'fast';
    const debate = Boolean(req.body?.debate);
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

    if (!prompt) return sendJson(res, 400, { error: 'Prompt vazio.' });

    const agents = makeAgents(`${prompt} ${debate ? 'debate' : ''}`, mode);
    const agentRuns = await Promise.all(agents.map(async (agent) => {
      const system = [
        `Voce e um agente Synapse AI com papel: ${agent.role}.`,
        `Tarefa: ${agent.task}`,
        'Responda em pt-BR, de forma objetiva, sem emojis, com raciocinio util e verificavel.'
      ].join('\n');

      const messages = [
        { role: 'system', content: system },
        ...history.map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: sanitizeText(item.content, 2000)
        })),
        { role: 'user', content: prompt }
      ];

      const output = await callGroq({
        model: agent.model,
        messages,
        temperature: agent.role === 'critico' ? 0.2 : 0.45
      });

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

    sendJson(res, 200, { agents: agentRuns, answer: review.content, model: synthesisModel });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Erro inesperado.' });
  }
}
