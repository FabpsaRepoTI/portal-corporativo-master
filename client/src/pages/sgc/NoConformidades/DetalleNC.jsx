// pages/sgc/NoConformidades/DetalleNC.jsx
// Ficha de una No Conformidad como registro: sello (folio, clasificación),
// título, hechos clave en línea, pista del ciclo de vida con fechas,
// contenido (hallazgo, acciones correctivas, evidencia) y, al lado, el
// siguiente paso y la bitácora.
import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import Archivos from "../components/Archivos";
import { Bitacora, Pista } from "../components/Historial";
import PanelEstatus from "../components/PanelEstatus";
import { Avance, Dato, ErrorCarga, Folio, Panel, Persona, Riel, Skel, Vacio, Vence, useMigas, useToast, TituloSub, Volver } from "../components/ui";
import { sgcApi, avisarCambio, procesos as cargarProcesos, useSgc, fechaCorta, fechaHora, PROCESO_TIPO } from "../sgcApi";

/** Proceso del mapa al que pertenece la NC; el Coordinador o el responsable lo cambian aquí. */
function ProcesoNC({ nc, onCambio }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [lista, setLista] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (editando && !lista) cargarProcesos().then(setLista).catch((e) => (toast.error(e.message), setEditando(false)));
    // eslint-disable-next-line
  }, [editando]);
  const guardar = async (valor) => {
    try {
      setGuardando(true);
      const r = await sgcApi(`/nc/${nc.idNC}/proceso`, { method: "PATCH", body: { idProceso: valor ? Number(valor) : null } });
      toast.ok(r.proceso ? `Vinculada a «${r.proceso}»` : "Se quitó el vínculo con el proceso");
      setEditando(false);
      onCambio();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGuardando(false);
    }
  };
  if (editando) {
    return (
      <select className="inp inp--chico" autoFocus disabled={!lista || guardando} value={nc.idProceso || ""} onChange={(e) => guardar(e.target.value)} onBlur={() => !guardando && setEditando(false)} aria-label="Proceso de la NC">
        <option value="">{lista ? "Sin vincular" : "Cargando procesos…"}</option>
        {(lista || []).map((p) => (
          <option key={p.idProceso} value={p.idProceso}>
            {p.nombre} · {PROCESO_TIPO[p.tipo].label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span className="nc-proceso">
      {nc.idProceso ? (
        <Link to={`/sgc/procesos?proceso=${nc.idProceso}`}>
          <i className="ti ti-hierarchy-3" style={{ color: PROCESO_TIPO[nc.procesoTipo]?.color }} /> {nc.proceso}
        </Link>
      ) : (
        <span className="muted">Sin vincular</span>
      )}
      {nc.puedeVincularProceso && (
        <button type="button" className="btn btn--fantasma btn--icono btn--sm" onClick={() => setEditando(true)} aria-label="Cambiar proceso" title="Cambiar proceso">
          <i className="ti ti-pencil" />
        </button>
      )}
    </span>
  );
}

const REGLAS = {
  cancelar: 6,
  requiereMotivo: (nuevo, actual) => nuevo < actual || nuevo === 5 || nuevo === 6,
  destructivo: (nuevo) => nuevo === 5 || nuevo === 6,
  ayuda: (nuevo) =>
    ({
      2: "Se integra el equipo y se analiza la causa raíz.",
      3: "La causa raíz está identificada y se ejecuta el plan.",
      4: "Las acciones se implementaron; falta verificar su eficacia.",
      5: "Se registra la fecha de cierre y el motivo queda como observación de cierre.",
      6: "La NC deja de contar como abierta y no podrá reabrirse.",
    })[nuevo] || null,
};

export default function DetalleNC() {
  const { idNC } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { rol } = useOutletContext();
  const { data: nc, error, recargar } = useSgc(() => sgcApi(`/nc/${idNC}`), [idNC]);
  const [destello, setDestello] = useState(0);
  useMigas([{ to: "/sgc/no-conformidades", label: "No conformidades" }, { label: nc?.folio || "…" }]);

  if (error && !nc) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <ErrorCarga error={error} onReintentar={recargar} />
        </div>
      </div>
    );
  }
  if (!nc) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <Skel filas={12} />
        </div>
      </div>
    );
  }

  const cambiar = async (body) => {
    const r = await sgcApi(`/nc/${nc.idNC}/estatus`, { method: "PATCH", body });
    toast.ok(body.nuevoEstatus === nc.idEstatus ? "Responsable reasignado" : `${nc.folio} → «${r.estatusLabel}»`);
    setDestello((d) => d + 1);
    avisarCambio();
    recargar();
  };

  const final = [5, 6].includes(nc.idEstatus);
  const puedeNuevaAC = rol !== 4 && !final;

  return (
    <div className="sg-page">
      <header className="registro">
        <Volver />
        <div className="registro__sello">
          <Folio folio={nc.folio} tono={nc.esVencida ? "danger" : "brand"} grande />
          <span className="tag tag--linea">{nc.clasificacion}</span>
          {nc.esVencida && (
            <span className="tag t-danger">
              <i className="ti ti-clock-exclamation" /> Vencida {nc.diasVencido} {nc.diasVencido === 1 ? "día" : "días"}
            </span>
          )}
          {nc.esReincidencia && (
            <span className="tag t-orange">
              <i className="ti ti-repeat" /> Reincidencia
            </span>
          )}
          {nc.folioAuditoria && (
            <Link className="tag t-brand" to={`/sgc/auditorias/${nc.idAuditoria}`}>
              <i className="ti ti-clipboard-check" /> {nc.folioAuditoria}
            </Link>
          )}
        </div>
        <div className="registro__fila">
          <TituloSub texto={nc.descripcion} />
          {puedeNuevaAC && (
            <div className="registro__acciones">
              <button className="btn" onClick={() => navigate(`/sgc/acciones-correctivas/nueva?idNC=${nc.idNC}`)}>
                <i className="ti ti-plus" /> Acción correctiva
              </button>
            </div>
          )}
        </div>
        <dl className="hechos">
          <div className="hecho">
            <dt>Responsable</dt>
            <dd>
              <Persona nombre={nc.responsable} login={nc.loginResponsable} />
            </dd>
          </div>
          <div className="hecho">
            <dt>Compromiso</dt>
            <dd>
              <Vence fecha={nc.fechaCompromiso} dias={nc.diasRestantes} cerrada={final} linea />
            </dd>
          </div>
          <div className="hecho">
            <dt>Origen</dt>
            <dd title={nc.origen}>{nc.origen}</dd>
          </div>
          <div className="hecho">
            <dt>Detectada</dt>
            <dd>{fechaCorta(nc.fechaDeteccion)}</dd>
          </div>
          <div className="hecho">
            <dt>Área</dt>
            <dd title={nc.departamento || nc.codigoDpto}>{nc.departamento || nc.codigoDpto || "—"}</dd>
          </div>
        </dl>
      </header>

      <section key={destello} className={`pnl${destello ? " destello" : ""}`} style={{ marginBottom: 16 }}>
        <Pista tipo="nc" actual={nc.idEstatus} historial={nc.historial} />
      </section>

      <div className="detalle">
        <div className="pila">
          <Panel titulo="Hallazgo">
            {nc.descripcionDetallada ? <p className="texto">{nc.descripcionDetallada}</p> : <p className="muted">Sin descripción detallada.</p>}
            {nc.correccionInmediata && (
              <div className="bloque">
                <div className="bloque__etq">Corrección inmediata</div>
                <p className="texto">{nc.correccionInmediata}</p>
              </div>
            )}
            {nc.herramientas.length > 0 && (
              <div className="bloque">
                <div className="bloque__etq">Herramientas de análisis</div>
                <div className="opciones">
                  {nc.herramientas.map((h) => (
                    <span key={h.idHerramienta} className="tag tag--linea">
                      <i className="ti ti-tool" /> {h.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {nc.idEstatus === 5 && (
              <div className="bloque">
                <div className="bloque__etq">Cierre · {fechaCorta(nc.fechaCierre)} · {nc.cierra || nc.loginCierra}</div>
                <p className="texto">{nc.observacionCierre}</p>
              </div>
            )}
          </Panel>

          <Panel
            titulo="Acciones correctivas"
            cuenta={nc.acciones.length}
            flush
            acciones={
              puedeNuevaAC && (
                <button className="btn btn--fantasma btn--sm" onClick={() => navigate(`/sgc/acciones-correctivas/nueva?idNC=${nc.idNC}`)}>
                  <i className="ti ti-plus" /> Nueva
                </button>
              )
            }
          >
            {!nc.acciones.length ? (
              <Vacio
                compacto
                icono="ti-checklist"
                titulo="Sin acciones correctivas"
                texto={puedeNuevaAC ? "Define una acción para eliminar la causa raíz y evitar que se repita." : "Esta no conformidad no tiene acciones registradas."}
              />
            ) : (
              nc.acciones.map((a) => (
                <Link key={a.idAC} to={`/sgc/acciones-correctivas/${a.idAC}`} className="fila fila--ac">
                  <Folio folio={a.folio} tono="info" />
                  <span className="fila__txt">
                    <b>{a.titulo || "—"}</b>
                    <small>
                      {a.responsable || a.loginResponsable} · {a.estatusLabel} · {a.lineasCompletadas}/{a.totalLineas} actividades
                    </small>
                  </span>
                  <Avance valor={a.avance} />
                  <Vence fecha={a.fechaCompromiso} dias={a.diasRestantes} cerrada={a.idEstatus >= 4} />
                </Link>
              ))
            )}
          </Panel>

          <Archivos base={`/nc/${nc.idNC}`} archivos={nc.archivos} puedeAdjuntar={nc.puedeAdjuntar} onCambio={recargar} rolCoordinador={rol === 1} />
        </div>

        <aside className="detalle__lateral">
          <PanelEstatus
            key={`${nc.idEstatus}-${nc.loginResponsable}`}
            tipo="nc"
            actual={nc.idEstatus}
            transiciones={nc.transiciones}
            reglas={REGLAS}
            reasignar={nc.puedeReasignar}
            responsableActual={nc.loginResponsable}
            onGuardar={cambiar}
          />
          <Panel titulo="Bitácora" cuenta={nc.historial.length} flush>
            <Bitacora tipo="nc" eventos={nc.historial} />
          </Panel>
          <Panel titulo="Registro">
            <dl className="datos">
              <Dato label="Registró">{nc.creador || nc.loginDetecta}</Dato>
              <Dato label="Fecha">{fechaHora(nc.fechaCreacion)}</Dato>
              <Dato label="Afectación">{nc.afectacion}</Dato>
              <Dato label="Sitio">{nc.sitio}</Dato>
              <Dato label="Proceso">
                <ProcesoNC nc={nc} onCambio={recargar} />
              </Dato>
              <Dato label="Estatus">
                <Riel tipo="nc" id={nc.idEstatus} />
              </Dato>
              {nc.idNCPadre && (
                <Dato label="NC relacionada">
                  <Link to={`/sgc/no-conformidades/${nc.idNCPadre}`} className="mono">
                    {nc.folioPadre}
                  </Link>
                </Dato>
              )}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
