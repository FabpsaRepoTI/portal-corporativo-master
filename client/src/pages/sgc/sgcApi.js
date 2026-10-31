// pages/sgc/sgcApi.js
// Cliente del backend SGC/SGI (/api/sgc), catálogos de estatus y utilidades.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../utils/apiFetch";

export const ROLES = { 1: "Coordinador SGI", 2: "Auditor SGI", 3: "Responsable de área", 4: "Dirección" };

// tono → clase t-* del sistema de diseño (sgc.css)
export const NC_ESTATUS = {
  1: { label: "Abierta", tono: "warn" },
  2: { label: "En análisis", tono: "info" },
  3: { label: "En ejecución", tono: "info" },
  4: { label: "Verificación", tono: "orange" },
  5: { label: "Cerrada", tono: "ok" },
  6: { label: "Cancelada", tono: "neutral" },
};
export const NC_FLUJO = [1, 2, 3, 4, 5];
export const AC_ESTATUS = {
  1: { label: "Abierta", tono: "warn" },
  2: { label: "En ejecución", tono: "info" },
  3: { label: "Pendiente verificación", tono: "orange" },
  4: { label: "Verificada eficaz", tono: "brand" },
  5: { label: "Cerrada", tono: "ok" },
};
export const AC_FLUJO = [1, 2, 3, 4, 5];
export const PLAN_ESTATUS = {
  1: { label: "Pendiente", tono: "neutral" },
  2: { label: "En proceso", tono: "info" },
  3: { label: "Completada", tono: "ok" },
};
export const AUD_ESTATUS = {
  1: { label: "Planeada", tono: "brand" },
  2: { label: "En curso", tono: "info" },
  3: { label: "Completada", tono: "ok" },
  4: { label: "Cancelada", tono: "neutral" },
};
export const AUD_TIPO = { 1: "Interna", 2: "Externa", 3: "Certificación" };
export const HALLAZGO_TIPO = {
  1: { label: "No conformidad", corto: "NC", tono: "danger", icono: "ti-alert-circle" },
  2: { label: "Observación", corto: "Obs.", tono: "warn", icono: "ti-eye" },
  3: { label: "Oportunidad de mejora", corto: "OM", tono: "info", icono: "ti-bulb" },
};
export const FRECUENCIA = { 1: "Mensual", 2: "Trimestral", 3: "Semestral", 4: "Anual" };
export const SENTIDO = { 1: "Mayor es mejor", 2: "Menor es mejor" };
export const SEMAFORO = {
  verde: { label: "En meta", tono: "ok" },
  amarillo: { label: "En riesgo", tono: "warn" },
  rojo: { label: "Fuera de meta", tono: "danger" },
};
export const RIESGO_TIPO = { 1: "Riesgo", 2: "Oportunidad" };
export const RIESGO_ESTATUS = {
  1: { label: "Activo", tono: "warn" },
  2: { label: "Mitigado", tono: "ok" },
  3: { label: "Aceptado", tono: "neutral" },
};
// Mismos nombres que sgcComun.service.js (RIESGO_CATEGORIA)
export const RIESGO_CATEGORIA = { 1: "Operativo", 2: "Calidad", 3: "Inocuidad", 4: "Legal y cumplimiento", 5: "Financiero" };
// Nivel = probabilidad × impacto: <5 bajo, 5–12 medio, >12 alto
export const NIVELES = {
  bajo: { label: "Bajo", tono: "ok", rango: "1–4" },
  medio: { label: "Medio", tono: "warn", rango: "5–12" },
  alto: { label: "Alto", tono: "danger", rango: "13–25" },
};
export function nivelDe(n) {
  if (n > 12) return "alto";
  if (n >= 5) return "medio";
  return "bajo";
}

// Mesa de Servicio SGI
export const MSI_ESTATUS = {
  1: { label: "Recibida", tono: "warn" },
  2: { label: "En atención", tono: "info" },
  3: { label: "En espera", tono: "orange" },
  4: { label: "Resuelta", tono: "ok" },
  5: { label: "Cancelada", tono: "neutral" },
};
export const MSI_PRIORIDAD = {
  1: { label: "Baja", tono: "neutral" },
  2: { label: "Media", tono: "info" },
  3: { label: "Alta", tono: "danger" },
};

// Mapa de procesos
export const PROCESO_TIPO = {
  1: { label: "Estratégico", color: "#8b5cf6", icono: "ti-target-arrow" },
  2: { label: "Operativo", color: "#10b981", icono: "ti-settings-automation" },
  3: { label: "Apoyo", color: "#64748b", icono: "ti-lifebuoy" },
};
export const RELACION_TIPO = { 1: "Alimenta", 2: "Controla", 3: "Apoya" };

/** $1,234,567 MXN */
export function mxn(v, conMoneda = true) {
  if (v == null || v === "") return "—";
  const s = "$" + Math.round(Number(v)).toLocaleString("en-US");
  return conMoneda ? `${s} MXN` : s;
}

/**
 * sgcApi("/nc", { method, body, form })
 * Devuelve `data` de la respuesta { ok, data }. Lanza Error con .status.
 */
export async function sgcApi(path, { method = "GET", body, form } = {}) {
  // useSgc anota qué rutas consulta su función (para mostrar al instante lo de la visita anterior)
  if (_rutasLeidas && method === "GET") _rutasLeidas.push(path);
  const opts = { method };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  const res = await apiFetch("/api/sgc" + path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!res.ok || data?.ok === false) {
    throw Object.assign(new Error(data?.error || "No se pudo completar la operación"), { status: res.status });
  }
  return data?.data ?? null;
}

/** Como sgcApi, pero devuelve el cuerpo completo ({ ok, data, ...extras }). */
export async function sgcRespuesta(path) {
  const res = await apiFetch("/api/sgc" + path);
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) {
    throw Object.assign(new Error(data?.error || "No se pudo completar la operación"), { status: res.status });
  }
  return data;
}

/** Descarga un adjunto con la sesión y devuelve un object URL (revocar al terminar). */
export async function urlArchivo(idArchivo) {
  const res = await apiFetch(`/api/sgc/archivos/${idArchivo}`);
  if (!res.ok) throw Object.assign(new Error("No se pudo abrir el archivo"), { status: res.status });
  return URL.createObjectURL(await res.blob());
}

// ── Catálogos con caché por sesión de página ────────────────
const _cache = {};
function _cacheado(clave, path) {
  if (!_cache[clave]) _cache[clave] = sgcApi(path).catch((e) => ((_cache[clave] = null), Promise.reject(e)));
  return _cache[clave];
}
export const catalogos = () => _cacheado("catalogos", "/catalogos");
export const usuarios = () => _cacheado("usuarios", "/usuarios");
export const departamentos = () => _cacheado("departamentos", "/departamentos");
export const sitios = () => _cacheado("sitios", "/sitios");

// Procesos del mapa (sin caché: el mapa se edita en la misma sesión)
export const procesos = () => sgcApi("/procesos/mapa").then((m) => m.nodos.map((n) => n.data));

// Avisa a la navegación (contadores del sidebar) que algo cambió
export const avisarCambio = () => window.dispatchEvent(new CustomEvent("sgc:cambio"));

// ── Respuestas recientes (mostrar al instante y actualizar en segundo plano) ──
// Clave = rutas GET que pidió la función de useSgc. Solo vive en la pestaña del
// navegador; se descarta al recargar la página o tras 10 minutos.
let _rutasLeidas = null;
const RECIENTES_MAX = 60;
const RECIENTES_MS = 10 * 60000;
const _recientes = new Map();

/**
 * Carga datos con estado: const { data, error, cargando, recargar } = useSgc(() => sgcApi("/nc"), [deps])
 * Conserva los datos anteriores mientras recarga (sin parpadeo). Al volver a una
 * pantalla ya visitada muestra de inmediato lo último que cargó y lo actualiza.
 */
export function useSgc(cargar, deps = []) {
  const [estado, setEstado] = useState({ data: null, error: null, cargando: true });
  const [version, setVersion] = useState(0);
  const fn = useRef(cargar);
  fn.current = cargar;
  useEffect(() => {
    let vivo = true;
    // Ejecuta la carga anotando sus rutas (sgcApi las registra al llamarse)
    const rutas = [];
    _rutasLeidas = rutas;
    let promesa;
    try {
      promesa = fn.current();
    } catch (err) {
      promesa = Promise.reject(err);
    } finally {
      _rutasLeidas = null;
    }
    const clave = rutas.length ? rutas.join("|") : null;
    const previo = clave && _recientes.get(clave);
    if (previo && Date.now() - previo.t < RECIENTES_MS) setEstado({ data: previo.data, error: null, cargando: true });
    else setEstado((e) => ({ ...e, cargando: true, error: null }));
    Promise.resolve(promesa)
      .then((data) => {
        if (clave) {
          _recientes.delete(clave);
          _recientes.set(clave, { data, t: Date.now() });
          if (_recientes.size > RECIENTES_MAX) _recientes.delete(_recientes.keys().next().value);
        }
        if (vivo) setEstado({ data, error: null, cargando: false });
      })
      .catch((error) => vivo && setEstado((e) => ({ ...e, error, cargando: false })));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line
  }, [...deps, version]);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}

// ── Fechas ───────────────────────────────────────────────────
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fecha(v) {
  if (!v) return "—";
  return String(v).slice(0, 10).split("-").reverse().join("/");
}
export function fechaCorta(v, conAnio = true) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}${conAnio ? ` ${y}` : ""}`;
}
export function periodoLabel(v) {
  if (!v) return "—";
  const [y, m] = String(v).slice(0, 7).split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}
export function mesCorto(v) {
  if (!v) return "";
  return MESES[Number(String(v).slice(5, 7)) - 1];
}
export function diaMes(v) {
  if (!v) return { dia: "—", mes: "" };
  const [, m, d] = String(v).slice(0, 10).split("-");
  return { dia: Number(d), mes: MESES[Number(m) - 1] };
}
export function fechaHora(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** "hace 3 h", "ayer", "12 oct" */
export function hace(v) {
  if (!v) return "—";
  const ms = Date.now() - new Date(v).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return fechaCorta(new Date(v).toISOString(), new Date(v).getFullYear() !== new Date().getFullYear());
}
export function hoyISO(dias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const anioActual = () => new Date().getFullYear();
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
