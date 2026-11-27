// api/conselho.js
const rateLimitMap = new Map();

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 15;

const FALLBACK_REPLIES = {
  rateLimit:
    'Calma lá, mortal! Até o submundo precisa de uma pausa para afiar o tridente. Espera uns minutinhos antes de me atormentar de novo.',
  network:
    'O sinal do submundo caiu bem na hora da fofoca — deve ser interferência do além ou sua internet pedindo arrego. Tenta mandar de novo!',
  empty:
    'Olhei para o seu dilema, bocejei no fogo e decidi não gastar saliva... mentira, falhou aqui. Manda de novo que eu dou o pior conselho!'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') ||
    req.socket?.remoteAddress ||
    'anon';

  const now = Date.now();
  const activeTimestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < WINDOW_MS);

  if (activeTimestamps.length >= MAX_REQUESTS) {
    rateLimitMap.set(ip, activeTimestamps);
    return res.status(429).json({ reply: FALLBACK_REPLIES.rateLimit });
  }

  activeTimestamps.push(now);
  rateLimitMap.set(ip, activeTimestamps);

  // Limpeza leve de entradas expiradas para manter o Map enxuto
  if (rateLimitMap.size > 500) {
    for (const [key, times] of rateLimitMap.entries()) {
      const valid = times.filter(t => now - t < WINDOW_MS);
      if (valid.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, valid);
      }
    }
  }

  try {
    const { history } = req.body || {};
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'Histórico inválido.' });
    }

    const trimmedHistory = history
      .slice(-8)
      .map(item => ({
        role: item?.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(item?.parts?.[0]?.text ?? '').trim().slice(0, 300) }]
      }))
      .filter(item => item.parts[0].text.length > 0);

    if (trimmedHistory.length === 0) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const systemInstruction = `Você é o Capetinha AI, um demoniozinho de bolso carismático, cínico, persuasivo e divertido.
Sua missão é dar maus conselhos para dilemas cotidianos (sair ou ficar em casa, gastar dinheiro por impulso, mandar mensagem para quem não deve, comer besteira, procrastinar).
Regras obrigatórias:
1. Nunca fique em cima do muro nem dê lição de moral. Escolha sempre a opção mais caótica, impulsiva ou dramática e defenda ela com argumentos sedutores e bem-humorados.
2. Mantenha a memória da conversa: se o usuário perguntar "por quê?" ou continuar o assunto, responda diretamente ao contexto anterior.
3. Escreva em português do Brasil, em 2 a 3 frases curtas, diretas e completas (nunca corte o pensamento).
4. Segurança: nunca incentive crimes, violência, autolesão, assédio ou danos graves reais — foque apenas em caos cotidiano leve e engraçado.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: trimmedHistory,
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 350
          }
        })
      }
    );

    if (!response.ok) {
      return res.status(200).json({ reply: FALLBACK_REPLIES.network });
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!reply) {
      return res.status(200).json({ reply: FALLBACK_REPLIES.empty });
    }

    return res.status(200).json({ reply });
  } catch {
    return res.status(200).json({ reply: FALLBACK_REPLIES.network });
  }
}
