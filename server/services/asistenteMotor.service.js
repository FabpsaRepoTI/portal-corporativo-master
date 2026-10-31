// server/services/asistenteMotor.service.js
// Motor compartido de los asistentes del portal (Fabi en Mesa de Servicio,
// Fabi · Información Técnica en el SIT y Fab-i · Asistente SGC). Cada asistente aporta sus propias
// instrucciones y su juego de herramientas; aquí vive el ciclo con la API:
//   Claude pide una herramienta → se ejecuta con el login de la SESIÓN (solo
//   las del juego de ese asistente) → se le devuelve el resultado → al final
//   responde con el JSON { respuesta, destino }.
const Anthropic = require("@anthropic-ai/sdk");
const { ejecutarHerramienta } = require("./fabiTools.service");

const MAX_RONDAS_HERRAMIENTAS = 4;
let _cliente = null;
function _client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI_UNAVAILABLE");
  if (!_cliente) _cliente = new Anthropic({ timeout: 45000, maxRetries: 1 });
  return _cliente;
}

const _falla = (detalle) => Object.assign(new Error("AI_UNAVAILABLE"), { detalle });

/**
 * conversar({ system, herramientas, messages, login, destinos, alResultado?, model?, effort? })
 *  - destinos: Map clave → { nombre, to } (el modelo elige una clave o "")
 *  - alResultado(nombreHerramienta, resultadoParseado): opcional, para que el
 *    asistente arme un botón dinámico (p. ej. la ficha de un artículo)
 *  - model / effort: opcionales por asistente (por omisión ANTHROPIC_MODEL y
 *    el esfuerzo por defecto del modelo)
 *  - timeoutMs: opcional, tiempo límite por llamada (por omisión el del cliente, 45 s)
 *  - salidaExtra: opcional, campos adicionales del JSON de salida (p. ej. el
 *    borrador de NC de Fab-i SGC); se devuelven tal cual junto a respuesta/destino
 * Devuelve { respuesta, destino, ...salidaExtra } ya validados.
 */
async function conversar({ system, herramientas, messages, login, destinos, alResultado, model, effort, maxTokens = 2000, maxRespuesta = 2500, salidaExtra = null, timeoutMs = null }) {
  if (!login) throw _falla("sin login de sesión");
  const client = _client();
  // salidaExtra: { campo: schema } opcional que se agrega (requerido) al JSON de salida
  const extra = salidaExtra || {};
  const output_config = {
    ...(effort ? { effort } : {}),
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["respuesta", "destino", ...Object.keys(extra)],
        properties: {
          respuesta: { type: "string" },
          destino: { type: "string", enum: ["", ...destinos.keys()] },
          ...extra,
        },
      },
    },
  };

  const conversacion = messages.map((m) => ({ role: m.role, content: m.content }));
  let response;
  for (let ronda = 0; ; ronda++) {
    try {
      response = await client.messages.create({
        model: model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        tools: herramientas,
        // Última ronda: ya no se ofrecen herramientas, tiene que responder
        tool_choice: ronda >= MAX_RONDAS_HERRAMIENTAS ? { type: "none" } : { type: "auto" },
        messages: conversacion,
        output_config,
      }, timeoutMs ? { timeout: timeoutMs } : undefined);
    } catch (err) {
      throw _falla(err instanceof Anthropic.APIError ? `API de Anthropic ${err.status}: ${err.message}` : err.message);
    }
    if (response.stop_reason !== "tool_use") break;

    // Todas las herramientas de la ronda en paralelo; todos los resultados en un solo mensaje
    const pedidas = response.content.filter((b) => b.type === "tool_use");
    const resultados = await Promise.all(
      pedidas.map(async (b) => {
        const r = await ejecutarHerramienta(b.name, login, b.input, herramientas);
        if (r.ok && alResultado) {
          try { alResultado(b.name, JSON.parse(r.contenido)); } catch { /* sin efecto */ }
        }
        return { type: "tool_result", tool_use_id: b.id, content: r.contenido, ...(r.ok ? {} : { is_error: true }) };
      }),
    );
    conversacion.push({ role: "assistant", content: response.content });
    conversacion.push({ role: "user", content: resultados });
  }

  if (response.stop_reason === "refusal") throw _falla("refusal");
  if (response.stop_reason === "max_tokens") throw _falla("max_tokens");
  let result;
  try {
    result = JSON.parse(response.content.filter((x) => x.type === "text").map((x) => x.text).join(""));
  } catch {
    throw _falla("respuesta sin JSON válido");
  }
  if (
    typeof result.respuesta !== "string" ||
    result.respuesta.length > maxRespuesta ||
    typeof result.destino !== "string" ||
    (result.destino && !destinos.has(result.destino))
  )
    throw _falla("respuesta fuera de formato");
  return result;
}

module.exports = { conversar };
