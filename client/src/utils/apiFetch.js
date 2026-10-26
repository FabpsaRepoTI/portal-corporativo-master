/**
 * apiFetch — wrapper global para todas las llamadas al backend.
 *
 * Si el servidor responde 401 (token expirado o inválido):
 *  1. Intenta renovar la sesión (vale mientras no pasen 8 h desde el login)
 *     y repite la llamada una vez con el token nuevo.
 *  2. Si la sesión ya terminó: limpia el localStorage y dispara
 *     "fabpsa:session-expired" → AuthContext muestra el overlay → login.
 *  Una falla de red al renovar no cierra la sesión: devuelve el 401 original.
 *
 * Uso idéntico a fetch():
 *   const res = await apiFetch("/api/solicitudes");
 *   const data = await res.json();
 */
import { renovarSesion } from "../services/authService";

const TOKEN = () => localStorage.getItem("fabpsa_token");

const llamar = (url, opts) =>
  fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      ...(opts.headers || {}),
    },
  });

export async function apiFetch(url, opts = {}) {
  const res = await llamar(url, opts);
  if (res.status !== 401) return res;

  try {
    await renovarSesion();
  } catch (err) {
    if (err.definitivo) {
      localStorage.removeItem("fabpsa_token");
      localStorage.removeItem("fabpsa_user");
      window.dispatchEvent(new CustomEvent("fabpsa:session-expired"));
    }
    return res;
  }

  return llamar(url, opts);
}
