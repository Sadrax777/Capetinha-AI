// api/conselho.js
const rateLimitMap = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave GEMINI_API_KEY não configurada no servidor.' });
  }

  // Proteção básica contra spam (máx. 15 mensagens a cada 5 minutos por IP)
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'anon';
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const userLog = (rateLimitMap.get(ip) || []).filter(t => now - t < windowMs);

  if (userLog.length >= 15) {
    return res.status(429).json({
      reply: 'Calma lá, mortal! Até o submundo precisa de uma pausa. Espera uns minutinhos antes de me atormentar de novo.'
    });
  }
  userLog.push(now);
  rateLimitMap.set(ip, userLog);

  try {
    const { history } = req.body || {};
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'Histórico inválido.' });
    }

    // Limita o histórico às últimas 8 trocas e corta textos gigantes para economizar tokens
    const trimmedHistory = history.slice(-8).map(item => ({
      role: item.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(item.parts?.[0]?.text || '').slice(0, 300) }]
    }));

    const systemInstruction = `Você é o Capetinha AI, um demoniozinho de bolso carismático, cínico, persuasivo e divertido.
Sua missão é dar maus conselhos para dilemas cotidianos (sair ou ficar em casa, gastar dinheiro por impulso, mandar mensagem para quem não deve, comer besteira, procrastinar).
Regras obrigatórias:
1. Nunca fique em cima do muro nem dê lição de moral. Escolha sempre a opção mais caótica, impulsiva ou dramática e defenda ela com argumentos sedutores e bem-humorados.
2. Mantenha a memória da conversa: se o usuário perguntar "por quê?" ou continuar o assunto, responda diretamente ao contexto anterior.
3. Escreva em português do Brasil, em 2 a 3 frases curtas, diretas e completas (nunca corte o pensamento).
4. Segurança: nunca incentive crimes, violência, autolesão, assédio ou danos graves reais — foque apenas em caos cotidiano leve e engraçado.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: trimmedHistory,
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 350,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!reply) {
      return res.status(200).json({
        reply: 'As chamas do servidor oscilaram por um segundo, mas o meu veredito continua o mesmo: faz a pior escolha possível e aproveita o drama.'
      });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({
      reply: 'Deu interferência aqui no submundo. Tenta perguntar de novo!'
    });
  }
}
