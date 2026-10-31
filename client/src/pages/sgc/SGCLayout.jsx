// pages/sgc/SGCLayout.jsx
// Aplicación SGI: se monta FUERA del layout del portal (sin su sidebar,
// navbar ni pestañas). Del portal usa el AuthContext y el tema (claro/oscuro). Tiene tema
// propio (oscuro por defecto), contadores operativos en la navegación,
// migas y búsqueda global en la barra superior.
// Las páginas reciben por el contexto del Outlet: { rol, login, usuario }.
import { Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Folio, Migas, MigasProvider, Skel, ToastProvider, Vacio, iniciales, useToast } from "./components/ui";
import { SGCEmptyState } from "./components/sgcComponents";
import { sgcApi } from "./sgcApi";
import { apiFetch } from "../../utils/apiFetch";
import { DEMO_DESCRIPCION, DEMO_NOMBRE } from "../../utils/empresaDemo";
import FabiChat from "../../components/sgc/FabiChat";
import Notificaciones from "../../components/sgc/Notificaciones";
import { avisarFase } from "../../components/sgc/sgiEntrada";
import logoFabpsa from "../../assets/sgc/logo-fabpsa-sgi.png";
import "./sgc.css";

const NAV = [
  { to: "/sgc/dashboard", icon: "ti-layout-dashboard", label: "Centro de control" },
  { to: "/sgc/no-conformidades", icon: "ti-alert-circle", label: "No conformidades", cuenta: "ncAbiertas", alerta: "ncVencidas" },
  { to: "/sgc/acciones-correctivas", icon: "ti-circle-check", label: "Acciones correctivas", cuenta: "acAbiertas", alerta: "acVencidas" },
  { to: "/sgc/auditorias", icon: "ti-clipboard-check", label: "Auditorías", cuenta: "auditoriasPendientes" },
  { to: "/sgc/indicadores", icon: "ti-chart-bar", label: "Indicadores" },
  { to: "/sgc/riesgos", icon: "ti-shield-exclamation", label: "Riesgos", alerta: "riesgosAltos" },
];
const NAV_GESTION = [
  { to: "/sgc/ejecutivo", icon: "ti-presentation-analytics", label: "Desempeño del SGI", roles: [1, 4] },
  { to: "/sgc/documentos", icon: "ti-files", label: "Gestión documental" },
  { to: "/sgc/procesos", icon: "ti-hierarchy-3", label: "Mapa de procesos" },
  { to: "/mesa-sgi", icon: "ti-certificate-2", label: "Mesa SGI" },
];
const EQUIPO = { to: "/sgc/equipo", icon: "ti-users", label: "Equipo SGI" };
const MANUAL = { to: "/sgc/manual", icon: "ti-book-2", label: "Ayuda" };
// Ayuda contextual: la sección del centro de ayuda que corresponde al módulo actual
const AYUDA = { dashboard: "dashboard", "no-conformidades": "nc", "acciones-correctivas": "ac", auditorias: "auditorias", indicadores: "indicadores", riesgos: "riesgos", ejecutivo: "ejecutivo", documentos: "documentos", procesos: "procesos", equipo: "equipo" };
const ayudaDe = (pathname) => {
  const s = AYUDA[pathname.split("/")[2]];
  return s ? `${MANUAL.to}?s=${s}` : MANUAL.to;
};

const RUTA_TIPO = { nc: "no-conformidades", ac: "acciones-correctivas", aud: "auditorias", ind: "indicadores", riesgo: "riesgos" };
const GRUPO_TIPO = { nc: "No conformidades", ac: "Acciones correctivas", aud: "Auditorías", ind: "Indicadores", riesgo: "Riesgos" };
const TONO_TIPO = { nc: "danger", ac: "info", aud: "brand", ind: "ok", riesgo: "orange" };

const FUENTE_ID = "sgc-fuente";
function cargarFuente() {
  if (document.getElementById(FUENTE_ID)) return;
  const link = document.createElement("link");
  link.id = FUENTE_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap";
  document.head.appendChild(link);
}


// ── Paleta de comandos (Ctrl+K o /) ──────────────────────────────────────────
// Folios (como siempre) + Registros, Documentos SharePoint, Acciones rápidas,
// Vistas guardadas y Navegación. Los documentos se abren por el proxy del
// backend con el token en el header (apiFetch → Blob), nunca con URLs de SharePoint.
const ACCIONES = [
  { id: "nc", label: "Nueva NC", icono: "ti-alert-circle", to: "/sgc/no-conformidades/nueva", roles: [1, 3] },
  { id: "ac", label: "Nueva AC", icono: "ti-circle-check", to: "/sgc/acciones-correctivas/nueva", roles: [1, 2, 3] },
  { id: "aud", label: "Programar auditoría", icono: "ti-calendar-plus", to: "/sgc/auditorias/nueva", roles: [1, 2] },
  { id: "riesgo", label: "Nuevo riesgo", icono: "ti-shield-plus", to: "/sgc/riesgos?nuevo=1", roles: [1, 2, 3] },
  { id: "fabi", label: "Abrir Fab-i", icono: "ti-sparkles", evento: "sgc:abrirFabi" },
];
const RUTA_LISTA = /^\/sgc\/(no-conformidades|acciones-correctivas|auditorias|indicadores|riesgos)\/?$/;
const VISIBLES_NAVEGADOR = new Set(["pdf", "png", "jpg", "jpeg", "gif", "txt"]);
const _sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Abre (pdf/imagen/txt) o descarga un documento de SharePoint por el proxy autenticado. */
async function abrirDocumento(d) {
  const ver = VISIBLES_NAVEGADOR.has(d.extension);
  // La ventana se abre antes del fetch para que el navegador no la bloquee
  const ventana = ver ? window.open("", "_blank") : null;
  try {
    const res = await apiFetch(ver ? d.url_preview : `/api/sgc/documentos/download/${encodeURIComponent(d.id)}`);
    if (!res.ok) throw new Error("No se pudo abrir el documento.");
    const url = URL.createObjectURL(await res.blob());
    if (ventana) ventana.location.href = url;
    else {
      const a = document.createElement("a");
      a.href = url;
      a.download = d.nombre;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (ventana) ventana.close();
    throw err;
  }
}

function Buscador({ rol }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [extra, setExtra] = useState(null); // { documentos, registros, vistas, documentosError }
  const [buscandoExtra, setBuscandoExtra] = useState(false);
  const [misVistas, setMisVistas] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const caja = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    const atajo = (e) => {
      const escribiendo = /input|textarea|select/i.test(document.activeElement?.tagName || "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !escribiendo)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    window.addEventListener("keydown", atajo);
    document.addEventListener("mousedown", fuera);
    return () => {
      window.removeEventListener("keydown", atajo);
      document.removeEventListener("mousedown", fuera);
    };
  }, []);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setRes(null);
      setExtra(null);
      return undefined;
    }
    let vivo = true;
    setBuscando(true);
    setBuscandoExtra(true);
    // Folios: rápido (como siempre). Paleta (incluye SharePoint): más lenta, va aparte
    const t = setTimeout(() => {
      sgcApi(`/buscar?q=${encodeURIComponent(texto)}`)
        .then((r) => {
          if (!vivo) return;
          setRes(r);
          setActivo(0);
        })
        .catch(() => vivo && setRes([]))
        .finally(() => vivo && setBuscando(false));
    }, 220);
    const t2 = setTimeout(() => {
      sgcApi(`/paleta/buscar?q=${encodeURIComponent(texto)}`)
        .then((r) => vivo && setExtra(r))
        .catch(() => vivo && setExtra({ documentos: [], registros: [], vistas: [], documentosError: "No se pudo buscar." }))
        .finally(() => vivo && setBuscandoExtra(false));
    }, 380);
    return () => {
      vivo = false;
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [q]);

  // Vistas guardadas para la paleta sin texto (se cargan al abrirla por primera vez)
  useEffect(() => {
    if (abierto && misVistas === null) sgcApi("/paleta/vistas").then(setMisVistas).catch(() => setMisVistas([]));
  }, [abierto, misVistas]);

  const cerrar = () => {
    setAbierto(false);
    setQ("");
    input.current?.blur();
  };
  const ir = (to) => {
    navigate(to);
    cerrar();
  };

  const guardarVista = async () => {
    const nombre = window.prompt("Nombre de la vista (con los filtros actuales):");
    if (!nombre?.trim()) return;
    try {
      const v = await sgcApi("/paleta/vistas", { method: "POST", body: { nombre: nombre.trim(), ruta: location.pathname + location.search } });
      setMisVistas((l) => [...(l || []), v]);
      toast.ok(`Vista «${v.nombre}» guardada.`);
    } catch (err) {
      toast.error(err.message);
    }
  };
  const borrarVista = async (v) => {
    try {
      await sgcApi(`/paleta/vistas/${v.id}`, { method: "DELETE" });
      setMisVistas((l) => (l || []).filter((x) => x.id !== v.id));
      setExtra((e) => (e ? { ...e, vistas: e.vistas.filter((x) => x.id !== v.id) } : e));
    } catch (err) {
      toast.error(err.message);
    }
  };
  const verDocumento = async (d) => {
    try {
      await abrirDocumento(d);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ── Secciones → lista plana navegable con el teclado ──
  const texto = q.trim();
  const coincide = (s) => !texto || _sinAcentos(s).includes(_sinAcentos(texto));
  const vistoFolio = new Set((res || []).map((r) => `${r.tipo}${r.id}`));
  const secciones = [];
  if (texto.length >= 2 && res) {
    for (const t of Object.keys(GRUPO_TIPO)) {
      const l = res.filter((r) => r.tipo === t);
      if (l.length) secciones.push({ titulo: GRUPO_TIPO[t], items: l.map((r) => ({ key: `f${r.tipo}${r.id}`, folio: r.folio, tipo: r.tipo, titulo: r.titulo, run: () => ir(`/sgc/${RUTA_TIPO[r.tipo]}/${r.id}`) })) });
    }
  }
  if (extra) {
    const regs = extra.registros.filter((r) => !vistoFolio.has(`${r.tipo}${r.id}`));
    if (regs.length) secciones.push({ titulo: "Registros", items: regs.map((r) => ({ key: `r${r.tipo}${r.id}`, folio: r.folio, tipo: r.tipo, titulo: r.descripcion, sub: r.estado, run: () => ir(`/sgc/${RUTA_TIPO[r.tipo]}/${r.id}`) })) });
    if (extra.documentos.length) {
      secciones.push({
        titulo: "Documentos SharePoint",
        items: extra.documentos.map((d) => ({ key: `d${d.id}`, icono: "ti-file-text", titulo: d.nombre, sub: [d.area, d.vigente === true ? "Vigente" : d.vigente === false ? "No vigente" : null].filter(Boolean).join(" · "), doc: d, run: () => verDocumento(d) })),
      });
    }
  }
  const acciones = ACCIONES.filter((a) => (!a.roles || a.roles.includes(rol)) && coincide(a.label));
  if (RUTA_LISTA.test(location.pathname) && (!texto || coincide("guardar vista"))) {
    acciones.push({ id: "vista", label: "Guardar esta vista", icono: "ti-bookmark-plus", accion: guardarVista });
  }
  if (acciones.length) {
    secciones.push({
      titulo: "Acciones rápidas",
      items: acciones.map((a) => ({
        key: `a${a.id}`, icono: a.icono, titulo: a.label,
        run: () => {
          if (a.accion) return a.accion();
          if (a.evento) {
            window.dispatchEvent(new CustomEvent(a.evento));
            return cerrar();
          }
          return ir(a.to);
        },
      })),
    });
  }
  const vistas = texto.length >= 2 ? extra?.vistas || [] : misVistas || [];
  if (vistas.length) {
    secciones.push({
      titulo: "Vistas guardadas",
      items: vistas.map((v) => ({ key: `v${v.id}`, icono: v.es_global ? "ti-world" : "ti-bookmark", titulo: v.nombre, sub: v.es_global ? "Del equipo" : null, vista: v, run: () => v.filtros?.ruta && ir(v.filtros.ruta) })),
    });
  }
  const nav = [...NAV, ...NAV_GESTION].filter((n) => (!n.roles || n.roles.includes(rol)) && coincide(n.label));
  if (nav.length) secciones.push({ titulo: "Navegación", items: nav.map((n) => ({ key: `n${n.to}`, icono: n.icon, titulo: n.label, run: () => ir(n.to) })) });
  const plano = secciones.flatMap((s) => s.items);
  const sinNada = texto.length >= 2 && res && !buscandoExtra && !plano.length;

  return (
    <div className="sg-buscar" ref={caja}>
      <div className="sg-buscar__campo">
        <i className={`ti ${buscando ? "ti-loader-2 giro" : "ti-search"}`} />
        <input
          ref={input}
          value={q}
          placeholder="Buscar folio, NC, auditoría…"
          aria-label="Búsqueda global"
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, plano.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && plano[activo]) plano[activo].run();
            else if (e.key === "Escape") {
              setAbierto(false);
              input.current?.blur();
            }
          }}
        />
        <kbd>/</kbd>
      </div>
      {abierto && (
        <div className="sg-buscar__panel sg-paleta" role="listbox">
          {sinNada && <div className="sg-buscar__vacio">Sin resultados para «{texto}».</div>}
          {secciones.map((s) => (
            <div key={s.titulo}>
              <div className="sg-buscar__grupo">{s.titulo}</div>
              {s.items.map((it) => {
                const i = plano.indexOf(it);
                return (
                  <div key={it.key} className={`sg-buscar__item sg-paleta__item${i === activo ? " is-activo" : ""}`} role="option" aria-selected={i === activo} onMouseEnter={() => setActivo(i)}>
                    <button type="button" className="sg-paleta__ir" onClick={it.run} tabIndex={-1}>
                      {it.folio ? (
                        it.tipo === "riesgo" ? <span className="folio t-orange">N{it.folio}</span> : <Folio folio={it.folio} tono={TONO_TIPO[it.tipo]} />
                      ) : (
                        <i className={`ti ${it.icono} sg-paleta__icono`} />
                      )}
                      <span className="sg-paleta__txt">
                        <span>{it.titulo}</span>
                        {it.sub && <small>{it.sub}</small>}
                      </span>
                    </button>
                    {it.doc ? (
                      <button type="button" className="btn btn--sm" tabIndex={-1} onClick={it.run} title={VISIBLES_NAVEGADOR.has(it.doc.extension) ? "Visualizar" : "Descargar (no se puede ver en el navegador)"}>
                        <i className={`ti ${VISIBLES_NAVEGADOR.has(it.doc.extension) ? "ti-eye" : "ti-download"}`} /> {VISIBLES_NAVEGADOR.has(it.doc.extension) ? "Visualizar" : "Descargar"}
                      </button>
                    ) : it.vista?.propia || (it.vista?.es_global && rol === 1) ? (
                      <button type="button" className="btn btn--fantasma btn--sm btn--icono" tabIndex={-1} aria-label={`Borrar vista ${it.titulo}`} onClick={() => borrarVista(it.vista)}>
                        <i className="ti ti-trash" />
                      </button>
                    ) : (
                      <i className="ti ti-corner-down-left muted" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {texto.length >= 2 && buscandoExtra && (
            <div className="sg-buscar__vacio"><i className="ti ti-loader-2 giro" /> Buscando en SharePoint…</div>
          )}
          {extra?.documentosError && <div className="sg-buscar__vacio t-danger">{extra.documentosError}</div>}
        </div>
      )}
    </div>
  );
}

const SECCIONES = Object.fromEntries([...NAV, ...NAV_GESTION, EQUIPO, MANUAL].filter((n) => n.to.startsWith("/sgc/")).map((n) => [n.to.split("/")[2], n]));
const MAX_PESTANAS = 8;
const CLAVE_PESTANAS = "sgc_pestanas";

function leerPestanas() {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE_PESTANAS));
    return Array.isArray(v) ? v.filter((t) => SECCIONES[t.id]) : [];
  } catch {
    return [];
  }
}

/** Pestañas por sección del SGC; cada una recuerda su última ruta. */
function Pestanas() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState(leerPestanas);
  const seccion = location.pathname.split("/")[2];
  const actual = SECCIONES[seccion] ? seccion : null;
  const ruta = location.pathname + location.search;

  useEffect(() => {
    if (!actual) return;
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
      navigate(sig ? sig.ruta : "/sgc/dashboard");
    }
  };

  if (!tabs.length) return null;
  return (
    <nav className="sg-tabs" aria-label="Secciones abiertas">
      <div className="sg-tabs__lista" role="tablist">
        {tabs.map((t) => {
          const s = SECCIONES[t.id];
          const on = t.id === actual;
          return (
            <div key={t.id} className={`sg-tab${on ? " is-on" : ""}`}>
              <button type="button" role="tab" aria-selected={on} className="sg-tab__ir" onClick={() => !on && navigate(t.ruta)}>
                <i className={`ti ${s.icon}`} aria-hidden="true" />
                {s.label}
              </button>
              {tabs.length > 1 && (
                <button type="button" className="sg-tab__x" aria-label={`Cerrar ${s.label}`} onClick={(e) => cerrar(e, t)}>
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

const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function FechaWidget() {
  const hoy = new Date();
  const dia = `${DIAS[hoy.getDay()]}, ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
  return (
    <div className="sg-top__fecha">
      <i className="ti ti-calendar" />
      <div>
        <div className="sg-top__fecha-dia">{dia}</div>
      </div>
    </div>
  );
}

/**
 * Se monta junto con la pantalla cuando su código terminó de cargar (mismo
 * Suspense). El centro de control avisa "listo" cuando llegan sus datos; las
 * demás pantallas muestran su propio esqueleto, así que basta con el código.
 */
function PantallaCargada() {
  const { pathname } = useLocation();
  const conDatos = /^\/sgc\/dashboard\/?$/.test(pathname);
  useEffect(() => {
    avisarFase(conDatos ? "datos" : "listo");
    // Solo la primera pantalla de la entrada importa para la transición
    // eslint-disable-next-line
  }, []);
  return null;
}

/** Menú de perfil igual al del portal (mismas clases nb-* de App.css) + Equipo SGI y demo. */
function MenuPerfil({ user, rol, demo, onDemo }) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [sinFoto, setSinFoto] = useState(false);
  const caja = useRef(null);
  const nombre = user?.name || user?.login || "Usuario";
  const partes = nombre.trim().split(/\s+/);
  const corto = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
  const depto = user?.area || user?.role || "Colaborador";

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const foto = (clase) =>
    user?.picture && !sinFoto ? (
      <img src={user.picture} alt="" className={`${clase} ${clase}--img`} onError={() => setSinFoto(true)} />
    ) : (
      <div className={`${clase} ${clase}--initials`}>{iniciales(nombre)}</div>
    );

  return (
    <div className="nb-profile-wrapper sg-perfil" ref={caja}>
      <button className={`nb-profile-trigger ${abierto ? "nb-profile-trigger--open" : ""}`} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="true">
        {foto("nb-avatar")}
        <div className="nb-profile-info">
          <span className="nb-profile-name">{corto}</span>
          <span className="nb-profile-dept">{depto}</span>
        </div>
        <i className="ti ti-chevron-down nb-profile-chevron" aria-hidden="true" />
      </button>
      {abierto && (
        <div className="nb-dropdown" role="menu">
          <div className="nb-dd-header">
            {foto("nb-dd-avatar")}
            <div className="nb-dd-name">{nombre}</div>
            <div className="nb-dd-meta">
              <span className="nb-dd-dept">{depto}</span>
            </div>
          </div>
          <div className="nb-dd-menu">
            {rol === 1 && !demo && (
              <button className="nb-dd-item" role="menuitem" onClick={() => { setAbierto(false); navigate(EQUIPO.to); }}>
                <i className={`ti ${EQUIPO.icon} nb-dd-item-icon`} aria-hidden="true" />
                <span>{EQUIPO.label}</span>
              </button>
            )}
            <button className="nb-dd-item" role="menuitem" onClick={() => { setAbierto(false); onDemo(!demo); }}>
              <i className={`ti ${demo ? "ti-logout" : "ti-car"} nb-dd-item-icon`} aria-hidden="true" />
              <span>{demo ? "Salir del demo" : "Ver demo automotriz"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SGCLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, empresaDemo, switchEmpresaDemo, salirEmpresaDemo } = useContext(AuthContext);
  // Entrar o salir del demo: recarga en el centro de control para que ninguna
  // pantalla conserve datos en memoria de la otra empresa
  const cambiarDemo = (activar) => {
    if (activar) switchEmpresaDemo();
    else salirEmpresaDemo();
    window.location.assign(`${window.location.pathname.split("/sgc/")[0]}/sgc/dashboard`);
  };
  const [rol, setRol] = useState(undefined); // undefined = cargando, null = sin rol
  const [error, setError] = useState(null);
  const [menu, setMenu] = useState(false);
  // El SGI respeta el tema elegido en el portal (claro / oscuro)
  const { theme } = useTheme() || {};
  const tema = theme === "dark" ? "oscuro" : "claro";
  const [migas, setMigas] = useState([]);
  const [cuentas, setCuentas] = useState(null);

  const cargarRol = useCallback(async () => {
    try {
      setError(null);
      avisarFase("acceso");
      const r = await sgcApi("/mi-rol");
      setRol(r ? r.idRol : null);
      // Con rol: se carga la pantalla; sin rol, la transición se retira para mostrar el aviso
      avisarFase(r ? "modulo" : "listo");
    } catch (err) {
      setError(err);
      avisarFase("listo");
    }
  }, []);

  // Al navegar se refrescan a lo más cada 30 s; un cambio guardado ("sgc:cambio") los refresca siempre
  const ultimaCuenta = useRef(0);
  const cargarCuentas = useCallback((forzar = true) => {
    if (forzar !== true && Date.now() - ultimaCuenta.current < 30000) return;
    ultimaCuenta.current = Date.now();
    sgcApi("/contadores").then(setCuentas).catch(() => {});
  }, []);

  useEffect(() => {
    cargarFuente();
    const previo = document.title;
    document.title = "SGI · Sistemas de Gestión Integral";
    return () => {
      document.title = previo;
    };
  }, []);

  useEffect(() => {
    cargarRol();
  }, [cargarRol, user?.login]);

  // Contadores: al cambiar de sección y cuando una página avisa un cambio
  useEffect(() => {
    if (!rol) return undefined;
    const alCambiar = () => cargarCuentas(true);
    window.addEventListener("sgc:cambio", alCambiar);
    return () => window.removeEventListener("sgc:cambio", alCambiar);
  }, [rol, cargarCuentas]);
  useEffect(() => {
    if (rol) cargarCuentas(false);
    setMenu(false);
  }, [location.pathname, rol, cargarCuentas]);


  return (
    <div className={`sgc-app${menu ? " is-menu" : ""}`} data-tema={tema}>
      <ToastProvider>
        <div className="sg-side-fondo" onClick={() => setMenu(false)} />

        <aside className="sg-side" aria-label="Navegación del SGI">
          <button type="button" className="sg-side__portal" onClick={() => navigate("/")}>
            <i className="ti ti-arrow-left" /> Portal
          </button>

          <div className="sg-marca">
            <span className="sg-marca__sello sg-marca__sello--logo">
              <img src={logoFabpsa} alt="FABPSA" width="480" height="451" />
            </span>
            <div>
              <strong><span className="sg-marca__nombre">SGI</span></strong>
              <span className="sg-marca__sub">Sistemas de Gestión Integral</span>
              <span className="sg-marca__tag">Calidad · Control · Mejora</span>
            </div>
          </div>

          <div className="sg-nav__grupo">Operación</div>
          <nav className="sg-nav">
            {NAV.map((n) => {
              const c = cuentas && n.cuenta ? cuentas[n.cuenta] : null;
              const a = cuentas && n.alerta ? cuentas[n.alerta] : 0;
              return (
                <NavLink key={n.to} to={n.to} className="sg-nav__item">
                  <i className={`ti ${n.icon}`} />
                  <span className="sg-nav__label">{n.label}</span>
                  {a > 0 ? (
                    <span className="sg-nav__cuenta sg-nav__cuenta--alerta">
                      {a}
                    </span>
                  ) : c > 0 ? (
                    <span className="sg-nav__cuenta">{c}</span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="sg-nav__grupo">Gestión</div>
          <nav className="sg-nav">
            {NAV_GESTION.filter((n) => !n.roles || n.roles.includes(rol)).map((n) => (
              <NavLink key={n.to} to={n.to} className="sg-nav__item">
                <i className={`ti ${n.icon}`} />
                <span className="sg-nav__label">{n.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sg-side__slogan">
            <span className="sg-side__marca-agua" style={{ "--logo": `url(${logoFabpsa})` }} aria-hidden="true" />
            <svg className="sg-side__olas" viewBox="0 0 220 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="none">
              <path d="M-10 60 Q 40 30 90 55 T 200 45 T 300 55" stroke="rgba(109,40,217,0.35)" strokeWidth="2" fill="none"/>
              <path d="M-10 72 Q 50 45 100 68 T 210 58 T 310 68" stroke="rgba(139,92,246,0.25)" strokeWidth="1.5" fill="none"/>
              <path d="M-10 82 Q 60 58 110 78 T 220 70 T 320 78" stroke="rgba(167,139,250,0.18)" strokeWidth="1.5" fill="none"/>
            </svg>
            <span className="sg-side__slogan-eyebrow">Nuestro compromiso</span>
            <p>Calidad que impulsa <strong>resultados</strong></p>
            <hr className="sg-side__slogan-linea" />          </div>

        </aside>

        <div className="sg-main">
          <header className="sg-top">
            <button className="btn btn--fantasma btn--icono sg-top__menu" onClick={() => setMenu(true)} aria-label="Abrir menú">
              <i className="ti ti-menu-2" />
            </button>
            {location.pathname.split("/").filter(Boolean).length > 2 ? <Migas migas={migas} /> : <span className="sg-top__hueco" />}
            {rol ? <Buscador rol={rol} /> : null}
            <div className="sg-top__derecha">
              {!empresaDemo && <Notificaciones conRol={!!rol} />}
              <button className="btn sg-top__ayuda" title="Ayuda de este módulo" aria-label="Abrir la ayuda de este módulo" onClick={() => navigate(ayudaDe(location.pathname))}>
                <i className="ti ti-help-circle" />
                <span>Ayuda</span>
              </button>
              <FechaWidget />
              <MenuPerfil user={user} rol={rol} demo={empresaDemo} onDemo={cambiarDemo} />
            </div>
          </header>
          {empresaDemo && (
            <div className="sg-demo" role="status">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              <span>
                <b>Modo demo — {DEMO_NOMBRE}</b> ({DEMO_DESCRIPCION}). Datos ficticios de demostración; solo lectura.
              </span>
              <button type="button" className="sg-demo__salir" onClick={() => cambiarDemo(false)}>
                <i className="ti ti-logout" /> Salir del demo
              </button>
            </div>
          )}
          {rol ? <Pestanas /> : null}

          <MigasProvider value={setMigas}>
            {error ? (
              <div className="sg-page">
                <div className="pnl">
                  <Vacio
                    tipo="error"
                    icono="ti-cloud-off"
                    titulo="No pudimos verificar tu acceso"
                    texto={error.message}
                    accion={
                      <button className="btn" onClick={cargarRol}>
                        <i className="ti ti-refresh" /> Reintentar
                      </button>
                    }
                  />
                </div>
              </div>
            ) : rol === undefined ? (
              <div className="sg-page">
                <div className="pnl">
                  <Skel filas={8} />
                </div>
              </div>
            ) : rol === null ? (
              <div className="sg-page">
                <div className="pnl">
                  <SGCEmptyState
                    icono="ti-shield-lock"
                    titulo="Aún no tienes un rol en Sistemas de Gestión"
                    desc="Para usar el SGI, el Coordinador SGI debe asignarte un rol: Coordinador, Auditor, Responsable de área o Dirección."
                    accion={
                      <button className="btn" onClick={() => navigate("/")}>
                        <i className="ti ti-arrow-left" /> Volver al portal
                      </button>
                    }
                  />
                </div>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="sg-page">
                    <div className="pnl">
                      <Skel filas={8} />
                    </div>
                  </div>
                }
              >
                <Outlet context={{ rol, login: user?.login, usuario: user }} />
                <PantallaCargada />
              </Suspense>
            )}
          </MigasProvider>
        </div>
        {rol ? <FabiChat /> : null}
      </ToastProvider>
    </div>
  );
}
