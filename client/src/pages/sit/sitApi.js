// pages/sit/sitApi.js
// Llamadas al backend del módulo SIT y utilidades compartidas.
import { apiFetch } from "../../utils/apiFetch";

export const PLANTAS = { 1: "IAFSA", 2: "FDNC" };

/**
 * Ruta del detalle de un artículo del ERP. El código se repite entre
 * empresas, por eso va acompañado de la empresa.
 * Acepta { codigoArticulo, empresa } o { codigoArticulo, idPlanta }.
 */
export function rutaArticulo({ codigoArticulo, empresa, idPlanta }) {
  const emp = empresa || PLANTAS[idPlanta] || "";
  return `/sit/articulos/${encodeURIComponent(codigoArticulo)}${emp ? `?empresa=${emp}` : ""}`;
}

export const VALIDACION = {
  1: { label: "OK", icon: "ti-circle-check", tono: "ok" },
  2: { label: "Parcial", icon: "ti-alert-triangle", tono: "parcial" },
  3: { label: "No corresponde", icon: "ti-circle-x", tono: "rechazo" },
};

/**
 * sitApi("/articulos", { method, body, form })
 * Devuelve `data` de la respuesta { ok, data }. Lanza Error con .status;
 * un 403 se traduce a "Sin permisos".
 */
export async function sitApi(path, { method = "GET", body, form } = {}) {
  const opts = { method };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }

  const res = await apiFetch("/api/sit" + path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok || data?.ok === false) {
    const msg =
      res.status === 403 && method !== "GET"
        ? "Sin permisos para esta acción"
        : data?.error || "No se pudo completar la operación";
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data?.data ?? null;
}

/**
 * URL de un solo uso (60 s) para una operación sobre un documento.
 * doc = { tipo: 'sharepoint' | 'sit', id, historial? }; modo = 'ver' | 'descargar' | 'imprimir'.
 * El servidor rechaza la operación si el rol no la permite; el JWT de la
 * sesión nunca va en la URL.
 */
export async function urlDocumento(doc, modo) {
  const r = await sitApi("/documentos/ticket", { method: "POST", body: { ...doc, modo } });
  const base = process.env.REACT_APP_API_URL || "/api";
  return `${base}${r.ruta}`;
}

/** Permisos efectivos del usuario en el SIT (caché por sesión de página; el servidor siempre vuelve a decidir). */
let _misPermisos = null;
export function misPermisos({ refrescar = false } = {}) {
  if (!_misPermisos || refrescar) _misPermisos = sitApi("/mis-permisos").catch((e) => ((_misPermisos = null), Promise.reject(e)));
  return _misPermisos;
}

export function fecha(v) {
  if (!v) return "—";
  return String(v).slice(0, 10).split("-").reverse().join("/");
}

export function fechaHora(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
