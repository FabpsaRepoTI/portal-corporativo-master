// utils/empresaDemo.js
// Modo demo del SGC (datos de la industria automotriz, idEmpresa = 99).
// Vive solo en sessionStorage: afecta a esta pestaña y se pierde al cerrarla.
// No toca el token ni la sesión: apiFetch agrega el encabezado X-SGC-Empresa a
// las llamadas del SGC y el servidor decide (solo lectura, con un rol SGC real).
export const DEMO_EMPRESA_ID = 99;
export const DEMO_NOMBRE = "Transmisiones del Bajío";
export const DEMO_DESCRIPCION = "Automotriz · Tier 1 · IATF 16949";
const CLAVE = "sgc_empresa_demo";

export function empresaDemoActiva() {
  try {
    return sessionStorage.getItem(CLAVE) === String(DEMO_EMPRESA_ID);
  } catch {
    return false;
  }
}

export function guardarEmpresaDemo(activa) {
  try {
    if (activa) sessionStorage.setItem(CLAVE, String(DEMO_EMPRESA_ID));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* almacenamiento no disponible: el modo demo no se activa */
  }
}
