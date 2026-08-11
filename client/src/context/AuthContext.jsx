//Con useState guardamos la memoria de quien esta loggeado
//useEffect  Se ejecuta una sola vez cuando la app arranca. Lee localStorage para recuperar la sesión si el usuario ya había iniciado sesión antes y recargó la página.

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

  function login(tokenRecibido, userRecibido) {
    setUser(userRecibido);
    setToken(tokenRecibido);
  }

  function logout() {
    clearSession();
    setUser(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
