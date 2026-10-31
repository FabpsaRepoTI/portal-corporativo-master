// pages/sgc/Indicadores/DetalleIndicador.jsx
// Indicador: lectura actual (valor, variación, meta), tendencia contra la
// meta (recharts; cada punto con el color de su semáforo), histórico y
// registro de valores. Los colores de la gráfica salen de los tokens del tema.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Area, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BotonGuardar, Campo, Dato, ErrorCarga, Modal, Panel, Persona, SelectUsuario, Skel, Vacio, useMigas, useToast, useTokens, TituloSub, Volver } from "../components/ui";
import { sgcApi, useSgc, periodoLabel, fechaHora, FRECUENCIA, SEMAFORO, SENTIDO } from "../sgcApi";
import { Delta, fmt } from "./ListaIndicadores";

function ModalValor({ ind, onClose, onGuardado }) {
  const toast = useToast();
  const hoy = new Date();
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const [periodo, setPeriodo] = useState(actual);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  const duplicado = ind.valores.some((v) => String(v.periodo).slice(0, 7) === periodo);
  const guardar = async () => {
    if (!periodo || valor === "" || Number.isNaN(Number(valor))) return toast.aviso("Captura el periodo y un valor numérico.");
    if (duplicado) return;
    try {
      setGuardando(true);
      await sgcApi(`/indicadores/${ind.idIndicador}/valores`, { method: "POST", body: { periodo, valor: Number(valor), observaciones: obs } });
      toast.ok(`Valor de ${periodoLabel(periodo)} registrado`);
      onGuardado();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };
  return (
    <Modal
      titulo="Registrar medición"
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <BotonGuardar ocupado={guardando} icono="ti-device-floppy" onClick={guardar} disabled={duplicado}>
            Registrar
          </BotonGuardar>
        </>
      }
    >
      <div className="rejilla">
        <Campo etq="Periodo" error={duplicado ? `${periodoLabel(periodo)} ya tiene valor.` : null}>
          <input type="month" className={`inp${duplicado ? " inp--error" : ""}`} max={actual} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </Campo>
        <Campo etq={`Valor${ind.unidad ? ` (${ind.unidad})` : ""}`} ayuda={`Meta ${ind.sentido === 2 ? "≤" : "≥"} ${fmt(ind.meta, ind.unidad)}`}>
          <input type="number" step="0.01" className="inp" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo etq="Observaciones" opcional className="full">
          <textarea className="inp" rows={3} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}

function ModalEditar({ ind, onClose, onGuardado }) {
  const toast = useToast();
  const [meta, setMeta] = useState(String(ind.meta ?? ""));
  const [resp, setResp] = useState(ind.loginResponsable || "");
  const [sentido, setSentido] = useState(ind.sentido || 1);
  const [activo, setActivo] = useState(ind.activo);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (meta === "" || Number.isNaN(Number(meta))) return toast.aviso("La meta debe ser numérica.");
    if (!resp) return toast.aviso("Asigna un responsable.");
    try {
      setGuardando(true);
      await sgcApi(`/indicadores/${ind.idIndicador}`, { method: "PATCH", body: { meta: Number(meta), loginResponsable: resp, activo, sentido } });
      toast.ok("Indicador actualizado");
      onGuardado();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };
  return (
    <Modal
      titulo="Ajustar indicador"
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <BotonGuardar ocupado={guardando} icono="ti-device-floppy" onClick={guardar}>
            Guardar
          </BotonGuardar>
        </>
      }
    >
      <Campo etq={`Meta${ind.unidad ? ` (${ind.unidad})` : ""}`}>
        <input type="number" step="0.01" className="inp" value={meta} onChange={(e) => setMeta(e.target.value)} />
      </Campo>
      <div className="campo">
        <span className="campo__etq">Sentido de la meta</span>
        <div className="seg" role="radiogroup" aria-label="Sentido de la meta">
          {Object.entries(SENTIDO).map(([id, l]) => (
            <button key={id} type="button" role="radio" aria-checked={sentido === Number(id)} className={sentido === Number(id) ? "is-on" : ""} onClick={() => setSentido(Number(id))}>
              <i className={`ti ${id === "1" ? "ti-trending-up" : "ti-trending-down"}`} /> {l}
            </button>
          ))}
        </div>
        <span className="campo__ayuda">Define cuándo el semáforo está en verde (p. ej. una tasa de reincidencia es «menor es mejor»).</span>
      </div>
      <Campo etq="Responsable">
        <SelectUsuario value={resp} onChange={setResp} />
      </Campo>
      <label className="check">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Indicador activo
      </label>
    </Modal>
  );
}

function TooltipValor({ active, payload, unidad, meta }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const s = p.semaforo ? SEMAFORO[p.semaforo] : null;
  return (
    <div className="tooltip">
      <b>{periodoLabel(p.periodo)}</b>
      {fmt(p.valor, unidad)} · meta {fmt(meta, unidad)}
      {s && <div className={`est t-${s.tono}`}>{s.label}</div>}
    </div>
  );
}

export default function DetalleIndicador() {
  const { idIndicador } = useParams();
  const { data: ind, error, recargar } = useSgc(() => sgcApi(`/indicadores/${idIndicador}`), [idIndicador]);
  const [modal, setModal] = useState(null);
  const t = useTokens(["--brand", "--ok", "--warn", "--danger", "--muted", "--line", "--panel", "--faint"]);
  useMigas([{ to: "/sgc/indicadores", label: "Indicadores" }, { label: ind?.clave || "…" }]);

  if (error && !ind) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <ErrorCarga error={error} onReintentar={recargar} />
        </div>
      </div>
    );
  }
  if (!ind) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <Skel filas={12} />
        </div>
      </div>
    );
  }

  const s = ind.semaforo ? SEMAFORO[ind.semaforo] : null;
  const colorSem = { verde: t["--ok"], amarillo: t["--warn"], rojo: t["--danger"] };
  const datos = ind.valores.map((v) => ({ ...v, etiqueta: periodoLabel(v.periodo) }));
  const valoresY = [...datos.map((d) => d.valor), ind.meta ?? 0];
  const minY = Math.min(...valoresY);
  const maxY = Math.max(...valoresY);
  const margen = (maxY - minY || Math.abs(maxY) || 1) * 0.18;
  const anterior = ind.valores.length > 1 ? ind.valores[ind.valores.length - 2].valor : null;
  const enMeta = ind.valores.filter((v) => v.semaforo === "verde").length;

  const Punto = ({ cx, cy, payload }) =>
    cx == null ? null : <circle cx={cx} cy={cy} r={4.5} fill={t["--panel"]} stroke={colorSem[payload.semaforo] || t["--brand"]} strokeWidth={2.25} />;

  return (
    <div className="sg-page">
      <header className="registro">
        <Volver />
        <div className="registro__sello">
          <span className="folio t-ok">{ind.clave}</span>
          {ind.clausulaISO && <span className="tag tag--linea">cl. {ind.clausulaISO}</span>}
          <span className="tag tag--linea">{FRECUENCIA[ind.frecuencia]}</span>
          <span className="tag tag--linea">
            <i className={`ti ${ind.sentido === 2 ? "ti-trending-down" : "ti-trending-up"}`} /> {SENTIDO[ind.sentido || 1]}
          </span>
          {!ind.activo && <span className="tag t-neutral">Inactivo</span>}
        </div>
        <div className="registro__fila">
          <TituloSub texto={ind.nombre} />
          <div className="registro__acciones">
            {ind.puedeEditar && (
              <button className="btn" onClick={() => setModal("editar")}>
                <i className="ti ti-adjustments" /> Ajustar
              </button>
            )}
            {ind.puedeRegistrar && ind.activo && (
              <button className="btn btn--primario" onClick={() => setModal("valor")}>
                <i className="ti ti-plus" /> Registrar medición
              </button>
            )}
          </div>
        </div>
        {ind.descripcion && (
          <p className="sg-head__desc" style={{ marginTop: 8 }}>
            {ind.descripcion}
          </p>
        )}
        <dl className="hechos">
          <div className="hecho" style={{ flexBasis: 240 }}>
            <dt>Última medición · {ind.ultimoPeriodo ? periodoLabel(ind.ultimoPeriodo) : "sin registros"}</dt>
            <dd style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }} className="num">
                {fmt(ind.ultimoValor, ind.unidad)}
              </span>
              <Delta actual={ind.ultimoValor} anterior={anterior} sentido={ind.sentido} unidad={ind.unidad} />
            </dd>
          </div>
          <div className="hecho">
            <dt>Meta</dt>
            <dd className="num">
              {ind.sentido === 2 ? "≤" : "≥"} {fmt(ind.meta, ind.unidad)}
            </dd>
          </div>
          <div className="hecho">
            <dt>Semáforo</dt>
            <dd>{s ? <span className={`est t-${s.tono}`}>{s.label}</span> : <span className="muted">Sin medición</span>}</dd>
          </div>
          <div className="hecho">
            <dt>Cumplimiento histórico</dt>
            <dd className="num">{ind.valores.length ? `${enMeta} de ${ind.valores.length} periodos en meta` : "—"}</dd>
          </div>
          <div className="hecho">
            <dt>Responsable</dt>
            <dd>
              <Persona nombre={ind.responsable} login={ind.loginResponsable} />
            </dd>
          </div>
        </dl>
      </header>

      <Panel titulo="Tendencia contra la meta" sub={ind.valores.length ? `${ind.valores.length} mediciones` : null} flush className="">
        {!datos.length ? (
          <Vacio icono="ti-chart-line" titulo="Sin datos para graficar" texto="Registra la primera medición para ver la tendencia contra la meta." />
        ) : (
          <div className="grafica">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datos} margin={{ top: 16, right: 28, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="sgc-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={t["--brand"]} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={t["--brand"]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={t["--line"]} vertical={false} />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={{ stroke: t["--line"] }} tick={{ fill: t["--muted"], fontSize: 11.5 }} />
                <YAxis domain={[Math.floor(minY - margen), Math.ceil(maxY + margen)]} tickLine={false} axisLine={false} tick={{ fill: t["--muted"], fontSize: 11.5 }} width={44} />
                <Tooltip content={<TooltipValor unidad={ind.unidad} meta={ind.meta} />} cursor={{ stroke: t["--faint"], strokeDasharray: "3 3" }} />
                {ind.meta != null && (
                  <ReferenceLine
                    y={ind.meta}
                    stroke={t["--ok"]}
                    strokeDasharray="6 4"
                    label={{ value: `Meta ${fmt(ind.meta, ind.unidad)}`, position: "insideTopRight", fill: t["--ok"], fontSize: 11.5, fontWeight: 600 }}
                  />
                )}
                <Area type="monotone" dataKey="valor" stroke="none" fill="url(#sgc-area)" isAnimationActive animationDuration={700} />
                <Line type="monotone" dataKey="valor" stroke={t["--brand"]} strokeWidth={2.25} dot={<Punto />} activeDot={{ r: 6 }} animationDuration={700} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div className="detalle" style={{ marginTop: 16 }}>
        <Panel titulo="Histórico de mediciones" cuenta={ind.valores.length} flush>
          {!ind.valores.length ? (
            <Vacio compacto icono="ti-table-off" titulo="Sin mediciones" texto="Aún no se registran valores de este indicador." />
          ) : (
            <div className="tabla-wrap">
              <table className="tabla tabla--compacta">
                <thead>
                  <tr>
                    <th className="fit">Periodo</th>
                    <th className="fit der">Valor</th>
                    <th className="fit der">vs meta</th>
                    <th className="fit">Semáforo</th>
                    <th>Observaciones</th>
                    <th className="fit ocultar-movil">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {[...ind.valores].reverse().map((v) => {
                    const dif = ind.meta != null ? Math.round((v.valor - ind.meta) * 100) / 100 : null;
                    const bueno = dif == null ? null : ind.sentido === 2 ? dif <= 0 : dif >= 0;
                    const sv = v.semaforo ? SEMAFORO[v.semaforo] : null;
                    return (
                      <tr key={v.idValor}>
                        <td className="fit strong">{periodoLabel(v.periodo)}</td>
                        <td className="fit der num strong">{fmt(v.valor)}</td>
                        <td className={`fit der num delta ${bueno == null ? "" : bueno ? "t-ok" : "t-danger"}`} style={{ display: "table-cell" }}>
                          {dif == null ? "—" : `${dif > 0 ? "+" : ""}${fmt(dif)}`}
                        </td>
                        <td className="fit">{sv ? <span className={`est t-${sv.tono}`}>{sv.label}</span> : "—"}</td>
                        <td className="muted">{v.observaciones || "—"}</td>
                        <td className="fit ocultar-movil">
                          <span className="celda-sub" title={fechaHora(v.fechaRegistro)}>
                            {v.nombre || v.login}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <aside className="detalle__lateral">
          <Panel titulo="Ficha técnica">
            <dl className="datos">
              <Dato label="Fórmula">{ind.formulaCalculo}</Dato>
              <Dato label="Unidad">{ind.unidad}</Dato>
              <Dato label="Frecuencia">{FRECUENCIA[ind.frecuencia]}</Dato>
              <Dato label="Semáforo">
                {ind.sentido === 2 ? "Verde ≤ meta · ámbar ≤ 120 % · rojo arriba" : "Verde ≥ meta · ámbar ≥ 80 % · rojo abajo"}
              </Dato>
            </dl>
          </Panel>
        </aside>
      </div>

      {modal === "valor" && (
        <ModalValor
          ind={ind}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargar();
          }}
        />
      )}
      {modal === "editar" && (
        <ModalEditar
          ind={ind}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}
