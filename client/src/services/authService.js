import axios from "axios";

const API_URL = `${process.env.REACT_APP_API_URL}/auth`;

export async function loginService(login, password, captchaToken) {
  const response = await axios.post(`${API_URL}/login`, {
    login,
    password,
    captchaToken,
  });
  return response.data;
}

export async function refreshSession(token) {
  const response = await axios.post(
    `${API_URL}/refresh`,
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export function saveSession(token, user) {
  localStorage.setItem("fabpsa_token", token);
  localStorage.setItem("fabpsa_user", JSON.stringify(user));
}

// Devuelve la sesión guardada aunque el token ya haya vencido: mientras no
// pasen 8 h desde el login el servidor lo renueva (ver renovarSesion).
export function getSession() {
  const token = localStorage.getItem("fabpsa_token");
  const user = localStorage.getItem("fabpsa_user");
  if (!token || !user) return null;

  try {
    JSON.parse(atob(token.split(".")[1]));
    return { token, user: JSON.parse(user) };
  } catch {
    clearSession();
    return null;
  }
}

export function tokenVencido(token, margenMs = 0) {
  try {
    return JSON.parse(atob(token.split(".")[1])).exp * 1000 - margenMs < Date.now();
  } catch {
    return true;
  }
}

// ── Renovación compartida ─────────────────────────────────
// Una sola petición a la vez aunque la pidan varios (el contexto y cada
// apiFetch que reciba 401). Error con .definitivo = la sesión terminó de
// verdad (8 h, token inválido); sin .definitivo = falla de red/servidor y
// se puede reintentar sin sacar al usuario.
let renovando = null;

export function renovarSesion() {
  if (!renovando) {
    renovando = (async () => {
      const token = localStorage.getItem("fabpsa_token");
      if (!token) throw Object.assign(new Error("Sin sesión"), { definitivo: true });
      try {
        const data = await refreshSession(token);
        saveSession(data.token, data.user);
        window.dispatchEvent(new CustomEvent("fabpsa:session-refreshed", { detail: data }));
        return data;
      } catch (err) {
        const status = err.response?.status;
        if (status === 401 || status === 403) err.definitivo = true;
        throw err;
      }
    })().finally(() => {
      renovando = null;
    });
  }
  return renovando;
}

export function clearSession() {
  localStorage.removeItem("fabpsa_token");
  localStorage.removeItem("fabpsa_user");
}
