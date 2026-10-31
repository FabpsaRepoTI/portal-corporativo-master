// pages/sgc/components/ui.jsx
// Componentes del sistema de diseño del SGI ("Registro técnico").
// No reutiliza componentes visuales del portal: todo usa sgc.css.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import heroDashboard from "../../../assets/sgc/hero-dashboard.svg";
import heroNC from "../../../assets/sgc/hero-nc.svg";
import heroAC from "../../../assets/sgc/hero-ac.svg";
import heroAuditorias from "../../../assets/sgc/hero-auditorias.svg";
import heroIndicadores from "../../../assets/sgc/hero-indicadores.svg";
import heroRiesgos from "../../../assets/sgc/hero-riesgos.svg";
import heroEjecutivo from "../../../assets/sgc/hero-ejecutivo.svg";
import heroDocumentos from "../../../assets/sgc/hero-documentos.svg";
import heroProcesos from "../../../assets/sgc/hero-procesos.svg";
import heroEquipo from "../../../assets/sgc/hero-equipo.svg";
import heroMesa from "../../../assets/sgc/hero-mesa.svg";
import { NC_ESTATUS, AC_ESTATUS, PLAN_ESTATUS, AUD_ESTATUS, NC_FLUJO, AC_FLUJO, usuarios as cargarUsuarios, fechaCorta } from "../sgcApi";

const MAPAS = { nc: NC_ESTATUS, ac: AC_ESTATUS, plan: PLAN_ESTATUS, aud: AUD_ESTATUS };
const FLUJOS = { nc: NC_FLUJO, ac: AC_FLUJO };

// ── Identidad de registro ────────────────────────────────────
/** Folio con el prefijo resaltado: NC-2026-0007 → [NC]-2026-0007 */
export function Folio({ folio, tono = "brand", grande = false }) {
  if (!folio) return null;
  const i = String(folio).indexOf("-");
  return (
    <span className={`folio t-${tono}${grande ? " folio--lg" : ""}`}>
      {i > 0 ? (
        <>
          <b>{folio.slice(0, i)}</b>
          {folio.slice(i)}
        </>
      ) : (
        folio
      )}
    </span>
  );
}

export function Estatus({ tipo, id }) {
  const e = MAPAS[tipo]?.[id] || { label: "—", tono: "neutral" };
  return <span className={`est t-${e.tono}`}>{e.label}</span>;
}

/** Riel del ciclo de vida: un segmento por etapa, relleno hasta la actual. */
export function Riel({ tipo, id, sinTexto = false }) {
  const flujo = FLUJOS[tipo];
  const e = MAPAS[tipo]?.[id] || { label: "—", tono: "neutral" };
  const cancelada = !flujo.includes(id);
  const pos = flujo.indexOf(id);
  return (
    <span className={`riel t-${e.tono}${cancelada ? " riel--cancelada" : ""}`} title={`${e.label}${cancelada ? "" : ` · etapa ${pos + 1} de ${flujo.length}`}`}>
      <span className="riel__pistas" aria-hidden="true">
        {flujo.map((paso, i) => (
          <span key={paso} className={!cancelada && i <= pos ? "on" : ""} />
        ))}
      </span>
      {!sinTexto && <span className="riel__txt">{e.label}</span>}
    </span>
  );
}

/** Vencimiento como cuenta regresiva: "−5 d" rojo, "hoy"/"< 3 d" naranja. */
export function Vence({ fecha, dias, cerrada = false, linea = false, sinFecha = false }) {
  if (!fecha) return <span className="muted">—</span>;
  let tono = "neutral";
  let cuenta = null;
  if (!cerrada && dias != null) {
    if (dias < 0) {
      tono = "danger";
      cuenta = `−${Math.abs(dias)} d`;
    } else if (dias === 0) {
      tono = "orange";
      cuenta = "hoy";
    } else {
      tono = dias < 3 ? "orange" : "neutral";
      cuenta = `${dias} d`;
    }
  }
  const titulo = cerrada
    ? undefined
    : dias < 0
      ? `Vencida hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`
      : dias === 0
        ? "Vence hoy"
        : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`;
  return (
    <span className={`vence${linea ? " vence--linea" : ""}`} title={titulo}>
      {cuenta ? <span className={`vence__cuenta t-${tono}`}>{cuenta}</span> : <span className="vence__cuenta t-ok">✓</span>}
      {!sinFecha && <span className="vence__fecha">{fechaCorta(fecha, false)}</span>}
    </span>
  );
}

/** Barra que se anima desde 0. */
export function Barra({ valor = 0, tono }) {
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAncho(Math.max(0, Math.min(100, valor))));
    return () => cancelAnimationFrame(id);
  }, [valor]);
  return (
    <div className={`barra${tono ? ` t-${tono}` : ""}`}>
      <span style={{ width: `${ancho}%` }} />
    </div>
  );
}

export function Avance({ valor = 0, grande = false }) {
  const tono = valor >= 100 ? "ok" : undefined;
  return (
    <div className={`avance${grande ? " avance--lg" : ""}`} role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100}>
      <Barra valor={valor} tono={tono} />
      <small>{Math.round(valor)}%</small>
    </div>
  );
}

/**
 * Franja de distribución por estatus que también filtra.
 * items: [{ id, label, total, vencidas?, tono }]; sel: id | [ids] | null
 */
export function Distribucion({ items, sel, onSel, etiquetaTodos = "Todas" }) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const esSel = (id) => (Array.isArray(sel) ? sel.includes(id) : sel === id);
  const unico = sel != null && !Array.isArray(sel);
  return (
    <div className="dist">
      <div className={`dist__barra${sel != null ? " has-sel" : ""}`} aria-hidden="true">
        {items
          .filter((i) => i.total)
          .map((i) => (
            <span key={i.id} className={`t-${i.tono}${esSel(i.id) ? " is-sel" : ""}`} style={{ flexGrow: i.total }} title={`${i.label}: ${i.total}`} />
          ))}
      </div>
      <div className="dist__leyenda" role="group" aria-label="Filtrar por estatus">
        <button type="button" className={`dist__op t-neutral${sel == null ? " is-sel" : ""}`} onClick={() => onSel(null)}>
          {etiquetaTodos} <b>{total}</b>
        </button>
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            className={`dist__op t-${i.tono}${esSel(i.id) ? " is-sel" : ""}`}
            disabled={!i.total && !esSel(i.id)}
            aria-pressed={esSel(i.id)}
            onClick={() => onSel(unico && sel === i.id ? null : i.id)}
          >
            {i.label} <b>{i.total}</b>
            {i.vencidas > 0 && <small title="Vencidas">{i.vencidas} venc.</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Sparkline SVG con línea de meta. serie: [{ valor }] */
export function Spark({ serie = [], meta, tono = "brand" }) {
  if (serie.length < 2) {
    return <div className="spark__vacio">{serie.length ? "1 medición · sin tendencia aún" : "Sin mediciones"}</div>;
  }
  const valores = serie.map((s) => s.valor);
  const todos = meta != null ? [...valores, meta] : valores;
  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const rango = max - min || 1;
  const W = 100;
  const H = 40;
  const x = (i) => (i / (serie.length - 1)) * W;
  const y = (v) => H - 4 - ((v - min) / rango) * (H - 8);
  const puntos = valores.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg className={`spark t-${tono}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Tendencia de las últimas mediciones">
      <polygon className="spark__area" points={`0,${H} ${puntos} ${W},${H}`} />
      {meta != null && <line className="spark__meta" x1="0" x2={W} y1={y(meta)} y2={y(meta)} />}
      <polyline className="spark__linea" points={puntos} />
    </svg>
  );
}

/**
 * Lee tokens del tema actual del SGI (recharts no acepta var() en atributos
 * SVG). Se actualiza al cambiar data-tema.
 */
export function useTokens(nombres) {
  const leer = () => {
    const el = document.querySelector(".sgc-app") || document.documentElement;
    const css = getComputedStyle(el);
    return Object.fromEntries(nombres.map((n) => [n, css.getPropertyValue(n).trim()]));
  };
  const [tokens, setTokens] = useState(leer);
  useEffect(() => {
    const el = document.querySelector(".sgc-app");
    const obs = new MutationObserver(() => setTokens(leer()));
    if (el) obs.observe(el, { attributes: true, attributeFilter: ["data-tema"] });
    setTokens(leer());
    return () => obs.disconnect();
    // eslint-disable-next-line
  }, []);
  return tokens;
}

// ── Personas ─────────────────────────────────────────────────
export function iniciales(nombre) {
  return String(nombre || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
export function Avatar({ nombre, foto, chico = false }) {
  return <span className={`av${chico ? " av--sm" : ""}`}>{foto ? <img src={foto} alt="" /> : iniciales(nombre)}</span>;
}
export function Persona({ nombre, login }) {
  if (!nombre && !login) return <span className="muted">—</span>;
  return (
    <span className="persona" title={login}>
      <Avatar nombre={nombre || login} chico />
      <span>{nombre || login}</span>
    </span>
  );
}

// ── Estructura ───────────────────────────────────────────────
// Sección de la ruta → [nombre, grupo, ilustración]. El grupo va en la etiqueta
// para no repetir el título.
const HEROES = {
  dashboard: ["Centro de control", "SGC · Operación", heroDashboard],
  "no-conformidades": ["No conformidades", "SGC · Operación", heroNC],
  "acciones-correctivas": ["Acciones correctivas", "SGC · Operación", heroAC],
  auditorias: ["Auditorías", "SGC · Operación", heroAuditorias],
  indicadores: ["Indicadores", "SGC · Operación", heroIndicadores],
  riesgos: ["Riesgos", "SGC · Operación", heroRiesgos],
  ejecutivo: ["Desempeño del SGI", "SGC · Gestión", heroEjecutivo],
  documentos: ["Gestión documental", "SGC · Gestión", heroDocumentos],
  procesos: ["Mapa de procesos", "SGC · Gestión", heroProcesos],
  equipo: ["Equipo SGI", "SGC · Administración", heroEquipo],
  "mesa-sgi": ["Mesa SGI", "SGC · Mesa de servicio", heroMesa],
  manual: ["Manual del SGC", "SGC · Ayuda", heroDocumentos],
};

/** Título con la última palabra en degradado. */
function TituloResalte({ texto, children }) {
  const palabras = String(texto ?? "").trim().split(/\s+/);
  const resalte = palabras.pop();
  return (
    <>
      {palabras.length > 0 && <span>{palabras.join(" ")}</span>}
      <em>{resalte}</em>
      {children}
    </>
  );
}

/** Botón "Volver a …" de una subvista: regresa a la página principal de su módulo. */
export function Volver() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const partes = pathname.split("/").filter(Boolean);
  const seccion = partes[0] === "sgc" ? partes[1] : partes[0];
  const destino = partes[0] === "sgc" ? `/sgc/${seccion}` : `/${seccion}`;
  const nombre = (HEROES[seccion] || ["inicio"])[0];
  return (
    <button type="button" className="sg-volver" onClick={() => navigate(destino)}>
      <i className="ti ti-arrow-left" /> Volver a {nombre.toLowerCase()}
    </button>
  );
}
/** Título de subvista (detalle): misma tipografía que el encabezado, más pequeño. */
export function TituloSub({ texto }) {
  return (
    <h1 className="sg-sub__titulo">
      <TituloResalte texto={texto} />
    </h1>
  );
}

/**
 * Encabezado estándar del portal (como Vigilancia): volver, etiqueta, título
 * con resalte e ilustración. En subvistas (formularios) se muestra compacto.
 */
export function Encabezado({ titulo, cuenta, acciones }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const partes = pathname.split("/").filter(Boolean);
  const enSgc = partes[0] === "sgc";
  const seccion = enSgc ? partes[1] : partes[0];
  const [nombre, grupo, arte] = HEROES[seccion] || ["Inicio", "Sistemas de gestión", heroDashboard];
  const sub = partes.length > (enSgc ? 2 : 1) && seccion !== "mesa-sgi";
  const enInicio = !sub && (seccion === "dashboard" || seccion === "mesa-sgi");
  const volver = sub ? `/${partes.slice(0, enSgc ? 2 : 1).join("/")}` : enInicio ? "/" : "/sgc/dashboard";
  const textoVolver = sub ? `Volver a ${nombre.toLowerCase()}` : enInicio ? "Volver al portal" : "Volver al inicio";
  return (
    <header className={`sg-hero${sub ? " sg-hero--sub" : ""}`}>
      <div className="sg-hero__txt">
        <button type="button" className="sg-hero__volver" onClick={() => navigate(volver)}>
          <i className="ti ti-arrow-left" /> {textoVolver}
        </button>
        {!sub && <span className="sg-hero__eyebrow">{grupo}</span>}
        <h1 className="sg-hero__titulo">
          <TituloResalte texto={titulo}>{cuenta != null && <span className="sg-hero__cuenta">{cuenta}</span>}</TituloResalte>
        </h1>
      </div>
      <img className="sg-hero__arte" src={arte} alt="" aria-hidden="true" />
      {acciones && <div className="sg-hero__acciones">{acciones}</div>}
    </header>
  );
}

export function Panel({ titulo, sub, cuenta, acciones, children, flush = false, className = "", id }) {
  return (
    <section className={`pnl ${className}`} id={id}>
      {titulo && (
        <header className="pnl__head">
          <h2>{titulo}</h2>
          {cuenta != null && <span className="cuenta-pill">{cuenta}</span>}
          {sub && <small>{sub}</small>}
          {acciones && <div className="pnl__acciones">{acciones}</div>}
        </header>
      )}
      {flush ? children : <div className="pnl__body">{children}</div>}
    </section>
  );
}

export function Dato({ label, children }) {
  return (
    <div className="dato">
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">—</span>}</dd>
    </div>
  );
}

export function Campo({ etq, opcional, ayuda, error, children, className = "" }) {
  return (
    <label className={`campo ${className}`}>
      {etq && (
        <span className="campo__etq">
          {etq} {opcional && <em>opcional</em>}
        </span>
      )}
      {children}
      {error ? (
        <span className="campo__error" role="alert">
          <i className="ti ti-alert-circle" /> {error}
        </span>
      ) : ayuda ? (
        <span className="campo__ayuda">{ayuda}</span>
      ) : null}
    </label>
  );
}

export function Vacio({ icono = "ti-inbox", titulo, texto, accion, tipo, compacto = false }) {
  return (
    <div className={`vacio${tipo ? ` vacio--${tipo}` : ""}${compacto ? " vacio--compacto" : ""}`}>
      <span className="vacio__icono">
        <i className={`ti ${icono}`} />
      </span>
      <h3>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {accion}
    </div>
  );
}

export function ErrorCarga({ error, onReintentar }) {
  const sinAcceso = error?.status === 403;
  const noExiste = error?.status === 404;
  return (
    <Vacio
      tipo="error"
      icono={sinAcceso ? "ti-lock" : noExiste ? "ti-file-unknown" : "ti-cloud-off"}
      titulo={sinAcceso ? "Sin acceso" : noExiste ? "Registro no encontrado" : "No pudimos cargar la información"}
      texto={error?.message}
      accion={
        !sinAcceso && !noExiste && onReintentar ? (
          <button className="btn" onClick={onReintentar}>
            <i className="ti ti-refresh" /> Reintentar
          </button>
        ) : null
      }
    />
  );
}

export function Skel({ filas = 6 }) {
  return (
    <div className="skel" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function Paginador({ page, limit, total, onPage }) {
  if (!total || total <= limit) return null;
  const paginas = Math.ceil(total / limit);
  return (
    <div className="paginador">
      <span className="num">
        {(page - 1) * limit + 1}–{Math.min(total, page * limit)} de {total.toLocaleString("es-MX")}
      </span>
      <div>
        <button className="btn btn--sm btn--icono" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <i className="ti ti-chevron-left" />
        </button>
        <span className="num">
          {page} / {paginas}
        </span>
        <button className="btn btn--sm btn--icono" disabled={page >= paginas} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          <i className="ti ti-chevron-right" />
        </button>
      </div>
    </div>
  );
}

// ── Migas en la barra superior ───────────────────────────────
const MigasCtx = createContext(() => {});
export const MigasProvider = MigasCtx.Provider;
/** useMigas([{ to, label }, { label }]) — las muestra la barra superior del SGI. */
export function useMigas(migas) {
  const set = useContext(MigasCtx);
  const clave = JSON.stringify(migas);
  useEffect(() => {
    set(JSON.parse(clave));
  }, [clave, set]);
}
export function Migas({ migas }) {
  return (
    <nav className="sg-migas" aria-label="Ruta">
      {migas.map((m, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <i className="ti ti-chevron-right" />}
          {m.to ? <Link to={m.to}>{m.label}</Link> : <span>{m.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// ── Modal ────────────────────────────────────────────────────
export function Modal({ titulo, onClose, children, pie, ancho = false, bloqueado = false }) {
  const caja = useRef(null);
  useEffect(() => {
    const alTeclear = (e) => e.key === "Escape" && !bloqueado && onClose();
    window.addEventListener("keydown", alTeclear);
    const previo = document.activeElement;
    const primero = caja.current?.querySelector("input, select, textarea, button:not([aria-label='Cerrar'])");
    primero?.focus();
    return () => {
      window.removeEventListener("keydown", alTeclear);
      previo?.focus?.();
    };
    // eslint-disable-next-line
  }, []);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && !bloqueado && onClose()}>
      <div ref={caja} className={`modal${ancho ? " modal--ancho" : ""}`} role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <header className="modal__head">
          <h2>{titulo}</h2>
          <button className="btn btn--fantasma btn--icono" onClick={onClose} disabled={bloqueado} aria-label="Cerrar">
            <i className="ti ti-x" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {pie && <footer className="modal__pie">{pie}</footer>}
      </div>
    </div>
  );
}

export function Confirmar({ titulo, mensaje, textoConfirmar = "Confirmar", peligro = true, onConfirmar, onCancelar, ocupado = false }) {
  return (
    <Modal
      titulo={titulo}
      onClose={onCancelar}
      bloqueado={ocupado}
      pie={
        <>
          <button className="btn" onClick={onCancelar} disabled={ocupado}>
            Volver
          </button>
          <button className={`btn ${peligro ? "btn--peligro btn--solido" : "btn--primario"}`} onClick={onConfirmar} disabled={ocupado}>
            {ocupado && <i className="ti ti-loader-2 giro" />} {textoConfirmar}
          </button>
        </>
      }
    >
      <div className="texto">{mensaje}</div>
    </Modal>
  );
}

/** Botón de guardar con estado de ejecución. */
export function BotonGuardar({ ocupado, children, icono = "ti-check", className = "btn btn--primario", disabled, ...props }) {
  return (
    <button className={className} {...props} disabled={ocupado || disabled}>
      <i className={`ti ${ocupado ? "ti-loader-2 giro" : icono}`} /> {children}
    </button>
  );
}

// ── Toasts ───────────────────────────────────────────────────
const ToastCtx = createContext({ ok() {}, error() {}, aviso() {} });
const TOAST = { ok: ["ti-circle-check", "t-ok"], error: ["ti-alert-circle", "t-danger"], aviso: ["ti-alert-triangle", "t-warn"] };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const quitar = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const mostrar = useCallback(
    (msg, tipo) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, msg, tipo }]);
      setTimeout(() => quitar(id), tipo === "error" ? 6500 : 4500);
    },
    [quitar],
  );
  const api = useMemo(() => ({ ok: (m) => mostrar(m, "ok"), error: (m) => mostrar(m, "error"), aviso: (m) => mostrar(m, "aviso") }), [mostrar]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role={t.tipo === "error" ? "alert" : "status"}>
            <i className={`ti ${TOAST[t.tipo][0]} ${TOAST[t.tipo][1]}`} />
            <span>{t.msg}</span>
            <button onClick={() => quitar(t.id)} aria-label="Cerrar aviso">
              <i className="ti ti-x" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ── Selector de usuario con búsqueda ─────────────────────────
let _usuariosMemo = null;
export function useUsuarios() {
  const [lista, setLista] = useState(_usuariosMemo || []);
  useEffect(() => {
    if (_usuariosMemo) return;
    cargarUsuarios()
      .then((u) => {
        _usuariosMemo = u;
        setLista(u);
      })
      .catch(() => {});
  }, []);
  return lista;
}

const _normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** value = login; onChange(login | ""). */
export function SelectUsuario({ value, onChange, placeholder = "Buscar persona…", excluir = [], invalido = false, id }) {
  const lista = useUsuarios();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef(null);
  const elegido = lista.find((u) => u.login === value);

  useEffect(() => {
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const q = _normalizar(texto);
  const opciones = lista.filter((u) => !excluir.includes(u.login) && (!q || _normalizar(`${u.nombre} ${u.login} ${u.area}`).includes(q))).slice(0, 40);
  const elegir = (u) => {
    onChange(u.login);
    setTexto("");
    setAbierto(false);
  };

  return (
    <div className="combo" ref={caja}>
      <input
        id={id}
        className={`inp${invalido ? " inp--error" : ""}`}
        value={abierto ? texto : elegido ? elegido.nombre : value || ""}
        placeholder={placeholder}
        onFocus={() => {
          setAbierto(true);
          setTexto("");
          setActivo(0);
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
          setAbierto(true);
          if (!e.target.value) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((a) => Math.min(a + 1, opciones.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && abierto && opciones[activo]) {
            e.preventDefault();
            elegir(opciones[activo]);
          } else if (e.key === "Escape") setAbierto(false);
        }}
        role="combobox"
        aria-expanded={abierto}
        aria-autocomplete="list"
      />
      {abierto && (
        <div className="combo__lista" role="listbox">
          {!opciones.length ? (
            <div className="combo__vacio">Sin coincidencias</div>
          ) : (
            opciones.map((u, i) => (
              <button
                type="button"
                key={u.login}
                className={`combo__op${i === activo ? " is-activo" : ""}`}
                onMouseEnter={() => setActivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(u);
                }}
                role="option"
                aria-selected={u.login === value}
              >
                <Avatar nombre={u.nombre} chico />
                {u.nombre}
                <small>{u.area}</small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Listados (NC, AC, Mesa, Auditorías) ──────────────────────
/**
 * Fila de tarjetas de estatus que también filtra.
 * items: [{ id, label, total, vencidas?, tono, icono? }]; sel: id | [ids] | null
 */
export function TarjetasEstado({ items, sel, onSel, etiquetaTotal = "Total", total }) {
  const suma = total ?? items.reduce((s, i) => s + i.total, 0);
  const esSel = (id) => (Array.isArray(sel) ? sel.includes(id) : sel === id);
  const tarjeta = (key, label, valor, tono, icono, vencidas, activa, onClick) => (
    <button key={key} type="button" className={`st-card t-${tono}${activa ? " is-sel" : ""}`} aria-pressed={activa} onClick={onClick}>
      <span className="st-card__barra" aria-hidden="true" />
      <span className="st-card__txt">
        <span className="st-card__etq">{label}</span>
        <strong className="st-card__num">{valor}</strong>
        {vencidas > 0 && <small className="st-card__venc">{vencidas} {vencidas === 1 ? "vencida" : "vencidas"}</small>}
      </span>
      <span className="st-card__ico" aria-hidden="true"><i className={`ti ${icono}`} /></span>
    </button>
  );
  return (
    <div className="st-cards" role="group" aria-label="Filtrar por estatus">
      {tarjeta("todos", etiquetaTotal, suma, "neutral", "ti-stack-2", 0, sel == null, () => onSel(null))}
      {items.map((i) =>
        tarjeta(i.id, i.label, i.total, i.tono, i.icono || "ti-point", i.vencidas, esSel(i.id), () => onSel(!Array.isArray(sel) && sel === i.id ? null : i.id)),
      )}
    </div>
  );
}

/** Etiqueta de estatus con punto. */
export function Pastilla({ tono = "neutral", children }) {
  return (
    <span className={`pastilla t-${tono}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

/** Días al compromiso como pastilla: "13 d", "−6 d" rojo, "—" si cerrada. */
export function Dias({ dias, cerrada = false }) {
  if (cerrada || dias == null) return <span className="muted">—</span>;
  const tono = dias < 0 ? "danger" : dias <= 3 ? "orange" : "neutral";
  return <span className={`dias t-${tono}`}>{dias < 0 ? `−${Math.abs(dias)}` : dias} d</span>;
}

/** Descarga un CSV (UTF-8 con BOM para Excel). */
export function exportarCSV(nombre, cabeceras, filas) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cabeceras, ...filas].map((f) => f.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
