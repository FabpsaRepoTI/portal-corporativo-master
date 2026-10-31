// pages/sgc/AccionesCorrectivas/DetalleAC.jsx
// Ficha de una Acción Correctiva: sello, hechos clave, ciclo de vida, causa
// raíz, plan de acción como checklist (un clic avanza la actividad:
// Pendiente → En proceso → Completada), evidencia, siguiente paso y bitácora.
import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import Archivos from "../components/Archivos";
import { Bitacora, Pista } from "../components/Historial";
import PanelEstatus from "../components/PanelEstatus";
import { Avance, Campo, Dato, ErrorCarga, Folio, Panel, Persona, Riel, SelectUsuario, Skel, Vacio, Vence, useMigas, useToast, TituloSub, Volver } from "../components/ui";
import { sgcApi, avisarCambio, useSgc, fechaCorta, fechaHora, hoyISO, PLAN_ESTATUS } from "../sgcApi";

const REGLAS = {
  requiereMotivo: (nuevo, actual) => nuevo < actual || nuevo === 5,
  destructivo: (nuevo) => nuevo === 5,
  ayuda: (nuevo) =>
    ({
      2: "Arranca la ejecución del plan de acción.",
      3: "Todas las actividades están completas; queda lista para verificar su eficacia.",
      4: "Confirmas que la acción eliminó la causa raíz. Se registra quién verificó y cuándo.",
      5: "La acción se cierra y su plan ya no podrá modificarse.",
    })[nuevo] || null,
};
const SIGUIENTE = { 1: 2, 2: 3, 3: 1 };

function NuevaActividad({ idAC, limite, onAgregada }) {
  const toast = useToast();
  const vacia = { actividad: "", loginResponsable: "", fechaCompromiso: "", recursos: "" };
  const [l, setL] = useState(vacia);
  const [abierta, setAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const valida = l.actividad.trim() && l.loginResponsable && l.fechaCompromiso;
  const agregar = async () => {
    if (!valida) return toast.aviso("La actividad necesita descripción, responsable y fecha.");
    try {
      setGuardando(true);
      await sgcApi(`/ac/${idAC}/plan`, { method: "POST", body: l });
      toast.ok("Actividad agregada al plan");
      setL(vacia);
      setAbierta(false);
      onAgregada();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGuardando(false);
    }
  };
  if (!abierta) {
    return (
      <div style={{ padding: "10px 16px 14px" }}>
        <button className="btn btn--fantasma btn--sm" onClick={() => setAbierta(true)}>
          <i className="ti ti-plus" /> Agregar actividad
        </button>
      </div>
    );
  }
  return (
    <div className="plan__nueva">
      <Campo etq="Actividad">
        <input className="inp" maxLength={500} value={l.actividad} onChange={(e) => setL({ ...l, actividad: e.target.value })} placeholder="Qué se hará" autoFocus />
      </Campo>
      <Campo etq="Responsable">
        <SelectUsuario value={l.loginResponsable} onChange={(v) => setL({ ...l, loginResponsable: v })} />
      </Campo>
      <Campo etq="Fecha">
        <input type="date" className="inp" min={hoyISO()} max={limite || undefined} value={l.fechaCompromiso} onChange={(e) => setL({ ...l, fechaCompromiso: e.target.value })} />
      </Campo>
      <Campo etq="Recursos" opcional>
        <input className="inp" maxLength={500} value={l.recursos} onChange={(e) => setL({ ...l, recursos: e.target.value })} />
      </Campo>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn--fantasma btn--icono" onClick={() => setAbierta(false)} aria-label="Descartar">
          <i className="ti ti-x" />
        </button>
        <button className="btn btn--primario" onClick={agregar} disabled={guardando || !valida}>
          <i className={`ti ${guardando ? "ti-loader-2 giro" : "ti-plus"}`} /> Agregar
        </button>
      </div>
    </div>
  );
}

export default function DetalleAC() {
  const { idAC } = useParams();
  const toast = useToast();
  const { rol } = useOutletContext();
  const { data: ac, error, recargar } = useSgc(() => sgcApi(`/ac/${idAC}`), [idAC]);
  const [optimista, setOptimista] = useState(null); // { base, lineas, avance }
  const [ocupada, setOcupada] = useState(null);
  const [destello, setDestello] = useState(0);
  useMigas([{ to: "/sgc/acciones-correctivas", label: "Acciones correctivas" }, { label: ac?.folio || "…" }]);

  if (error && !ac) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <ErrorCarga error={error} onReintentar={recargar} />
        </div>
      </div>
    );
  }
  if (!ac) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <Skel filas={12} />
        </div>
      </div>
    );
  }

  const vigente = optimista && optimista.base === ac ? optimista : null;
  const lineas = vigente ? vigente.lineas : ac.plan;
  const completadas = lineas.filter((l) => l.idEstatus === 3).length;
  const avance = lineas.length ? Math.round((100 * completadas) / lineas.length) : 0;

  const avanzarLinea = async (linea) => {
    const nuevo = SIGUIENTE[linea.idEstatus];
    const previas = lineas;
    setOptimista({ base: ac, lineas: lineas.map((l) => (l.idLinea === linea.idLinea ? { ...l, idEstatus: nuevo } : l)) });
    setOcupada(linea.idLinea);
    try {
      await sgcApi(`/ac/plan/${linea.idLinea}/estatus`, { method: "PATCH", body: { nuevoEstatus: nuevo } });
      recargar();
    } catch (err) {
      setOptimista({ base: ac, lineas: previas });
      toast.error(err.message);
    } finally {
      setOcupada(null);
    }
  };

  const cambiar = async (body) => {
    const r = await sgcApi(`/ac/${ac.idAC}/estatus`, { method: "PATCH", body });
    toast.ok(`${ac.folio} → «${r.estatusLabel}»`);
    setDestello((d) => d + 1);
    avisarCambio();
    recargar();
  };

  const bloqueo = ac.idEstatus === 2 && !ac.planCompleto && ac.puedeEditarPlan ? `Faltan ${lineas.length - completadas} de ${lineas.length || 0} actividades para pasar a verificación.` : null;

  return (
    <div className="sg-page">
      <header className="registro">
        <Volver />
        <div className="registro__sello">
          <Folio folio={ac.folio} tono={ac.esVencida ? "danger" : "info"} grande />
          {ac.folioNC ? (
            <Link className="tag t-brand" to={`/sgc/no-conformidades/${ac.idNC}`}>
              <i className="ti ti-link" /> {ac.folioNC}
            </Link>
          ) : (
            <span className="tag tag--linea">Independiente</span>
          )}
          {ac.esVencida && (
            <span className="tag t-danger">
              <i className="ti ti-clock-exclamation" /> Atrasada {ac.diasVencido} {ac.diasVencido === 1 ? "día" : "días"}
            </span>
          )}
          {ac.eficaciaVerificada && (
            <span className="tag t-ok">
              <i className="ti ti-rosette-discount-check" /> Eficacia verificada
            </span>
          )}
        </div>
        <div className="registro__fila">
          <TituloSub texto={ac.titulo} />
        </div>
        <dl className="hechos">
          <div className="hecho">
            <dt>Responsable</dt>
            <dd>
              <Persona nombre={ac.responsable} login={ac.loginResponsable} />
            </dd>
          </div>
          <div className="hecho">
            <dt>Compromiso</dt>
            <dd>
              <Vence fecha={ac.fechaCompromiso} dias={ac.diasRestantes} cerrada={ac.idEstatus >= 4} linea />
            </dd>
          </div>
          <div className="hecho" style={{ flexBasis: 220 }}>
            <dt>Avance del plan</dt>
            <dd>
              <Avance valor={avance} />
            </dd>
          </div>
          <div className="hecho">
            <dt>Herramienta</dt>
            <dd>{ac.herramienta || "—"}</dd>
          </div>
        </dl>
      </header>

      <section key={destello} className={`pnl${destello ? " destello" : ""}`} style={{ marginBottom: 16 }}>
        <Pista tipo="ac" actual={ac.idEstatus} historial={ac.historial} />
      </section>

      <div className="detalle">
        <div className="pila">
          <Panel titulo="Análisis">
            <div className="bloque">
              <div className="bloque__etq">Causa raíz</div>
              <p className="texto">{ac.causaRaiz || <span className="muted">Aún no se documenta la causa raíz.</span>}</p>
            </div>
            {ac.descripcion && ac.descripcion !== ac.titulo && (
              <div className="bloque">
                <div className="bloque__etq">Descripción</div>
                <p className="texto">{ac.descripcion}</p>
              </div>
            )}
            {(ac.d3_contencion || ac.d5_acciones) && (
              <div className="bloque">
                <div className="bloque__etq">Contención</div>
                <p className="texto">{ac.d3_contencion || ac.d5_acciones}</p>
              </div>
            )}
            {ac.idNC && (
              <div className="bloque">
                <div className="bloque__etq">
                  No conformidad de origen ·{" "}
                  <Link to={`/sgc/no-conformidades/${ac.idNC}`} className="mono">
                    {ac.folioNC}
                  </Link>
                </div>
                <p className="texto muted">{ac.descripcionNC}</p>
              </div>
            )}
          </Panel>

          <Panel titulo="Plan de acción" flush>
            <div className="plan__resumen">
              <span className="plan__cifra">
                {completadas}
                <small>/{lineas.length} completadas</small>
              </span>
              <Avance valor={avance} grande />
            </div>
            {!lineas.length ? (
              <Vacio compacto icono="ti-list-check" titulo="Plan vacío" texto="Agrega las actividades que eliminarán la causa raíz." />
            ) : (
              lineas.map((l) => (
                <div key={l.idLinea} className={`actividad is-${l.idEstatus}`}>
                  <button
                    type="button"
                    className="actividad__marca"
                    disabled={!l.puedeEditar || ocupada === l.idLinea}
                    onClick={() => avanzarLinea(l)}
                    aria-label={`${l.actividad}: ${PLAN_ESTATUS[l.idEstatus].label}. ${l.puedeEditar ? `Marcar como ${PLAN_ESTATUS[SIGUIENTE[l.idEstatus]].label}` : ""}`}
                    title={l.puedeEditar ? `Marcar como «${PLAN_ESTATUS[SIGUIENTE[l.idEstatus]].label}»` : PLAN_ESTATUS[l.idEstatus].label}
                  >
                    {ocupada === l.idLinea ? <i className="ti ti-loader-2 giro" style={{ color: "var(--muted)" }} /> : <i className="ti ti-check" />}
                  </button>
                  <div className="actividad__txt">
                    <b>{l.actividad}</b>
                    <small>
                      <span>
                        <i className="ti ti-user" /> {l.responsable || l.loginResponsable}
                      </span>
                      {l.recursos && (
                        <span>
                          <i className="ti ti-package" /> {l.recursos}
                        </span>
                      )}
                    </small>
                  </div>
                  <span className={`est t-${PLAN_ESTATUS[l.idEstatus].tono}`}>{PLAN_ESTATUS[l.idEstatus].label}</span>
                  <Vence fecha={l.fechaCompromiso} dias={l.diasRestantes} cerrada={l.idEstatus === 3} />
                </div>
              ))
            )}
            {ac.puedeEditarPlan && <NuevaActividad idAC={ac.idAC} limite={String(ac.fechaCompromiso).slice(0, 10)} onAgregada={recargar} />}
          </Panel>

          <Archivos base={`/ac/${ac.idAC}`} archivos={ac.archivos} puedeAdjuntar={ac.puedeAdjuntar} onCambio={recargar} rolCoordinador={rol === 1} />
        </div>

        <aside className="detalle__lateral">
          <PanelEstatus key={`${ac.idEstatus}-${ac.planCompleto}`} tipo="ac" actual={ac.idEstatus} transiciones={ac.transiciones} reglas={REGLAS} bloqueo={bloqueo} onGuardar={cambiar} />
          <Panel titulo="Bitácora" cuenta={ac.historial.length} flush>
            <Bitacora tipo="ac" eventos={ac.historial} />
          </Panel>
          <Panel titulo="Registro">
            <dl className="datos">
              <Dato label="Estatus">
                <Riel tipo="ac" id={ac.idEstatus} />
              </Dato>
              <Dato label="Verificó">{ac.verifica ? `${ac.verifica} · ${fechaCorta(ac.fechaVerificacion)}` : null}</Dato>
              <Dato label="Cierre">{ac.fechaCierre ? fechaCorta(ac.fechaCierre) : null}</Dato>
              <Dato label="Registrada">{fechaHora(ac.fechaCreacion)}</Dato>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
