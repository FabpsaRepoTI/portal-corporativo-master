// src/pages/HomePage.jsx
import { useContext, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { QUICK_APPS } from "../data/staticData";
//import "../style/HomePage.css"

const getToken = () => localStorage.getItem("fabpsa_token");
const apiFetch = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) data.__httpError = true;
  return data;
};

const MENSAJES = {
  1: {
    a: "Comenzamos una nueva semana.",
    b: "Nuevas oportunidades para avanzar y construir.",
  },
  2: {
    a: "Ya estamos avanzando en la semana.",
    b: "Concéntrate en lo importante y deja que nosotros te ayudemos.",
  },
  3: {
    a: "Estamos a mitad de semana.",
    b: "Un buen momento para resolver pendientes y seguir construyendo.",
  },
  4: {
    a: "Cada día es una oportunidad para hacer las cosas mejor.",
    b: "Estamos aquí para apoyarte.",
  },
  5: {
    a: "Cerremos la semana con buenos resultados.",
    b: "Gracias por hacer que las cosas sucedan.",
  },
  6: {
    a: "Gracias por estar aquí.",
    b: "Hagamos que este día también cuente.",
  },
  0: { a: "Buen descanso.", b: "Mañana seguimos construyendo juntos." },
};

const saludo = () => {
  const h = new Date().getHours();
  return h >= 5 && h < 12
    ? "Buenos días"
    : h < 19
      ? "Buenas tardes"
      : "Buenas noches";
};
const fmtHoy = () =>
  new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const fmtFecha = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";
const fmtAgo = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  return d === 0 ? "Hoy" : d === 1 ? "Ayer" : `${d} ago`;
};

const AVS = [
  { bg: "#dbeafe", c: "#1d4ed8" },
  { bg: "#dcfce7", c: "#15803d" },
  { bg: "#fce7f3", c: "#be185d" },
  { bg: "#ede9fe", c: "#6d28d9" },
  { bg: "#fef3c7", c: "#b45309" },
  { bg: "#fee2e2", c: "#b91c1c" },
  { bg: "#f0fdf4", c: "#166534" },
  { bg: "#fdf4ff", c: "#7e22ce" },
];
const initials = (b) =>
  ((b.nombre?.[0] || "") + (b.apellidoPaterno?.[0] || "")).toUpperCase();

const CAT_COLORS = {
  tecnologia: "#3b82f6",
  ciberseguridad: "#ef4444",
  nom35: "#10b981",
  vidasana: "#06b6d4",
  industria: "#f59e0b",
  ia: "#8b5cf6",
};
const CAT_LABELS = {
  tecnologia: "Tecnología",
  ciberseguridad: "Ciberseguridad",
  nom35: "NOM-035",
  vidasana: "Vida Sana",
  industria: "Industria",
  ia: "IA",
};
const CAT_EMOJIS = {
  tecnologia: "💻",
  ciberseguridad: "🔐",
  nom35: "📋",
  vidasana: "🌿",
  industria: "🏭",
  ia: "🤖",
};

const SVC_ICONS = {
  "Correo / Microsoft 365": "ti-mail",
  "ERP Multivisión": "ti-database",
  "Internet y red": "ti-wifi",
  "Office 365": "ti-brand-office",
  "Telefonía y comunicaciones": "ti-phone",
};
const EST = {
  operando: { label: "Operando", color: "#16a34a" },
  intermitencia: { label: "Intermitencia", color: "#d97706" },
  incidente: { label: "Incidente", color: "#dc2626" },
};

/* ── Ilustración isométrica SVG ─────────────────────────────────── */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 280 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="hx-illu"
      aria-hidden="true"
    >
      {/* Base platform */}
      <ellipse
        cx="140"
        cy="165"
        rx="90"
        ry="20"
        fill="var(--hx-illu-shadow)"
        opacity=".12"
      />
      {/* Laptop base */}
      <rect
        x="70"
        y="105"
        width="140"
        height="8"
        rx="4"
        fill="var(--hx-illu-base)"
      />
      <rect
        x="62"
        y="113"
        width="156"
        height="5"
        rx="2.5"
        fill="var(--hx-illu-base2)"
      />
      {/* Laptop screen */}
      <rect
        x="80"
        y="35"
        width="120"
        height="72"
        rx="8"
        fill="var(--hx-illu-screen)"
      />
      <rect
        x="85"
        y="40"
        width="110"
        height="62"
        rx="5"
        fill="var(--hx-illu-inner)"
      />
      {/* Screen UI */}
      <rect
        x="91"
        y="47"
        width="55"
        height="5"
        rx="2"
        fill="var(--hx-illu-bar1)"
        opacity=".6"
      />
      <rect
        x="91"
        y="56"
        width="38"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".35"
      />
      <rect
        x="91"
        y="65"
        width="98"
        height="22"
        rx="4"
        fill="var(--hx-illu-card)"
      />
      <rect
        x="97"
        y="70"
        width="28"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar1)"
        opacity=".4"
      />
      <rect
        x="97"
        y="77"
        width="44"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".25"
      />
      <circle cx="166" cy="76" r="7" fill="#3b82f6" opacity=".15" />
      <rect
        x="91"
        y="91"
        width="42"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".25"
      />
      <rect
        x="137"
        y="91"
        width="26"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".15"
      />
      {/* Floating card top-right */}
      <rect
        x="198"
        y="22"
        width="64"
        height="40"
        rx="8"
        fill="var(--hx-illu-card)"
        style={{ filter: "drop-shadow(0 4px 12px rgba(59,130,246,.18))" }}
      />
      <circle cx="211" cy="36" r="8" fill="#3b82f6" opacity=".15" />
      <rect
        x="224"
        y="32"
        width="30"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar1)"
        opacity=".4"
      />
      <rect
        x="224"
        y="39"
        width="20"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".25"
      />
      <rect
        x="204"
        y="50"
        width="50"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".18"
      />
      {/* Floating card left */}
      <rect
        x="14"
        y="65"
        width="56"
        height="32"
        rx="8"
        fill="var(--hx-illu-card)"
        style={{ filter: "drop-shadow(0 4px 12px rgba(16,185,129,.14))" }}
      />
      <circle cx="26" cy="81" r="6" fill="#10b981" opacity=".2" />
      <rect
        x="37"
        y="77"
        width="24"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar1)"
        opacity=".4"
      />
      <rect
        x="37"
        y="84"
        width="18"
        height="3"
        rx="1.5"
        fill="var(--hx-illu-bar2)"
        opacity=".25"
      />
      {/* Plant decoration */}
      <ellipse cx="212" cy="108" rx="12" ry="5" fill="#10b981" opacity=".15" />
      <path
        d="M212 108 Q206 92 215 82 Q208 90 212 108Z"
        fill="#10b981"
        opacity=".3"
      />
      <path
        d="M212 108 Q220 88 226 80 Q218 92 212 108Z"
        fill="#10b981"
        opacity=".25"
      />
      <path
        d="M212 108 Q205 95 200 85 Q210 97 212 108Z"
        fill="#10b981"
        opacity=".2"
      />
      {/* Dots */}
      <circle cx="248" cy="130" r="4" fill="#3b82f6" opacity=".2" />
      <circle cx="258" cy="140" r="2.5" fill="#3b82f6" opacity=".12" />
      <circle cx="242" cy="142" r="2" fill="#3b82f6" opacity=".1" />
      <circle cx="40" cy="118" r="3" fill="#10b981" opacity=".18" />
      <circle cx="30" cy="128" r="2" fill="#10b981" opacity=".1" />
    </svg>
  );
}

/* ── Modal cumpleaños ────────────────────────────────────────────── */
function ModalCumpleanos({ data, onClose }) {
  return (
    <div className="hx-modal-overlay" onClick={onClose}>
      <div className="hx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hx-modal-hdr">
          <div className="hx-modal-hdr-left">
            <span className="hx-modal-ico">🎂</span>
            <span className="hx-modal-title">Cumpleaños del mes</span>
          </div>
          <button className="hx-modal-close" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="hx-modal-body">
          {data.length === 0 ? (
            <div className="hx-empty">Sin cumpleaños este mes.</div>
          ) : (
            <div className="hx-bday-modal-grid">
              {data.map((b, i) => {
                const av = AVS[i % AVS.length];
                const ini = initials(b);
                return (
                  <div key={i} className="hx-bday-modal-item">
                    <div
                      className="hx-bday-modal-av"
                      style={{ background: av.bg, color: av.c }}
                    >
                      {ini}
                    </div>
                    <div className="hx-bday-modal-info">
                      <div className="hx-bday-modal-name">
                        {b.nombre} {b.apellidoPaterno}
                      </div>
                      <div className="hx-bday-modal-meta">
                        {b.diaNacimiento} ago · {b.departamento || b.sitio}
                      </div>
                    </div>
                    <span className="hx-bday-modal-cake">🎂</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   HOMEPAGE
   ══════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const nav = useNavigate();
  const { user } = useContext(AuthContext);
  const name = user?.name?.split(" ")[0] ?? "Usuario";
  const msg = MENSAJES[new Date().getDay()] ?? MENSAJES[0];
  const ops = user?.area === "SISTEMAS";

  // Data states
  const [coms, setComs] = useState([]);
  const [svcs, setSvcs] = useState([]);
  const [svcCat, setSvcCat] = useState([]);
  const [bdays, setBdays] = useState([]);
  const [arts, setArts] = useState([]);
  const [edicion, setEdicion] = useState(null);
  const [lCom, setLCom] = useState(true);
  const [lSvc, setLSvc] = useState(true);
  const [lBday, setLBday] = useState(true);
  const [lArts, setLArts] = useState(true);

  // Modal states
  const [mCom, setMCom] = useState(false);
  const [mSvc, setMSvc] = useState(false);
  const [mBdays, setMBdays] = useState(false);
  const [fCom, setFCom] = useState({ encabezado: "", cuerpo: "" });
  const [fSvc, setFSvc] = useState({
    idServicio: "",
    estado: "operando",
    detalle: "",
  });
  const [sCom, setSCom] = useState(false);
  const [sSvc, setSSvc] = useState(false);

  useEffect(() => {
    loadComs();
    loadSvcs();
    loadBdays();
    loadArts();
  }, []);

  async function loadComs() {
    setLCom(true);
    try {
      const d = await apiFetch("/api/home/comunicados");
      setComs(Array.isArray(d) ? d : []);
    } catch {
      setComs([]);
    } finally {
      setLCom(false);
    }
  }
  async function loadSvcs() {
    setLSvc(true);
    try {
      const [a, b] = await Promise.all([
        apiFetch("/api/home/estado-servicios"),
        apiFetch("/api/home/servicios-ti"),
      ]);
      setSvcs(Array.isArray(a) ? a : []);
      setSvcCat(Array.isArray(b) ? b : []);
    } catch {
      setSvcs([]);
    } finally {
      setLSvc(false);
    }
  }
  async function loadBdays() {
    setLBday(true);
    try {
      const url = process.env.REACT_APP_API_URL
        ? `${process.env.REACT_APP_API_URL}/birthdays`
        : "/api/birthdays";
      const d = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then((r) => r.json());
      setBdays(Array.isArray(d) ? d : []);
    } catch {
      setBdays([]);
    } finally {
      setLBday(false);
    }
  }
  async function loadArts() {
    setLArts(true);
    try {
      const ed = await apiFetch("/api/blog/edicion/activa");
      if (ed && !ed.__httpError) {
        setEdicion(ed);
        const a = await apiFetch(
          `/api/blog/articulos?idEdicion=${ed.idEdicion}`,
        );
        setArts(Array.isArray(a) ? a.slice(0, 3) : []);
      }
    } catch {
    } finally {
      setLArts(false);
    }
  }
  async function pubCom() {
    if (!fCom.encabezado.trim()) return;
    setSCom(true);
    try {
      await apiFetch("/api/home/comunicados", {
        method: "POST",
        body: JSON.stringify({ ...fCom, loginAutor: user?.login }),
      });
      setMCom(false);
      setFCom({ encabezado: "", cuerpo: "" });
      loadComs();
    } finally {
      setSCom(false);
    }
  }
  async function updSvc() {
    if (!fSvc.idServicio) return;
    setSSvc(true);
    try {
      await apiFetch("/api/home/estado-servicios", {
        method: "PUT",
        body: JSON.stringify({
          idServicio: parseInt(fSvc.idServicio),
          estado: fSvc.estado,
          detalle: fSvc.detalle,
          loginAutor: user?.login,
        }),
      });
      setMSvc(false);
      setFSvc({ idServicio: "", estado: "operando", detalle: "" });
      loadSvcs();
    } finally {
      setSSvc(false);
    }
  }

  const allOk = svcs.length > 0 && svcs.every((s) => s.estado === "operando");

  // Cumpleaños: próximos del mes
  const hoy = new Date();
  const bdayProximos = bdays
    .sort((a, b) => parseInt(a.diaNacimiento) - parseInt(b.diaNacimiento))
    .slice(0, 4);

  return (
    <div className="hx">
      {/* ══ ROW 1: Hero + Cumpleaños ═══════════════════════════ */}
      <div className="hx-row1">
        {/* Hero */}
        <div className="hx-hero">
          <div className="hx-hero-left">
            <div className="hx-date">{fmtHoy()}</div>
            <h1 className="hx-h1">
              {saludo()}, <span className="hx-name">{name}</span> 👋
            </h1>
            <p className="hx-msg">{msg.a}</p>
            <p className="hx-sub">{msg.b}</p>
            <nav className="hx-dock">
              {QUICK_APPS.map((a, i) => (
                <a
                  key={i}
                  className="hx-dock-item"
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  title={a.desc}
                >
                  <span className="hx-dock-ico" style={{ background: a.bg }}>
                    <i className={`ti ${a.icon}`} style={{ color: a.color }} />
                  </span>
                  <span className="hx-dock-lbl">{a.name}</span>
                </a>
              ))}
            </nav>
          </div>
          <div className="hx-hero-right">
            <HeroIllustration />
          </div>
        </div>

        {/* Cumpleaños */}
        <div className="hx-card hx-bday-panel">
          <div className="hx-panel-hdr">
            <div className="hx-panel-hdr-left">
              <i className="ti ti-cake hx-panel-ico" />
              <span className="hx-panel-label">PRÓXIMOS CUMPLEAÑOS</span>
            </div>
            <button className="hx-ver-btn" onClick={() => setMBdays(true)}>
              Ver todos
            </button>
          </div>

          {lBday ? (
            <div className="hx-loading">Cargando…</div>
          ) : bdayProximos.length === 0 ? (
            <div className="hx-empty">Sin cumpleaños próximos.</div>
          ) : (
            <div className="hx-bday-list">
              {bdayProximos.map((b, i) => {
                const av = AVS[i % AVS.length];
                return (
                  <div key={i} className="hx-bday-row">
                    <div
                      className="hx-bday-av"
                      style={{ background: av.bg, color: av.c }}
                    >
                      {initials(b)}
                    </div>
                    <div className="hx-bday-info">
                      <div className="hx-bday-name">
                        {b.nombre} {b.apellidoPaterno}
                      </div>
                      <div className="hx-bday-meta">
                        {b.diaNacimiento} ago · {b.departamento || b.sitio}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cake decoration */}
          <div className="hx-bday-deco" aria-hidden="true">
            <svg viewBox="0 0 80 80" fill="none" width="80" height="80">
              <circle cx="56" cy="56" r="30" fill="#fef3c7" opacity=".4" />
              <text x="44" y="62" fontSize="26" textAnchor="middle">
                🎂
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* ══ ROW 2: Comunicados + Servicios TI + Soporte ═════════ */}
      <div className="hx-row2">
        {/* Comunicados */}
        <div className="hx-card hx-col-com">
          <div className="hx-panel-hdr" style={{ marginBottom: 10 }}>
            <span className="hx-panel-label">COMUNICADOS</span>
            {ops && (
              <button className="hx-add-btn" onClick={() => setMCom(true)}>
                <i className="ti ti-plus" /> Nuevo
              </button>
            )}
          </div>

          {lCom ? (
            <div className="hx-loading">Cargando…</div>
          ) : coms.length === 0 ? (
            <div className="hx-empty">Sin comunicados.</div>
          ) : (
            coms.slice(0, 2).map((c, i) => (
              <div key={i} className="hx-com-item">
                <div className="hx-com-thumb">
                  {c.imagenUrl ? (
                    <img src={c.imagenUrl} alt={c.encabezado} />
                  ) : (
                    <div className="hx-com-thumb-placeholder">
                      <i
                        className={`ti ${i === 0 ? "ti-windmill" : "ti-device-desktop"}`}
                      />
                    </div>
                  )}
                </div>
                <div className="hx-com-body">
                  {c.tipo && (
                    <span
                      className="hx-com-tag"
                      style={{
                        color: i === 0 ? "#ef4444" : "#3b82f6",
                        background: i === 0 ? "#fee2e2" : "#dbeafe",
                      }}
                    >
                      {c.tipo || (i === 0 ? "Importante" : "Actualización")}
                    </span>
                  )}
                  {!c.tipo && (
                    <span
                      className="hx-com-tag"
                      style={{
                        color: i === 0 ? "#ef4444" : "#3b82f6",
                        background: i === 0 ? "#fee2e2" : "#dbeafe",
                      }}
                    >
                      {i === 0 ? "Importante" : "Actualización"}
                    </span>
                  )}
                  <div className="hx-com-title">{c.encabezado}</div>
                  {c.cuerpo && <div className="hx-com-desc">{c.cuerpo}</div>}
                  <div className="hx-com-date">
                    {fmtFecha(c.fechaPublicacion)}
                  </div>
                </div>
              </div>
            ))
          )}

          <button className="hx-see-all">
            Ver todos los comunicados <i className="ti ti-arrow-right" />
          </button>
        </div>

        {/* Servicios TI */}
        <div className="hx-card hx-col-svc">
          <div className="hx-panel-hdr" style={{ marginBottom: 8 }}>
            <span className="hx-panel-label">SERVICIOS TI</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {ops && (
                <button className="hx-add-btn" onClick={() => setMSvc(true)}>
                  <i className="ti ti-refresh" /> Actualizar
                </button>
              )}
              <button className="hx-ver-btn">Ver catálogo</button>
            </div>
          </div>

          {!lSvc && svcs.length > 0 && (
            <div className={`hx-svc-status-bar ${allOk ? "ok" : "warn"}`}>
              <span className="hx-svc-dot-sm" />
              {allOk
                ? "Todos los servicios operando"
                : "Hay incidencias activas"}
            </div>
          )}

          {lSvc ? (
            <div className="hx-loading">Cargando…</div>
          ) : (
            svcs.map((s, i) => {
              const e = EST[s.estado] ?? EST.operando;
              const ico = SVC_ICONS[s.nombre] || "ti-server";
              return (
                <div key={i} className="hx-svc-row">
                  <div className="hx-svc-ico">
                    <i className={`ti ${ico}`} />
                  </div>
                  <span className="hx-svc-name">{s.nombre}</span>
                  <span className="hx-svc-badge" style={{ color: e.color }}>
                    <span
                      className="hx-svc-dot"
                      style={{ background: e.color }}
                    />
                    {e.label}
                  </span>
                </div>
              );
            })
          )}

          <button className="hx-see-all">
            Ver todos los servicios <i className="ti ti-arrow-right" />
          </button>
        </div>

        {/* Tu Soporte */}
        <div className="hx-col-soporte">
          {/* Mesa */}
          <div className="hx-card hx-mesa-card">
            <div className="hx-panel-label" style={{ marginBottom: 10 }}>
              TU SOPORTE
            </div>
            <div className="hx-mesa-inner">
              <div className="hx-mesa-text">
                <div className="hx-mesa-title">Mesa de Servicios</div>
                <div className="hx-mesa-desc">
                  Reporta incidencias, solicita soporte o consulta tus
                  solicitudes.
                </div>
                <button
                  className="hx-mesa-btn"
                  onClick={() => nav("/mesa-de-servicio")}
                >
                  Ir a Mesa de Servicios <i className="ti ti-arrow-right" />
                </button>
              </div>
              <div className="hx-mesa-illo" aria-hidden="true">
                <svg viewBox="0 0 70 70" width="70" height="70">
                  <circle cx="35" cy="35" r="30" fill="#dbeafe" />
                  <text x="35" y="46" fontSize="26" textAnchor="middle">
                    🎧
                  </text>
                </svg>
              </div>
            </div>
          </div>
          {/* Contacto */}
          <div className="hx-card hx-contacto-card">
            <div className="hx-panel-label" style={{ marginBottom: 10 }}>
              CONTACTO DIRECTO
            </div>
            <a
              className="hx-contact"
              href="https://teams.microsoft.com/l/chat/0/0?users=jorge.gonzalez@fabpsa.com.mx"
              target="_blank"
              rel="noreferrer"
            >
              <div
                className="hx-contact-av"
                style={{ background: "#dcfce7", color: "#15803d" }}
              >
                JG
              </div>
              <div className="hx-contact-info">
                <span className="hx-contact-site">Planta</span>
                <span className="hx-contact-name">Jorge González</span>
              </div>
              <i className="ti ti-brand-teams hx-teams" />
            </a>
            <a
              className="hx-contact"
              href="https://teams.microsoft.com/l/chat/0/0?users=lizbet.hernandez@fabpsa.com.mx"
              target="_blank"
              rel="noreferrer"
            >
              <div
                className="hx-contact-av"
                style={{ background: "#dbeafe", color: "#1d4ed8" }}
              >
                LH
              </div>
              <div className="hx-contact-info">
                <span className="hx-contact-site">Sur 121</span>
                <span className="hx-contact-name">Lizbet Hernández J.</span>
              </div>
              <i className="ti ti-brand-teams hx-teams" />
            </a>
          </div>
        </div>
      </div>

      {/* ══ ROW 3: Cultura Digital + Accesos rápidos ════════════ */}
      <div className="hx-row3">
        {/* Cultura Digital */}
        <div className="hx-card hx-col-cultura">
          <div className="hx-panel-hdr" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="hx-panel-label">CULTURA DIGITAL</span>
              {edicion && (
                <span className="hx-edition-tag">Edición {edicion.titulo}</span>
              )}
            </div>
            <button
              className="hx-ver-btn"
              onClick={() => nav("/cultura-digital")}
            >
              Ver todo
            </button>
          </div>
          <div className="hx-cultura-grid">
            {lArts ? (
              [1, 2, 3].map((i) => <div key={i} className="hx-art-skeleton" />)
            ) : arts.length === 0 ? (
              <div className="hx-empty">Próximamente.</div>
            ) : (
              arts.map((a, i) => {
                const cc = CAT_COLORS[a.categoria] || "#3b82f6";
                const cl = CAT_LABELS[a.categoria] || a.categoria;
                const fecha = a.fechaPublicacion
                  ? new Date(a.fechaPublicacion).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })
                  : "";
                return (
                  <div
                    key={a.idArticulo}
                    className="hx-art-card"
                    onClick={() => nav("/cultura-digital")}
                  >
                    <div className="hx-art-img">
                      {a.fotoUrl ? (
                        <img src={a.fotoUrl} alt={a.titulo} />
                      ) : (
                        <div
                          className="hx-art-img-ph"
                          style={{ background: cc + "14" }}
                        >
                          <span style={{ fontSize: 22 }}>
                            {CAT_EMOJIS[a.categoria] || "📄"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="hx-art-body">
                      <span
                        className="hx-art-cat"
                        style={{ color: cc, background: cc + "12" }}
                      >
                        {cl}
                      </span>
                      <div className="hx-art-title">{a.titulo}</div>
                      <div className="hx-art-meta">
                        {a.autor} · {fecha}
                      </div>
                      <div className="hx-art-reactions">
                        <span>👍 {a.likes ?? 0}</span>
                        <span>💬 {a.comentarios ?? 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="hx-card hx-col-accesos">
          <div className="hx-panel-label" style={{ marginBottom: 16 }}>
            ACCESOS RÁPIDOS
          </div>
          <div className="hx-accesos-grid">
            {[
              {
                icon: "ti-ticket",
                label: "Solicitudes\nde TI",
                color: "#3b82f6",
                bg: "#dbeafe",
                path: "/mesa-de-servicio",
              },
              {
                icon: "ti-alert-circle",
                label: "Reportar\nincidencia",
                color: "#ef4444",
                bg: "#fee2e2",
                path: "/mesa-de-servicio",
              },
              {
                icon: "ti-book",
                label: "Base de\nconocimiento",
                color: "#8b5cf6",
                bg: "#ede9fe",
                path: "/cultura-digital",
              },
              {
                icon: "ti-users",
                label: "Directorio\nde personal",
                color: "#10b981",
                bg: "#dcfce7",
                path: "/",
              },
            ].map((a, i) => (
              <button key={i} className="hx-acceso" onClick={() => nav(a.path)}>
                <div className="hx-acceso-ico" style={{ background: a.bg }}>
                  <i className={`ti ${a.icon}`} style={{ color: a.color }} />
                </div>
                <span className="hx-acceso-lbl">
                  {a.label.replace("\n", " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ MODAL CUMPLEAÑOS ════════════════════════════════════ */}
      {mBdays && (
        <ModalCumpleanos data={bdays} onClose={() => setMBdays(false)} />
      )}

      {/* ══ MODAL NUEVO COMUNICADO ══════════════════════════════ */}
      {mCom && (
        <div className="hx-modal-overlay" onClick={() => setMCom(false)}>
          <div className="hx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hx-modal-hdr">
              <div className="hx-modal-hdr-left">
                <span className="hx-modal-title">Nuevo comunicado</span>
              </div>
              <button className="hx-modal-close" onClick={() => setMCom(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="hx-modal-body">
              <label className="hx-lbl">Encabezado</label>
              <input
                className="hx-inp"
                placeholder="Título"
                value={fCom.encabezado}
                autoFocus
                onChange={(e) =>
                  setFCom((v) => ({ ...v, encabezado: e.target.value }))
                }
              />
              <label className="hx-lbl" style={{ marginTop: 12 }}>
                Cuerpo <span className="hx-opt">(opcional)</span>
              </label>
              <textarea
                className="hx-ta"
                rows={4}
                placeholder="Descripción…"
                value={fCom.cuerpo}
                onChange={(e) =>
                  setFCom((v) => ({ ...v, cuerpo: e.target.value }))
                }
              />
              <div className="hx-hint">
                <i className="ti ti-calendar" /> Hoy,{" "}
                {new Date().toLocaleDateString("es-MX")}
              </div>
            </div>
            <div className="hx-modal-ftr">
              <button className="hx-btn-cancel" onClick={() => setMCom(false)}>
                Cancelar
              </button>
              <button
                className="hx-btn-primary"
                disabled={sCom || !fCom.encabezado.trim()}
                onClick={pubCom}
              >
                {sCom ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ACTUALIZAR SERVICIO ═══════════════════════════ */}
      {mSvc && (
        <div className="hx-modal-overlay" onClick={() => setMSvc(false)}>
          <div className="hx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hx-modal-hdr">
              <div className="hx-modal-hdr-left">
                <span className="hx-modal-title">Actualizar servicio</span>
              </div>
              <button className="hx-modal-close" onClick={() => setMSvc(false)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="hx-modal-body">
              <label className="hx-lbl">Servicio</label>
              <select
                className="hx-sel"
                value={fSvc.idServicio}
                onChange={(e) =>
                  setFSvc((v) => ({ ...v, idServicio: e.target.value }))
                }
              >
                <option value="">Seleccionar…</option>
                {svcCat.map((s) => (
                  <option key={s.idServicio} value={s.idServicio}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <label className="hx-lbl" style={{ marginTop: 12 }}>
                Estado
              </label>
              <div className="hx-radio-row">
                {Object.entries(EST).map(([k, v]) => (
                  <label
                    key={k}
                    className={`hx-radio${fSvc.estado === k ? " on" : ""}`}
                    style={
                      fSvc.estado === k
                        ? { borderColor: v.color, background: v.color + "10" }
                        : {}
                    }
                  >
                    <input
                      type="radio"
                      name="est"
                      checked={fSvc.estado === k}
                      onChange={() => setFSvc((f) => ({ ...f, estado: k }))}
                    />
                    <span
                      className="hx-radio-dot"
                      style={{ background: v.color }}
                    />
                    {v.label}
                  </label>
                ))}
              </div>
              <label className="hx-lbl" style={{ marginTop: 12 }}>
                Detalle <span className="hx-opt">(opcional)</span>
              </label>
              <textarea
                className="hx-ta"
                rows={3}
                value={fSvc.detalle}
                onChange={(e) =>
                  setFSvc((v) => ({ ...v, detalle: e.target.value }))
                }
                placeholder="Descripción…"
              />
            </div>
            <div className="hx-modal-ftr">
              <button className="hx-btn-cancel" onClick={() => setMSvc(false)}>
                Cancelar
              </button>
              <button
                className="hx-btn-primary"
                disabled={sSvc || !fSvc.idServicio}
                onClick={updSvc}
              >
                {sSvc ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
