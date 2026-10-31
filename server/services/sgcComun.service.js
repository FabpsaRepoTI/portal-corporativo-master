// server/services/sgcComun.service.js
// Utilidades y catálogos de estatus compartidos por los services del SGC/SGI.
const { HOY_SQL } = require("./sgcFolio.service");

const NC_ESTATUS = { 1: "Abierta", 2: "En análisis", 3: "En ejecución", 4: "Verificación", 5: "Cerrada", 6: "Cancelada" };
const AC_ESTATUS = { 1: "Abierta", 2: "En ejecución", 3: "Pendiente verificación", 4: "Verificada eficaz", 5: "Cerrada" };
const PLAN_ESTATUS = { 1: "Pendiente", 2: "En proceso", 3: "Completada" };
const AUD_ESTATUS = { 1: "Planeada", 2: "En curso", 3: "Completada", 4: "Cancelada" };
const AUD_TIPO = { 1: "Interna", 2: "Externa", 3: "Certificación" };
const HALLAZGO_TIPO = { 1: "No conformidad", 2: "Observación", 3: "Oportunidad de mejora" };
const FRECUENCIA = { 1: "Mensual", 2: "Trimestral", 3: "Semestral", 4: "Anual" };
const RIESGO_TIPO = { 1: "Riesgo", 2: "Oportunidad" };
const RIESGO_ESTATUS = { 1: "Activo", 2: "Mitigado", 3: "Aceptado" };
// Categorías de riesgo (sgc_riesgos.categoria 1–5): edita los nombres aquí
const RIESGO_CATEGORIA = { 1: "Operativo", 2: "Calidad", 3: "Inocuidad", 4: "Legal y cumplimiento", 5: "Financiero" };

// Mesa de Servicio SGI
const MSI_ESTATUS = { 1: "Recibida", 2: "En atención", 3: "En espera", 4: "Resuelta", 5: "Cancelada" };
const MSI_PRIORIDAD = { 1: "Baja", 2: "Media", 3: "Alta" };

// Mapa de procesos
const PROCESO_TIPO = { 1: "Estratégico", 2: "Operativo", 3: "Apoyo" };
const RELACION_TIPO = { 1: "Alimenta", 2: "Controla", 3: "Apoya" };

/** Nivel de riesgo = probabilidad × impacto: <5 bajo, 5–12 medio, >12 alto. */
function nivelRiesgo(nivel) {
  if (nivel > 12) return { clave: "alto", label: "Alto" };
  if (nivel >= 5) return { clave: "medio", label: "Medio" };
  return { clave: "bajo", label: "Bajo" };
}
const NIVEL_RANGO = { bajo: [1, 4], medio: [5, 12], alto: [13, 25] };
const NIVEL_ALTO_MIN = 13;

const _err = (res, status, error) => res.status(status).json({ ok: false, error });

function _int(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Lista "1,2,3" o [1,2,3] → [1,2,3] (solo los valores permitidos). */
function _ints(v, permitidos) {
  const lista = Array.isArray(v) ? v : String(v ?? "").split(",");
  return [...new Set(lista.map((x) => _int(x)).filter((n) => n !== null && (!permitidos || permitidos.includes(n))))];
}

/** 'YYYY-MM-DD' válido o null. */
function _fecha(v) {
  const s = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number.isNaN(new Date(s + "T00:00:00Z").getTime()) ? null : s;
}

function _texto(v, max) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

const _mismo = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();

/** Error de FK / CHECK de SQL Server → referencia inválida (400). */
const _esReferenciaInvalida = (err) => err?.number === 547;

/** ?page=1&limit=20 (acepta también pagina/limite). */
function _paginacion(q) {
  const page = Math.max(1, _int(q.page ?? q.pagina) || 1);
  const limit = Math.min(500, Math.max(1, _int(q.limit ?? q.limite) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

/** Agrega `col IN (@p0, @p1…)` al request y devuelve el fragmento SQL. */
function _in(request, col, nombre, valores, tipo) {
  const params = valores.map((v, i) => {
    request.input(`${nombre}${i}`, tipo, v);
    return `@${nombre}${i}`;
  });
  return `${col} IN (${params.join(", ")})`;
}

/** Texto para LIKE con comodines escapados. */
const _like = (texto) => `%${String(texto).replace(/[[%_]/g, "[$&]")}%`;

async function _rollback(tx) {
  try {
    await tx.rollback();
  } catch {
    /* la transacción ya se cerró */
  }
}

/** Corta una petición dentro de una transacción con un error HTTP. */
async function _abortar(tx, res, status, error) {
  await _rollback(tx);
  return _err(res, status, error);
}

module.exports = {
  HOY_SQL,
  NC_ESTATUS,
  AC_ESTATUS,
  PLAN_ESTATUS,
  AUD_ESTATUS,
  AUD_TIPO,
  HALLAZGO_TIPO,
  FRECUENCIA,
  RIESGO_TIPO,
  RIESGO_ESTATUS,
  RIESGO_CATEGORIA,
  MSI_ESTATUS,
  MSI_PRIORIDAD,
  PROCESO_TIPO,
  RELACION_TIPO,
  NIVEL_RANGO,
  NIVEL_ALTO_MIN,
  nivelRiesgo,
  _err,
  _int,
  _ints,
  _fecha,
  _texto,
  _mismo,
  _esReferenciaInvalida,
  _paginacion,
  _in,
  _like,
  _rollback,
  _abortar,
};
