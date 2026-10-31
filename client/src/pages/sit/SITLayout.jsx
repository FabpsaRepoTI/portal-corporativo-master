// pages/sit/SITLayout.jsx
// Sistema de Información Técnica como aplicación propia dentro del portal (igual
// que el SGC): barra lateral, barra superior y pestañas por sección. Se monta
// FUERA del layout del portal; del portal solo usa el AuthContext y el tema.
// Las páginas siguen siendo las mismas (cada una con su <main className="sit-root sit-nube">).
// Fabi · Información Técnica acompaña todas las secciones.
import { Suspense, useContext, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import SitAsistente from "./components/SitAsistente";
import { sitApi } from "./sitApi";
import "./SITLayout.css";

// Secciones: id = segundo segmento de la ruta ("" = tablero)
const NAV = [
  { id: "", to: "/sit?general=1", icon: "ti-layout-dashboard", label: "Tablero de vigencia" },
  { id: "articulos", to: "/sit/articulos", icon: "ti-list-search", label: "Artículos" },
];
const NAV_ADMIN = [
  { id: "dashboard", to: "/sit/dashboard", icon: "ti-chart-dots-3", label: "Indicadores documentales" },
  { id: "control", to: "/sit/control", icon: "ti-shield-lock", label: "Centro de control" },
];
const SECCIONES = Object.fromEntries([...NAV, ...NAV_ADMIN].map((n) => [n.id, n]));
const seccionDe = (pathname) => pathname.split("/")[2] || "";

const MAX_PESTANAS = 6;
const CLAVE_PESTANAS = "sit_pestanas";
function leerPestanas() {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE_PESTANAS));
    return Array.isArray(v) ? v.filter((t) => SECCIONES[t.id]) : [];
  } catch {
    return [];
  }
}

/** Pestañas por sección del SIT; cada una recuerda su última ruta (incluido el artículo abierto). */
function Pestanas() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState(leerPestanas);
  const actual = seccionDe(location.pathname);
  const ruta = location.pathname + location.search;

  useEffect(() => {
    if (!SECCIONES[actual]) return;
    setTabs((prev) => {
      const existe = prev.find((t) => t.id === actual);
      if (existe) return existe.ruta === ruta ? prev : prev.map((t) => (t.id === actual ? { ...t, ruta } : t));
      const base = prev.length >= MAX_PESTANAS ? prev.slice(1) : prev;
      return [...base, { id: actual, ruta }];
    });
  }, [actual, ruta]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_PESTANAS, JSON.stringify(tabs));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [tabs]);

  const cerrar = (e, t) => {
    e.stopPropagation();
    const i = tabs.findIndex((x) => x.id === t.id);
    const resto = tabs.filter((x) => x.id !== t.id);
    setTabs(resto);
    if (t.id === actual) {
      const sig = resto[Math.min(i, resto.length - 1)];
      navigate(sig ? sig.ruta : NAV[0].to);
    }
  };

  if (!tabs.length) return null;
  return (
    <nav className="st-tabs" aria-label="Secciones abiertas">
      <div className="st-tabs__lista" role="tablist">
        {tabs.map((t) => {
          const s = SECCIONES[t.id];
          const on = t.id === actual;
          // Dentro de Artículos, la pestaña muestra el artículo abierto
          const detalle = t.id === "articulos" && t.ruta.split("?")[0].split("/")[3];
          return (
            <div key={t.id || "tablero"} className={`st-tab${on ? " is-on" : ""}`}>
              <button type="button" role="tab" aria-selected={on} className="st-tab__ir" onClick={() => !on && navigate(t.ruta)}>
                <i className={`ti ${s.icon}`} aria-hidden="true" />
                {s.label}
                {detalle && <span className="st-tab__sub">· {decodeURIComponent(detalle)}</span>}
              </button>
              {tabs.length > 1 && (
                <button type="button" className="st-tab__x" aria-label={`Cerrar ${s.label}`} onClick={(e) => cerrar(e, t)}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** Foto, nombre y área del usuario (igual que en el portal). */
function Perfil({ user }) {
  const [sinFoto, setSinFoto] = useState(false);
  const nombre = user?.name || user?.login || "Usuario";
  const partes = nombre.trim().split(/\s+/);
  const corto = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
  const iniciales = partes.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <div className="st-perfil" title={nombre}>
      {user?.picture && !sinFoto ? (
        <img src={user.picture} alt="" className="st-perfil__foto" onError={() => setSinFoto(true)} />
      ) : (
        <span className="st-perfil__foto st-perfil__foto--ini">{iniciales}</span>
      )}
      <span className="st-perfil__txt">
        <b>{corto}</b>
        <small>{user?.area || "Colaborador"}</small>
      </span>
    </div>
  );
}

export default function SITLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [menu, setMenu] = useState(false);
  const [permisos, setPermisos] = useState(null);
  const principal = useRef(null);

  useEffect(() => {
    const previo = document.title;
    document.title = "Información Técnica";
    return () => {
      document.title = previo;
    };
  }, []);

  // Permisos del usuario en el SIT: definen si ve la sección de administración
  useEffect(() => {
    sitApi("/mis-permisos").then(setPermisos).catch(() => setPermisos({}));
  }, [user?.login]);

  // Al cambiar de sección: cierra el menú móvil y regresa arriba
  useEffect(() => {
    setMenu(false);
    principal.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  const admin = !!permisos?.esAdministradoraDocumental;
  const enlace = (n) => (
    <NavLink
      key={n.id || "tablero"}
      to={n.to}
      end={n.id === ""}
      className={({ isActive }) => `st-nav__item${isActive ? " active" : ""}`}
    >
      <i className={`ti ${n.icon}`} />
      <span>{n.label}</span>
    </NavLink>
  );

  return (
    <div className={`sit-app${menu ? " is-menu" : ""}`}>
      <div className="st-side-fondo" onClick={() => setMenu(false)} />

      <aside className="st-side" aria-label="Navegación de Información Técnica">
        <button type="button" className="st-side__portal" onClick={() => navigate("/")}>
          <i className="ti ti-arrow-left" /> Portal
        </button>

        <div className="st-marca">
          <span className="st-marca__sello" aria-hidden="true"><i className="ti ti-file-certificate" /></span>
          <div>
            <strong>SIT</strong>
            <span className="st-marca__sub">Información Técnica</span>
            <span className="st-marca__tag">Compras · Documentación</span>
          </div>
        </div>

        <div className="st-nav__grupo">Consulta</div>
        <nav className="st-nav">{NAV.map(enlace)}</nav>

        {admin && (
          <>
            <div className="st-nav__grupo">Administración documental</div>
            <nav className="st-nav">{NAV_ADMIN.map(enlace)}</nav>
          </>
        )}

        <div className="st-side__pie">
          <i className="ti ti-info-circle" />
          <p>Fichas técnicas, certificados y documentos de proveedores, con su vigencia.</p>
        </div>
      </aside>

      <div className="st-main" ref={principal}>
        <header className="st-top">
          <button className="st-top__menu" onClick={() => setMenu(true)} aria-label="Abrir menú">
            <i className="ti ti-menu-2" />
          </button>
          <span className="st-top__titulo">
            <i className="ti ti-file-certificate" /> Sistema de Información Técnica
          </span>
          <div className="st-top__derecha">
            <Perfil user={user} />
          </div>
        </header>
        <Pestanas />

        <Suspense fallback={<div className="st-cargando"><i className="ti ti-loader-2 st-giro" /> Cargando…</div>}>
          <Outlet />
        </Suspense>
      </div>

      <SitAsistente />
    </div>
  );
}
