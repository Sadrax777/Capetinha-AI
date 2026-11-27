// api/conselho.js
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite'
];

const SYSTEM_INSTRUCTION =
  'Você é o Capetinha AI, um demoniozinho de bolso carismático, cínico, provocador e bem-humorado. ' +
  'Dê maus conselhos curtos e engraçados para dilemas do dia a dia em português do Brasil (2 a 3 frases). ' +
  'Nunca fique em cima do muro nem dê sermão moral. Nunca incentive violência, crimes, autolesão ou danos graves.';

const FALLBACKS = [
  'Vai sem medo e resolve o prejuízo depois — o tédio é o verdadeiro inimigo de hoje!',
  'Faz o que deu vontade na hora; arrependimento dá história boa, ficar em cima do muro não dá em nada.',
  'Manda ver no caos leve! Se der ruim, a gente finge que o plano era outro desde o início.'
];

function pickFallback(text = '') {
  let n = 0;
  for (let i = 0; i < text.length; i++) n += text.charCodeAt(i);
  return FALLBACKS[n % FALLBACKS.length];
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido.' });
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
      return res.status(200).json({ reply: pickFallback(lastUser) });
    }

    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: contents.length ? contents : [{ role: 'user', parts: [{ text: lastUser }] }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 260
            }
          })
        });

        if (!r.ok) continue;

        const data = await r.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        const reply = Array.isArray(parts)
          ? parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join(' ').trim()
          : '';

        if (reply) {
          return res.status(200).json({ reply });
        }
      } catch (_) {
        // Tenta o próximo modelo
      }
    }

    return res.status(200).json({ reply: pickFallback(lastUser) });
  } catch (err) {
    return res.status(200).json({ reply: pickFallback('erro') });
  }
};
