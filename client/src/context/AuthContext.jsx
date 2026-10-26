import { createContext, useState, useEffect } from "react";
import { getSession, clearSession, renovarSesion, tokenVencido } from "../services/authService";

const REFRESH_MARGIN_MS = 3 * 60 * 1000; // refrescar cuando falten <3min para expirar

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────
  // Si el token guardado ya venció (equipo suspendido, navegador cerrado),
  // se renueva antes de mostrar el portal; solo se pide login si la sesión
  // de 8 h ya terminó.
  useEffect(() => {
    const session = getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    if (!tokenVencido(session.token)) {
      setUser(session.user);
      setToken(session.token);
      setLoading(false);
      return;
    }
    renovarSesion()
      .then(({ token: nuevoToken, user: nuevoUser }) => {
        setUser(nuevoUser);
        setToken(nuevoToken);
      })
      .catch((err) => {
        if (err.definitivo) {
          clearSession();
        } else {
          // Sin red/servidor: se conserva la sesión y se reintenta luego
          setUser(session.user);
          setToken(session.token);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Foto de perfil ────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const tkn = localStorage.getItem("fabpsa_token");
    fetch("/api/perfil", { headers: { Authorization: `Bearer ${tkn}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.picture) updatePicture(data.picture);
      })
      .catch(() => {});
  }, [user?.login]);

  // ── Refresco silencioso ───────────────────────────────────
  // El JWT dura poco (20m) a propósito, para que revocar/otorgar módulos
  // se refleje sin esperar horas. Antes de que venza pedimos uno nuevo con
  // los permisos vigentes en BD. Si ya venció porque el equipo estuvo
  // suspendido o la pestaña dormida (el navegador pausa los timers), también
  // se renueva: la sesión dura 8 h desde el login. Solo se cierra cuando el
  // servidor dice que terminó; una falla de red se reintenta.
  useEffect(() => {
    if (!token) return;

    const check = async () => {
      const actual = localStorage.getItem("fabpsa_token") || token;
      if (!tokenVencido(actual, REFRESH_MARGIN_MS)) return;
      try {
        await renovarSesion(); // actualiza el estado vía "fabpsa:session-refreshed"
      } catch (err) {
        if (err.definitivo) _expire();
      }
    };

    // Al regresar al equipo/pestaña, renovar de inmediato sin esperar al timer
    const alVolver = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    const id = setInterval(check, 30_000);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [token]);

  // Token renovado (por este contexto, por apiFetch o por otra pestaña)
  useEffect(() => {
    const alRenovar = (e) => {
      setUser(e.detail.user);
      setToken(e.detail.token);
    };
    const alCambiarStorage = (e) => {
      if (e.key !== "fabpsa_token" || !e.newValue) return;
      const s = getSession();
      if (s) {
        setUser(s.user);
        setToken(s.token);
      }
    };
    window.addEventListener("fabpsa:session-refreshed", alRenovar);
    window.addEventListener("storage", alCambiarStorage);
    return () => {
      window.removeEventListener("fabpsa:session-refreshed", alRenovar);
      window.removeEventListener("storage", alCambiarStorage);
    };
  }, []);

  // ── Escucha el evento global que disparan los fetch ───────
  // Cualquier llamada que reciba 401 dispara "fabpsa:session-expired"
  useEffect(() => {
    const handler = () => _expire();
    window.addEventListener("fabpsa:session-expired", handler);
    return () => window.removeEventListener("fabpsa:session-expired", handler);
  }, []);

  // ── Helpers internos ──────────────────────────────────────
  function _expire() {
    clearSession();
    setUser(null);
    setToken(null);
    setSessionExpired(true);
  }

  // ── API pública del contexto ──────────────────────────────
  function login(tokenRecibido, userRecibido) {
    setUser(userRecibido);
    setToken(tokenRecibido);
    setSessionExpired(false);
  }

  function logout() {
    clearSession();
    setUser(null);
    setToken(null);
    setSessionExpired(false);
  }

  function updatePicture(picture) {
    setUser((prev) => {
      const updated = { ...prev, picture };
      const stored = JSON.parse(localStorage.getItem("fabpsa_user") || "null");
      if (stored)
        localStorage.setItem(
          "fabpsa_user",
          JSON.stringify({ ...stored, picture }),
        );
      return updated;
    });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        loading,
        updatePicture,
        modulos: user?.modulos ?? [],
        sessionExpired,
        setSessionExpired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
