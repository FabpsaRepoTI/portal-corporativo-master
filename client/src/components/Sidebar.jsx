import { NavLink } from "react-router-dom";
import { useState, useEffect, useRef, useContext } from "react";
import logoFabpsa from "../logo-fabpsa.png";
import { AuthContext } from "../context/AuthContext";

const NAV_SECTIONS = [
  {
    label: "General",
    items: [{ to: "/", icon: "ti-home", label: "Inicio", modulo: "portal" }],
  },
  {
    label: "Mesa de Servicio",
    items: [
      {
        to: "/mesa-de-servicio",
        icon: "ti-device-laptop",
        label: "Mesa de Servicio",
        color: "#10b981",
        modulo: "mesa_servicio",
      },
    ],
  },
  {
    label: "Recursos",
    items: [
      {
        to: "/aplicativos",
        icon: "ti-layout-grid",
        label: "Aplicativos",
        modulo: "portal",
      },
      {
        to: "http://201.151.218.138:3550/fabp/Directorio",
        icon: "ti-address-book",
        label: "Directorio",
        external: true,
        modulo: "portal",
      },
      {
        to: "/cultura-digital",
        icon: "ti-bulb",
        label: "Cultura Digital",
        modulo: "cultura_digital",
      },
      {
        to: "/cedis/facturas",
        icon: "ti-barcode",
        label: "Escaner",
        modulo: "escaner",
      },
    ],
  },
];

export default function Sidebar() {
  const { modulos = [] } = useContext(AuthContext); // ← NUEVO

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
    items: section.items.filter((item) => modulos.includes(item.modulo)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {sidebarMobileOpen && (
        <div className="sb-mobile-overlay" onClick={closeMobile} />
      )}

      <aside className={`sidebar${sidebarMobileOpen ? " sidebar--open" : ""}`}>
        <div className="sb-logo-area">
          <div className="sidebar-logo-mark">
            <img className="logoFabpsa" src={logoFabpsa} alt="FABPSA" />
          </div>
          <div className="sb-logo-text">
            <span className="sb-logo-name">PORTAL CORPORATIVO</span>
            <span className="sb-logo-sub">FABPSA</span>
          </div>
          <button
            className="sb-close-btn"
            onClick={closeMobile}
            aria-label="Cerrar menú"
          >
            <i className="ti ti-x" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {seccionesFiltradas.map(
            (
              section, // ← seccionesFiltradas en lugar de NAV_SECTIONS
            ) => (
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
            ),
          )}
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
