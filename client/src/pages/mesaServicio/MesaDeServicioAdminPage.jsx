import arteHero from "../../assets/visor-ejecutivo-hero.png";
import PageHero from "../../components/PageHero";
import {usePendingAttention} from "../../context/PendingAttention";
// MesaDeServicioAdminPage.jsx
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
    color: "#4F46E5",
  },
];

export default function MesaDeServicioAdminPage() {
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get("tab") === "desarrollo" ? "desarrollo" : "incidencias");
  const navigate = useNavigate();
  const {search}=useLocation();
  const {counts,error}=usePendingAttention();
  useEffect(()=>{const target=new URLSearchParams(search).get("tab");if(TABS.some(t=>t.key===target))setActiveTab(target);},[search]);

  return (
    <div className="mds-shell">
      {/* Encabezado estándar del portal (mismo que Información Técnica) */}
      <PageHero
        arte={arteHero}
        eyebrow="Mesa de Servicio · Administración"
        titulo="Administración de"
        resalte="Solicitudes"
        sub="Consulta, da seguimiento y gestiona las solicitudes e incidencias reportadas por los usuarios."
        volver={{ to: "/mesa-de-servicio", label: "Volver a la Mesa de Ayuda" }}
      />

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
                {!error&&counts?.[t.key]>0&&<span className="mds-pending-count" aria-label={counts[t.key]+" pendientes de atención"}>{counts[t.key]}</span>}
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
