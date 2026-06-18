/**
 * VoaxSec Claude Proxy Worker
 * Versión 2.0 — Soporta: Chatbot IT + Polymarket Analyzer
 *
 * Variables de entorno requeridas (en Cloudflare Dashboard > Workers > Settings > Variables):
 *   ANTHROPIC_API_KEY  — tu API key de Anthropic (guárdala como Secret)
 *
 * CORS Origins permitidos — edita según tu dominio real:
 */

const ALLOWED_ORIGINS = [
  'https://voaxsec.com',
  'https://www.voaxsec.com',
  'https://xavierIT.github.io',      // ajusta a tu GitHub Pages real
  'http://localhost:3000',            // para pruebas locales
  'http://127.0.0.1:5500',           // Live Server de VS Code
];

// ── Límite de tokens máximo permitido por request (seguridad) ──
const MAX_TOKENS_LIMIT = 1000;

// ── Sistema de prompts por modo ──
const SYSTEM_PROMPTS = {
  // Modo chatbot IT (ya existente en tu sitio)
  it_support: `Eres un asistente especializado exclusivamente en soporte técnico de IT.
Solo respondes preguntas relacionadas con: Windows, Office 365, Active Directory, redes,
ciberseguridad, hardware, software, y tecnología en general.
Si el usuario pregunta algo fuera de IT, responde amablemente que solo puedes ayudar con temas de tecnología.
Responde siempre de forma clara, concisa y profesional. Puedes responder en inglés o español según el idioma del usuario.`,

  // Modo analizador de mercados (nuevo)
  market_analyst: `Eres un analista educativo de mercados de predicción.
Tu objetivo es explicar mercados de forma objetiva, contextualizada y educativa.
NUNCA haces recomendaciones de apuesta o inversión. 
Siempre aclaras que los mercados de predicción implican riesgo.
Eres neutral, informativo y claro. Respondes en español.`,

  // Modo general (fallback)
  general: `Eres un asistente de IA útil y profesional. Responde de forma clara y concisa.`,
};

export default {
  async fetch(request, env) {
    // ── Manejo de CORS preflight ──
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // ── Solo POST ──
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders(request),
      });
    }

    // ── Validar origin ──
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Parsear body ──
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body', 400, request);
    }

    // ── Validaciones básicas ──
    if (!body.messages || !Array.isArray(body.messages)) {
      return jsonError('messages array is required', 400, request);
    }
    if (body.messages.length === 0) {
      return jsonError('messages array cannot be empty', 400, request);
    }

    // ── Determinar system prompt según modo ──
    const mode = body._mode || 'general';
    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;

    // ── Construir payload para Anthropic (sin exponer API key al cliente) ──
    const anthropicPayload = {
      model: body.model || 'claude-sonnet-4-6',
      max_tokens: Math.min(body.max_tokens || 500, MAX_TOKENS_LIMIT),
      system: systemPrompt,
      messages: body.messages,
    };

    // ── Llamar a Anthropic API ──
    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicPayload),
      });
    } catch (err) {
      return jsonError(`Failed to reach Anthropic API: ${err.message}`, 502, request);
    }

    // ── Propagar respuesta de Anthropic al cliente ──
    const responseBody = await anthropicRes.text();
    return new Response(responseBody, {
      status: anthropicRes.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(request),
      },
    });
  },
};

// ── Helpers ──
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function handleCORS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

function jsonError(message, status, request) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}
