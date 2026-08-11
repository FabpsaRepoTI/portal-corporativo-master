// MesaDeServicioAdminPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MesaAyudaAdminPage from "./atencionIncidencias/AtencionIncidenciasPage";
import HardwareSolicitudesPage from "./hardware/HardwareSolicitudesPage";
import SolicitudesDesarrolloPage from "./desarrolloSoftware/SolicitudesDesarrolloPage";
import "./MesaDeServicioAdmin.css";

const TABS = [
  {
    key: "incidencias",
    label: "Tickets",
    icon: "ti-alert-circle",
    color: "#7c8cf8",
    colorBg: "rgba(124,140,248,0.08)",
    colorBorder: "rgba(124,140,248,0.25)",
  },
  {
    key: "hardware",
    label: "Solicitudes de Hardware",
    icon: "ti-device-laptop",
    color: "#10b981",
    colorBg: "rgba(16,185,129,0.08)",
    colorBorder: "rgba(16,185,129,0.25)",
  },

  {
    key: "desarrollo",
    label: "Desarrollo de Software",
    icon: "ti-code",
    color: "#f97316",
  },
];

export default function MesaDeServicioAdminPage() {
  const [activeTab, setActiveTab] = useState("incidencias");
  const navigate = useNavigate();

  return (
    <div className="mds-shell">
      {/* ── Header — igual al patrón de otras páginas de la app ── */}
      <div className="mds-header">
        <button
          className="mds-back"
          onClick={() => navigate("/mesa-de-servicio")}
        >
          <i className="ti ti-arrow-left" />
          Volver a la Mesa de Ayuda
        </button>

        <div className="mds-hero">
          <div className="mds-hero-icon">
            <i className="ti ti-headset" />
          </div>
          <div className="mds-hero-text">
            <h1 className="mds-hero-title">Administración de Solicitudes</h1>
            <p className="mds-hero-desc">
              Consulta, da seguimiento y gestiona las solicitudes e incidencias
              reportadas por los usuarios.
            </p>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────── */}
      <div className="mds-tabbar">
        <div className="mds-tabbar-inner">
          {TABS.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                className={`mds-tab ${isActive ? "mds-tab--active" : ""}`}
                style={{
                  "--tc": t.color,
                  "--tb": t.colorBg,
                  "--tbr": t.colorBorder,
                }}
                onClick={() => setActiveTab(t.key)}
              >
                <span className="mds-tab-icon-wrap">
                  <i className={`ti ${t.icon}`} />
                </span>
                <span className="mds-tab-label">{t.label}</span>
                {isActive && <span className="mds-tab-indicator" />}
              </button>
            );
          })}
        </div>
        <div className="mds-tabbar-rule" />
      </div>

      {/* ── Contenido ───────────────────────────────────────────── */}
      <div className="mds-content">
        {activeTab === "incidencias" && <MesaAyudaAdminPage />}
        {activeTab === "hardware" && <HardwareSolicitudesPage />}
        {activeTab === "desarrollo" && <SolicitudesDesarrolloPage />}
      </div>
    </div>
  );
}
