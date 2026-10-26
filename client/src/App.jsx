import {PendingAttentionProvider} from "./context/PendingAttention";
import ApplicationTabs from "./components/ApplicationTabs";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useContext } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PageLoader from "./components/PageLoader";
import HomePage from "./pages/HomePage";
import AplicativosPage from "./pages/AplicativosPage";
import LoginPage from "./pages/LoginPage";
import { esTemporadaDiaMuertos } from "./utils/temporada";
import "./style/TemporadaDiaMuertos.css";
import "./style/PortalNube.css";
import "./style/LetraInter.css";
import VisorEjecutivoPage from "./pages/VisorEjecutivoPage";
import GuiaDisenoPage from "./pages/GuiaDisenoPage";

// ── Rutas por módulo ──────────────────────────────────────────
import mesaServicioRoutes from "./router/mesaServicio.routes";
import mantenimientoRoutes from "./router/mantenimiento.routes";
import blogRoutes from "./router/blog.routes";
import cedisRoutes from "./router/cedis.routes";
import adminRoutes from "./router/admin.routes";
import gestionDesarrolloRoutes from "./router/gestionDesarrollo.routes";
import vigilanciaRoutes from "./router/vigilancia.routes";
import sitRoutes from "./router/sit.routes";

import "./App.css";
import "./theme/cide-theme.css"; // Tema CIDE (prueba) — quitar esta línea para revertir

// ─────────────────────────────────────────────────────────────
//  Overlay de sesión expirada
// ─────────────────────────────────────────────────────────────
function SessionExpiredOverlay() {
  const { sessionExpired, setSessionExpired } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!sessionExpired) return null;

  const handleIrAlLogin = () => {
    setSessionExpired(false);
    navigate("/login", { replace: true });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.78)",
        backdropFilter: "blur(10px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "40px 44px",
          textAlign: "center",
          maxWidth: 380,
          width: "90%",
          boxShadow: "0 24px 64px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 18 }}>⏰</div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "var(--text-h)",
            marginBottom: 10,
          }}
        >
          Sesión expirada
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          Tu sesión de 8 horas ha concluido.
          <br />
          Inicia sesión nuevamente para continuar.
        </div>
        <button
          onClick={handleIrAlLogin}
          style={{
            background: "var(--primary)",
            color: "#0b0f1a",
            border: "none",
            borderRadius: 10,
            padding: "13px 0",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            width: "100%",
            transition: "opacity .15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = ".85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Ir al inicio de sesión
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Layout principal
// ─────────────────────────────────────────────────────────────
// Estilo "nube" en todo el portal (style/PortalNube.css). Para quitarlo: false.
const PORTAL_NUBE = true;
// PRUEBA TEMPORAL: letra Inter en todo el portal (style/LetraInter.css). Para regresar a Outfit: false.
const LETRA_INTER = true;
if (typeof document !== "undefined") document.documentElement.classList.toggle("portal-inter", LETRA_INTER);
if (typeof document !== "undefined") document.documentElement.classList.toggle("portal-nube", PORTAL_NUBE);

function AppLayout() {
  return (
    <div className={"layout" + (esTemporadaDiaMuertos() ? " layout--dm" : "") + (PORTAL_NUBE ? " layout--nube" : "")}>
      <Sidebar />
      <div className="main-wrapper">
        <Navbar />
        <ApplicationTabs>
            {/* Rutas globales — pocas y estables */}
            <Route
              path="/"
              element={
                <PageLoader>
                  <HomePage />
                </PageLoader>
              }
            />
            <Route
              path="/aplicativos"
              element={
                <PageLoader>
                  <AplicativosPage />
                </PageLoader>
              }
            />
            <Route
              path="/visor-ti"
              element={
                <ProtectedRoute modulo="mesa_servicio" soloSistemas>
                  <VisorEjecutivoPage />
                </ProtectedRoute>
              }
            />
            <Route path="/guia-diseno" element={<GuiaDisenoPage />} />

            {/* Rutas por módulo */}
            {mesaServicioRoutes}
            {mantenimientoRoutes}
            {blogRoutes}
            {cedisRoutes}
            {adminRoutes}
            {gestionDesarrolloRoutes}
            {vigilanciaRoutes}
            {sitRoutes}
        </ApplicationTabs>
        <Footer />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  App raíz
// ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename="/portal-corporativo/fabpsa">
          <SessionExpiredOverlay />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <PendingAttentionProvider><AppLayout /></PendingAttentionProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
