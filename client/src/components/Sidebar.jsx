import { NavLink } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import logoFabpsa from "../logo-fabpsa.png";

const NAV_SECTIONS = [
  {
    label: "General",
    items: [{ to: "/", icon: "ti-home", label: "Inicio" }],
  },
  {
    label: "Mesa de Servicio",
    items: [
      {
        to: "/mesa-de-servicio",
        icon: "ti-device-laptop",
        label: "Mesa de Servicio",
        color: "#10b981",
      },
    ],
  },
  {
    label: "Recursos",
    items: [
      { to: "/aplicativos", icon: "ti-layout-grid", label: "Aplicativos" },
      {
        to: "http://201.151.218.138:3550/fabp/Directorio",
        icon: "ti-address-book",
        label: "Directorio",
        external: true,
      },
      {
        to: "/cultura-digital",
        icon: "ti-bulb",
        label: "Cultura Digital",
      },
      {
        label: "Mis desarrollos",
        icon: "ti-code",
        to: "/mesa-de-servicio/mis-desarrollos",
      },
    ],
  },
];

export default function Sidebar() {
  const [supportOpen, setSupportOpen] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark",
  );
  const [popoverTop, setPopoverTop] = useState(0);
  const helpRef = useRef(null);

  /* ── Tema ── */
  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute(
      "data-theme",
      next ? "dark" : "light",
    );
  };

  /* ── Popover soporte ── */
  const handleSupportClick = () => {
    if (helpRef.current) {
      const rect = helpRef.current.getBoundingClientRect();
      setPopoverTop(rect.top);
    }
    setSupportOpen((v) => !v);
  };

  /* ── Cerrar popover al hacer clic fuera ── */
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

  /* ── Escuchar botón hamburguesa desde Navbar ── */
  useEffect(() => {
    const handler = () => setSidebarMobileOpen((v) => !v);
    document.addEventListener("sidebar:toggle", handler);
    return () => document.removeEventListener("sidebar:toggle", handler);
  }, []);

  /* ── Cerrar sidebar al navegar ── */
  const closeMobile = () => setSidebarMobileOpen(false);

  return (
    <>
      {/* Overlay FUERA del aside — z-index 599, sidebar es 600 */}
      {sidebarMobileOpen && (
        <div className="sb-mobile-overlay" onClick={closeMobile} />
      )}

      <aside className={`sidebar${sidebarMobileOpen ? " sidebar--open" : ""}`}>
        {/* Logo + botón cerrar (X solo visible en móvil) */}
        <div className="sb-logo-area">
          <div className="sidebar-logo-mark">
            <img className="logoFabpsa" src={logoFabpsa} alt="FABPSA" />
          </div>
          <div className="sb-logo-text">
            <span className="sb-logo-name">FABPSA</span>
            <span className="sb-logo-sub">Mesa de Servicio</span>
          </div>
          <button
            className="sb-close-btn"
            onClick={closeMobile}
            aria-label="Cerrar menú"
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="sb-section">
              <span className="sidebar-group-label">{section.label}</span>
              <ul className="sidebar-group">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.to}
                    {...item}
                    onNavigate={closeMobile}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom: help card + theme toggle */}
        <div className="sidebar-bottom">
          <div className="sidebar-bottom-inner">
            <div ref={helpRef}>
              <div className="sb-help-card">
                <div className="sb-help-card-header">
                  <span className="sb-help-ico">
                    <i className="ti ti-headset" />
                  </span>
                  <span className="sb-help-card-title">¿Necesitas ayuda?</span>
                </div>
                <p className="sb-help-card-desc">
                  Nuestro equipo está listo para asistirte.
                </p>
                <button className="sb-help-btn" onClick={handleSupportClick}>
                  <i className="ti ti-message-circle" />
                  Contactar a soporte
                  <i
                    className={`ti ${supportOpen ? "ti-chevron-up" : "ti-chevron-down"} sb-help-chev`}
                  />
                </button>
              </div>
            </div>

            <div className="sb-theme-row">
              <i
                className={`ti ${darkMode ? "ti-moon" : "ti-sun"} sb-theme-icon`}
              />
              <span className="sb-theme-label">
                {darkMode ? "Modo oscuro" : "Modo claro"}
              </span>
              <button
                className={`sb-theme-toggle${darkMode ? " on" : ""}`}
                onClick={toggleTheme}
                aria-label="Cambiar tema"
                role="switch"
                aria-checked={darkMode}
              >
                <span className="sb-theme-knob" />
              </button>
            </div>
          </div>
        </div>

        {/* Popover soporte — position:fixed via JS */}
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
      </aside>
    </>
  );
}

function SidebarItem({ to, icon, label, badge, external, color, onNavigate }) {
  if (external) {
    return (
      <li>
        <a
          href={to}
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
        to={to}
        end={to === "/"}
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
