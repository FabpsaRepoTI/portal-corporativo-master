// pages/sgc/Auditorias/ListaAuditorias.jsx
// Programa de auditorías agrupado por mes: bloque de fecha, tipo, equipo,
// hallazgos por tipo y estatus. Filtros por año, estatus y tipo.
import { useCallback, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import PanelLateral, { PanelSplit, RUTA_COMPLETA } from "../../../components/sgc/PanelLateral";
import { Distribucion, Encabezado, ErrorCarga, Skel, Vacio, useMigas } from "../components/ui";
import { sgcApi, useSgc, anioActual, diaMes, fechaCorta, AUD_ESTATUS, AUD_TIPO } from "../sgcApi";

const ANIOS = Array.from({ length: 5 }, (_, i) => anioActual() + 1 - i);
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TONO_TIPO = { 1: "brand", 2: "info", 3: "orange" };

export default function ListaAuditorias() {
  const navigate = useNavigate();
  const { rol } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const f = { estatus: params.get("estatus") || "", tipo: params.get("tipo") || "", anio: params.has("anio") ? params.get("anio") : String(anioActual()) };
  useMigas([{ label: "Auditorías" }]);
  const [sel, setSel] = useState(null); // { id, folio } en el panel lateral
  const cerrarPanel = useCallback(() => setSel(null), []);

  const setFiltro = (k, v) => {
    const p = new URLSearchParams(params);
    if (v || k === "anio") p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  // El estatus se filtra en el cliente para que la distribución muestre todo el año
  const consulta = new URLSearchParams();
  if (f.anio) consulta.set("anio", f.anio);
  if (f.tipo) consulta.set("tipo", f.tipo);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi(`/auditorias?${consulta}`), [consulta.toString()]);
  const puedeCrear = rol === 1 || rol === 2;

  const estatusSel = f.estatus ? Number(f.estatus) : null;
  const lista = (data || []).filter((a) => !estatusSel || a.idEstatus === estatusSel);
  const dist = Object.entries(AUD_ESTATUS).map(([id, e]) => ({ id: Number(id), label: e.label, total: (data || []).filter((a) => a.idEstatus === Number(id)).length, tono: e.tono }));

  // Agrupa por mes de inicio (orden cronológico)
  const meses = [];
  for (const a of [...lista].sort((x, y) => String(x.fechaInicio).localeCompare(String(y.fechaInicio)))) {
    const clave = String(a.fechaInicio).slice(0, 7);
    let g = meses.find((m) => m.clave === clave);
    if (!g) meses.push((g = { clave, items: [] }));
    g.items.push(a);
  }

  return (
    <div className="sg-page lst-page">
      <Encabezado
        kicker={<>Auditorías <i className="ti ti-chevron-right" /> Programa anual</>}
        titulo="Programa de auditorías"
        cuenta={data ? data.length : null}
        desc="Auditorías internas, externas y de certificación, con sus hallazgos."
        acciones={
          <>
            <select className="inp" style={{ width: 110 }} value={f.anio} onChange={(e) => setFiltro("anio", e.target.value)} aria-label="Año">
              <option value="">Todos</option>
              {ANIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="seg" role="radiogroup" aria-label="Tipo">
              <button type="button" role="radio" aria-checked={!f.tipo} className={!f.tipo ? "is-on" : ""} onClick={() => setFiltro("tipo", "")}>
                Todas
              </button>
              {Object.entries(AUD_TIPO).map(([id, t]) => (
                <button key={id} type="button" role="radio" aria-checked={f.tipo === id} className={f.tipo === id ? "is-on" : ""} onClick={() => setFiltro("tipo", id)}>
                  {t}
                </button>
              ))}
            </div>
            {puedeCrear && (
              <button className="btn btn--primario" onClick={() => navigate("/sgc/auditorias/nueva")}>
                <i className="ti ti-plus" /> Programar
              </button>
            )}
          </>
        }
      />

      <PanelSplit
        abierto={!!sel}
        onClose={cerrarPanel}
        panel={sel && <PanelLateral registro={sel} modulo="auditoria" onClose={cerrarPanel} onAbrirCompleto={(m, id) => navigate(RUTA_COMPLETA[m](id))} />}
      >
      <section className="pnl aud-prog">
        {data && <div className="aud-resumen"><Distribucion items={dist} sel={estatusSel} onSel={(id) => setFiltro("estatus", id ?? "")} etiquetaTodos={f.anio ? `Programa ${f.anio}` : "Todas"} /></div>}

        {error && !data ? (
          <ErrorCarga error={error} onReintentar={recargar} />
        ) : !data ? (
          <Skel filas={8} />
        ) : !lista.length ? (
          <Vacio
            icono="ti-calendar-off"
            titulo="Sin auditorías"
            texto={f.anio ? `No hay auditorías ${estatusSel ? `«${AUD_ESTATUS[estatusSel].label.toLowerCase()}» ` : ""}en el programa ${f.anio}.` : "No hay auditorías con estos filtros."}
            accion={
              puedeCrear ? (
                <button className="btn btn--primario" onClick={() => navigate("/sgc/auditorias/nueva")}>
                  <i className="ti ti-calendar-plus" /> Programar auditoría
                </button>
              ) : null
            }
          />
        ) : (
          <div className={cargando ? "recargando" : undefined}>
            {meses.map((m) => (
              <div key={m.clave}>
                <div className="programa__mes">
                  {MESES_LARGOS[Number(m.clave.slice(5, 7)) - 1]} {m.clave.slice(0, 4)} · {m.items.length}
                </div>
                {m.items.map((a) => {
                  const ini = diaMes(a.fechaInicio);
                  const varios = String(a.fechaFin).slice(0, 10) !== String(a.fechaInicio).slice(0, 10);
                  return (
                    <Link key={a.idAuditoria} to={`/sgc/auditorias/${a.idAuditoria}`} className={`fila programa__fila${sel?.id === a.idAuditoria ? " is-sel" : ""}`}
                      onClick={(e) => {
                        // Clic normal: panel lateral; Ctrl/⌘/medio: abre la página como siempre
                        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        setSel({ id: a.idAuditoria, folio: a.folio });
                      }}>
                      <span className="fecha-bloque" aria-label={fechaCorta(a.fechaInicio)}>
                        <b>{ini.dia}</b>
                        <small>{ini.mes}</small>
                      </span>
                      <span className="fila__txt">
                        <b>{a.titulo}</b>
                        <small>
                          <span className="mono">{a.folio}</span>
                          {varios && ` · hasta ${fechaCorta(a.fechaFin, false)}`}
                          {a.normaAplicable && ` · ${a.normaAplicable}`}
                          {a.auditores && ` · ${a.auditores}`}
                        </small>
                      </span>
                      <span>
                        <span className={`tag t-${TONO_TIPO[a.tipo]}`}>{a.tipoLabel}</span>
                      </span>
                      <span className="hallazgos-mini" aria-label={`${a.ncs} no conformidades, ${a.observaciones} observaciones, ${a.oportunidades} oportunidades de mejora`}>
                        <span className={`t-danger${a.ncs ? "" : " cero"}`} title="No conformidades">
                          <b>{a.ncs}</b> NC
                        </span>
                        <span className={`t-warn${a.observaciones ? "" : " cero"}`} title="Observaciones">
                          <b>{a.observaciones}</b> Obs
                        </span>
                        <span className={`t-info${a.oportunidades ? "" : " cero"}`} title="Oportunidades de mejora">
                          <b>{a.oportunidades}</b> OM
                        </span>
                      </span>
                      <span className={`aud-est t-${AUD_ESTATUS[a.idEstatus].tono}`}><i aria-hidden="true" />{AUD_ESTATUS[a.idEstatus].label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
      </PanelSplit>
    </div>
  );
}
