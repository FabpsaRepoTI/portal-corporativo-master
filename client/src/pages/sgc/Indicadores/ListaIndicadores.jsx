// pages/sgc/Indicadores/ListaIndicadores.jsx
// Tablero de indicadores: cada tarjeta muestra el último valor, la variación
// contra el periodo anterior (coloreada según el sentido de la meta), una
// sparkline con la línea de meta y el semáforo. Distribución por semáforo arriba.
import { useCallback, useState } from "react";
import PanelLateral, { PanelSplit, RUTA_COMPLETA } from "../../../components/sgc/PanelLateral";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { BotonGuardar, Campo, Distribucion, Encabezado, ErrorCarga, Modal, Panel, SelectUsuario, Skel, Spark, Vacio, useMigas, useToast } from "../components/ui";
import { sgcApi, useSgc, periodoLabel, FRECUENCIA, SEMAFORO, SENTIDO } from "../sgcApi";

export const fmt = (v, unidad) => (v == null ? "—" : `${Number(v).toLocaleString("es-MX", { maximumFractionDigits: 2 })}${unidad ? ` ${unidad}` : ""}`);

/** Variación vs. periodo anterior: verde si mejora según el sentido de la meta. */
export function Delta({ actual, anterior, sentido = 1, unidad }) {
  if (actual == null || anterior == null) return null;
  const d = Math.round((actual - anterior) * 100) / 100;
  if (d === 0) return <span className="delta t-neutral">= sin cambio</span>;
  const mejora = sentido === 2 ? d < 0 : d > 0;
  return (
    <span className={`delta t-${mejora ? "ok" : "danger"}`} title={`${mejora ? "Mejora" : "Empeora"} respecto al periodo anterior`}>
      <i className={`ti ${d > 0 ? "ti-arrow-up-right" : "ti-arrow-down-right"}`} />
      {d > 0 ? "+" : ""}
      {fmt(d, unidad === "%" ? "pts" : unidad)}
    </span>
  );
}

function ModalIndicador({ onClose, onCreado }) {
  const toast = useToast();
  const [f, setF] = useState({ nombre: "", descripcion: "", unidad: "%", meta: "", frecuencia: "1", sentido: "1", loginResponsable: "", clausulaISO: "9.1.3", formulaCalculo: "" });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const e = {};
    if (!f.nombre.trim()) e.nombre = "Escribe el nombre.";
    if (f.meta === "" || Number.isNaN(Number(f.meta))) e.meta = "Captura una meta numérica.";
    if (!f.loginResponsable) e.loginResponsable = "Asigna un responsable.";
    setErrores(e);
    if (Object.keys(e).length) return;
    try {
      setGuardando(true);
      const r = await sgcApi("/indicadores", { method: "POST", body: { ...f, meta: Number(f.meta), frecuencia: Number(f.frecuencia), sentido: Number(f.sentido) } });
      toast.ok(`Indicador ${r.clave} creado`);
      onCreado(r);
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Nuevo indicador"
      ancho
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <BotonGuardar ocupado={guardando} icono="ti-device-floppy" onClick={guardar}>
            Crear indicador
          </BotonGuardar>
        </>
      }
    >
      <div className="rejilla rejilla--3">
        <Campo etq="Nombre" error={errores.nombre} className="full">
          <input className={`inp${errores.nombre ? " inp--error" : ""}`} maxLength={120} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Satisfacción del cliente" />
        </Campo>
        <Campo etq="Meta" error={errores.meta}>
          <input className={`inp${errores.meta ? " inp--error" : ""}`} type="number" step="0.01" value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} />
        </Campo>
        <Campo etq="Unidad" opcional>
          <input className="inp" maxLength={20} value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} placeholder="%, días, pzas…" />
        </Campo>
        <Campo etq="Frecuencia">
          <select className="inp" value={f.frecuencia} onChange={(e) => setF({ ...f, frecuencia: e.target.value })}>
            {Object.entries(FRECUENCIA).map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </Campo>
        <div className="full">
          <span className="campo__etq" style={{ marginBottom: 6 }}>
            Sentido de la meta
          </span>
          <div className="seg" role="radiogroup" aria-label="Sentido de la meta">
            {Object.entries(SENTIDO).map(([id, l]) => (
              <button key={id} type="button" role="radio" aria-checked={f.sentido === id} className={f.sentido === id ? "is-on" : ""} onClick={() => setF({ ...f, sentido: id })}>
                <i className={`ti ${id === "1" ? "ti-trending-up" : "ti-trending-down"}`} /> {l}
              </button>
            ))}
          </div>
        </div>
        <Campo etq="Responsable" error={errores.loginResponsable}>
          <SelectUsuario value={f.loginResponsable} onChange={(l) => setF({ ...f, loginResponsable: l })} invalido={!!errores.loginResponsable} />
        </Campo>
        <Campo etq="Cláusula ISO" opcional>
          <input className="inp mono" maxLength={20} value={f.clausulaISO} onChange={(e) => setF({ ...f, clausulaISO: e.target.value })} />
        </Campo>
        <div />
        <Campo etq="Fórmula de cálculo" opcional className="full">
          <input className="inp" maxLength={500} value={f.formulaCalculo} onChange={(e) => setF({ ...f, formulaCalculo: e.target.value })} placeholder="Ej. clientes satisfechos / encuestados × 100" />
        </Campo>
        <Campo etq="Descripción" opcional className="full">
          <textarea className="inp" rows={2} maxLength={500} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </Campo>
      </div>
    </Modal>
  );
}

// Colores concretos por tono (para SVG donde var() no funciona en atributos)
const TONO_COLOR = { ok: "#10b981", warn: "#f59e0b", danger: "#ef4444", neutral: "#9ca3af" };
const TONO_BG    = { ok: "#d1fae5", warn: "#fef3c7", danger: "#fee2e2", neutral: "#f3f4f6" };
const TONO_TEXTO = { ok: "#065f46", warn: "#92400e", danger: "#991b1b", neutral: "#4b5563" };

// Iconos representativos por prefijo de clave
function iconoIndicador(clave = "") {
  const c = clave.toUpperCase();
  if (c.startsWith("AC")) return "ti-circle-check";
  if (c.startsWith("AUD")) return "ti-clipboard-check";
  if (c.startsWith("NC")) return "ti-alert-circle";
  if (c.startsWith("PRB")) return "ti-package";
  if (c.startsWith("IND")) return "ti-chart-bar";
  return "ti-chart-line";
}

/** Panel superior: dona + barra segmentada */
function PanelEstado({ dist, total, sel, onSel }) {
  // Dona SVG pura
  const R = 52; const r = 32; const cx = 68; const cy = 68;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const sectores = dist.filter(d => d.total > 0).map(d => {
    const frac = d.total / (total || 1);
    const dash = frac * circ;
    const seg = { ...d, dash, offset, frac };
    offset += dash;
    return seg;
  });

  return (
    <div className="ind-estado pnl">
      <div className="ind-estado__dona-wrap">
        <p className="ind-estado__titulo">Estado de los indicadores</p>
        <div className="ind-estado__dona-area">
          <svg width={136} height={136} viewBox="0 0 136 136" aria-hidden="true">
            {total === 0 ? (
              <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e5e7eb" strokeWidth={R - r} />
            ) : sectores.map(d => (
              <circle key={d.id} cx={cx} cy={cy} r={R} fill="none"
                stroke={TONO_COLOR[d.tono]} strokeWidth={R - r}
                strokeDasharray={`${d.dash} ${circ - d.dash}`}
                strokeDashoffset={circ / 4 - d.offset}
                style={{ transition: "stroke-dasharray 0.5s ease", cursor: "pointer", opacity: sel && sel !== d.id ? 0.3 : 1 }}
                onClick={() => onSel(sel === d.id ? null : d.id)}
              />
            ))}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#9ca3af">indicadores</text>
          </svg>
          <ul className="ind-estado__leyenda">
            {dist.map(d => (
              <li key={d.id}>
                <button type="button" className={`ind-estado__leg-item${sel === d.id ? " is-sel" : ""}`}
                  onClick={() => onSel(sel === d.id ? null : d.id)} disabled={!d.total}>
                  <span className="ind-estado__punto" style={{ background: TONO_COLOR[d.tono] }} />
                  <span className="ind-estado__leg-label">{d.label}</span>
                  <b className="ind-estado__leg-num">{d.total}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="ind-estado__barra-wrap">
        <div className="ind-estado__barra-seg">
          {dist.filter(d => d.total > 0).map(d => (
            <div key={d.id} className="ind-estado__seg" style={{ flex: d.total, background: TONO_COLOR[d.tono] }}>
              <span className="ind-estado__seg-pct">{Math.round(d.total / (total || 1) * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="ind-estado__barra-leg">
          {dist.map(d => (
            <div key={d.id} className="ind-estado__barra-col" style={{ flex: Math.max(d.total, 0.5) }}>
              <span className="ind-estado__barra-dot" style={{ background: TONO_COLOR[d.tono] }} />
              <strong style={{ color: TONO_COLOR[d.tono] }}>{d.total} {d.label.toLowerCase()}</strong>
              <small>{d.id === "sin" ? "Sin datos disponibles" : d.id === "verde" ? "Cumpliendo el objetivo" : d.id === "amarillo" ? "Requieren seguimiento" : "Acción recomendada"}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ListaIndicadores() {
  const navigate = useNavigate();
  const { rol } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const [nuevo, setNuevo] = useState(false);
  const [sel, setSel] = useState(null); // { id, folio } en el panel lateral
  const cerrarPanel = useCallback(() => setSel(null), []);
  const f = { frecuencia: params.get("frecuencia") || "", semaforo: params.get("semaforo") || "", activo: params.get("activo") || "1" };
  useMigas([{ label: "Indicadores" }]);
  const setFiltro = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const consulta = new URLSearchParams();
  if (f.frecuencia) consulta.set("frecuencia", f.frecuencia);
  if (f.activo) consulta.set("activo", f.activo);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi(`/indicadores?${consulta}`), [consulta.toString()]);
  const puedeCrear = rol === 1 || rol === 4;

  const clave = (i) => i.semaforo || "sin";
  const lista = (data || []).filter((i) => !f.semaforo || clave(i) === f.semaforo);
  const dist = [
    ...Object.entries(SEMAFORO).map(([k, s]) => ({ id: k, label: s.label, tono: s.tono, total: (data || []).filter((i) => i.semaforo === k).length })),
    { id: "sin", label: "Sin medición", tono: "neutral", total: (data || []).filter((i) => !i.semaforo).length },
  ];
  const total = (data || []).length;

  return (
    <div className="sg-page">
      <Encabezado
        kicker="Desempeño · ISO 9001 cl. 9.1"
        titulo="Indicadores"
        cuenta={data ? data.length : null}
        desc="Seguimiento y medición de los objetivos del sistema de gestión."
        acciones={
          <>
            <select className="inp" style={{ width: 150 }} value={f.frecuencia} onChange={(e) => setFiltro("frecuencia", e.target.value)} aria-label="Frecuencia">
              <option value="">Toda frecuencia</option>
              {Object.entries(FRECUENCIA).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
            <select className="inp" style={{ width: 120 }} value={f.activo} onChange={(e) => setFiltro("activo", e.target.value)} aria-label="Estado">
              <option value="1">Activos</option>
              <option value="0">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            {puedeCrear && (
              <button className="btn btn--primario" onClick={() => setNuevo(true)}>
                <i className="ti ti-plus" /> Nuevo indicador
              </button>
            )}
          </>
        }
      />

      {data && data.length > 0 && (
        <PanelEstado dist={dist} total={total} sel={f.semaforo || null} onSel={(id) => setFiltro("semaforo", id ?? "")} />
      )}

      <PanelSplit
        abierto={!!sel}
        onClose={cerrarPanel}
        panel={sel && <PanelLateral registro={sel} modulo="indicador" onClose={cerrarPanel} onAbrirCompleto={(m, id) => navigate(RUTA_COMPLETA[m](id))} />}
      >
      {error && !data ? (
        <div className="pnl">
          <ErrorCarga error={error} onReintentar={recargar} />
        </div>
      ) : !data ? (
        <div className="ind-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="pnl"><Skel filas={5} /></div>)}
        </div>
      ) : !lista.length ? (
        <Panel>
          <Vacio icono="ti-chart-bar-off" titulo="Sin indicadores" texto={data.length ? "Ningún indicador coincide con el filtro." : "Define el primer indicador del sistema de gestión."} />
        </Panel>
      ) : (
        <div className={`ind-grid${cargando ? " recargando" : ""}`}>
          {lista.map((i) => {
            const s = i.semaforo ? SEMAFORO[i.semaforo] : null;
            const tono = s ? s.tono : "neutral";
            const icono = iconoIndicador(i.clave);
            return (
              <button key={i.idIndicador} type="button" className={`ind t-${tono}${sel?.id === i.idIndicador ? " is-sel" : ""}`} onClick={() => setSel({ id: i.idIndicador, folio: i.clave })}>
                <div className="ind__head">
                  <div className="ind__head-left">
                    <div className="ind__icono" style={{ background: TONO_BG[tono], color: TONO_COLOR[tono] }}>
                      <i className={`ti ${icono}`} />
                    </div>
                    <div>
                      <span className="ind__clave">{i.clave}</span>
                      <h3 className="ind__nombre">{i.nombre}</h3>
                    </div>
                  </div>
                  <span className="ind__badge" style={{ background: TONO_BG[tono], color: TONO_TEXTO[tono] }}>
                    {s ? s.label : "Sin medición"}
                  </span>
                </div>
                <div className="ind__valor">
                  <strong>
                    {fmt(i.ultimoValor)}
                    {i.ultimoValor != null && i.unidad && <small>{i.unidad}</small>}
                  </strong>
                  <Delta actual={i.ultimoValor} anterior={i.valorAnterior} sentido={i.sentido} unidad={i.unidad} />
                </div>
                <div className="ind__meta">meta {i.sentido === 2 ? "≤" : "≥"} {fmt(i.meta, i.unidad)}</div>
                <Spark serie={i.serie} meta={i.meta} tono={tono} />
                <div className="ind__pie">
                  <span><i className="ti ti-calendar" /> {FRECUENCIA[i.frecuencia]} · {i.ultimoPeriodo ? periodoLabel(i.ultimoPeriodo) : "sin registros"}</span>
                  <span><i className="ti ti-user" /> {i.responsable || "Sin responsable"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      </PanelSplit>

      {nuevo && (
        <ModalIndicador
          onClose={() => setNuevo(false)}
          onCreado={(r) => { setNuevo(false); navigate(`/sgc/indicadores/${r.idIndicador}`); }}
        />
      )}
    </div>
  );
}
