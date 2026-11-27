// api/conselho.js
const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash'
];

const SYSTEM_INSTRUCTION = `Você é o Capetinha AI, um demoniozinho de bolso carismático, cínico, provocador e bem-humorado.
Sua missão é dar maus conselhos para dilemas do dia a dia (sair ou ficar, comprar por impulso, mandar mensagem, comer besteira, procrastinar, tomar decisões duvidosas).
Regras:
1. Nunca fique em cima do muro nem dê sermão ou lição de moral. Escolha sempre o caminho mais caótico, impulsivo ou dramático dentro do humor leve.
2. Responda sempre em português do Brasil, em 2 a 3 frases curtas, diretas e completas.
3. Considere o histórico da conversa quando houver continuação.
4. Nunca incentive violência, crimes, autolesão, assédio ou danos graves reais.`;

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido. Use POST.' });
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }

    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const contents = rawHistory
      .slice(-6)
      .map((m) => {
        const role = m && m.role === 'model' ? 'model' : 'user';
        const partsArr = Array.isArray(m && m.parts) ? m.parts : [];
        const txt = partsArr
          .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
          .join(' ')
          .trim()
          .slice(0, 280);
        return txt ? { role, parts: [{ text: txt }] } : null;
      })
      .filter(Boolean);

    const lastUser =
      [...contents].reverse().find((item) => item.role === 'user')?.parts?.[0]?.text || '';

    if (!lastUser) {
      return res.status(400).json({ error: 'Escreve uma pergunta primeiro.' });
    }

    const apiKey = process.env.GEMINI_API_KEY ? String(process.env.GEMINI_API_KEY).trim() : '';
    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY não está configurada na Vercel.'
      });
    }

    let lastError = 'Sem resposta dos modelos';

    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents,
            generationConfig: {
              temperature: 0.95,
              maxOutputTokens: 320
            }
          })
        });

        const data = await r.json().catch(() => null);

        if (!r.ok) {
          lastError = `${model} (${r.status}): ${data?.error?.message || 'erro na API do Gemini'}`;
          continue;
        }

        const parts = data?.candidates?.[0]?.content?.parts;
        const reply = Array.isArray(parts)
          ? parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join(' ').trim()
          : '';

        if (reply) {
          return res.status(200).json({ reply });
        }

        lastError = `${model}: veio sem texto na resposta`;
      } catch (err) {
        lastError = `${model}: ${err?.message || 'falha de conexão'}`;
      }
    }

    return res.status(502).json({ error: lastError });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Erro interno no servidor.' });
  }
};
