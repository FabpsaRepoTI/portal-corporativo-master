// pages/sgc/Riesgos.jsx
// Riesgos y oportunidades (ISO 9001 cl. 6.1).
// Rediseñado para coincidir con la referencia visual ejecutiva:
//   - Layout: matriz + panel lateral derecho / tabla completa debajo
//   - Panel derecho: exposición económica, niveles de riesgo, ¿cómo se calcula?
//   - Tabla con buscador, exportar, estado badge, menú ⋮
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import Matriz, { IMPACTO, Nivel, PROBABILIDAD } from "./components/Matriz";
import { BotonGuardar, Campo, Dato, Encabezado, ErrorCarga, Modal, Persona, SelectUsuario, Skel, Spark, Vacio, useMigas, useToast } from "./components/ui";
import {
  avisarCambio, fechaCorta, fechaHora, hoyISO, mxn, nivelDe,
  sgcApi, useSgc, NIVELES, RIESGO_CATEGORIA, RIESGO_ESTATUS, RIESGO_TIPO,
} from "./sgcApi";

export function SelectorEscala({ valor, onChange, etiquetas, nombre }) {
  return (
    <div className="escala" role="radiogroup" aria-label={nombre}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n}
          className={valor === n ? "is-on" : ""} onClick={() => onChange(n)}>
          {n}<small>{etiquetas[n]}</small>
        </button>
      ))}
    </div>
  );
}

export function NivelGrande({ p, i }) {
  const nivel = p * i;
  const n = NIVELES[nivelDe(nivel)];
  return (
    <div className={`nivel-grande t-${n.tono}`}>
      <strong>{nivel}</strong>
      <div>
        <b>Nivel {n.label.toLowerCase()}</b>
        <small>Probabilidad {p} ({PROBABILIDAD[p].toLowerCase()}) × impacto {i} ({IMPACTO[i].toLowerCase()})</small>
      </div>
    </div>
  );
}

const VACIO = {
  tipo: 1, nombre: "", descripcion: "", probabilidad: 3, impacto: 3,
  categoria: "", impactoEconomico: "", loginResponsable: "",
  clausulaISO: "6.1", planTratamiento: "", controlExistente: "", fechaRevision: "",
};

// ── Modal riesgo/oportunidad ─────────────────────────────────────────────────
// borrador: alta prellenada por Fab-i (nombre, descripción, categoría, P × I y controles)
function ModalRiesgo({ riesgo, borrador, tipoInicial, onClose, onGuardado }) {
  const toast = useToast();
  const { rol, login } = useOutletContext();
  const deFabi = borrador
    ? {
        tipo: borrador.tipo === "Oportunidad" ? 2 : 1,
        nombre: String(borrador.nombre || "").slice(0, 150),
        descripcion: [borrador.descripcion, borrador.proceso_sugerido && `Proceso: ${borrador.proceso_sugerido}`].filter(Boolean).join("\n"),
        categoria: Object.entries(RIESGO_CATEGORIA).find(([, n]) => n === borrador.categoria)?.[0] ?? "",
        probabilidad: borrador.probabilidad_sugerida || 3,
        impacto: borrador.impacto_sugerido || 3,
        controlExistente: borrador.controles_sugeridos || "",
        planTratamiento: borrador.plan_sugerido || "",
        impactoEconomico: borrador.impacto_economico ?? "",
      }
    : {};
  const inicial = riesgo
    ? { ...VACIO, ...Object.fromEntries(Object.keys(VACIO).map((k) => [k, riesgo[k] ?? VACIO[k]])), fechaRevision: riesgo.fechaRevision ? String(riesgo.fechaRevision).slice(0, 10) : "", impactoEconomico: riesgo.impactoEconomico ?? "", categoria: riesgo.categoria ?? "" }
    : { ...VACIO, tipo: tipoInicial, loginResponsable: rol === 3 ? login : "", fechaRevision: hoyISO(90), ...deFabi };
  const [f, setF] = useState(inicial);
  const [notas, setNotas] = useState("");
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const esOportunidad = Number(f.tipo) === 2;

  const guardar = async () => {
    const e = {};
    if (!f.nombre.trim()) e.nombre = "Escribe el nombre.";
    if (!f.loginResponsable) e.loginResponsable = "Asigna un responsable.";
    if (f.impactoEconomico !== "" && !(Number(String(f.impactoEconomico).replace(/[$,\s]/g, "")) >= 0)) e.impactoEconomico = "Escribe un monto en pesos.";
    setErrores(e);
    if (Object.keys(e).length) return;
    const cuerpo = { ...f, categoria: f.categoria === "" ? null : Number(f.categoria), impactoEconomico: f.impactoEconomico === "" ? null : f.impactoEconomico, fechaRevision: f.fechaRevision || null };
    try {
      setGuardando(true);
      if (riesgo) {
        const cambios = Object.fromEntries(Object.entries(cuerpo).filter(([k, v]) => String(v ?? "") !== String(inicial[k] ?? "")));
        if (!Object.keys(cambios).length) { toast.aviso("No hay cambios que guardar."); setGuardando(false); return; }
        const r = await sgcApi(`/riesgos/${riesgo.idRiesgo}`, { method: "PUT", body: { ...cambios, notas: notas.trim() || undefined } });
        toast.ok(`Cambios guardados · nivel ${r.nivel}`);
      } else {
        const r = await sgcApi("/riesgos", { method: "POST", body: cuerpo });
        toast.ok(`${RIESGO_TIPO[f.tipo]} registrado · nivel ${r.nivel}`);
        cuerpo.idRiesgo = r.idRiesgo;
      }
      avisarCambio();
      onGuardado(cuerpo);
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={riesgo ? `Editar ${RIESGO_TIPO[f.tipo].toLowerCase()}` : "Registrar riesgo u oportunidad"} ancho onClose={onClose} bloqueado={guardando}
      pie={<><button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button><BotonGuardar ocupado={guardando} icono="ti-device-floppy" onClick={guardar}>{riesgo ? "Guardar cambios" : "Registrar"}</BotonGuardar></>}>
      {!riesgo && (
        <div className="seg" role="radiogroup" aria-label="Tipo">
          {Object.entries(RIESGO_TIPO).map(([id, l]) => (
            <button key={id} type="button" role="radio" aria-checked={Number(f.tipo) === Number(id)} className={Number(f.tipo) === Number(id) ? "is-on" : ""} onClick={() => setF({ ...f, tipo: Number(id) })}>
              <i className={`ti ${id === "2" ? "ti-bulb" : "ti-alert-triangle"}`} /> {l}
            </button>
          ))}
        </div>
      )}
      <div className="rejilla">
        <Campo etq="Nombre" error={errores.nombre} className="full">
          <input className={`inp${errores.nombre ? " inp--error" : ""}`} maxLength={200} value={f.nombre} onChange={set("nombre")} placeholder={esOportunidad ? "Ej. Certificación FSSC 22000" : "Ej. Desabasto de material de empaque"} />
        </Campo>
        <Campo etq="Descripción" opcional className="full"><textarea className="inp" rows={2} value={f.descripcion} onChange={set("descripcion")} /></Campo>
        <div className="campo"><span className="campo__etq">Probabilidad</span><SelectorEscala nombre="Probabilidad" valor={Number(f.probabilidad)} etiquetas={PROBABILIDAD} onChange={set("probabilidad")} /></div>
        <div className="campo"><span className="campo__etq">Impacto</span><SelectorEscala nombre="Impacto" valor={Number(f.impacto)} etiquetas={IMPACTO} onChange={set("impacto")} /></div>
        <div className="full"><NivelGrande p={Number(f.probabilidad)} i={Number(f.impacto)} /></div>
        <Campo etq="Categoría" opcional>
          <select className="inp" value={f.categoria} onChange={set("categoria")}>
            <option value="">Sin categoría</option>
            {Object.entries(RIESGO_CATEGORIA).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </Campo>
        <Campo etq={esOportunidad ? "Beneficio económico estimado" : "Impacto económico"} opcional ayuda="Pesos mexicanos (MXN)" error={errores.impactoEconomico}>
          <div className="inp-pref"><span>$</span><input className={`inp num${errores.impactoEconomico ? " inp--error" : ""}`} inputMode="decimal" value={f.impactoEconomico} onChange={set("impactoEconomico")} placeholder="0" /></div>
        </Campo>
        <Campo etq="Responsable" error={errores.loginResponsable}><SelectUsuario value={f.loginResponsable} onChange={set("loginResponsable")} invalido={!!errores.loginResponsable} /></Campo>
        <Campo etq="Próxima revisión" opcional><input type="date" className="inp" value={f.fechaRevision} onChange={set("fechaRevision")} /></Campo>
        <Campo etq="Cláusula ISO" opcional><input className="inp mono" maxLength={20} value={f.clausulaISO} onChange={set("clausulaISO")} /></Campo>
        <Campo etq="Controles existentes" opcional className="full"><textarea className="inp" rows={2} value={f.controlExistente} onChange={set("controlExistente")} /></Campo>
        <Campo etq={esOportunidad ? "Plan para aprovecharla" : "Plan de tratamiento"} opcional className="full"><textarea className="inp" rows={3} value={f.planTratamiento} onChange={set("planTratamiento")} /></Campo>
        {riesgo && <Campo etq="Nota para el historial" opcional ayuda="Si la dejas vacía se registran los campos que cambiaron." className="full"><input className="inp" maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Reevaluación tras auditoría de proveedor" /></Campo>}
      </div>
    </Modal>
  );
}

// ── Cambio de estatus ────────────────────────────────────────────────────────
function CambioEstatus({ riesgo, onCambio }) {
  const toast = useToast();
  const [destino, setDestino] = useState(null);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (destino === 3 && !notas.trim()) return toast.error("Justifica por qué se acepta el riesgo.");
    try {
      setGuardando(true);
      await sgcApi(`/riesgos/${riesgo.idRiesgo}/estatus`, { method: "PUT", body: { idEstatus: destino, notas: notas.trim() || undefined } });
      toast.ok(`Estatus: ${RIESGO_ESTATUS[destino].label}`);
      setDestino(null); setNotas(""); avisarCambio(); onCambio();
    } catch (err) { toast.error(err.message); } finally { setGuardando(false); }
  };
  return (
    <div className="cajon__estatus">
      <div className="seg seg--chico" role="radiogroup" aria-label="Estatus">
        {Object.entries(RIESGO_ESTATUS).map(([id, e]) => {
          const n = Number(id); const actual = riesgo.idEstatus === n;
          return <button key={id} type="button" role="radio" aria-checked={actual || destino === n} className={actual ? "is-on" : destino === n ? "is-destino" : ""} disabled={actual || guardando} onClick={() => setDestino(destino === n ? null : n)}>{e.label}</button>;
        })}
      </div>
      {destino && (
        <div className="cajon__estatus-form">
          <textarea className="inp" rows={2} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={destino === 3 ? "Justificación (obligatoria)" : "Nota para el historial (opcional)"} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn btn--sm" onClick={() => setDestino(null)} disabled={guardando}>Descartar</button>
            <BotonGuardar className="btn btn--sm btn--primario" ocupado={guardando} onClick={guardar}>Pasar a «{RIESGO_ESTATUS[destino].label}»</BotonGuardar>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cajón lateral: detalle ────────────────────────────────────────────────────
function Cajon({ id, onClose, onEditar, version, onCambio }) {
  const { data: r, error, cargando, recargar } = useSgc(() => sgcApi(`/riesgos/${id}`), [id, version]);
  const serie = r ? [...r.historial].reverse().map((h) => ({ valor: h.nivel })) : [];
  return (
    <>
      <div className="cajon-fondo" onClick={onClose} />
      <aside className="cajon" aria-label="Detalle del registro">
        <header className="cajon__head">
          <div>
            <span className="cajon__kicker">{r ? `${r.tipoLabel}${r.categoriaLabel ? " · " + r.categoriaLabel : ""}` : "Cargando…"}</span>
            <h2>{r?.nombre || " "}</h2>
          </div>
          <button className="btn btn--fantasma btn--icono" onClick={onClose} aria-label="Cerrar"><i className="ti ti-x" /></button>
        </header>
        <div className="cajon__cuerpo">
          {error ? <ErrorCarga error={error} onReintentar={recargar} /> : cargando && !r ? <Skel filas={7} /> : (
            <>
              <NivelGrande p={r.probabilidad} i={r.impacto} />
              <div className="cajon__datos">
                <Dato label="Estatus"><span className={`tag t-${RIESGO_ESTATUS[r.idEstatus].tono}`}>{r.estatusLabel}</span></Dato>
                <Dato label={r.tipo === 2 ? "Beneficio estimado" : "Impacto económico"}><span className={`num strong${r.tipo === 1 && r.impactoEconomico > 0 ? " t-danger tinta" : ""}`}>{mxn(r.impactoEconomico)}</span></Dato>
                <Dato label="Responsable"><Persona nombre={r.responsable} login={r.loginResponsable} /></Dato>
                <Dato label="Próxima revisión">{r.fechaRevision ? fechaCorta(r.fechaRevision) : "Sin fecha"}</Dato>
                <Dato label="Cláusula ISO"><span className="mono">{r.clausulaISO || "—"}</span></Dato>
                <Dato label="Registrado">{fechaCorta(r.fechaCreacion)}</Dato>
              </div>
              {r.descripcion && <p className="cajon__texto">{r.descripcion}</p>}
              {r.controlExistente && <div className="cajon__bloque"><h3>Controles existentes</h3><p>{r.controlExistente}</p></div>}
              <div className="cajon__bloque"><h3>{r.tipo === 2 ? "Plan para aprovecharla" : "Plan de tratamiento"}</h3><p className={r.planTratamiento ? "" : "muted"}>{r.planTratamiento || "Sin plan registrado."}</p></div>
              {r.puedeEditar && <div className="cajon__bloque"><h3>Estatus</h3><CambioEstatus riesgo={r} onCambio={() => { recargar(); onCambio(); }} /></div>}
              <div className="cajon__bloque">
                <h3>Evolución del nivel</h3>
                <div className="cajon__evolucion">
                  <div className="cajon__spark"><Spark serie={serie} tono={NIVELES[nivelDe(r.nivel)].tono} /></div>
                  <Matriz mini resaltar={{ p: r.probabilidad, i: r.impacto }} />
                </div>
                <ol className="evolucion">
                  {r.historial.map((h, k) => {
                    const previo = r.historial[k + 1]; const delta = previo ? h.nivel - previo.nivel : 0;
                    return (
                      <li key={h.idHistorial}>
                        <Nivel nivel={h.nivel} conTexto={false} />
                        <div>
                          <p>{h.notas || "Actualización"}{delta !== 0 && <span className={`evolucion__delta t-${delta > 0 ? "danger" : "ok"}`}>{delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}</span>}</p>
                          <small>P{h.probabilidad} × I{h.impacto} · {h.nombre || h.login} · {fechaHora(h.fechaRegistro)}</small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </div>
        {r?.puedeEditar && <footer className="cajon__pie"><button className="btn btn--primario" onClick={() => onEditar(r)}><i className="ti ti-pencil" /> Editar</button></footer>}
      </aside>
    </>
  );
}

// ── Panel derecho: exposición económica ──────────────────────────────────────
function CardExposicion({ monto, lista }) {
  const sparkData = lista.slice(0, 12).map((r) => Number(r.impactoEconomico) || 0);
  return (
    <div className="rsk-card">
      <div className="rsk-card__head">
        <div className="rsk-card__ico"><i className="ti ti-currency-dollar" /></div>
        <span>Exposición económica</span>
        <i className="ti ti-chevron-right rsk-card__arr" />
      </div>
      <div className="rsk-card__monto">
        <strong>${Number(monto).toLocaleString("es-MX")}</strong>
        <span className="rsk-card__moneda">MXN</span>
      </div>
      <p className="rsk-card__sub">Riesgos activos</p>
      {sparkData.length > 0 && (
        <svg className="rsk-card__spark" viewBox={`0 0 ${sparkData.length * 10} 36`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const max = Math.max(1, ...sparkData);
            const pts = sparkData.map((v, i) => `${i * 10 + 5},${36 - (v / max) * 28}`).join(" ");
            const area = `${5},36 ${pts} ${(sparkData.length - 1) * 10 + 5},36`;
            return (
              <>
                <polygon points={area} fill="url(#expGrad)" />
                <polyline points={pts} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" />
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

// ── Panel derecho: niveles ────────────────────────────────────────────────────
function CardNiveles({ lista }) {
  const alto   = lista.filter((r) => nivelDe(r.nivel) === "alto").length;
  const medio  = lista.filter((r) => nivelDe(r.nivel) === "medio").length;
  const bajo   = lista.filter((r) => nivelDe(r.nivel) === "bajo").length;
  const total  = Math.max(1, lista.length);
  return (
    <div className="rsk-card">
      <h4 className="rsk-card__titulo">Niveles de riesgo</h4>
      <div className="rsk-niveles">
        <div className="rsk-nivel">
          <span className="rsk-nivel__dot" style={{ background: "#ef4444" }} />
          <span className="rsk-nivel__label">Alto</span>
          <span className="rsk-nivel__rango mono">13 – 25</span>
          <span className="rsk-nivel__num">{alto} registros</span>
          <div className="rsk-nivel__track"><div className="rsk-nivel__fill" style={{ width: `${(alto / total) * 100}%`, background: "#ef4444" }} /></div>
        </div>
        <div className="rsk-nivel">
          <span className="rsk-nivel__dot" style={{ background: "#f59e0b" }} />
          <span className="rsk-nivel__label">Medio</span>
          <span className="rsk-nivel__rango mono">5 – 12</span>
          <span className="rsk-nivel__num">{medio} registros</span>
          <div className="rsk-nivel__track"><div className="rsk-nivel__fill" style={{ width: `${(medio / total) * 100}%`, background: "#f59e0b" }} /></div>
        </div>
        <div className="rsk-nivel">
          <span className="rsk-nivel__dot" style={{ background: "#10b981" }} />
          <span className="rsk-nivel__label">Bajo</span>
          <span className="rsk-nivel__rango mono">1 – 4</span>
          <span className="rsk-nivel__num">{bajo} registros</span>
          <div className="rsk-nivel__track"><div className="rsk-nivel__fill" style={{ width: `${(bajo / total) * 100}%`, background: "#10b981" }} /></div>
        </div>
      </div>
    </div>
  );
}

// ── Panel derecho: cómo se calcula ───────────────────────────────────────────
function CardCalculo() {
  return (
    <div className="rsk-card rsk-card--info">
      <div className="rsk-card__head">
        <div className="rsk-card__ico rsk-card__ico--info"><i className="ti ti-bulb" /></div>
        <span>¿Cómo se calcula?</span>
        <i className="ti ti-chevron-right rsk-card__arr" />
      </div>
      <p className="rsk-card__desc">El nivel de riesgo se obtiene multiplicando la probabilidad por el impacto del evento.</p>
    </div>
  );
}

const FILTRO_ESTATUS = [
  { id: "1", label: "Activos" },
  { id: "2", label: "Mitigados" },
  { id: "3", label: "Aceptados" },
  { id: "", label: "Todos" },
];

// ── Página principal ─────────────────────────────────────────────────────────
export default function Riesgos() {
  const navigate = useNavigate();
  const { idRiesgo } = useParams();
  const { rol } = useOutletContext();
  const sel = idRiesgo ? Number(idRiesgo) : null;
  const [tipo, setTipo] = useState(1);
  const [estatus, setEstatus] = useState("1");
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(null);
  const [version, setVersion] = useState(0);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi("/riesgos"), [version]);
  useMigas([{ to: "/sgc/dashboard", label: "SGI" }, { label: "Riesgos y oportunidades" }]);

  // ?nuevo=1 (paleta Ctrl+K o Fab-i con location.state.borrador): abre el alta y limpia el parámetro
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  useEffect(() => {
    if (params.get("nuevo") !== "1") return;
    if ([1, 2, 3].includes(rol)) setModal({ nuevo: true, borrador: location.state?.borrador || null });
    const p = new URLSearchParams(params);
    p.delete("nuevo");
    setParams(p, { replace: true });
  }, [params, setParams, rol, location.state]);

  const todos = data || [];
  const cuenta = (t) => todos.filter((r) => r.tipo === t && (!estatus || String(r.idEstatus) === estatus)).length;
  const lista = useMemo(
    () => todos.filter((r) =>
      r.tipo === tipo &&
      (!estatus || String(r.idEstatus) === estatus) &&
      (!categoria || String(r.categoria) === categoria) &&
      (!busqueda || r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    ),
    [todos, tipo, estatus, categoria, busqueda],
  );
  // Para los paneles laterales: sin filtro de búsqueda (solo tipo + estatus)
  const listaBase = useMemo(
    () => todos.filter((r) => r.tipo === tipo && (!estatus || String(r.idEstatus) === estatus)),
    [todos, tipo, estatus],
  );
  const altos = listaBase.filter((r) => nivelDe(r.nivel) === "alto").length;
  const monto = listaBase.reduce((s, r) => s + (Number(r.impactoEconomico) || 0), 0);
  const abrir = (r) => navigate(`/sgc/riesgos/${r.idRiesgo}`);
  const cerrar = () => navigate("/sgc/riesgos");
  const refrescar = () => setVersion((v) => v + 1);
  const puedeRegistrar = [1, 2, 3].includes(rol);

  const exportar = () => {
    const cab = ["Nombre", "Categoría", "Nivel", "Impacto económico", "Responsable", "Próxima revisión", "Estado"].join(",");
    const filas = lista.map((r) => [
      `"${r.nombre.replace(/"/g, '""')}"`,
      r.categoriaLabel || "",
      r.nivel,
      r.impactoEconomico || "",
      r.responsable || r.loginResponsable || "",
      r.fechaRevision ? String(r.fechaRevision).slice(0, 10) : "",
      r.estatusLabel || "",
    ].join(","));
    const blob = new Blob([[cab, ...filas].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "riesgos.csv"; a.click();
  };

  return (
    <div className="sg-page rsk-page">
      <Encabezado
        kicker="ISO 9001 · 6.1"
        titulo="Riesgos y oportunidades"
        desc="Nivel = probabilidad × impacto. Menor a 5 bajo, de 5 a 12 medio, mayor a 12 alto."
        acciones={puedeRegistrar && (
          <button className="btn btn--primario" onClick={() => setModal({ nuevo: true })}>
            <i className="ti ti-plus" /> Registrar
          </button>
        )}
      />

      {/* Pestañas */}
      <div className="rsk-tabs" role="tablist" aria-label="Tipo de registro">
        {Object.keys(RIESGO_TIPO).map((id) => (
          <button key={id} role="tab" type="button" aria-selected={tipo === Number(id)}
            className={`rsk-tab${tipo === Number(id) ? " is-on" : ""}`}
            onClick={() => setTipo(Number(id))}>
            <i className={`ti ${id === "2" ? "ti-bulb" : "ti-alert-triangle"}`} />
            {id === "1" ? "Riesgos" : "Oportunidades"}
            <span className="rsk-tab__num">{data ? cuenta(Number(id)) : "·"}</span>
          </button>
        ))}
      </div>

      {/* Filtros + resumen */}
      <div className="rsk-filtros">
        <div className="rsk-filtros__izq">
          <div className="seg seg--chico" role="radiogroup" aria-label="Estatus">
            {FILTRO_ESTATUS.map((e) => (
              <button key={e.id} type="button" role="radio" aria-checked={estatus === e.id}
                className={estatus === e.id ? "is-on" : ""} onClick={() => setEstatus(e.id)}>
                {e.label}
              </button>
            ))}
          </div>
          <select className="inp inp--sm" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" style={{ minWidth: 160 }}>
            <option value="">Todas las categorías</option>
            {Object.entries(RIESGO_CATEGORIA).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </div>
        {data && (
          <div className="rsk-filtros__der">
            <span className="rsk-stat"><b>{listaBase.length}</b> registros</span>
            {tipo === 1 && altos > 0 && (
              <span className="rsk-stat rsk-stat--alto"><b>{altos}</b> nivel alto</span>
            )}
            {tipo === 1 && (
              <span className="rsk-stat rsk-stat--exp">
                Exposición <b>{mxn(monto)}</b>
              </span>
            )}
          </div>
        )}
      </div>

      {error ? (
        <ErrorCarga error={error} onReintentar={recargar} />
      ) : cargando && !data ? (
        <div className="pnl"><Skel filas={8} /></div>
      ) : (
        <>
          {/* Fila: Matriz + Panel derecho */}
          <div className="rsk-main">
            <div className="rsk-matriz-wrap">
              <div className="rsk-panel">
                <div className="rsk-panel__head">
                  <i className="ti ti-layout-grid" />
                  <h3>Matriz de probabilidad × impacto</h3>
                  <span className="rsk-panel__sub">Cada punto es un registro; selecciónalo para ver su detalle.</span>
                </div>
                <Matriz riesgos={listaBase} sel={sel} onPunto={abrir} />
              </div>
            </div>
            <div className="rsk-sidebar">
              <CardExposicion monto={monto} lista={listaBase} />
              {tipo === 1 && <CardNiveles lista={listaBase} />}
              <CardCalculo />
            </div>
          </div>

          {/* Tabla */}
          <div className="rsk-panel rsk-panel--tabla">
            <div className="rsk-panel__head">
              <i className="ti ti-shield-check" />
              <h3>{tipo === 1 ? "Riesgos" : "Oportunidades"}</h3>
              <span className="rsk-tabla__cuenta">{lista.length}</span>
              <div style={{ flex: 1 }} />
              <div className="rsk-tabla__buscar">
                <i className="ti ti-search" />
                <input className="inp inp--sm" placeholder="Buscar riesgo, categoría..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
              <select className="inp inp--sm" value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">Todas las categorías</option>
                {Object.entries(RIESGO_CATEGORIA).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
              <button className="btn btn--sm" onClick={exportar}>
                <i className="ti ti-download" /> Exportar
              </button>
            </div>

            {!lista.length ? (
              <Vacio
                icono={tipo === 1 ? "ti-shield-check" : "ti-bulb"}
                titulo={todos.length ? "No hay registros con estos filtros" : `Aún no hay ${tipo === 1 ? "riesgos" : "oportunidades"} registrados`}
                texto={todos.length ? "Cambia el estatus o la categoría." : "Registra el primero para verlo en la matriz."}
                accion={puedeRegistrar && !todos.length ? (
                  <button className="btn btn--primario" onClick={() => setModal({ nuevo: true })}>
                    <i className="ti ti-plus" /> Registrar
                  </button>
                ) : null}
              />
            ) : (
              <div className="tabla-wrap">
                <table className="tabla tabla--compacta">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Categoría</th>
                      <th>Nivel</th>
                      <th className="der">{tipo === 1 ? "Impacto económico" : "Beneficio estimado"}</th>
                      <th>Responsable</th>
                      <th>Próxima revisión</th>
                      <th>Estado</th>
                      <th className="fit" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((r) => {
                      const vencida = r.fechaRevision && String(r.fechaRevision).slice(0, 10) < hoyISO();
                      return (
                        <tr key={r.idRiesgo} className={`link${sel === r.idRiesgo ? " is-sel" : ""}`}
                          onClick={() => abrir(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && abrir(r)}>
                          <td>
                            <span className="celda-titulo">{r.nombre}</span>
                          </td>
                          <td className="muted">{r.categoriaLabel || "—"}</td>
                          <td><Nivel nivel={r.nivel} /></td>
                          <td className="der num">{mxn(r.impactoEconomico)}</td>
                          <td><Persona nombre={r.responsable} login={r.loginResponsable} /></td>
                          <td className={vencida && r.idEstatus === 1 ? "t-danger tinta" : "muted"}>
                            {r.fechaRevision ? fechaCorta(r.fechaRevision) : "—"}
                            {vencida && r.idEstatus === 1 && <i className="ti ti-alert-circle" style={{ marginLeft: 4 }} />}
                          </td>
                          <td>
                            <span className={`rsk-badge rsk-badge--${RIESGO_ESTATUS[r.idEstatus].tono}`}>
                              <span className="rsk-badge__dot" />
                              {r.estatusLabel}
                            </span>
                          </td>
                          <td className="fit" onClick={(e) => e.stopPropagation()}>
                            <button className="btn btn--fantasma btn--icono btn--sm" onClick={() => abrir(r)} title="Ver detalle">
                              <i className="ti ti-dots-vertical" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {sel && <Cajon id={sel} version={version} onClose={cerrar} onEditar={(r) => setModal({ riesgo: r })} onCambio={refrescar} />}
      {modal && (
        <ModalRiesgo
          riesgo={modal.riesgo}
          borrador={modal.borrador}
          tipoInicial={tipo}
          onClose={() => setModal(null)}
          onGuardado={(r) => {
            setModal(null); refrescar();
            if (r.idRiesgo && !modal.riesgo) navigate(`/sgc/riesgos/${r.idRiesgo}`);
          }}
        />
      )}
    </div>
  );
}
