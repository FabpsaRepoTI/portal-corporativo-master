import { Navigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

// soloSistemas: además del módulo, exige el área SISTEMAS (equipo de TI)
export default function ProtectedRoute({ modulo, soloSistemas = false, children }) {
  const { user, loading, modulos = [] } = useContext(AuthContext);

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Si se especificó un módulo, verificar que tenga acceso
  if (modulo && !modulos.includes(modulo)) {
    return <Navigate to="/" replace />;
  }
  if (soloSistemas && !["SISTEMAS", "SYSTEMS"].includes(String(user.area || "").trim().toUpperCase())) {
    return <Navigate to="/" replace />;
  }

  return children;
}

const styles = {
  loadingWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F7F5F2",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #E4DED8",
    borderTopColor: "#0A6B65",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
};
