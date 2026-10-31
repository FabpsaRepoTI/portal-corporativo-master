// pages/sgc/Auditorias/DetalleAuditoria.jsx
// Ficha de auditoría: sello, hechos clave, alcance y conclusiones, hallazgos
// por tipo (las NC detectadas generan su No Conformidad), evidencia, siguiente
// paso (iniciar / completar con conclusiones / cancelar), equipo y áreas.
import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import Archivos from "../components/Archivos";
import { Avatar, BotonGuardar, Campo, Confirmar, Estatus, ErrorCarga, Folio, Modal, Panel, SelectUsuario, Skel, Vacio, useMigas, useToast, TituloSub, Volver } from "../components/ui";
import { sgcApi, avisarCambio, useSgc, catalogos, fechaCorta, hoyISO, plural, HALLAZGO_TIPO } from "../sgcApi";

const TONO_TIPO = { 1: "brand", 2: "info", 3: "orange" };

function ModalHallazgo({ idAuditoria, onClose, onCreado }) {
  const toast = useToast();
  const [cat, setCat] = useState(null);
  const [h, setH] = useState({ tipo: "1", descripcion: "", clausulaISO: "", loginResponsable: "", fechaCompromiso: hoyISO(30), crearNC: true, idClasificacion: "2" });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    catalogos().then(setCat).catch(() => {});
  }, []);
  const generaNC = h.tipo === "1" && h.crearNC;

  const guardar = async () => {
    if (!h.descripcion.trim()) return setError("Describe el hallazgo con evidencia objetiva.");
    if (generaNC && (!h.loginResponsable || !h.fechaCompromiso)) return setError("Para generar la NC indica responsable y fecha compromiso.");
    try {
      setGuardando(true);
      setError(null);
      const r = await sgcApi(`/auditorias/${idAuditoria}/hallazgos`, {
        method: "POST",
        body: { ...h, tipo: Number(h.tipo), crearNC: h.tipo === "1" ? h.crearNC : false, idClasificacion: Number(h.idClasificacion) },
      });
      toast.ok(r.folioNC ? `Hallazgo registrado · se generó ${r.folioNC}` : "Hallazgo registrado");
      avisarCambio();
      onCreado();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Registrar hallazgo"
      ancho
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <BotonGuardar ocupado={guardando} icono="ti-device-floppy" onClick={guardar}>
            {generaNC ? "Registrar y generar NC" : "Registrar hallazgo"}
          </BotonGuardar>
        </>
      }
    >
      <div className="opciones" role="radiogroup" aria-label="Tipo de hallazgo">
        {Object.entries(HALLAZGO_TIPO).map(([id, t]) => (
          <button key={id} type="button" role="radio" aria-checked={h.tipo === id} className={`opcion t-${t.tono}${h.tipo === id ? " is-on" : ""}`} onClick={() => setH({ ...h, tipo: id })}>
            <i className={`ti ${t.icono}`} /> {t.label}
          </button>
        ))}
      </div>
      <div className="rejilla">
        <Campo etq="Descripción" className="full">
          <textarea className="inp" rows={4} value={h.descripcion} onChange={(e) => setH({ ...h, descripcion: e.target.value })} placeholder="Evidencia objetiva: qué se observó, dónde y contra qué requisito" />
        </Campo>
        <Campo etq="Cláusula ISO" opcional>
          <input className="inp mono" maxLength={20} value={h.clausulaISO} onChange={(e) => setH({ ...h, clausulaISO: e.target.value })} placeholder="8.5.1" />
        </Campo>
        {h.tipo === "1" ? (
          <Campo etq="Clasificación de la NC">
            <select className="inp" value={h.idClasificacion} onChange={(e) => setH({ ...h, idClasificacion: e.target.value })}>
              {cat?.clasificaciones.map((c) => (
                <option key={c.idClasificacion} value={c.idClasificacion}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <div />
        )}
        <Campo etq="Responsable" opcional={!generaNC}>
          <SelectUsuario value={h.loginResponsable} onChange={(l) => setH({ ...h, loginResponsable: l })} />
        </Campo>
        <Campo etq="Fecha compromiso" opcional={!generaNC}>
          <input type="date" className="inp" min={hoyISO()} value={h.fechaCompromiso} onChange={(e) => setH({ ...h, fechaCompromiso: e.target.value })} />
        </Campo>
        {h.tipo === "1" && (
          <label className="check full">
            <input type="checkbox" checked={h.crearNC} onChange={(e) => setH({ ...h, crearNC: e.target.checked })} />
            Generar la No Conformidad vinculada al registrar
          </label>
        )}
      </div>
      {error && (
        <div className="aviso t-danger" role="alert">
          <i className="ti ti-alert-circle" /> {error}
        </div>
      )}
    </Modal>
  );
}

function ModalCrearNC({ idAuditoria, hallazgo, onClose, onCreada }) {
  const toast = useToast();
  const [resp, setResp] = useState(hallazgo.loginResponsable || "");
  const [fecha, setFecha] = useState(hallazgo.fechaCompromiso ? String(hallazgo.fechaCompromiso).slice(0, 10) : hoyISO(30));
  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    if (!resp || !fecha) return toast.aviso("Indica responsable y fecha compromiso.");
    try {
      setGuardando(true);
      const r = await sgcApi(`/auditorias/${idAuditoria}/hallazgos/${hallazgo.idHallazgo}/nc`, { method: "POST", body: { loginResponsable: resp, fechaCompromiso: fecha } });
      toast.ok(`Se generó la no conformidad ${r.folioNC}`);
      avisarCambio();
      onCreada();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };
  return (
    <Modal
      titulo="Generar no conformidad"
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <BotonGuardar ocupado={guardando} icono="ti-plus" onClick={crear}>
            Crear NC
          </BotonGuardar>
        </>
      }
    >
      <p className="texto">{hallazgo.descripcion}</p>
      <Campo etq="Responsable">
        <SelectUsuario value={resp} onChange={setResp} />
      </Campo>
      <Campo etq="Fecha compromiso">
        <input type="date" className="inp" min={hoyISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
    </Modal>
  );
}

function PanelAuditoria({ a, onCambiado }) {
  const toast = useToast();
  const [modo, setModo] = useState(null); // 3 completar | 4 cancelar
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const enviar = async (nuevo) => {
    if ((nuevo === 3 || nuevo === 4) && !texto.trim()) return toast.aviso(nuevo === 3 ? "Registra las conclusiones." : "Indica el motivo de la cancelación.");
    setConfirmar(null);
    try {
      setGuardando(true);
      const r = await sgcApi(`/auditorias/${a.idAuditoria}/estatus`, { method: "PATCH", body: { nuevoEstatus: nuevo, conclusiones: texto.trim() || undefined } });
      toast.ok(`${a.folio} → «${r.estatusLabel}»`);
      setModo(null);
      setTexto("");
      avisarCambio();
      onCambiado();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const puede = (t) => a.transiciones.includes(t);
  return (
    <section className="pnl" aria-label="Siguiente paso">
      <div className="paso__actual">
        <small>Estatus actual</small>
        <Estatus tipo="aud" id={a.idEstatus} />
      </div>
      {!a.transiciones.length ? (
        <p className="paso__final">
          <i className="ti ti-lock" />
          {[3, 4].includes(a.idEstatus) ? "Auditoría concluida." : "Tu rol no puede cambiar el estatus."}
        </p>
      ) : (
        <div className="paso__cuerpo">
          {puede(2) && (
            <BotonGuardar ocupado={guardando && !modo} icono="ti-player-play" className="btn btn--primario btn--lg btn--bloque" onClick={() => setConfirmar(2)}>
              Iniciar auditoría
            </BotonGuardar>
          )}
          {puede(3) && (
            <button type="button" className={`btn btn--lg btn--bloque${modo === 3 ? "" : " btn--primario"}`} onClick={() => setModo(modo === 3 ? null : 3)} aria-expanded={modo === 3}>
              <i className="ti ti-flag-check" /> Completar auditoría
            </button>
          )}
          {puede(4) && (
            <div className="paso__secundarias">
              <button type="button" className="btn btn--fantasma btn--sm btn--peligro" onClick={() => setModo(modo === 4 ? null : 4)}>
                <i className="ti ti-ban" /> Cancelar auditoría
              </button>
            </div>
          )}
          <div className={`paso__form${modo ? " is-abierto" : ""}`}>
            <div>
              {modo && (
                <div className="paso__form-in">
                  <b>{modo === 3 ? "Conclusiones de la auditoría" : "Motivo de la cancelación"}</b>
                  <textarea className="inp" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={modo === 3 ? "Resultado general, fortalezas y áreas de mejora" : "¿Por qué se cancela?"} aria-label={modo === 3 ? "Conclusiones" : "Motivo"} />
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn--sm" onClick={() => setModo(null)} disabled={guardando}>
                      Descartar
                    </button>
                    <BotonGuardar ocupado={guardando} className={`btn btn--sm ${modo === 4 ? "btn--peligro btn--solido" : "btn--primario"}`} onClick={() => (modo === 4 ? setConfirmar(4) : enviar(3))}>
                      {modo === 3 ? "Completar" : "Cancelar auditoría"}
                    </BotonGuardar>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {confirmar === 2 && (
        <Confirmar
          titulo="¿Iniciar la auditoría?"
          mensaje="Pasará a «En curso» y se registrará hoy como fecha de ejecución. Podrás registrar hallazgos conforme avance."
          textoConfirmar="Iniciar"
          peligro={false}
          onConfirmar={() => enviar(2)}
          onCancelar={() => setConfirmar(null)}
          ocupado={guardando}
        />
      )}
      {confirmar === 4 && (
        <Confirmar
          titulo="¿Cancelar la auditoría?"
          mensaje="Una auditoría cancelada ya no admite hallazgos ni cambios de estatus."
          textoConfirmar="Sí, cancelar"
          onConfirmar={() => enviar(4)}
          onCancelar={() => setConfirmar(null)}
          ocupado={guardando}
        />
      )}
    </section>
  );
}

export default function DetalleAuditoria() {
  const { idAuditoria } = useParams();
  const { rol } = useOutletContext();
  const { data: a, error, recargar } = useSgc(() => sgcApi(`/auditorias/${idAuditoria}`), [idAuditoria]);
  const [nuevoHallazgo, setNuevoHallazgo] = useState(false);
  const [generando, setGenerando] = useState(null);
  useMigas([{ to: "/sgc/auditorias", label: "Auditorías" }, { label: a?.folio || "…" }]);

  if (error && !a) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <ErrorCarga error={error} onReintentar={recargar} />
        </div>
      </div>
    );
  }
  if (!a) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <Skel filas={12} />
        </div>
      </div>
    );
  }

  const porTipo = [1, 2, 3].map((t) => ({ tipo: t, items: a.hallazgos.filter((h) => h.tipo === t) }));
  const varios = String(a.fechaFin).slice(0, 10) !== String(a.fechaInicio).slice(0, 10);
  const lider = a.auditores[0];

  return (
    <div className="sg-page">
      <header className="registro">
        <Volver />
        <div className="registro__sello">
          <Folio folio={a.folio} tono="brand" grande />
          <span className={`tag t-${TONO_TIPO[a.tipo]}`}>Auditoría {a.tipoLabel.toLowerCase()}</span>
          {a.normaAplicable && <span className="tag tag--linea">{a.normaAplicable}</span>}
          <Estatus tipo="aud" id={a.idEstatus} />
        </div>
        <div className="registro__fila">
          <TituloSub texto={a.titulo} />
        </div>
        <dl className="hechos">
          <div className="hecho">
            <dt>Fechas</dt>
            <dd>
              {fechaCorta(a.fechaInicio)}
              {varios && ` – ${fechaCorta(a.fechaFin)}`}
            </dd>
          </div>
          <div className="hecho">
            <dt>Auditor líder</dt>
            <dd>{lider ? lider.nombre : "—"}</dd>
          </div>
          <div className="hecho">
            <dt>Ejecución</dt>
            <dd>{a.fechaEjecucion ? fechaCorta(a.fechaEjecucion) : "Sin iniciar"}</dd>
          </div>
          <div className="hecho">
            <dt>Hallazgos</dt>
            <dd className="hallazgos-mini">
              {porTipo.map((g) => (
                <span key={g.tipo} className={`t-${HALLAZGO_TIPO[g.tipo].tono}${g.items.length ? "" : " cero"}`}>
                  <b>{g.items.length}</b> {HALLAZGO_TIPO[g.tipo].corto}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </header>

      <div className="detalle">
        <div className="pila">
          <Panel titulo="Alcance">
            <p className="texto">{a.alcance}</p>
            {a.conclusiones && (
              <div className="bloque">
                <div className="bloque__etq">{a.idEstatus === 4 ? "Motivo de cancelación" : "Conclusiones"}</div>
                <p className="texto">{a.conclusiones}</p>
              </div>
            )}
          </Panel>

          <Panel
            titulo="Hallazgos"
            cuenta={a.hallazgos.length}
            flush
            acciones={
              a.puedeRegistrarHallazgos && (
                <button className="btn btn--primario btn--sm" onClick={() => setNuevoHallazgo(true)}>
                  <i className="ti ti-plus" /> Registrar hallazgo
                </button>
              )
            }
          >
            {!a.hallazgos.length ? (
              <Vacio
                compacto
                icono="ti-search"
                titulo="Sin hallazgos"
                texto={
                  a.puedeRegistrarHallazgos
                    ? "Registra no conformidades, observaciones y oportunidades de mejora conforme avance la auditoría."
                    : a.idEstatus === 1
                      ? "Los hallazgos se registran una vez que la auditoría está en curso."
                      : "Esta auditoría no tiene hallazgos registrados."
                }
              />
            ) : (
              porTipo
                .filter((g) => g.items.length)
                .map((g) => (
                  <div key={g.tipo}>
                    <div className={`grupo-etq t-${HALLAZGO_TIPO[g.tipo].tono}`}>
                      {HALLAZGO_TIPO[g.tipo].label} · {g.items.length}
                    </div>
                    {g.items.map((h) => (
                      <div key={h.idHallazgo} className={`hallazgo t-${HALLAZGO_TIPO[h.tipo].tono}`}>
                        <div>
                          <p className="texto" style={{ color: "var(--ink)" }}>
                            {h.descripcion}
                          </p>
                          <div className="hallazgo__meta">
                            {h.clausulaISO && (
                              <span className="mono">
                                <i className="ti ti-bookmark" /> cl. {h.clausulaISO}
                              </span>
                            )}
                            {h.responsable && (
                              <span>
                                <i className="ti ti-user" /> {h.responsable}
                              </span>
                            )}
                            {h.fechaCompromiso && (
                              <span>
                                <i className="ti ti-calendar" /> {fechaCorta(h.fechaCompromiso)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ alignSelf: "center" }}>
                          {h.idNC ? (
                            <Link to={`/sgc/no-conformidades/${h.idNC}`} className="btn btn--sm">
                              <span className="mono">{h.folioNC}</span>
                              {h.estatusNC && <Estatus tipo="nc" id={h.estatusNC} />}
                            </Link>
                          ) : (
                            h.tipo === 1 &&
                            [1, 2].includes(rol) && (
                              <button className="btn btn--sm" onClick={() => setGenerando(h)}>
                                <i className="ti ti-plus" /> Generar NC
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
            )}
          </Panel>

          <Archivos base={`/auditorias/${a.idAuditoria}`} archivos={a.archivos} puedeAdjuntar={a.puedeAdjuntar} onCambio={recargar} rolCoordinador={rol === 1} titulo="Plan, informe y evidencia" />
        </div>

        <aside className="detalle__lateral">
          <PanelAuditoria a={a} onCambiado={recargar} />
          <Panel titulo="Equipo auditor" cuenta={a.auditores.length} flush>
            {a.auditores.map((u, i) => (
              <div key={u.login} className="fila" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
                <Avatar nombre={u.nombre} />
                <span className="fila__txt">
                  <b>{u.nombre}</b>
                  <small>{i === 0 ? "Auditor líder" : u.area || "Auditor"}</small>
                </span>
              </div>
            ))}
          </Panel>
          <Panel titulo="Áreas auditadas" cuenta={a.areas.length}>
            {a.areas.length ? (
              <div className="opciones">
                {a.areas.map((ar) => (
                  <span key={ar.idDepartamento} className="chip chip--sin-x">
                    {ar.departamento} <span className="muted">· {ar.sitio}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">{plural(0, "área", "áreas")} registradas.</p>
            )}
          </Panel>
        </aside>
      </div>

      {nuevoHallazgo && (
        <ModalHallazgo
          idAuditoria={a.idAuditoria}
          onClose={() => setNuevoHallazgo(false)}
          onCreado={() => {
            setNuevoHallazgo(false);
            recargar();
          }}
        />
      )}
      {generando && (
        <ModalCrearNC
          idAuditoria={a.idAuditoria}
          hallazgo={generando}
          onClose={() => setGenerando(null)}
          onCreada={() => {
            setGenerando(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}
