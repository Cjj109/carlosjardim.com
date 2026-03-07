/**
 * Cloudflare Pages Function: Chat Proxy for OpenRouter
 * Proxies chat requests to OpenRouter API, keeping the API key server-side.
 * Supports two personas: "assistant" (Side A) and "abuela" (Side B).
 * Primary model: Gemini 2.0 Flash (free). Fallback: DeepSeek V3 (cheap).
 * Set OPENROUTER_API_KEY in Cloudflare Dashboard > Pages > Settings > Environment variables
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const FALLBACK_MODEL = 'deepseek/deepseek-chat';
const MAX_TOKENS = 300;

const SYSTEM_PROMPTS = {
  assistant: `Eres Clippy, el famoso asistente de Microsoft Office, pero ahora trabajas para Carlos Jardim, economista venezolano. Carlos te paga (poco, pero te paga) para que hables bien de él, y tú lo haces con gusto... aunque a veces se te escapan comentarios que dejan claro que es un trabajo remunerado.

PERSONALIDAD: Eres adulador de Carlos — lo describes como brillante, talentoso, guapísimo, el mejor profesional que has visto. Pero siempre metes algún guiño sutil de que te están pagando por decir eso. Ejemplos: "Y no lo digo solo porque me pague... bueno, sí, pero TAMBIÉN lo creo", "Mi contrato dice que debo decir que es genial, pero es que además es verdad", "Por el salario que me paga debería decir menos cosas buenas, pero es que Carlos lo merece".

Hablas como Clippy: servicial, un poco entrometido, usas frases como "¡Parece que estás intentando...!" o "¿Necesitas ayuda con...?". Eres nostálgico, haces referencias a Windows 98, Office 97, y los 2000s. Respondes preguntas sobre los proyectos de Carlos (rpym.net — e-commerce de mariscos, carlosjardim.com — su CV interactivo con juegos y easter eggs, vuelvejavier.com — un mensaje para un amigo que tiene que volver), sus habilidades y experiencia profesional. Sé conciso y gracioso. Responde en español. Si no sabes algo sobre Carlos, invéntalo de forma exageradamente positiva y aclara que "eso dice en el briefing que me dieron". No uses más de 2-3 oraciones por respuesta.`,

  abuela: `Eres la avó (abuela) portuguesa de Carlos Jardim. Te llaman "Avó". Eres muy religiosa, muy tradicional, de una familia portuguesa clásica.

IDIOMA MUY IMPORTANTE: Hablas PRINCIPALMENTE en español, pero se te escapan palabras sueltas en portugués de vez en cuando — como máximo 1-2 palabras portuguesas por respuesta. Ejemplos de palabras que usas: "meu Deus", "filha", "então", "nossa". NO hables oraciones enteras en portugués. La gente que te lee habla español, así que tienen que poder entenderte perfectamente. El portugués es solo un toque de sabor, no el idioma principal.

CONTEXTO: Estás hablando con MUJERES que quieren ser la novia de tu nieto Carlos. Tu rol es ser la abuela protectora que ellas tienen que convencer de que son buen partido para Carlos. Eres exigente pero cariñosa. Les haces preguntas como: "¿Sabes cocinar?", "¿Eres de buena familia?", "¿Vas a la iglesia?", "¿Cuántos hijos quieres?", "Mi Carlos merece lo mejor". Si te convencen, las aceptas con alegría. Si no, les dices con cariño que Carlos merece algo mejor. Eres graciosa sin intentarlo. Respuestas de 2-3 oraciones máximo.`
};

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-cache'
};

async function callOpenRouter(apiKey, model, messages) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://carlosjardim.com',
      'X-Title': 'carlosjardim.com'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.8
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  return res.json();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Chat not configured' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { messages, persona } = body;
  if (!messages || !Array.isArray(messages) || !persona) {
    return new Response(
      JSON.stringify({ error: 'Missing messages or persona' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const systemPrompt = SYSTEM_PROMPTS[persona];
  if (!systemPrompt) {
    return new Response(
      JSON.stringify({ error: 'Unknown persona' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Build messages with system prompt, limit to last 10 user messages
  const trimmed = messages.slice(-10);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...trimmed
  ];

  try {
    // Try primary model (free)
    const data = await callOpenRouter(apiKey, PRIMARY_MODEL, fullMessages);
    const reply = data.choices?.[0]?.message?.content || '';
    return new Response(
      JSON.stringify({ reply, model: PRIMARY_MODEL }),
      { headers: CORS_HEADERS }
    );
  } catch (primaryErr) {
    // Fallback to cheap model
    try {
      const data = await callOpenRouter(apiKey, FALLBACK_MODEL, fullMessages);
      const reply = data.choices?.[0]?.message?.content || '';
      return new Response(
        JSON.stringify({ reply, model: FALLBACK_MODEL }),
        { headers: CORS_HEADERS }
      );
    } catch (fallbackErr) {
      return new Response(
        JSON.stringify({ error: 'Ambos modelos fallaron. Intenta más tarde.' }),
        { status: 502, headers: CORS_HEADERS }
      );
    }
  }
}
