import { createContext, useState, useEffect } from "react";
import { getSession, clearSession } from "../services/authService";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUser(session.user);
      setToken(session.token);
    }
    setLoading(false);
  }, []);

  // Carga la foto desde el perfil una vez que el usuario está disponible
  useEffect(() => {
    if (!user) return;
    const tkn = localStorage.getItem("fabpsa_token");
    fetch("/api/perfil", {
      headers: { Authorization: `Bearer ${tkn}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.picture) updatePicture(data.picture);
      })
      .catch(() => {});
  }, [user?.login]);

  function login(tokenRecibido, userRecibido) {
    setUser(userRecibido);
    setToken(tokenRecibido);
  }

  function logout() {
    clearSession();
    setUser(null);
    setToken(null);
  }

  function updatePicture(picture) {
    setUser((prev) => {
      const updated = { ...prev, picture };
      const stored = JSON.parse(localStorage.getItem("fabpsa_user") || "null");
      if (stored) {
        localStorage.setItem(
          "fabpsa_user",
          JSON.stringify({ ...stored, picture }),
        );
      }
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
