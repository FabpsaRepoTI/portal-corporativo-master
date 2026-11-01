// pages/sgc/GestionProcesos.jsx
// Mapa de procesos (ISO 9001 cl. 4.4): lienzo con zoom y desplazamiento libre
// (React Flow). Nodos por tipo — Estratégico, Operativo, Apoyo — y conexiones
// con su tipo (Alimenta / Controla / Apoya).
//   · Clic en un nodo: panel lateral con su ficha y sus NCs abiertas.
//   · Coordinador: + Proceso, + Conexión (o arrastrar de un nodo a otro),
//     mover nodos (se guarda la posición al soltar), editar y eliminar.
// Los demás roles consultan el mapa sin editarlo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ReactFlow, {
  Background, Handle, MarkerType, MiniMap,
  Position, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, useViewport,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  BotonGuardar, Campo, Confirmar, Dato, ErrorCarga,
  Modal, Persona, SelectUsuario, Skel, Vacio, useMigas, useToast,
} from "./components/ui";
import { fechaCorta, sgcApi, useSgc, NC_ESTATUS, PROCESO_TIPO, RELACION_TIPO } from "./sgcApi";

// Prefijos de código por tipo
const CODIGO_PREFIJO = { 1: "EST", 2: "OP", 3: "AP" };

// Color de aristas por tipo de relación
const ARISTA_COLOR = { 1: "#3978f6", 2: "#6366f1", 3: "#94a3b8" };
const ARISTA_DASH  = { 1: undefined, 2: "6 4", 3: "3 5" };

// ── Nodo de proceso rediseñado ──────────────────────────────────────────────
function NodoProceso({ data, selected }) {
  const t = PROCESO_TIPO[data.tipo];
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div
      className={`pnodo2${selected ? " is-sel" : ""}`}
      style={{ "--nodo": t.color }}
      onMouseLeave={() => setMenuAbierto(false)}
    >
      <Handle type="target" position={Position.Left} />

      {/* Cabecera: icono + código + menú */}
      <div className="pnodo2__head">
        <div className="pnodo2__ico-wrap">
          <i className={`ti ${t.icono}`} />
        </div>
        <span className="pnodo2__codigo">{data.codigo}</span>
        {data.onMenu && (
          <button
            type="button"
            className="pnodo2__menu-btn"
            title="Opciones"
            onClick={(e) => { e.stopPropagation(); setMenuAbierto((v) => !v); data.onMenu?.(e, data); }}
          >
            <i className="ti ti-dots-vertical" />
          </button>
        )}
      </div>

      {/* Nombre */}
      <strong className="pnodo2__nombre">{data.nombre}</strong>

      {/* Responsable e ISO */}
      <div className="pnodo2__meta">
        <span className="pnodo2__resp" title={data.responsable}>
          {data.responsable || "Sin responsable"}
        </span>
        {data.clausulaISO && (
          <span className="pnodo2__iso mono">ISO 9001: {data.clausulaISO}</span>
        )}
      </div>

      {/* Badge NC */}
      {data.ncAbiertas > 0 && (
        <span className="pnodo2__nc">{data.ncAbiertas} NC</span>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const TIPOS_NODO = { proceso: NodoProceso };

// ── Modal crear / editar proceso ────────────────────────────────────────────
function ModalProceso({ proceso, onClose, onGuardado }) {
  const toast = useToast();
  const [f, setF] = useState({
    nombre: proceso?.nombre || "",
    tipo: proceso?.tipo || 2,
    descripcion: proceso?.descripcion || "",
    loginResponsable: proceso?.loginResponsable || "",
    clausulaISO: proceso?.clausulaISO || "",
  });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!f.nombre.trim()) return setError("Escribe el nombre del proceso.");
    try {
      setGuardando(true);
      const cuerpo = { ...f, loginResponsable: f.loginResponsable || null, clausulaISO: f.clausulaISO || null, descripcion: f.descripcion || null };
      if (proceso) await sgcApi(`/procesos/${proceso.idProceso}`, { method: "PUT", body: cuerpo });
      else await sgcApi("/procesos", { method: "POST", body: cuerpo });
      toast.ok(proceso ? "Proceso actualizado" : "Proceso agregado al mapa");
      onGuardado();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={proceso ? "Editar proceso" : "Nuevo proceso"}
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
          <BotonGuardar ocupado={guardando} onClick={guardar}>{proceso ? "Guardar" : "Agregar"}</BotonGuardar>
        </>
      }
    >
      <div className="seg" role="radiogroup" aria-label="Tipo de proceso">
        {Object.entries(PROCESO_TIPO).map(([id, t]) => (
          <button key={id} type="button" role="radio" aria-checked={f.tipo === Number(id)}
            className={f.tipo === Number(id) ? "is-on" : ""}
            onClick={() => setF({ ...f, tipo: Number(id) })}>
            <i className={`ti ${t.icono}`} style={{ color: t.color }} /> {t.label}
          </button>
        ))}
      </div>
      <div className="rejilla">
        <Campo etq="Nombre" error={error} className="full">
          <input className={`inp${error ? " inp--error" : ""}`} maxLength={120} value={f.nombre}
            onChange={(e) => (setF({ ...f, nombre: e.target.value }), setError(null))}
            placeholder="Ej. Compras y evaluación de proveedores" />
        </Campo>
        <Campo etq="Responsable" opcional>
          <SelectUsuario value={f.loginResponsable} onChange={(l) => setF({ ...f, loginResponsable: l })} />
        </Campo>
        <Campo etq="Cláusula ISO" opcional>
          <input className="inp mono" maxLength={20} value={f.clausulaISO}
            onChange={(e) => setF({ ...f, clausulaISO: e.target.value })} placeholder="8.4" />
        </Campo>
        <Campo etq="Descripción" opcional className="full">
          <textarea className="inp" rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </Campo>
      </div>
    </Modal>
  );
}

// ── Modal conexión ───────────────────────────────────────────────────────────
function ModalConexion({ procesos, inicial, onClose, onGuardado }) {
  const toast = useToast();
  const [f, setF] = useState({
    idProcesoOrigen: inicial?.origen || "",
    idProcesoDestino: inicial?.destino || "",
    tipo: 1,
    descripcion: "",
  });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!f.idProcesoOrigen || !f.idProcesoDestino) return toast.error("Elige los dos procesos.");
    if (String(f.idProcesoOrigen) === String(f.idProcesoDestino)) return toast.error("Un proceso no puede conectarse consigo mismo.");
    try {
      setGuardando(true);
      await sgcApi("/procesos/relacion", { method: "POST", body: { ...f, idProcesoOrigen: Number(f.idProcesoOrigen), idProcesoDestino: Number(f.idProcesoDestino), descripcion: f.descripcion || null } });
      toast.ok("Conexión agregada");
      onGuardado();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  const opciones = procesos.map((p) => (
    <option key={p.idProceso} value={p.idProceso}>{p.nombre} · {PROCESO_TIPO[p.tipo].label}</option>
  ));

  return (
    <Modal
      titulo="Nueva conexión"
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
          <BotonGuardar ocupado={guardando} onClick={guardar}>Conectar</BotonGuardar>
        </>
      }
    >
      <div className="rejilla">
        <Campo etq="Desde" className="full">
          <select className="inp" value={f.idProcesoOrigen} onChange={(e) => setF({ ...f, idProcesoOrigen: e.target.value })}>
            <option value="">Proceso de origen…</option>{opciones}
          </select>
        </Campo>
        <div className="campo full">
          <span className="campo__etq">Relación</span>
          <div className="seg" role="radiogroup" aria-label="Tipo de relación">
            {Object.entries(RELACION_TIPO).map(([id, l]) => (
              <button key={id} type="button" role="radio" aria-checked={f.tipo === Number(id)}
                className={f.tipo === Number(id) ? "is-on" : ""}
                onClick={() => setF({ ...f, tipo: Number(id) })}>{l}
              </button>
            ))}
          </div>
        </div>
        <Campo etq="Hacia" className="full">
          <select className="inp" value={f.idProcesoDestino} onChange={(e) => setF({ ...f, idProcesoDestino: e.target.value })}>
            <option value="">Proceso de destino…</option>{opciones}
          </select>
        </Campo>
        <Campo etq="Descripción" opcional className="full">
          <input className="inp" maxLength={200} value={f.descripcion}
            onChange={(e) => setF({ ...f, descripcion: e.target.value })}
            placeholder="Ej. Requisitos del cliente" />
        </Campo>
      </div>
    </Modal>
  );
}

// ── Cajón lateral: ficha del proceso ─────────────────────────────────────────
function CajonProceso({ id, puedeEditar, onClose, onEditar, onEliminado }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: p, error, cargando, recargar } = useSgc(() => sgcApi(`/procesos/${id}`), [id]);
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const eliminar = async () => {
    try {
      setBorrando(true);
      await sgcApi(`/procesos/${id}`, { method: "DELETE" });
      toast.ok("Proceso eliminado del mapa");
      onEliminado();
    } catch (err) {
      toast.error(err.message);
      setBorrando(false);
      setConfirmar(false);
    }
  };

  const t = p ? PROCESO_TIPO[p.tipo] : null;
  return (
    <aside className="cajon cajon--flotante" aria-label="Ficha del proceso">
      <header className="cajon__head">
        <div>
          <span className="cajon__kicker" style={t ? { color: t.color } : undefined}>
            {t ? <><i className={`ti ${t.icono}`} /> Proceso {t.label.toLowerCase()}</> : "Cargando…"}
          </span>
          <h2>{p?.nombre || " "}</h2>
        </div>
        <button className="btn btn--fantasma btn--icono" onClick={onClose} aria-label="Cerrar">
          <i className="ti ti-x" />
        </button>
      </header>
      <div className="cajon__cuerpo">
        {error ? (
          <ErrorCarga error={error} onReintentar={recargar} />
        ) : cargando && !p ? (
          <Skel filas={6} />
        ) : (
          <>
            <div className="cajon__datos">
              <Dato label="Responsable">
                {p.responsable ? <Persona nombre={p.responsable} login={p.loginResponsable} /> : <span className="muted">Sin asignar</span>}
              </Dato>
              <Dato label="Cláusula ISO"><span className="mono">{p.clausulaISO || "—"}</span></Dato>
            </div>
            {p.descripcion && <p className="cajon__texto">{p.descripcion}</p>}
            <div className="cajon__bloque">
              <h3>NCs abiertas asociadas <span className="cuenta">{p.ncs.length}</span></h3>
              {!p.ncs.length ? (
                <p className="muted">Sin NCs abiertas vinculadas a este proceso.</p>
              ) : (
                <ul className="lista-nc">
                  {p.ncs.map((n) => (
                    <li key={n.idNC}>
                      <button type="button" onClick={() => navigate(`/sgc/no-conformidades/${n.idNC}`)}>
                        <span className="mono strong">{n.folio}</span>
                        <span className={`tag t-${NC_ESTATUS[n.idEstatus].tono}`}>{n.estatusLabel}</span>
                        <span className={`num${n.diasRestantes < 0 ? " t-danger tinta" : " muted"}`}>
                          {n.diasRestantes < 0 ? `${-n.diasRestantes} d vencida` : fechaCorta(n.fechaCompromiso)}
                        </span>
                        <small>{n.descripcion}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="cajon__enlaces">
                <Link to={`/sgc/no-conformidades?proceso=${p.idProceso}`} className="btn btn--fantasma btn--sm">
                  <i className="ti ti-list" /> Todas sus NCs
                </Link>
                <Link to={`/sgc/no-conformidades/nueva?proceso=${p.idProceso}`} className="btn btn--fantasma btn--sm">
                  <i className="ti ti-plus" /> Registrar NC
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
      {p && puedeEditar && (
        <footer className="cajon__pie">
          <button className="btn btn--fantasma btn--peligro" onClick={() => setConfirmar(true)}>
            <i className="ti ti-trash" /> Eliminar
          </button>
          <button className="btn btn--primario" onClick={() => onEditar(p)}>
            <i className="ti ti-pencil" /> Editar
          </button>
        </footer>
      )}
      {confirmar && (
        <Confirmar
          titulo="¿Eliminar el proceso del mapa?"
          mensaje={`«${p.nombre}» y sus conexiones dejarán de mostrarse en el mapa.`}
          textoConfirmar="Sí, eliminar"
          onConfirmar={eliminar}
          onCancelar={() => setConfirmar(false)}
          ocupado={borrando}
        />
      )}
    </aside>
  );
}

// Encuadre: nunca alejar tanto que los nodos dejen de leerse (el usuario se desplaza)
const ENCUADRE = { padding: 0.12, minZoom: 0.6, maxZoom: 1.1, duration: 300 };

// ── Barra flotante de zoom (esquina inferior izquierda) ─────────────────────
function BarraZoom({ sel }) {
  const { zoomIn, zoomOut, zoomTo, fitView, setCenter, getNode } = useReactFlow();
  const { zoom } = useViewport();
  // Centrar: en el proceso seleccionado, o en todo el mapa
  const centrar = () => {
    const n = sel && getNode(String(sel));
    if (n) setCenter(n.position.x + (n.width || 220) / 2, n.position.y + (n.height || 110) / 2, { zoom: Math.max(zoom, 1), duration: 300 });
    else fitView({ ...ENCUADRE, minZoom: zoom, maxZoom: zoom });
  };
  return (
    <div className="pm-zoom" role="toolbar" aria-label="Navegación del mapa">
      <button type="button" onClick={() => zoomOut({ duration: 150 })} title="Alejar" aria-label="Alejar"><i className="ti ti-minus" /></button>
      <button type="button" className="pm-zoom__pct" onClick={() => zoomTo(1, { duration: 200 })} title="Restablecer zoom al 100 %">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => zoomIn({ duration: 150 })} title="Acercar" aria-label="Acercar"><i className="ti ti-plus" /></button>
      <span className="pm-zoom__sep" />
      <button type="button" onClick={centrar} title={sel ? "Centrar en el proceso seleccionado" : "Centrar el mapa"} aria-label="Centrar"><i className="ti ti-focus-centered" /></button>
      <button type="button" onClick={() => fitView({ ...ENCUADRE, minZoom: 0.2 })} title="Ajustar todo el mapa a la vista" aria-label="Ajustar a la vista"><i className="ti ti-arrows-minimize" /></button>
    </div>
  );
}

/**
 * Pantalla completa del área de trabajo: siempre se cubre la ventana dentro de
 * la app (así los modales y avisos del SGC siguen encima) y, si el navegador lo
 * permite, además se pide su pantalla completa. Salir: botón, Esc o la tecla del
 * navegador. El estado del mapa (filtros, selección, zoom) vive en el mismo
 * componente, así que no se pierde al entrar o salir.
 */
function usePantallaCompleta(puedeSalirConEsc) {
  const [activa, setActiva] = useState(false);
  const salir = useCallback(() => {
    setActiva(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);
  const entrar = useCallback(() => {
    setActiva(true);
    document.documentElement.requestFullscreen?.().catch(() => { /* sin permiso: queda la versión dentro de la app */ });
  }, []);
  useEffect(() => {
    // Si el navegador sale (Esc / F11), la app también
    const cambio = () => !document.fullscreenElement && setActiva(false);
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);
  useEffect(() => {
    if (!activa) return undefined;
    // Sin pantalla completa del navegador, Esc la cierra (si no hay un modal abierto)
    const esc = (e) => e.key === "Escape" && !document.fullscreenElement && puedeSalirConEsc() && salir();
    window.addEventListener("keydown", esc);
    document.body.classList.add("pm-sin-scroll");
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.classList.remove("pm-sin-scroll");
    };
  }, [activa, salir, puedeSalirConEsc]);
  useEffect(() => () => document.fullscreenElement && document.exitFullscreen?.().catch(() => {}), []);
  return { activa, entrar, salir };
}

/** Alto del área de trabajo = lo que queda de la ventana bajo la barra y las pestañas del SGC. */
function useAltoDisponible(ref, deps) {
  const [alto, setAlto] = useState(null);
  useEffect(() => {
    const medir = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top + window.scrollY;
      setAlto(Math.max(420, window.innerHeight - top - 12));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
    // eslint-disable-next-line
  }, deps);
  return alto;
}

// ── Lienzo principal ────────────────────────────────────────────────────────
function Lienzo() {
  const toast = useToast();
  const navigate = useNavigate();
  const { fitView, setCenter, getNode } = useReactFlow();
  const ws = useRef(null);
  const [version, setVersion] = useState(0);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi("/procesos/mapa"), [version]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroResp, setFiltroResp] = useState("");
  const [vistaLista, setVistaLista] = useState(false);
  const [params] = useSearchParams();
  const [sel, setSel] = useState(() => Number(params.get("proceso")) || null);
  const [arista, setArista] = useState(null);
  const [modal, setModal] = useState(null);
  const puedeEditar = !!data?.puedeEditar;
  const procesos = data ? data.nodos.map((n) => n.data) : [];
  const recargarMapa = () => setVersion((v) => v + 1);

  // Esc solo sale de pantalla completa cuando no hay un modal abierto
  const hayModal = useRef(false);
  hayModal.current = !!modal;
  const puedeSalirConEsc = useCallback(() => !hayModal.current, []);
  const pantalla = usePantallaCompleta(puedeSalirConEsc);
  const alto = useAltoDisponible(ws, [!!data, vistaLista]);

  // Buscar proceso: lo selecciona y lleva la vista hasta él (respetando los filtros)
  const irAProceso = (id) => {
    if (!id) return;
    setFiltroTipo("");
    setFiltroResp("");
    setVistaLista(false);
    setSel(Number(id));
    setArista(null);
    setTimeout(() => {
      const n = getNode(String(id));
      if (n) setCenter(n.position.x + (n.width || 220) / 2, n.position.y + (n.height || 110) / 2, { zoom: 1, duration: 400 });
    }, 60);
  };

  // Responsables únicos para el filtro (depende de data, no de procesos)
  const responsables = useMemo(() => {
    if (!data) return [];
    const set = new Map();
    data.nodos.forEach((n) => {
      const p = n.data;
      if (p.loginResponsable) set.set(p.loginResponsable, p.responsable || p.loginResponsable);
    });
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Códigos por tipo — depende solo de data para no disparar loops
  const conCodigos = useMemo(() => {
    if (!data) return [];
    const cnt = {};
    return data.nodos.map((n) => {
      const p = n.data;
      cnt[p.tipo] = (cnt[p.tipo] || 0) + 1;
      return { ...p, codigo: `${CODIGO_PREFIJO[p.tipo]}-${String(cnt[p.tipo]).padStart(2, "0")}` };
    });
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const mapacodigos = new Map(conCodigos.map((p) => [p.idProceso, p]));
    setNodes(
      data.nodos.map((n) => {
        const pd = mapacodigos.get(n.data.idProceso) || n.data;
        const hidden =
          (filtroTipo !== "" && pd.tipo !== Number(filtroTipo)) ||
          (filtroResp !== "" && pd.loginResponsable !== filtroResp);
        return { ...n, data: pd, hidden };
      }),
    );
    setEdges(
      data.aristas.map((a) => ({
        ...a,
        label: a.data.tipoLabel,
        labelStyle: { fontSize: 11, fontWeight: 600, fill: "var(--ink-2)" },
        labelBgStyle: { fill: "var(--panel)", fillOpacity: 0.9 },
        labelBgPadding: [4, 6],
        labelBgBorderRadius: 4,
        style: { stroke: ARISTA_COLOR[a.data.tipo] || "#3978f6", strokeWidth: 1.5, strokeDasharray: ARISTA_DASH[a.data.tipo] },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: ARISTA_COLOR[a.data.tipo] || "#3978f6" },
      })),
    );
    // eslint-disable-next-line
  }, [data, filtroTipo, filtroResp]);

  const encuadrado = useRef(false);
  useEffect(() => {
    encuadrado.current = false;
  }, [data]);
  useEffect(() => {
    if (nodes.filter((n) => !n.hidden).length && !encuadrado.current) {
      encuadrado.current = true;
      setTimeout(() => fitView({ ...ENCUADRE, duration: 400 }), 80);
    }
  }, [nodes, fitView]);

  const alSoltar = useCallback(
    async (_e, nodo) => {
      if (!puedeEditar) return;
      try {
        await sgcApi(`/procesos/${nodo.id}`, { method: "PUT", body: { posX: nodo.position.x, posY: nodo.position.y } });
      } catch (err) {
        toast.error(`No se guardó la posición: ${err.message}`);
      }
    },
    [puedeEditar, toast],
  );

  const eliminarArista = async () => {
    try {
      await sgcApi(`/procesos/relacion/${arista.data.idRelacion}`, { method: "DELETE" });
      toast.ok("Conexión eliminada");
      setArista(null);
      recargarMapa();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const conteo = (t) => procesos.filter((p) => p.tipo === t).length;

  if (error) return <ErrorCarga error={error} onReintentar={recargar} />;
  if (cargando && !data) return <div className="pnl"><Skel filas={8} /></div>;

  return (
    <div ref={ws} className={`pm-ws${pantalla.activa ? " is-completa" : ""}`} style={!pantalla.activa && alto ? { height: alto } : undefined}>
      {/* Barra de herramientas compacta (sustituye al encabezado grande) */}
      <header className="pm-barra">
        <div className="pm-barra__izq">
          {!pantalla.activa && (
            <button type="button" className="btn btn--fantasma btn--icono btn--sm" onClick={() => navigate("/sgc/dashboard")} title="Volver al centro de control" aria-label="Volver al centro de control">
              <i className="ti ti-arrow-left" />
            </button>
          )}
          <span className="pm-barra__ico" aria-hidden="true"><i className="ti ti-hierarchy-3" /></span>
          <h1 className="pm-barra__titulo">Mapa de procesos</h1>
          <span className="pm-barra__cuenta" title={`${procesos.length} procesos`}>{procesos.length}</span>
          <span className="pm-barra__norma">ISO 9001 · 4.4</span>
        </div>
        <div className="pm-barra__der">
          <div className="seg pm-vista" role="radiogroup" aria-label="Vista">
            <button type="button" role="radio" aria-checked={!vistaLista} className={!vistaLista ? "is-on" : ""} onClick={() => setVistaLista(false)}>
              <i className="ti ti-hierarchy-3" /> <span>Mapa</span>
            </button>
            <button type="button" role="radio" aria-checked={vistaLista} className={vistaLista ? "is-on" : ""} onClick={() => setVistaLista(true)}>
              <i className="ti ti-layout-list" /> <span>Lista</span>
            </button>
          </div>
          <button className="btn btn--fantasma btn--sm" onClick={() => window.print()} title="Exportar (imprimir o guardar como PDF)">
            <i className="ti ti-download" /> <span className="pm-txt">Exportar</span>
          </button>
          {puedeEditar && (
            <button className="btn btn--fantasma btn--sm" onClick={() => setModal({ tipo: "conexion" })} disabled={procesos.length < 2} title="Conectar dos procesos (o arrastra de un nodo a otro)">
              <i className="ti ti-arrows-right-left" /> <span className="pm-txt">Conexión</span>
            </button>
          )}
          <button
            className="btn btn--fantasma btn--sm btn--icono"
            onClick={pantalla.activa ? pantalla.salir : pantalla.entrar}
            title={pantalla.activa ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
            aria-label={pantalla.activa ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            <i className={`ti ${pantalla.activa ? "ti-arrows-minimize" : "ti-arrows-maximize"}`} />
          </button>
          {puedeEditar && (
            <button className="btn btn--primario btn--sm" onClick={() => setModal({ tipo: "proceso" })}>
              <i className="ti ti-plus" /> <span className="pm-txt">Nuevo proceso</span>
            </button>
          )}
        </div>
      </header>

      {/* Barra secundaria: filtros + leyenda */}
      <div className="mapa-filtros pm-filtros">
        <div className="mapa-filtros__izq">
          <select className="inp inp--sm mapa-sel" value="" onChange={(e) => irAProceso(e.target.value)} aria-label="Ir a un proceso">
            <option value="">Ir a un proceso… ({procesos.length})</option>
            {conCodigos.map((p) => (
              <option key={p.idProceso} value={p.idProceso}>{p.codigo} · {p.nombre}</option>
            ))}
          </select>
          <select className="inp inp--sm mapa-sel" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {Object.entries(PROCESO_TIPO).map(([id, t]) => (
              <option key={id} value={id}>{t.label}</option>
            ))}
          </select>
          <select className="inp inp--sm mapa-sel" value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} aria-label="Responsable">
            <option value="">Todos los responsables</option>
            {responsables.map(([login, nombre]) => (
              <option key={login} value={login}>{nombre}</option>
            ))}
          </select>
        </div>
        <div className="mapa-filtros__leyenda">
          {Object.entries(PROCESO_TIPO).map(([id, t]) => (
            <button
              key={id}
              type="button"
              className={`mapa-leyenda__item${filtroTipo === id ? " is-on" : ""}`}
              style={{ "--cat": t.color }}
              onClick={() => setFiltroTipo(filtroTipo === id ? "" : id)}
            >
              <span className="mapa-leyenda__dot" />
              {t.label} <span className="mapa-leyenda__num">{conteo(Number(id))}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Vista lista */}
      {vistaLista && (
        <div className="mapa-lista">
          {Object.entries(PROCESO_TIPO).map(([tid, tt]) => {
            const ps = conCodigos.filter((p) => p.tipo === Number(tid));
            if (!ps.length) return null;
            return (
              <section key={tid} className="mapa-lista__grupo">
                <h3 style={{ color: tt.color }}><i className={`ti ${tt.icono}`} /> {tt.label}</h3>
                <div className="mapa-lista__tabla">
                  {ps.map((p) => (
                    <div key={p.idProceso} className="mapa-lista__fila" onClick={() => { setSel(p.idProceso); setVistaLista(false); }}>
                      <span className="mono muted">{p.codigo}</span>
                      <strong>{p.nombre}</strong>
                      <span className="muted">{p.responsable || "—"}</span>
                      <span className="mono muted">{p.clausulaISO || "—"}</span>
                      {p.ncAbiertas > 0 && <span className="tag t-danger">{p.ncAbiertas} NC</span>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Lienzo React Flow */}
      {!vistaLista && (
        <div className="lienzo">
          {!procesos.length ? (
            <Vacio
              icono="ti-hierarchy-3"
              titulo="El mapa de procesos está vacío"
              texto={puedeEditar ? "Agrega los procesos estratégicos, operativos y de apoyo, y luego conéctalos." : "El Coordinador SGI aún no ha documentado el mapa de procesos."}
              accion={puedeEditar && (
                <button className="btn btn--primario" onClick={() => setModal({ tipo: "proceso" })}>
                  <i className="ti ti-plus" /> Agregar el primer proceso
                </button>
              )}
            />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={TIPOS_NODO}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_e, n) => { setSel(Number(n.id)); setArista(null); }}
              onEdgeClick={(_e, a) => puedeEditar && setArista(a)}
              onPaneClick={() => setArista(null)}
              onNodeDragStop={alSoltar}
              onConnect={(c) => puedeEditar && setModal({ tipo: "conexion", inicial: { origen: c.source, destino: c.target } })}
              nodesDraggable={puedeEditar}
              nodesConnectable={puedeEditar}
              elementsSelectable
              minZoom={0.2}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} size={1} />
              <MiniMap
                pannable
                zoomable
                className={sel ? "pm-minimapa--con-ficha" : undefined}
                nodeColor={(n) => PROCESO_TIPO[n.data?.tipo]?.color || "#9ca3af"}
                maskColor="rgba(100, 116, 139, 0.18)"
                position="bottom-right"
              />
            </ReactFlow>
          )}
          {procesos.length > 0 && <BarraZoom sel={sel} />}
          {pantalla.activa && (
            <button type="button" className="pm-salir" onClick={pantalla.salir}>
              <i className="ti ti-arrows-minimize" /> Salir de pantalla completa <kbd>Esc</kbd>
            </button>
          )}

          {arista && (
            <div className="lienzo__arista">
              <span>
                <b>{procesos.find((p) => p.idProceso === arista.data.idProcesoOrigen)?.nombre}</b>
                {" "}{arista.data.tipoLabel?.toLowerCase()} a{" "}
                <b>{procesos.find((p) => p.idProceso === arista.data.idProcesoDestino)?.nombre}</b>
                {arista.data.descripcion && <small>{arista.data.descripcion}</small>}
              </span>
              <button className="btn btn--sm btn--fantasma btn--peligro" onClick={eliminarArista}>
                <i className="ti ti-trash" /> Eliminar conexión
              </button>
            </div>
          )}

          {sel && (
            <CajonProceso
              key={`${sel}-${version}`}
              id={sel}
              puedeEditar={puedeEditar}
              onClose={() => setSel(null)}
              onEditar={(p) => setModal({ tipo: "proceso", proceso: p })}
              onEliminado={() => { setSel(null); recargarMapa(); }}
            />
          )}
        </div>
      )}

      {modal?.tipo === "proceso" && (
        <ModalProceso
          proceso={modal.proceso}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); recargarMapa(); }}
        />
      )}
      {modal?.tipo === "conexion" && (
        <ModalConexion
          procesos={procesos}
          inicial={modal.inicial}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); recargarMapa(); }}
        />
      )}
    </div>
  );
}

export default function GestionProcesos() {
  useMigas([{ to: "/sgc/dashboard", label: "SGI" }, { label: "Mapa de procesos" }]);
  return (
    <div className="sg-page sg-page--lienzo">
      <ReactFlowProvider>
        <Lienzo />
      </ReactFlowProvider>
    </div>
  );
}
