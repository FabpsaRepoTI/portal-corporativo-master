import SidebarMode, {readSidebarMode, setSidebarMode, readSidebarWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX} from "./SidebarMode";
import "./Sidebar.css";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useContext } from "react";
import logoFabpsa from "../logo-fabpsa.png";
import { AuthContext } from "../context/AuthContext";

const NAV_SECTIONS = [
 {id:"general",label:"General",icon:"ti-home",items:[{to:"/",icon:"ti-home",label:"Inicio",modulo:"portal"}]},
 {id:"soporte",label:"Soporte y atención",icon:"ti-headset",items:[
  {to:"/mesa-de-servicio",icon:"ti-device-laptop",label:"Mesa de Servicio",modulo:"mesa_servicio"},
  {to:"/gestion-desarrollo",icon:"ti-chart-dots-3",label:"Gestión de Desarrollo",modulo:"gestion_desarrollo"},
  {to:"/visor-ti",icon:"ti-layout-dashboard",label:"Panel de Operación TI",modulo:"mesa_servicio",sistemas:true},
  {to:"/mesa-de-servicio/mis-solicitudes",icon:"ti-clipboard-list",label:"Mis solicitudes",modulo:"mesa_servicio"}
 ]},
 {id:"operacion",label:"Operación técnica",icon:"ti-tool",items:[
  {to:"/mantenimiento",icon:"ti-tool",label:"Mantenimiento",modulo:"mantenimiento",disabled:true},
  {to:"/vigilancia",icon:"ti-shield-lock",label:"Vigilancia",modulo:"vigilancia"},
  {to:"/sit",icon:"ti-flask",label:"Información Técnica",modulo:"sit"},
 ]},
 {id:"escaner",label:"Control de facturas",icon:"ti-barcode",items:[{to:"/cedis/facturas",icon:"ti-barcode",label:"Escáner",modulo:"escaner"}]},
 {id:"recursos",label:"Recursos",icon:"ti-layout-grid",items:[
  {to:"/aplicativos",icon:"ti-layout-grid",label:"Aplicativos",modulo:"portal"},
  {to:"http://201.151.218.138:3550/fabp/Directorio",icon:"ti-address-book",label:"Directorio",external:true,modulo:"portal"},
  {to:"/cultura-digital",icon:"ti-bulb",label:"Cultura Digital",modulo:"cultura_digital"},
  {to:"/guia-diseno",icon:"ti-palette",label:"Guía de Diseño UI",modulo:"portal",sistemas:true},
  {to:"/mesa-de-servicio/encuesta-resultados",icon:"ti-star",label:"Resultados de encuesta",modulo:"mesa_servicio",logins:["JMRAMIREZ"]},
 ]}
];

export default function Sidebar() {
  const { modulos = [], user } = useContext(AuthContext);

  const [mode,setMode]=useState(readSidebarMode);
  useEffect(()=>{const handler=e=>setMode(e.detail);document.addEventListener("sidebar:mode",handler);return()=>document.removeEventListener("sidebar:mode",handler);},[]);
  const {pathname}=useLocation();
  useEffect(()=>{setSidebarMobileOpen(false);},[pathname]);

  const [sbWidth, setSbWidth] = useState(readSidebarWidth);
  useEffect(() => { document.documentElement.style.setProperty("--sb-w", sbWidth + "px"); }, [sbWidth]);
  const startResize = (e) => {
    e.preventDefault();
    let latest = sbWidth;
    const move = (ev) => {
      if (ev.clientX < 120) { cleanup(); setSidebarMode("hidden"); return; }
      latest = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, ev.clientX));
      setSbWidth(latest);
    };
    const up = () => { cleanup(); try { localStorage.setItem("sidebar-width", String(latest)); } catch {} };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const [supportOpen, setSupportOpen] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark",
  );
  const [popoverTop, setPopoverTop] = useState(0);
  const helpRef = useRef(null);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute(
      "data-theme",
      next ? "dark" : "light",
    );
  };

  const handleSupportClick = () => {
    if (helpRef.current) {
      const rect = helpRef.current.getBoundingClientRect();
      setPopoverTop(rect.top);
    }
    setSupportOpen((v) => !v);
  };

  useEffect(() => {
    const handler = (e) => {
      if (
        !e.target.closest(".sb-help-card") &&
        !e.target.closest(".sb-support-popover")
      ) {
        setSupportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = () => setSidebarMobileOpen((v) => !v);
    document.addEventListener("sidebar:toggle", handler);
    return () => document.removeEventListener("sidebar:toggle", handler);
  }, []);

  const closeMobile = () => setSidebarMobileOpen(false);

  // ── Filtrar secciones según módulos del usuario ──────────
  const seccionesFiltradas = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => modulos.includes(item.modulo) && (!item.sistemas || ["SISTEMAS","SYSTEMS"].includes(user?.area?.toUpperCase())) && (!item.logins || item.logins.includes(user?.login))),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {sidebarMobileOpen && (
        <div className="sb-mobile-overlay" onClick={closeMobile} />
      )}

      {mode === "hidden" && (
        <button type="button" className="sb-reopen" aria-label="Mostrar barra lateral" onClick={() => setSidebarMode("fixed")}>
          <i className="ti ti-layout-sidebar" />
        </button>
      )}

      <aside className={`sidebar sidebar--grouped sidebar-mode-${mode}${sidebarMobileOpen ? " sidebar--open" : ""}`}>
        <div className="sb-logo-area"><SidebarMode/>
          <div className="sidebar-logo-mark">
            <img className="logoFabpsa" src={logoFabpsa} alt="FABPSA" />
            <span className="dm-sb-flor" aria-hidden="true" />
          </div>
          <div className="sb-logo-text">
            <span className="sb-logo-name">PORTAL CORPORATIVO</span>
            <span className="sb-logo-sub"></span>
          </div>
          <button
            className="sb-close-btn"
            onClick={closeMobile}
            aria-label="Cerrar menú"
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {seccionesFiltradas.map(section=>(
            <section key={section.id} className="sb-section" aria-labelledby={"sb-heading-"+section.id}>
              <h2 id={"sb-heading-"+section.id} className="sb-section-heading">{section.label}</h2>
              <ul className="sidebar-group sb-static-group">
                {section.items.map(item=><SidebarItem key={item.to} {...item} onNavigate={closeMobile}/>)}
              </ul>
            </section>
          ))}
        </nav>

        <div
          className={`sb-support-popover${supportOpen ? " open" : ""}`}
          style={{ top: popoverTop }}
        >
          <div className="sb-pop-label">Selecciona tu sitio</div>
          <a
            className="sb-support-pop-item"
            href="https://teams.microsoft.com/l/chat/0/0?users=jorge.gonzalez@fabpsa.com.mx"
            target="_blank"
            rel="noreferrer"
            onClick={() => setSupportOpen(false)}
          >
            <div
              className="sb-pop-avatar"
              style={{ background: "rgba(16,185,129,0.15)", color: "#059669" }}
            >
              JG
            </div>
            <div>
              <div className="sb-pop-site">Planta</div>
              <div className="sb-pop-name">Jorge González</div>
            </div>
            <i className="ti ti-arrow-right sb-pop-arrow" />
          </a>
          <a
            className="sb-support-pop-item"
            href="https://teams.microsoft.com/l/chat/0/0?users=lizbet.hernandez@fabpsa.com.mx"
            target="_blank"
            rel="noreferrer"
            onClick={() => setSupportOpen(false)}
          >
            <div
              className="sb-pop-avatar"
              style={{ background: "rgba(59,130,246,0.15)", color: "#2563eb" }}
            >
              LH
            </div>
            <div>
              <div className="sb-pop-site">Sur 121</div>
              <div className="sb-pop-name">Lizbet Hernández J.</div>
            </div>
            <i className="ti ti-arrow-right sb-pop-arrow" />
          </a>
        </div>
        {mode === "fixed" && <div className="sb-resize" onPointerDown={startResize} title="Arrastra para cambiar el ancho" />}
      </aside>
    </>
  );
}

function SidebarItem({
  to,
  icon,
  label,
  badge,
  external,
  color,
  disabled,
  onNavigate,
}) {
  if (disabled) {
    return (
      <li>
        <div
          className="sidebar-link sidebar-link--disabled"
          aria-label={label}
          aria-disabled="true"
          title={`${label} — En pruebas`}
        >
          <span className="sb-icon-wrap">
            <i className={`ti ${icon} sidebar-link-icon`} />
          </span>
          <span className="sidebar-link-label">{label}</span>
          {badge && <span className="sidebar-badge-new">{badge}</span>}
        </div>
      </li>
    );
  }

  if (external) {
    return (
      <li>
        <a
          title={label}
          href={to}
          aria-label={label}
          target="_blank"
          rel="noreferrer"
          className="sidebar-link"
          onClick={onNavigate}
        >
          <span className="sb-icon-wrap">
            <i className={`ti ${icon} sidebar-link-icon`} />
          </span>
          <span className="sidebar-link-label">{label}</span>
        </a>
      </li>
    );
  }

  return (
    <li>
      <NavLink
        title={label}
        to={to}
        aria-label={label}
        state={to === "/mantenimiento" ? { mostrarEntradaMantenimiento: true } : undefined}
        end={to === "/" || to === "/mesa-de-servicio"}
        className={({ isActive }) =>
          "sidebar-link" + (isActive ? " sidebar-link--active" : "")
        }
        onClick={onNavigate}
      >
        {({ isActive }) => (
          <>
            <span
              className="sb-icon-wrap"
              style={
                color && isActive ? { background: `${color}18`, color } : {}
              }
            >
              <i className={`ti ${icon} sidebar-link-icon`} />
            </span>
            <span className="sidebar-link-label">{label}</span>
            {badge && <span className="sidebar-badge-new">{badge}</span>}
          </>
        )}
      </NavLink>
    </li>
  );
}
