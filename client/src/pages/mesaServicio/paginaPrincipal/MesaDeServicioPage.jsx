import { useNavigate } from "react-router-dom";
import { useContext, useState } from "react";
import { AuthContext } from "../../../context/AuthContext.jsx";
import {
  SERVICIOS_GRID,
  QUICK_SISTEMAS,
  QUICK_USUARIO,
  INCIDENTES_CHIPS,
  INCIDENTES_ICONS,
} from "../../../data/mesaDeServicioData.js";
import "./MesaDeServicioPage.css";

export default function MesaDeServicioPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [incidentesOpen, setIncidentesOpen] = useState(false);

  const firstName = user?.name?.split(" ")[0] ?? "Usuario";
  const esSistemas = ["SISTEMAS", "SYSTEMS"].includes(
    user?.area?.toUpperCase(),
  );
  const quickItems = esSistemas ? QUICK_SISTEMAS : QUICK_USUARIO;

  const handleServicioClick = (s) => {
    navigate(s.to);
  };

  const handleQuickClick = (item) => {
    if (item.type === "route") navigate(item.route);
    if (item.type === "link") navigate(item.to);
    if (item.type === "incidente") setIncidentesOpen(true);
  };

  const handleChipClick = (chip) => {
    navigate(`/mesa-de-servicio/solicitud/${chip.id}`);
  };

  return (
    <div className="mds3-root">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="mds3-page-hero">
        <button className="mds3-back-btn" onClick={() => navigate("/")}>
          <i className="ti ti-arrow-left" />
          Volver al inicio
        </button>
        <div className="mds3-page-hero-text">
          <span className="mds3-page-eyebrow">
            <span className="mds3-page-eyebrow-line" />
            Bienvenido a la mesa de ayuda
          </span>
          <h1 className="mds3-page-title">
            Hola, <em className="mds3-page-title-name">{firstName}</em>{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mds3-page-sub">¿Cómo podemos ayudarte hoy?</p>
        </div>
      </div>

      {/* ── DOS TARJETAS PROTAGONISTAS ────────────────────────── */}
      <div className="mds3-cards-row">
        {/* TARJETA IZQUIERDA — Reportar incidente (fondo morado) */}
        <div className="mds3-incident-card">
          {/* Decoración SVG de fondo */}
          <div className="mds3-incident-deco" aria-hidden="true">
            <svg
              viewBox="0 0 320 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="260" cy="40" r="80" fill="white" fillOpacity="0.05" />
              <circle
                cx="300"
                cy="140"
                r="50"
                fill="white"
                fillOpacity="0.04"
              />
              <circle cx="30" cy="160" r="40" fill="white" fillOpacity="0.04" />
            </svg>
          </div>

          {/* Icono central */}
          <div className="mds3-incident-icon-wrap" aria-hidden="true">
            <div className="mds3-incident-icon-ring mds3-incident-ring-outer" />
            <div className="mds3-incident-icon-ring mds3-incident-ring-inner" />
            <div className="mds3-incident-icon-circle">
              <i className="ti ti-bolt" />
            </div>
          </div>

          <div className="mds3-incident-body">
            <h2 className="mds3-incident-title">
              Reportar un incidente o falla
            </h2>
            <p className="mds3-incident-sub">
              ¿Tienes un problema con algún servicio o herramienta? Repórtalo y
              nuestro equipo de TI te ayudará lo antes posible.
            </p>
            <button
              className="mds3-incident-btn"
              onClick={() => setIncidentesOpen((v) => !v)}
            >
              <i className="ti ti-circle-plus" />
              Nueva incidencia
              <i
                className={`ti ${incidentesOpen ? "ti-chevron-up" : "ti-chevron-down"} mds3-incident-btn-chev`}
              />
            </button>
          </div>
        </div>

        {/* TARJETA DERECHA — Mis solicitudes (para usuario normal)
                           ó Accesos rápidos (para SISTEMAS)          */}
        {esSistemas ? (
          <div className="mds3-quick-card">
            {/* Glow decorativo esquina superior derecha */}
            <div className="mds3-quick-card-glow" aria-hidden="true" />

            <div className="mds3-quick-card-header">
              <span className="mds3-quick-card-eyebrow">
                <span className="mds3-quick-card-eyebrow-line" />
                Accesos rápidos
              </span>
            </div>

            <div className="mds3-quick-list">
              {quickItems.map((item, i) => (
                <button
                  key={i}
                  className="mds3-quick-item"
                  onClick={() => handleQuickClick(item)}
                >
                  <span
                    className="mds3-quick-ico"
                    style={{ background: item.colorBg, color: item.color }}
                  >
                    <i className={`ti ${item.icon}`} />
                  </span>
                  <span className="mds3-quick-text">
                    <span className="mds3-quick-label">{item.label}</span>
                    <span className="mds3-quick-desc">{item.desc}</span>
                  </span>
                  <i className="ti ti-chevron-right mds3-quick-arrow" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mds3-missol-card">
            {/* Decoración mint sutil */}
            <div className="mds3-missol-deco" aria-hidden="true" />

            <div className="mds3-missol-top">
              <div className="mds3-missol-icon-wrap">
                <i className="ti ti-clipboard-list" />
              </div>
            </div>

            <div className="mds3-missol-body">
              <span className="mds3-missol-eyebrow">Panel personal</span>
              <h2 className="mds3-missol-title">Mis solicitudes</h2>
              <p className="mds3-missol-desc">
                Consulta el estado, historial y seguimiento de todas tus
                solicitudes de soporte y requerimientos de hardware.
              </p>
            </div>

            {/* Imagen decorativa tipo clipboard */}
            <div className="mds3-missol-ilu" aria-hidden="true">
              <svg
                viewBox="0 0 100 110"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="15"
                  y="12"
                  width="70"
                  height="88"
                  rx="8"
                  fill="#e6faf4"
                  stroke="#4cc9a6"
                  strokeWidth="1.5"
                />
                <rect
                  x="35"
                  y="4"
                  width="30"
                  height="14"
                  rx="4"
                  fill="#4cc9a6"
                  opacity="0.6"
                />
                <rect
                  x="25"
                  y="32"
                  width="50"
                  height="5"
                  rx="2.5"
                  fill="#4cc9a6"
                  opacity="0.3"
                />
                <rect
                  x="25"
                  y="44"
                  width="38"
                  height="4"
                  rx="2"
                  fill="#4cc9a6"
                  opacity="0.2"
                />
                <rect
                  x="25"
                  y="56"
                  width="44"
                  height="4"
                  rx="2"
                  fill="#4cc9a6"
                  opacity="0.2"
                />
                <rect
                  x="25"
                  y="68"
                  width="32"
                  height="4"
                  rx="2"
                  fill="#4cc9a6"
                  opacity="0.2"
                />
                <circle cx="75" cy="80" r="14" fill="#4cc9a6" opacity="0.15" />
                <path
                  d="M69 80 l4 4 7-8"
                  stroke="#4cc9a6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <button
              className="mds3-missol-btn"
              onClick={() => handleQuickClick(quickItems[0])}
            >
              Ver mis solicitudes
              <i className="ti ti-arrow-right" />
            </button>
          </div>
        )}
      </div>

      {/* ── ACCORDION TIPOS DE INCIDENTE ─────────────────────── */}
      {incidentesOpen && (
        <div className="mds3-accordion">
          <div className="mds3-accordion-hdr">
            <i className="ti ti-alert-triangle mds3-accordion-ico" />
            <div>
              <div className="mds3-accordion-title">Incidentes y fallas</div>
              <div className="mds3-accordion-sub">
                Reporta fallas en equipos, aplicaciones, sistemas o cualquier
                incidente tecnológico
              </div>
            </div>
          </div>
          <div className="mds3-acc-grid">
            {INCIDENTES_CHIPS.map((chip) => (
              <button
                key={chip.id}
                className="mds3-acc-chip"
                onClick={() => handleChipClick(chip)}
              >
                <i
                  className={`ti ${INCIDENTES_ICONS[chip.label] ?? chip.icon} mds3-acc-ico`}
                />
                <span className="mds3-acc-label">{chip.label}</span>
                <i className="ti ti-arrow-right mds3-acc-arrow" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── SERVICIOS DISPONIBLES ─────────────────────────────── */}
      <div className="mds3-section-label">Servicios disponibles</div>
      <div className="mds3-grid">
        {SERVICIOS_GRID.map((s) => (
          <button
            key={s.id}
            className="mds3-svc"
            onClick={() => handleServicioClick(s)}
          >
            <div className="mds3-svc-top">
              <div
                className="mds3-svc-ico"
                style={{ background: s.colorBg, color: s.color }}
              >
                <i className={`ti ${s.icon}`} />
              </div>
              <i className="ti ti-chevron-right mds3-svc-arrow" />
            </div>
            <div className="mds3-svc-label">
              {s.nombre}
              {s.badge && (
                <span
                  className="mds3-svc-badge"
                  style={{ color: s.color, background: s.colorBg }}
                >
                  {s.badge}
                </span>
              )}
            </div>
            <div className="mds3-svc-desc">{s.desc}</div>
            <div className="mds3-svc-line" style={{ background: s.color }} />
          </button>
        ))}
      </div>

      {/* ── META STRIP DISCRETA ───────────────────────────────── */}
      <div className="mds3-meta-strip">
        <span className="mds3-meta-item">
          <i className="ti ti-bolt" />
          Respuesta rápida
        </span>
        <span className="mds3-meta-sep" aria-hidden="true" />
        <span className="mds3-meta-item">
          <i className="ti ti-eye" />
          Seguimiento en tiempo real
        </span>
        <span className="mds3-meta-sep" aria-hidden="true" />
        <span className="mds3-meta-item">
          <i className="ti ti-shield-check" />
          Soporte confiable
        </span>
        <span className="mds3-meta-sep" aria-hidden="true" />
        <span className="mds3-meta-item">
          <i className="ti ti-clock" />
          Lun–Vie 6:00–18:00 · Sáb 7:00–13:00
        </span>
      </div>
    </div>
  );
}
