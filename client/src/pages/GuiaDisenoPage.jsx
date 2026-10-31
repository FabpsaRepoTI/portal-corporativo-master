import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

// Guía de Diseño UI (HTML estático en /public). Solo visible para el área de Sistemas.
export default function GuiaDisenoPage() {
  const { user } = useContext(AuthContext);
  const esSistemas = ["SISTEMAS", "SYSTEMS"].includes(user?.area?.toUpperCase());

  if (!esSistemas) return <Navigate to="/" replace />;

  return (
    <iframe
      src={`${process.env.PUBLIC_URL}/guia-diseno-ui.html`}
      title="Guía de Diseño UI"
      style={{ width: "100%", height: "calc(100vh - 64px)", border: 0, display: "block" }}
    />
  );
}
