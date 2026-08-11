import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "./HomePage.css";

/* ── Datos ─────────────────────────────────────────────────────── */
const ACCESOS = [
  {
    icon: "ti-headset",
    color: "#6366f1",
    bg: "rgba(99,102,241,0.1)",
    nombre: "Mesa de Servicio",
    desc: "Reporta incidentes y solicita soporte",
    to: "/mesa-de-servicio",
  },
  {
    icon: "ti-device-laptop",
    color: "#10b981",
    bg: "rgba(16,185,129,0.1)",
    nombre: "Solicitudes de Hardware",
    desc: "Solicita equipos y accesorios",
    to: "/mesa-de-servicio/hardware",
  },
  {
    icon: "ti-layout-grid-add",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.1)",
    nombre: "Solicitudes de Software",
    desc: "Solicita accesos y licencias",
    to: "/mesa-de-servicio/solicitud/software",
  },
  {
    icon: "ti-users",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    nombre: "Directorio",
    desc: "Busca personas y áreas de la empresa",
    to: "/",
  },
  {
    icon: "ti-speakerphone",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    nombre: "Comunicados",
    desc: "Entérate de las últimas noticias",
    to: "/",
  },
  {
    icon: "ti-apps",
    color: "#0891b2",
    bg: "rgba(8,145,178,0.1)",
    nombre: "Aplicaciones",
    desc: "Accede a las apps internas",
    to: "/aplicativos",
  },
];

/* Solicitudes recientes — más valor que "Mis favoritos" para una intranet */
const SOLICITUDES_RECIENTES = [
  {
    folio: "TI-00234",
    titulo: "Sin acceso a internet",
    estatus: "En proceso",
    estatusColor: "#7c8cf8",
    estatusBg: "rgba(124,140,248,0.1)",
  },
  {
    folio: "TI-00231",
    titulo: "Laptop muy lenta",
    estatus: "Abierto",
    estatusColor: "#f59e0b",
    estatusBg: "rgba(245,158,11,0.1)",
  },
  {
    folio: "TI-00228",
    titulo: "Acceso a sistema SAP",
    estatus: "Resuelto",
    estatusColor: "#10b981",
    estatusBg: "rgba(16,185,129,0.1)",
  },
];

const COMUNICADOS = [
  {
    icon: "ti-tool",
    iconColor: "#6366f1",
    iconBg: "rgba(99,102,241,0.1)",
    titulo: "Mantenimiento programado",
    fecha: "Sáb 25 jul, 22:00 – 02:00 hrs",
  },
  {
    icon: "ti-lock",
    iconColor: "#10b981",
    iconBg: "rgba(16,185,129,0.1)",
    titulo: "Nueva política de contraseñas",
    fecha: "Actualizada el 20 de julio",
  },
  {
    icon: "ti-shield-check",
    iconColor: "#f59e0b",
    iconBg: "rgba(245,158,11,0.1)",
    titulo: "Capacitación de ciberseguridad",
    fecha: "Inscripciones abiertas",
  },
];

const SERVICIOS_STATUS = [
  {
    icon: "ti-mail",
    iconColor: "#0078D4",
    iconBg: "rgba(0,120,212,0.08)",
    nombre: "Correo electrónico",
  },
  {
    icon: "ti-brand-office",
    iconColor: "#D83B01",
    iconBg: "rgba(216,59,1,0.08)",
    nombre: "Office 365",
  },
  {
    icon: "ti-wifi",
    iconColor: "#10b981",
    iconBg: "rgba(16,185,129,0.08)",
    nombre: "Internet corporativo",
  },
  {
    icon: "ti-lock",
    iconColor: "#6366f1",
    iconBg: "rgba(99,102,241,0.08)",
    nombre: "VPN",
  },
];

const NOTICIAS = [
  {
    tipo: "tech",
    label: "Tecnología",
    img: "ti-building",
    titulo: "Nuevas mejoras en infraestructura",
    tiempo: "Hace 2h",
  },
  {
    tipo: "seg",
    label: "Seguridad",
    img: "ti-lock",
    titulo: "Cómo mantener tu información segura",
    tiempo: "Hace 5h",
  },
  {
    tipo: "corp",
    label: "Empresa",
    img: "ti-chart-bar",
    titulo: "Resultados Q2: récord de producción",
    tiempo: "Ayer",
  },
  {
    tipo: "ev",
    label: "Eventos",
    img: "ti-confetti",
    titulo: "Tech Day 2024 — inscripciones abiertas",
    tiempo: "Hace 1d",
  },
];

const EVENTOS = [
  {
    dia: "25",
    mes: "JUL",
    titulo: "Capacitación: Ciberseguridad",
    hora: "10:00 – 12:00 PM",
    lugar: "Sala Cap. 2",
    btn: true,
  },
  {
    dia: "02",
    mes: "AGO",
    titulo: "Tech Day 2024",
    hora: "09:00 – 04:00 PM",
    lugar: "Auditorio Gral.",
    btn: false,
  },
  {
    dia: "08",
    mes: "AGO",
    titulo: "Revisión de indicadores Q3",
    hora: "11:00 AM",
    lugar: "Sala Juntas A",
    btn: false,
  },
];

function getSaludo() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Buenos días";
  if (h >= 12 && h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/* ── Componente ─────────────────────────────────────────────────── */
export default function IntranetHomePage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const firstName = user?.name?.split(" ")[0] ?? "Usuario";

  return (
    <div className="ihp">
      <div className="ihp-wrap">
        {/* ══ COLUMNA PRINCIPAL ══ */}
        <div className="ihp-main">
          {/* Hero */}
          <div className="ihp-hero">
            <div>
              <div className="ihp-hero-eyebrow">Bienvenido de nuevo</div>
              <div className="ihp-hero-title">
                {getSaludo()}, <em>{firstName}</em> —<br />
                es un excelente día para lograr
                <br />
                <em>grandes cosas.</em>
              </div>
              <div className="ihp-hero-sub">
                Estamos aquí para apoyarte en todo lo que necesites.
              </div>
            </div>
            <div className="ihp-hero-ilu" aria-hidden>
              <div className="ihp-cube ihp-cube-1">🚀</div>
              <div className="ihp-cube ihp-cube-2" />
              <div className="ihp-cube ihp-cube-3" />
            </div>
          </div>

          {/* Accesos rápidos */}
          <div>
            <div className="ihp-sec-header">
              <span className="ihp-sec-title">Accesos rápidos</span>
              <span className="ihp-sec-link">
                <i
                  className="ti ti-adjustments-horizontal"
                  style={{ fontSize: "0.8rem" }}
                />
                Personalizar
              </span>
            </div>
            <div className="ihp-accesos">
              {ACCESOS.map((a, i) => (
                <div
                  key={i}
                  className="ihp-acceso"
                  onClick={() => navigate(a.to)}
                >
                  <div className="ihp-acceso-ico" style={{ background: a.bg }}>
                    <i className={`ti ${a.icon}`} style={{ color: a.color }} />
                  </div>
                  <div className="ihp-acceso-nombre">{a.nombre}</div>
                  <div className="ihp-acceso-desc">{a.desc}</div>
                  <i className="ti ti-arrow-right ihp-acceso-arrow" />
                </div>
              ))}
            </div>
          </div>

          {/* Fila inferior */}
          <div className="ihp-bottom">
            {/* Banner Portal de Conocimiento con SVG ilustración */}
            <div className="ihp-banner" onClick={() => navigate("/")}>
              {/* SVG ilustración libro + lupa — misma que HomePage */}
              <div className="ihp-banner-svg-wrap">
                <svg
                  width="120"
                  height="100"
                  viewBox="0 0 110 90"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="10"
                    y="20"
                    width="65"
                    height="55"
                    rx="5"
                    fill="#c4b5fd"
                    opacity="0.35"
                  />
                  <rect
                    x="14"
                    y="24"
                    width="57"
                    height="47"
                    rx="4"
                    fill="#ede9fe"
                    opacity="0.15"
                  />
                  <rect
                    x="10"
                    y="20"
                    width="5"
                    height="55"
                    rx="2"
                    fill="#a78bfa"
                    opacity="0.5"
                  />
                  <rect
                    x="22"
                    y="34"
                    width="35"
                    height="3"
                    rx="1.5"
                    fill="#c4b5fd"
                    opacity="0.6"
                  />
                  <rect
                    x="22"
                    y="41"
                    width="28"
                    height="3"
                    rx="1.5"
                    fill="#ddd6fe"
                    opacity="0.4"
                  />
                  <rect
                    x="22"
                    y="48"
                    width="32"
                    height="3"
                    rx="1.5"
                    fill="#ddd6fe"
                    opacity="0.4"
                  />
                  <rect
                    x="22"
                    y="55"
                    width="20"
                    height="3"
                    rx="1.5"
                    fill="#ddd6fe"
                    opacity="0.4"
                  />
                  <circle cx="78" cy="38" r="16" fill="white" opacity="0.12" />
                  <circle
                    cx="78"
                    cy="38"
                    r="11"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="2.5"
                    opacity="0.7"
                  />
                  <line
                    x1="86"
                    y1="47"
                    x2="95"
                    y2="57"
                    stroke="#a78bfa"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                  <circle cx="18" cy="18" r="3" fill="#c4b5fd" opacity="0.4" />
                  <circle cx="90" cy="20" r="2" fill="#a78bfa" opacity="0.35" />
                </svg>
              </div>
              <div className="ihp-banner-content">
                <div className="ihp-banner-tag">Nuevo</div>
                <div className="ihp-banner-title">
                  Portal de
                  <br />
                  Conocimiento
                </div>
                <div className="ihp-banner-desc">
                  Guías, manuales y mejores prácticas en un solo lugar.
                </div>
                <button className="ihp-banner-btn">
                  Explorar ahora
                  <i
                    className="ti ti-arrow-right"
                    style={{ fontSize: "0.8rem" }}
                  />
                </button>
              </div>
              <div className="ihp-banner-dots">
                <div className="ihp-dot on" />
                <div className="ihp-dot" />
                <div className="ihp-dot" />
              </div>
            </div>

            {/* Noticias — 2 columnas */}
            <div className="ihp-noticias">
              <div className="ihp-sec-header">
                <span className="ihp-sec-title">Noticias destacadas</span>
                <span className="ihp-sec-link">Ver todas</span>
              </div>
              <div className="ihp-noticias-grid">
                {NOTICIAS.map((n, i) => (
                  <div key={i} className="ihp-noticia">
                    <div className={`ihp-noticia-img ${n.tipo}`}>
                      <i className={`ti ${n.img}`} />
                    </div>
                    <div className="ihp-noticia-body">
                      <span className={`ihp-noticia-cat ${n.tipo}`}>
                        {n.label}
                      </span>
                      <div className="ihp-noticia-titulo">{n.titulo}</div>
                      <div className="ihp-noticia-tiempo">{n.tiempo}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Próximos eventos */}
            <div className="ihp-eventos">
              <div className="ihp-sec-header">
                <span className="ihp-sec-title">Próximos eventos</span>
                <span className="ihp-sec-link">Ver calendario</span>
              </div>
              <div className="ihp-eventos-list">
                {EVENTOS.map((e, i) => (
                  <div key={i} className="ihp-evento">
                    <div className="ihp-evento-fecha">
                      <span className="ihp-ev-dia">{e.dia}</span>
                      <span className="ihp-ev-mes">{e.mes}</span>
                    </div>
                    <div className="ihp-evento-info">
                      <div className="ihp-ev-titulo">{e.titulo}</div>
                      <div className="ihp-ev-meta">
                        <span>
                          <i className="ti ti-clock" />
                          {e.hora}
                        </span>
                        <span>
                          <i className="ti ti-map-pin" />
                          {e.lugar}
                        </span>
                      </div>
                      {e.btn && (
                        <button className="ihp-ev-btn">
                          <i
                            className="ti ti-calendar-plus"
                            style={{ fontSize: "0.75rem" }}
                          />
                          Agregar a mi calendario
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ SIDEBAR ══ */}
        <aside className="ihp-sidebar">
          {/* Solicitudes recientes — más valor que "Mis favoritos" */}
          <div className="ihp-sb">
            <div className="ihp-sb-head">
              <span className="ihp-sb-title">Mis solicitudes recientes</span>
              <span
                className="ihp-sb-link"
                onClick={() => navigate("/mesa-de-servicio/mis-solicitudes")}
              >
                Ver todas
              </span>
            </div>
            {SOLICITUDES_RECIENTES.map((s, i) => (
              <div
                key={i}
                className="ihp-reciente"
                onClick={() => navigate("/mesa-de-servicio/mis-solicitudes")}
              >
                <div
                  className="ihp-reciente-ico"
                  style={{ background: s.estatusBg }}
                >
                  <i
                    className="ti ti-ticket"
                    style={{ color: s.estatusColor }}
                  />
                </div>
                <div className="ihp-reciente-body">
                  <div className="ihp-reciente-folio">{s.folio}</div>
                  <div className="ihp-reciente-titulo">{s.titulo}</div>
                </div>
                <span
                  className="ihp-reciente-chip"
                  style={{ background: s.estatusBg, color: s.estatusColor }}
                >
                  {s.estatus}
                </span>
              </div>
            ))}
          </div>

          {/* Comunicados importantes — compactos */}
          <div className="ihp-sb">
            <div className="ihp-sb-head">
              <span className="ihp-sb-title">Comunicados</span>
              <span className="ihp-sb-link">Ver todos</span>
            </div>
            {COMUNICADOS.map((c, i) => (
              <div key={i} className="ihp-com">
                <div className="ihp-com-ico" style={{ background: c.iconBg }}>
                  <i
                    className={`ti ${c.icon}`}
                    style={{ color: c.iconColor }}
                  />
                </div>
                <div className="ihp-com-body">
                  <div className="ihp-com-titulo">{c.titulo}</div>
                  <div className="ihp-com-fecha">{c.fecha}</div>
                </div>
                <i className="ti ti-chevron-right ihp-com-arrow" />
              </div>
            ))}
          </div>

          {/* Estado de servicios — ultra compacto */}
          <div className="ihp-sb">
            <div className="ihp-sb-head">
              <span className="ihp-sb-title">Estado de servicios</span>
              <span className="ihp-sb-link">Ver todos</span>
            </div>
            {SERVICIOS_STATUS.map((s, i) => (
              <div key={i} className="ihp-status">
                <div
                  className="ihp-status-ico"
                  style={{ background: s.iconBg }}
                >
                  <i
                    className={`ti ${s.icon}`}
                    style={{ color: s.iconColor }}
                  />
                </div>
                <span className="ihp-status-name">{s.nombre}</span>
                <span className="ihp-status-ok">
                  <span className="ihp-status-dot" />
                  Operando
                </span>
              </div>
            ))}
          </div>

          {/* ¿Necesitas ayuda? */}
          <div className="ihp-help">
            <i className="ti ti-headset ihp-help-ico" />
            <div className="ihp-help-title">¿Necesitas ayuda?</div>
            <div className="ihp-help-sub">
              Nuestro equipo está listo para asistirte.
            </div>
            <button
              className="ihp-help-btn"
              onClick={() => navigate("/mesa-de-servicio")}
            >
              <i
                className="ti ti-message-circle"
                style={{ fontSize: "0.85rem" }}
              />
              Abrir chat de soporte
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
