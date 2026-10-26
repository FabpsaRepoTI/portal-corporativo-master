// ============================================================
// sitFechaIA.service.js
// Módulo SIT — extracción de la fecha de vencimiento (o emisión) de un
// PDF técnico de proveedor con Claude.
// El texto del PDF se extrae con pdf-parse; si el PDF es escaneado (sin
// capa de texto) se manda el PDF completo para que Claude lo lea.
// ============================================================

const Anthropic = require("@anthropic-ai/sdk");
const pdfParse = require("pdf-parse/lib/pdf-parse.js"); // ruta directa: el index de pdf-parse 1.x corre un modo de prueba

const MODELO = process.env.SIT_FECHA_MODEL || "claude-haiku-5-5";
const MIN_TEXTO = 80; // menos caracteres que esto = PDF escaneado / sin texto útil

const INSTRUCCIONES = `Eres un asistente que extrae fechas de documentos técnicos de proveedores de ingredientes alimentarios.

El siguiente texto es el contenido extraído de un PDF. Busca:
1. Fecha de vencimiento o expiración (la más importante)
2. Si no hay vencimiento, fecha de emisión o expedición

Reglas:
- Las fechas pueden estar en español o inglés
- Formatos comunes: "Válido hasta:", "Expiry date:", "Vigente hasta:", "Fecha de emisión:", "Valid through:", "Date of issue:"
- Si ves un año solo como "2025" sin mes, ignóralo
- Si hay varias fechas, elige la de vencimiento más próxima al futuro
- NO calcules fechas, devuelve solo lo que dice el documento

Devuelve ÚNICAMENTE este JSON, sin texto adicional:
{"fecha": "YYYY-MM-DD", "tipo": "vencimiento|emision", "confianza": "alta|media|baja", "texto_original": "fragmento exacto donde encontraste la fecha"}

Si no encuentras ninguna fecha útil: {"fecha": null}`;

let _cliente = null;
function _client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY no está configurada"), { configuracion: true });
  }
  if (!_cliente) _cliente = new Anthropic(); // toma ANTHROPIC_API_KEY del entorno
  return _cliente;
}

/** Saca el primer objeto JSON de la respuesta (por si viene con texto o ``` alrededor). */
function _parsearJson(texto) {
  const limpio = String(texto || "").trim();
  try {
    return JSON.parse(limpio);
  } catch {
    const m = limpio.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("La respuesta no trae JSON");
    return JSON.parse(m[0]);
  }
}

/** Valida y normaliza la respuesta del modelo. */
function _normalizar(r) {
  if (!r || r.fecha === null || r.fecha === undefined) return { fecha: null };
  const fecha = String(r.fecha).trim();
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !isNaN(Date.parse(fecha + "T00:00:00Z"));
  if (!valida) return { fecha: null };
  return {
    fecha,
    tipo: r.tipo === "emision" ? "emision" : "vencimiento",
    confianza: ["alta", "media", "baja"].includes(r.confianza) ? r.confianza : "baja",
    texto_original: r.texto_original ? String(r.texto_original).slice(0, 500) : null,
  };
}

/**
 * Extrae la fecha de un PDF.
 * Devuelve { fecha: 'YYYY-MM-DD', tipo, confianza, texto_original, fuente } o { fecha: null, fuente }.
 * fuente: 'texto' (pdf-parse) o 'pdf' (escaneado, lo leyó Claude directamente).
 */
async function extraerFechaDePdf(buffer) {
  let texto = "";
  try {
    texto = (await pdfParse(buffer)).text || "";
  } catch {
    texto = ""; // PDF dañado o sin capa de texto: se intenta mandarlo completo
  }
  texto = texto.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const conTexto = texto.length >= MIN_TEXTO;

  const content = conTexto
    ? [{ type: "text", text: `${INSTRUCCIONES}\n\nTEXTO DEL DOCUMENTO:\n${texto}` }]
    : [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
        { type: "text", text: `${INSTRUCCIONES}\n\nEl documento va adjunto como PDF (es escaneado, no tiene texto extraíble).` },
      ];

  const response = await _client().messages.create({
    model: MODELO,
    max_tokens: 4000,
    output_config: { effort: "low" }, // extracción simple: menos razonamiento, más rápido y barato
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw Object.assign(new Error("El modelo no procesó el documento"), { rechazo: true });
  }

  const salida = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { ..._normalizar(_parsearJson(salida)), fuente: conTexto ? "texto" : "pdf" };
}

module.exports = { extraerFechaDePdf, MODELO };
