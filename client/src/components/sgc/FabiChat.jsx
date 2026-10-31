// components/sgc/FabiChat.jsx
// Fab-i · Asistente SGC: botón flotante en la esquina inferior derecha de
// todas las pantallas del SGI (lo monta SGCLayout). Abre un panel de chat que
// consulta POST /api/sgc/fabi/chat; las conversaciones quedan en el historial
// del usuario (panel que entra desde la izquierda).
// Estilos en pages/sgc/sgc.css (bloque "Fab-i").
import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hace, sgcApi, fechaCorta } from "../../pages/sgc/sgcApi";
import { apiFetch } from "../../utils/apiFetch";

const BIENVENIDA = "Hola, soy Fab-i. Tengo acceso en tiempo real al SGC y a la biblioteca documental del SGI. Puedo buscarte documentos, ayudarte a redactar una NC, guiar un análisis de causa raíz o proponer acciones correctivas.";
const SUGERENCIAS = ["¿Qué NCs están vencidas?", "¿Cuál es la próxima auditoría?", "¿Qué riesgos tienen nivel alto?", "¿Qué acciones correctivas vencen este mes?"];
// Chips de intención: pre-llenan el campo para que el usuario complete
const CHIPS = [
  { icono: "ti-search", label: "Buscar documento", texto: "Busca el documento " },
  { icono: "ti-file-alert", label: "Redactar NC", texto: "Ayúdame a redactar una no conformidad: encontré " },
  { icono: "ti-zoom-question", label: "Análisis causa raíz", texto: "Ayúdame con el análisis de causa raíz (5 porqués) de este problema: " },
  { icono: "ti-checklist", label: "Proponer acciones", texto: "Propón un plan de acción correctiva para esta causa raíz: " },
];
const MAX = 1500;
const VISIBLES = new Set(["pdf", "png", "jpg", "jpeg", "gif", "txt"]);

const TIPOS_GUARDADOS = new Set(["documentos", "nc", "ac", "auditoria", "riesgo", "consulta_folio"]);
/** Lo que el chat pinta además del texto: documentos, borradores y ficha de folio. */
const extrasDe = (d) => ({
  resultados: Array.isArray(d.resultados) ? d.resultados : null,
  borrador_nc: d.borrador_nc || null,
  borrador_ac: d.borrador_ac || null,
  borrador_auditoria: d.borrador_auditoria || null,
  borrador_riesgo: d.borrador_riesgo || null,
  ficha: d.tipo === "consulta_folio" && d.datos ? { folio: d.folio, datos: d.datos, url: d.url_detalle } : null,
});

/** Mensaje guardado como JSON (documentos, borradores o ficha) → { contenido, ...extras }. */
function leerContenido(c) {
  if (typeof c === "string" && c.startsWith("{")) {
    try {
      const d = JSON.parse(c);
      if (typeof d?.contenido === "string" && TIPOS_GUARDADOS.has(d.tipo)) {
        return { ...extrasDe(d), contenido: d.contenido };
      }
    } catch {
      /* texto normal */
    }
  }
  return { contenido: c, resultados: null };
}

/** Encabezado + acciones comunes de las tarjetas de borrador. */
function Borrador({ titulo, icono, textoAbrir = "Abrir en formulario", onAbrir, puedeAbrir = true, children }) {
  return (
    <div className="fabi-draft">
      <div className="fabi-draft__head">
        <span className="fabi-draft__badge"><i className={`ti ${icono}`} /> {titulo}</span>
        <span className="fabi-draft__nota">Aún no se registra</span>
      </div>
      {children}
      <div className="fabi-draft__acciones">
        <button type="button" className="btn btn--primario btn--sm" onClick={onAbrir} disabled={!puedeAbrir}>
          <i className="ti ti-check" /> {textoAbrir}
        </button>
      </div>
    </div>
  );
}

function DraftAC({ borrador: b, onAbrir }) {
  return (
    <Borrador titulo="Borrador AC" icono="ti-circle-check" onAbrir={() => onAbrir(b)}>
      <dl className="fabi-draft__datos">
        <dt>Acción</dt><dd>{b.titulo}</dd>
        {b.nc_origen_folio && <><dt>NC origen</dt><dd className="mono">{b.nc_origen_folio}</dd></>}
        <dt>Problema</dt><dd>{b.descripcion_problema || "—"}</dd>
        <dt>Causa raíz</dt><dd>{b.causa_raiz || "—"}</dd>
      </dl>
      {b.actividades?.length > 0 && (
        <ol className="fabi-draft__pasos">
          {b.actividades.map((a, i) => (
            <li key={i}>
              {a.descripcion}
              <small>{[a.responsable_sugerido, `${a.plazo_dias} días`].filter(Boolean).join(" · ")}</small>
            </li>
          ))}
        </ol>
      )}
    </Borrador>
  );
}

function DraftAuditoria({ borrador: b, onAbrir }) {
  return (
    <Borrador titulo="Borrador Auditoría" icono="ti-clipboard-check" textoAbrir="Crear auditoría" onAbrir={() => onAbrir(b)}>
      <dl className="fabi-draft__datos">
        <dt>Nombre</dt><dd>{b.nombre}</dd>
        <dt>Tipo</dt><dd>{b.tipo}</dd>
        <dt>Norma</dt><dd>{b.norma || "—"}</dd>
        <dt>Fecha</dt><dd>{b.fecha_sugerida ? fechaCorta(b.fecha_sugerida) : "Por definir"}</dd>
        <dt>Proceso</dt><dd>{b.proceso_sugerido || "—"}</dd>
        <dt>Auditor</dt><dd>Lo eliges tú en el formulario</dd>
      </dl>
    </Borrador>
  );
}

// Mismos umbrales que la matriz de Riesgos: mayor a 12 alto, 5 a 12 medio, menor a 5 bajo
const tonoNivel = (n) => (n > 12 ? "danger" : n >= 5 ? "warn" : "ok");

function DraftRiesgo({ borrador: b, onAbrir }) {
  const nivel = b.probabilidad_sugerida * b.impacto_sugerido;
  const op = b.tipo === "Oportunidad";
  return (
    <Borrador titulo={op ? "Borrador Oportunidad" : "Borrador Riesgo"} icono={op ? "ti-bulb" : "ti-shield-exclamation"} onAbrir={() => onAbrir(b)}>
      <dl className="fabi-draft__datos">
        <dt>{op ? "Oportunidad" : "Riesgo"}</dt><dd>{b.nombre}</dd>
        <dt>Descripción</dt><dd>{b.descripcion || "—"}</dd>
        <dt>Categoría</dt><dd>{b.categoria || "—"}</dd>
        <dt>Nivel</dt>
        <dd>
          <span className={`fabi-nivel t-${tonoNivel(nivel)}`}>{nivel}</span> P{b.probabilidad_sugerida} × I{b.impacto_sugerido}
        </dd>
        {b.controles_sugeridos && <><dt>Controles</dt><dd>{b.controles_sugeridos}</dd></>}
        {b.plan_sugerido && <><dt>{op ? "Plan" : "Tratamiento"}</dt><dd>{b.plan_sugerido}</dd></>}
        {b.impacto_economico != null && <><dt>{op ? "Beneficio" : "Exposición"}</dt><dd>${Number(b.impacto_economico).toLocaleString("es-MX")} MXN</dd></>}
      </dl>
    </Borrador>
  );
}

const SEMAFORO_FICHA = { rojo: "danger", amarillo: "warn", verde: "ok", gris: "neutral" };

/** Ficha rápida de un folio consultado directo en la base. */
function FichaFolio({ ficha, onIr }) {
  const { datos: d } = ficha;
  return (
    <div className="fabi-ficha">
      <div className="fabi-ficha__head">
        <span className="fabi-ficha__folio">{ficha.folio}</span>
        <span className={`tag t-${SEMAFORO_FICHA[d.semaforo] || "neutral"}`}>{d.estado}</span>
      </div>
      <small className="fabi-ficha__tipo">{d.tipo}</small>
      {d.descripcion && <p className="fabi-ficha__desc">{d.descripcion}</p>}
      <dl className="fabi-draft__datos">
        {d.campos.map(([l, v]) => <Fragment key={l}><dt>{l}</dt><dd>{v}</dd></Fragment>)}
      </dl>
      <div className="fabi-draft__acciones">
        {ficha.url && (
          <button type="button" className="btn btn--primario btn--sm" onClick={() => onIr(ficha.url)}>
            <i className="ti ti-arrow-right" /> Ver completo
          </button>
        )}
        {d.vinculos?.map((v) => (
          <button key={v.folio} type="button" className="btn btn--sm" onClick={() => onIr(v.url)}>
            → {v.folio}
          </button>
        ))}
      </div>
    </div>
  );
}

// Mismos nombres que los catálogos sgc_cat_clasificaciones / sgc_cat_afectaciones
const CLASIFICACIONES = ["Mayor", "Menor", "Observación"];
const AFECTACIONES = ["Seguridad alimentaria", "Calidad del producto", "Legal", "Operativa", "Cliente"];

/** Borrador de NC: se revisa (o edita) aquí y se abre en el formulario de alta ya prellenado. */
function DraftCard({ borrador, onAbrir }) {
  const [b, setB] = useState(borrador);
  const [editando, setEditando] = useState(false);
  const set = (k) => (e) => setB((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="fabi-draft">
      <div className="fabi-draft__head">
        <span className="fabi-draft__badge"><i className="ti ti-file-pencil" /> Borrador NC</span>
        <span className="fabi-draft__nota">Aún no se registra</span>
      </div>
      {editando ? (
        <div className="fabi-draft__form">
          <label>Descripción<textarea className="inp" rows={3} maxLength={300} value={b.descripcion} onChange={set("descripcion")} /></label>
          <label>Detalle<textarea className="inp" rows={4} value={b.descripcion_detallada || ""} onChange={set("descripcion_detallada")} /></label>
          <label>Clasificación
            <select className="inp" value={b.clasificacion || ""} onChange={set("clasificacion")}>
              <option value="">—</option>
              {CLASIFICACIONES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Afectación
            <select className="inp" value={b.afectacion || ""} onChange={set("afectacion")}>
              <option value="">—</option>
              {AFECTACIONES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <dl className="fabi-draft__datos">
          <dt>Descripción</dt><dd>{b.descripcion}</dd>
          <dt>Clasificación</dt><dd>{b.clasificacion || "—"}</dd>
          <dt>Afectación</dt><dd>{b.afectacion || "—"}</dd>
          <dt>Proceso</dt><dd>{b.proceso_sugerido || "—"}{b.area_sugerida ? ` · ${b.area_sugerida}` : ""}</dd>
        </dl>
      )}
      <div className="fabi-draft__acciones">
        <button type="button" className="btn btn--primario btn--sm" onClick={() => onAbrir(b)} disabled={!b.descripcion?.trim()}>
          <i className="ti ti-check" /> Abrir en formulario
        </button>
        <button type="button" className="btn btn--fantasma btn--sm" onClick={() => setEditando((v) => !v)}>
          <i className={`ti ${editando ? "ti-eye" : "ti-pencil"}`} /> {editando ? "Ver resumen" : "Editar borrador"}
        </button>
      </div>
    </div>
  );
}

/** Markdown mínimo y seguro: **negritas**, listas con guion y saltos de línea. */
function Texto({ texto }) {
  const negritas = (linea) =>
    linea.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  const bloques = [];
  for (const linea of String(texto || "").split("\n")) {
    const item = linea.match(/^\s*[-•]\s+(.*)$/);
    const ultimo = bloques[bloques.length - 1];
    if (item) {
      if (ultimo?.tipo === "lista") ultimo.items.push(item[1]);
      else bloques.push({ tipo: "lista", items: [item[1]] });
    } else if (linea.trim()) bloques.push({ tipo: "p", texto: linea });
  }
  return bloques.map((b, i) =>
    b.tipo === "lista" ? (
      <ul key={i} className="fabi__lista">
        {b.items.map((t, k) => <li key={k}>{negritas(t)}</li>)}
      </ul>
    ) : (
      <p key={i} className="fabi__parrafo">{negritas(b.texto)}</p>
    ),
  );
}

const ICONO_EXT = (ext) =>
  ext === "pdf" ? "ti-file-type-pdf" : /^docx?$/.test(ext) ? "ti-file-type-docx" : /^xlsx?$/.test(ext) ? "ti-file-type-xls" : /^pptx?$/.test(ext) ? "ti-file-type-ppt" : /^(png|jpe?g|gif)$/.test(ext) ? "ti-photo" : "ti-file";

/** Tarjeta de documento: ver y descargar por el proxy del backend (token en el header). */
function DocumentResultCard({ doc }) {
  const [estado, setEstado] = useState(null); // "ver" | "bajar" | mensaje
  const ruta = (accion) => `/api/sgc/documentos/${accion}/${encodeURIComponent(doc.driveItemId)}`;

  const obtener = async (accion) => {
    const res = await apiFetch(ruta(accion));
    if (!res.ok) throw new Error("No se pudo obtener el archivo");
    return URL.createObjectURL(await res.blob());
  };

  const visualizar = async () => {
    if (!VISIBLES.has(doc.extension)) {
      setEstado("Este tipo de archivo no se puede ver en el navegador. Descárgalo para abrirlo.");
      return;
    }
    // La pestaña se abre antes del fetch para que el navegador no la bloquee
    const ventana = window.open("", "_blank");
    setEstado("ver");
    try {
      const url = await obtener("preview");
      if (ventana) ventana.location.href = url;
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setEstado(null);
    } catch (err) {
      ventana?.close();
      setEstado(err.message);
    }
  };

  const descargar = async () => {
    setEstado("bajar");
    try {
      const url = await obtener("download");
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setEstado(null);
    } catch (err) {
      setEstado(err.message);
    }
  };

  return (
    <div className="fabi-doc">
      <div className="fabi-doc__cabeza">
        <i className={`ti ${ICONO_EXT(doc.extension)} fabi-doc__ico`} aria-hidden="true" />
        <div className="fabi-doc__txt">
          <strong title={doc.nombre}>{doc.nombre}</strong>
          <span><i className="ti ti-folder" /> {doc.carpeta || "Raíz de la biblioteca"}</span>
          {doc.fechaModificacion && <small>Modificado {fechaCorta(String(doc.fechaModificacion).slice(0, 10))}</small>}
        </div>
      </div>
      <div className="fabi-doc__acciones">
        <button type="button" onClick={visualizar} disabled={estado === "ver" || estado === "bajar"}>
          <i className={`ti ${estado === "ver" ? "ti-loader-2 giro" : "ti-eye"}`} /> Visualizar
        </button>
        <button type="button" onClick={descargar} disabled={estado === "ver" || estado === "bajar"}>
          <i className={`ti ${estado === "bajar" ? "ti-loader-2 giro" : "ti-download"}`} /> Descargar
        </button>
      </div>
      {estado && estado !== "ver" && estado !== "bajar" && <p className="fabi-doc__aviso">{estado}</p>}
    </div>
  );
}

export default function FabiChat() {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]); // { rol, contenido, recomendacion?, error? }
  const [idConversacion, setIdConversacion] = useState(null);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [conversaciones, setConversaciones] = useState(null);
  const [errorHistorial, setErrorHistorial] = useState(null);
  const zona = useRef(null);
  const entrada = useRef(null);

  useEffect(() => {
    if (zona.current) zona.current.scrollTop = zona.current.scrollHeight;
  }, [mensajes, pensando, abierto]);

  // La paleta (Ctrl+K) y el Centro de control abren Fab-i con el evento "sgc:abrirFabi";
  // con detail.pregunta, además la envían como mensaje nuevo
  const enviarRef = useRef(null);
  useEffect(() => {
    const abrir = (e) => {
      setAbierto(true);
      const pregunta = e?.detail?.pregunta;
      if (pregunta) setTimeout(() => enviarRef.current?.(pregunta), 120);
    };
    window.addEventListener("sgc:abrirFabi", abrir);
    return () => window.removeEventListener("sgc:abrirFabi", abrir);
  }, []);

  useEffect(() => {
    if (abierto && !historialAbierto) setTimeout(() => entrada.current?.focus(), 160);
  }, [abierto, historialAbierto]);

  useEffect(() => {
    if (!abierto) return undefined;
    const esc = (e) => {
      if (e.key !== "Escape") return;
      if (historialAbierto) setHistorialAbierto(false);
      else setAbierto(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto, historialAbierto]);

  // Textarea que crece con el texto (hasta 5 líneas)
  useEffect(() => {
    const el = entrada.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [texto]);

  const enviar = async (contenido = texto) => {
    const mensaje = contenido.trim();
    if (!mensaje || pensando) return;
    setTexto("");
    setMensajes((m) => [...m, { rol: "user", contenido: mensaje }]);
    setPensando(true);
    try {
      const r = await sgcApi("/fabi/chat", { method: "POST", body: { mensaje, idConversacion } });
      setIdConversacion(r.idConversacion);
      setMensajes((m) => [...m, { rol: "assistant", ...extrasDe(r), contenido: r.contenido ?? r.respuesta, recomendacion: r.recomendacion }]);
      setConversaciones(null); // se recarga al abrir el historial
    } catch (err) {
      setMensajes((m) => [...m, { rol: "assistant", contenido: err.message, error: true, reintento: mensaje }]);
    } finally {
      setPensando(false);
    }
  };

  enviarRef.current = enviar;

  const reintentar = (k, mensaje) => {
    // Quita la pregunta fallida y su error, y la vuelve a enviar
    setMensajes((m) => m.slice(0, k - 1));
    setTimeout(() => enviar(mensaje), 0);
  };

  const nueva = () => {
    setMensajes([]);
    setIdConversacion(null);
    setHistorialAbierto(false);
  };

  const abrirHistorial = async () => {
    setHistorialAbierto(true);
    setErrorHistorial(null);
    try {
      setConversaciones(await sgcApi("/fabi/historial"));
    } catch (err) {
      setErrorHistorial(err.message);
    }
  };

  const cargar = async (c) => {
    try {
      const d = await sgcApi(`/fabi/historial/${c.idConversacion}`);
      setMensajes(d.mensajes.map((m) => (m.rol === "assistant" ? { rol: m.rol, ...leerContenido(m.contenido) } : { rol: m.rol, contenido: m.contenido })));
      setIdConversacion(d.idConversacion);
      setHistorialAbierto(false);
    } catch (err) {
      setErrorHistorial(err.message);
    }
  };

  const borrar = async (c) => {
    try {
      await sgcApi(`/fabi/historial/${c.idConversacion}`, { method: "DELETE" });
      setConversaciones((l) => l.filter((x) => x.idConversacion !== c.idConversacion));
      if (c.idConversacion === idConversacion) nueva();
    } catch (err) {
      setErrorHistorial(err.message);
    }
  };

  const ir = (to, state) => {
    navigate(to, state ? { state } : undefined);
    if (window.matchMedia("(max-width: 520px)").matches) setAbierto(false);
  };

  return (
    <div className={`fabi${abierto ? " is-abierto" : ""}`}>
      <section className="fabi__panel" role="dialog" aria-label="Fab-i, asistente SGC" aria-hidden={!abierto} inert={abierto ? undefined : ""}>
        <header className="fabi__head">
          <button type="button" className="fabi__icono" onClick={historialAbierto ? () => setHistorialAbierto(false) : abrirHistorial} aria-label={historialAbierto ? "Volver al chat" : "Historial de conversaciones"} title="Historial">
            <i className={`ti ${historialAbierto ? "ti-arrow-left" : "ti-history"}`} />
          </button>
          <span className="fabi__logo" aria-hidden="true">
            <i className="ti ti-sparkles" />
          </span>
          <div className="fabi__titulo">
            <strong>Fab-i</strong>
            <span>Asistente SGC</span>
          </div>
          <button type="button" className="fabi__icono" onClick={nueva} aria-label="Nueva conversación" title="Nueva conversación">
            <i className="ti ti-edit" />
          </button>
          <button type="button" className="fabi__icono" onClick={() => setAbierto(false)} aria-label="Cerrar Fab-i" title="Cerrar">
            <i className="ti ti-x" />
          </button>
        </header>

        <div className="fabi__cuerpo">
          <div className="fabi__mensajes" ref={zona} aria-live="polite">
            <div className="fabi__msg fabi__msg--asistente">
              <span className="fabi__avatar" aria-hidden="true">F</span>
              <div className="fabi__burbuja">{BIENVENIDA}</div>
            </div>
            {!mensajes.length && (
              <div className="fabi__sugerencias">
                {SUGERENCIAS.map((s) => (
                  <button key={s} type="button" onClick={() => enviar(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensajes.map((m, k) =>
              m.rol === "user" ? (
                <div key={k} className="fabi__msg fabi__msg--usuario">
                  <div className="fabi__burbuja">{m.contenido}</div>
                </div>
              ) : (
                <div key={k} className={`fabi__msg fabi__msg--asistente${m.error ? " is-error" : ""}`}>
                  <span className="fabi__avatar" aria-hidden="true">F</span>
                  <div className="fabi__burbuja">
                    {m.error ? m.contenido : <Texto texto={m.contenido} />}
                    {m.borrador_nc && <DraftCard borrador={m.borrador_nc} onAbrir={(b) => ir("/sgc/no-conformidades/nueva", { borrador: b })} />}
                    {m.borrador_ac && <DraftAC borrador={m.borrador_ac} onAbrir={(b) => ir("/sgc/acciones-correctivas/nueva", { borrador: b })} />}
                    {m.borrador_auditoria && <DraftAuditoria borrador={m.borrador_auditoria} onAbrir={(b) => ir("/sgc/auditorias/nueva", { borrador: b })} />}
                    {m.borrador_riesgo && <DraftRiesgo borrador={m.borrador_riesgo} onAbrir={(b) => ir("/sgc/riesgos?nuevo=1", { borrador: b })} />}
                    {m.ficha && <FichaFolio ficha={m.ficha} onIr={(to) => ir(to)} />}
                    {m.resultados?.length > 0 && (
                      <div className="fabi-docs">
                        {m.resultados.map((d) => <DocumentResultCard key={d.driveItemId} doc={d} />)}
                      </div>
                    )}
                    {m.recomendacion && (
                      <button type="button" className="fabi__ir" onClick={() => ir(m.recomendacion.to)}>
                        {m.recomendacion.nombre} <i className="ti ti-arrow-right" />
                      </button>
                    )}
                    {m.error && m.reintento && (
                      <button type="button" className="fabi__ir" onClick={() => reintentar(k, m.reintento)}>
                        <i className="ti ti-refresh" /> Reintentar
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
            {pensando && (
              <div className="fabi__msg fabi__msg--asistente">
                <span className="fabi__avatar" aria-hidden="true">F</span>
                <div className="fabi__burbuja fabi__pensando">
                  <span className="fabi__puntos" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Fab-i está pensando...
                </div>
              </div>
            )}
          </div>

          <form
            className="fabi__entrada"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <textarea
              ref={entrada}
              rows={1}
              value={texto}
              maxLength={MAX}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Pregúntale a Fab-i…"
              aria-label="Mensaje para Fab-i"
            />
            <button type="submit" className="fabi__enviar" disabled={!texto.trim() || pensando} aria-label="Enviar">
              <i className="ti ti-arrow-up" />
            </button>
          </form>
          {!mensajes.length && !texto && (
            <div className="fabi__chips" role="group" aria-label="¿Qué quieres hacer?">
              {CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    setTexto(c.texto);
                    setTimeout(() => {
                      const el = entrada.current;
                      if (el) { el.focus(); el.setSelectionRange(c.texto.length, c.texto.length); }
                    }, 0);
                  }}
                >
                  <i className={`ti ${c.icono}`} /> {c.label}
                </button>
              ))}
            </div>
          )}
          <p className="fabi__nota">Solo consulta: Fab-i no crea ni modifica registros.</p>

          <aside className={`fabi__historial${historialAbierto ? " is-abierto" : ""}`} aria-label="Conversaciones anteriores" aria-hidden={!historialAbierto} inert={historialAbierto ? undefined : ""}>
            <div className="fabi__historial-head">
              <b>Conversaciones</b>
              <button type="button" className="btn btn--sm" onClick={nueva}>
                <i className="ti ti-plus" /> Nueva
              </button>
            </div>
            {errorHistorial && <p className="fabi__historial-vacio t-danger">{errorHistorial}</p>}
            {!conversaciones && !errorHistorial ? (
              <p className="fabi__historial-vacio">Cargando…</p>
            ) : conversaciones && !conversaciones.length ? (
              <p className="fabi__historial-vacio">Aún no tienes conversaciones guardadas.</p>
            ) : (
              <ul>
                {(conversaciones || []).map((c) => (
                  <li key={c.idConversacion} className={c.idConversacion === idConversacion ? "is-actual" : ""}>
                    <button type="button" className="fabi__conv" onClick={() => cargar(c)}>
                      <span>{c.titulo}</span>
                      <small>
                        {hace(c.ultimoMensaje || c.fechaCreacion)} · {c.mensajes} mensajes
                      </small>
                    </button>
                    <button type="button" className="fabi__icono" onClick={() => borrar(c)} aria-label={`Eliminar «${c.titulo}»`} title="Eliminar">
                      <i className="ti ti-trash" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </section>

      <button type="button" className="fabi__boton" onClick={() => setAbierto((a) => !a)} aria-label={abierto ? "Cerrar Fab-i" : "Abrir Fab-i, asistente SGC"} aria-expanded={abierto}>
        <i className={`ti ${abierto ? "ti-x" : "ti-sparkles"}`} />
      </button>
    </div>
  );
}
