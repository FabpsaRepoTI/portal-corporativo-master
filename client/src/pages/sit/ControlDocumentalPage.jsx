// pages/sit/ControlDocumentalPage.jsx
// Centro de control documental: quién tiene acceso al SIT, con qué rol y
// en qué estado, y la auditoría de los cambios. Exclusivo de las cuentas de
// sit_administradores — el servidor rechaza cualquier otra (403) en cada
// endpoint /api/sit/control/*; esta página solo muestra lo que el servidor
// permite. Los roles son PROVISIONALES hasta la matriz definitiva.
import { useCallback, useEffect, useMemo, useState } from "react";
import SitHero from "./components/SitHero";
import SitModal from "./components/SitModal";
import SitPaginador, { usePaginacion } from "./components/SitPaginador";
import SitPreparando from "./components/SitPreparando";
import useSitToast from "./components/useSitToast";
import { sitApi, fechaHora } from "./sitApi";
import "./sit.css";
import "./SitNube.css";
import "./ControlDocumentalPage.css";

const ESTADO = {
  ACTIVO: { label: "Activo", clase: "activo" },
  SUSPENDIDO: { label: "Suspendido", clase: "suspendido" },
  REVOCADO: { label: "Revocado", clase: "revocado" },
  SIN_MODULO: { label: "Sin módulo", clase: "pendiente" },
};
const ORIGEN = { USUARIO: "Asignado", AREA: "Por área", DEFAULT: "Por defecto" };
const ACCION_AUDIT = {
  VISUALIZAR: "Abrió un documento",
  DOWNLOAD_DOC: "Descargó un documento",
  PRINT_DOC: "Imprimió un documento",
  ACCESS_GRANT: "Autorizó",
  ACCESS_ROLE: "Cambió rol",
  ACCESS_SUSPEND: "Suspendió",
  ACCESS_REVOKE: "Revocó",
  ACCESS_RESTORE: "Reactivó",
};
const PESTANAS = [
  { id: "usuarios", label: "Usuarios", icono: "ti-users" },
  { id: "roles", label: "Roles y permisos", icono: "ti-shield-check" },
  { id: "auditoria", label: "Auditoría", icono: "ti-history" },
];

function Permisos({ u }) {
  return (
    <span className="ctl-permisos">
      <i className={`ti ti-eye${u.puedeConsultarDocs ? " is-on" : ""}`} title={u.puedeConsultarDocs ? "Consulta documentos" : "No consulta documentos"} />
      <i className={`ti ti-download${u.puedeDescargar ? " is-on" : ""}`} title={u.puedeDescargar ? "Descarga" : "No descarga"} />
      <i className={`ti ti-printer${u.puedeImprimir ? " is-on" : ""}`} title={u.puedeImprimir ? "Imprime" : "No imprime"} />
    </span>
  );
}

export default function ControlDocumentalPage() {
  const [toastEl, showToast] = useSitToast();
  const [pestana, setPestana] = useState("usuarios");
  const [resumen, setResumen] = useState(null);
  const [usuarios, setUsuarios] = useState(null);
  const [roles, setRoles] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [modal, setModal] = useState(null); // { tipo, usuario }

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const [r, u, ro] = await Promise.all([sitApi("/control/resumen"), sitApi("/control/usuarios"), sitApi("/control/roles")]);
      setResumen(r);
      setUsuarios(u);
      setRoles(ro);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (usuarios || []).filter(
      (u) =>
        (!q || u.login.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q) || (u.area || "").toLowerCase().includes(q)) &&
        (!filtroEstado || u.estado === filtroEstado) &&
        (!filtroRol || u.rol === filtroRol)
    );
  }, [usuarios, busqueda, filtroEstado, filtroRol]);
  const pag = usePaginacion(filtrados, `${busqueda}|${filtroEstado}|${filtroRol}`);

  const tras = (mensaje) => {
    setModal(null);
    showToast(mensaje);
    cargar();
  };

  if (error) {
    return (
      <main className="sit-root sit-nube">
        <SitHero eyebrow="Información Técnica" titulo="Centro de" resalte="control documental" volver={{ to: "/sit/dashboard", label: "Volver a Indicadores documentales" }} />
        <div className="sit-state sit-state--error">
          <i className={`ti ${error.status === 403 ? "ti-lock" : "ti-cloud-off"}`} />
          <h3>{error.status === 403 ? "Acceso reservado" : "No se pudo cargar el centro de control"}</h3>
          <p>{error.message}</p>
          {error.status !== 403 && (
            <button className="sit-btn sit-btn--primary" onClick={cargar}>
              <i className="ti ti-refresh" /> Reintentar
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="sit-root sit-nube">
      {toastEl}
      <SitHero
        eyebrow="Información Técnica · Acceso reservado"
        titulo="Centro de"
        resalte="control documental"
        sub="Quién consulta la documentación técnica, con qué permisos, y el registro de cada cambio."
        volver={{ to: "/sit/dashboard", label: "Volver a Indicadores documentales" }}
        acciones={
          <button className="sit-btn sit-btn--primary" onClick={() => setModal({ tipo: "autorizar" })} disabled={!roles}>
            <i className="ti ti-user-plus" /> Autorizar usuario
          </button>
        }
      />

      {!usuarios ? (
        <SitPreparando />
      ) : (
        <>
          <div className="ctl-aviso" role="note">
            <i className="ti ti-alert-triangle" />
            <span>
              <strong>Configuración provisional.</strong> Los roles y permisos son temporales hasta recibir la matriz definitiva. Mientras tanto, los
              perfiles por área conservan la consulta, pero no la descarga ni la impresión.
            </span>
          </div>

          <p className="ctl-resumen">
            <span><strong>{resumen.autorizados}</strong> con acceso activo</span>
            <span><strong>{resumen.porArea}</strong> por su área</span>
            <span><strong>{resumen.conRolProvisional}</strong> con rol provisional</span>
            {resumen.suspendidos > 0 && <span className="ctl-resumen--suspendido"><strong>{resumen.suspendidos}</strong> suspendidos</span>}
            {resumen.revocados > 0 && <span className="ctl-resumen--revocado"><strong>{resumen.revocados}</strong> revocados</span>}
            {resumen.sinModulo > 0 && <span><strong>{resumen.sinModulo}</strong> sin módulo asignado</span>}
          </p>

          <div className="sit-art__tabs ctl-tabs" role="tablist">
            {PESTANAS.map((p) => (
              <button key={p.id} role="tab" aria-selected={pestana === p.id} className={`sit-art__tab${pestana === p.id ? " is-active" : ""}`} onClick={() => setPestana(p.id)}>
                <i className={`ti ${p.icono}`} /> {p.label}
              </button>
            ))}
          </div>

          {pestana === "usuarios" && (
            <section className="sit-fade">
              <div className="ctl-filtros">
                <div className="sit-art__buscar">
                  <i className="ti ti-search" />
                  <input className="sit-input" placeholder="Buscar por nombre, usuario o área…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                </div>
                <select className="sit-input ctl-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Estado">
                  <option value="">Todos los estados</option>
                  {Object.entries(ESTADO).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select className="sit-input ctl-select" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} aria-label="Rol">
                  <option value="">Todos los roles</option>
                  {(roles || []).map((r) => (
                    <option key={r.idPermiso} value={r.rol}>{r.rol}</option>
                  ))}
                </select>
              </div>

              {!filtrados.length ? (
                <div className="sit-state">
                  <i className="ti ti-users" />
                  <h3>Sin usuarios</h3>
                  <p>{usuarios.length ? "Nadie coincide con esos filtros." : "Todavía no hay usuarios con acceso al SIT."}</p>
                </div>
              ) : (
                <div className="sit-table-wrap">
                  <table className="sit-table">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th className="sit-col-fit">Rol</th>
                        <th className="sit-col-fit">Documentos</th>
                        <th className="sit-col-fit">Estado</th>
                        <th>Último cambio</th>
                        <th className="sit-col-fit sit-col-acciones">Acciones</th>
                      </tr>
                    </thead>
                    <tbody key={`${pag.pagina}-${pag.porPagina}`} className="sit-fade">
                      {pag.visibles.map((u) => (
                        <tr key={u.login}>
                          <td className="sit-col-texto">
                            <strong>{u.name}</strong>
                            <small>{u.login} · {u.area || "Sin área"}</small>
                          </td>
                          <td className="sit-col-fit">
                            {u.rol}
                            <small>
                              {ORIGEN[u.origen]}
                              {u.esProvisional && <span className="ctl-tag">Provisional</span>}
                            </small>
                          </td>
                          <td className="sit-col-fit"><Permisos u={u} /></td>
                          <td className="sit-col-fit">
                            <span className={`ctl-estado ctl-estado--${ESTADO[u.estado].clase}`}>{ESTADO[u.estado].label}</span>
                            {u.esAdministradora && <small>Administradora</small>}
                          </td>
                          <td className="sit-col-texto">
                            {u.fechaModificacion ? (
                              <>
                                {fechaHora(u.fechaModificacion)}
                                <small title={u.motivo || ""}>
                                  por {u.modificadoPorNombre || "—"}
                                  {u.motivo ? ` · ${u.motivo}` : ""}
                                </small>
                              </>
                            ) : (
                              <small>Acceso por su área, sin cambios registrados</small>
                            )}
                          </td>
                          <td className="sit-col-fit sit-col-acciones">
                            <div className="ctl-acciones">
                              <button className="sit-btn sit-btn--sm" onClick={() => setModal({ tipo: "efectivos", usuario: u })} title="Permisos efectivos">
                                <i className="ti ti-list-details" />
                              </button>
                              {!u.esAdministradora && (
                                <>
                                  <button className="sit-btn sit-btn--sm" onClick={() => setModal({ tipo: "rol", usuario: u })} title="Cambiar rol">
                                    <i className="ti ti-user-cog" />
                                  </button>
                                  {u.estado === "ACTIVO" ? (
                                    <button className="sit-btn sit-btn--sm" onClick={() => setModal({ tipo: "estado", estado: "SUSPENDIDO", usuario: u })} title="Suspender">
                                      <i className="ti ti-player-pause" />
                                    </button>
                                  ) : u.estado !== "SIN_MODULO" ? (
                                    <button className="sit-btn sit-btn--sm" onClick={() => setModal({ tipo: "estado", estado: "ACTIVO", usuario: u })} title="Reactivar">
                                      <i className="ti ti-player-play" />
                                    </button>
                                  ) : null}
                                  {u.estado !== "REVOCADO" && (
                                    <button className="sit-btn sit-btn--sm sit-btn--danger" onClick={() => setModal({ tipo: "estado", estado: "REVOCADO", usuario: u })} title="Revocar">
                                      <i className="ti ti-user-x" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <SitPaginador {...pag} />
                </div>
              )}
            </section>
          )}

          {pestana === "roles" && <TablaRoles roles={roles} />}
          {pestana === "auditoria" && <Auditoria />}
        </>
      )}

      {modal?.tipo === "autorizar" && (
        <ModalAutorizar roles={roles} onClose={() => setModal(null)} onListo={() => tras("Acceso autorizado")} />
      )}
      {modal?.tipo === "rol" && (
        <ModalRol usuario={modal.usuario} roles={roles} onClose={() => setModal(null)} onListo={() => tras("Rol actualizado")} />
      )}
      {modal?.tipo === "estado" && (
        <ModalEstado
          usuario={modal.usuario}
          estado={modal.estado}
          onClose={() => setModal(null)}
          onListo={() => tras({ ACTIVO: "Acceso reactivado", SUSPENDIDO: "Acceso suspendido", REVOCADO: "Acceso revocado" }[modal.estado])}
        />
      )}
      {modal?.tipo === "efectivos" && <ModalEfectivos usuario={modal.usuario} onClose={() => setModal(null)} />}
    </main>
  );
}

// ── Roles ────────────────────────────────────────────────────
function TablaRoles({ roles }) {
  const columnas = [
    ["puedeConsultarDocs", "Consultar"],
    ["puedeDescargar", "Descargar"],
    ["puedeImprimir", "Imprimir"],
    ["puedeCargarDoc", "Cargar"],
    ["puedeValidar", "Validar"],
    ["puedeVerInactivos", "Ver inactivos"],
  ];
  return (
    <section className="sit-fade">
      <p className="ctl-nota">
        La matriz vive en la base de datos (<code>sit_permisos_puestos</code>): cambiarla no requiere desplegar la aplicación. Los roles marcados
        como provisionales se reemplazarán con la matriz definitiva.
      </p>
      <div className="sit-table-wrap">
        <table className="sit-table">
          <thead>
            <tr>
              <th>Rol</th>
              {columnas.map(([, l]) => (
                <th key={l} className="sit-col-fit ctl-centro">{l}</th>
              ))}
              <th>Se obtiene por</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.idPermiso}>
                <td className="sit-col-texto">
                  <strong>{r.rol}</strong>
                  {r.esProvisional ? <span className="ctl-tag ctl-tag--pendiente">Provisional · pendiente de definir</span> : null}
                  {r.descripcion && <small>{r.descripcion}</small>}
                </td>
                {columnas.map(([k, l]) => (
                  <td key={k} className="sit-col-fit ctl-centro">
                    {r[k] ? <i className="ti ti-check ctl-si" aria-label={`${l}: sí`} /> : <i className="ti ti-minus ctl-no" aria-label={`${l}: no`} />}
                  </td>
                ))}
                <td className="sit-col-texto">
                  {[r.areas && `Área: ${r.areas}`, r.usuarios > 0 && `${r.usuarios} asignado${r.usuarios === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "—"}
                  {!r.asignable && <small>No se asigna desde el panel</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Auditoría ────────────────────────────────────────────────
const FILTROS_AUDIT = [
  { id: "", label: "Todas las acciones" },
  { id: "VISUALIZAR", label: "Aperturas de documentos" },
  { id: "DOWNLOAD_DOC", label: "Descargas" },
  { id: "PRINT_DOC", label: "Impresiones" },
  { id: "ACCESS_GRANT", label: "Autorizaciones" },
  { id: "ACCESS_ROLE", label: "Cambios de rol" },
  { id: "ACCESS_SUSPEND", label: "Suspensiones" },
  { id: "ACCESS_REVOKE", label: "Revocaciones" },
  { id: "ACCESS_RESTORE", label: "Reactivaciones" },
];

function Auditoria() {
  const [filas, setFilas] = useState(null);
  const [siguiente, setSiguiente] = useState(null);
  const [error, setError] = useState(null);
  const [accion, setAccion] = useState("");

  const cargar = useCallback(
    async (antes) => {
      try {
        setError(null);
        const p = new URLSearchParams();
        if (accion) p.set("accion", accion);
        if (antes) p.set("antes", antes);
        const r = await sitApi(`/control/auditoria${p.toString() ? `?${p}` : ""}`);
        setFilas((f) => (antes ? [...(f || []), ...r.filas] : r.filas));
        setSiguiente(r.siguiente);
      } catch (err) {
        setError(err);
      }
    },
    [accion]
  );
  useEffect(() => {
    setFilas(null);
    cargar();
  }, [cargar]);

  const filtro = (
    <div className="ctl-filtros">
      <select className="sit-input ctl-select" value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Tipo de acción">
        {FILTROS_AUDIT.map((f) => (
          <option key={f.id || "todas"} value={f.id}>{f.label}</option>
        ))}
      </select>
    </div>
  );

  if (error) return <>{filtro}<p className="ctl-nota">No se pudo cargar la auditoría: {error.message}</p></>;
  if (!filas) return <>{filtro}<div className="sit-state"><i className="ti ti-loader-2 sit-spin" /></div></>;
  if (!filas.length)
    return (
      <>
        {filtro}
        <div className="sit-state">
          <i className="ti ti-history" />
          <h3>Sin registros</h3>
          <p>
            {accion
              ? "No hay registros de ese tipo de acción."
              : "Aquí aparecerá cada apertura, descarga e impresión de documentos y cada cambio de acceso."}
          </p>
        </div>
      </>
    );
  return (
    <section className="sit-fade">
      {filtro}
      <p className="ctl-nota">Registro de solo lectura: nadie puede editarlo ni borrarlo desde el portal.</p>
      <div className="sit-table-wrap">
        <table className="sit-table">
          <thead>
            <tr>
              <th className="sit-col-fit">Fecha</th>
              <th className="sit-col-fit">Quién</th>
              <th className="sit-col-fit">Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => (
              <tr key={a.idAuditoria}>
                <td className="sit-col-fit">{fechaHora(a.fecha)}</td>
                <td className="sit-col-fit">
                  {a.nombreUsuario}
                  <small>{a.loginUsuario}</small>
                </td>
                <td className="sit-col-fit">{ACCION_AUDIT[a.accion] || a.accion}</td>
                <td className="sit-col-texto">
                  {a.descripcion}
                  {a.ipOrigen && <small>IP {a.ipOrigen}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {siguiente && (
          <div className="sit-pager">
            <span />
            <button className="sit-btn sit-btn--sm" onClick={() => cargar(siguiente)}>Ver más</button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Modales ──────────────────────────────────────────────────
function useEnvio(onListo) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const enviar = async (fn) => {
    setError("");
    try {
      setEnviando(true);
      await fn();
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };
  return { enviando, error, setError, enviar };
}

const Pie = ({ onClose, enviando, form, texto, peligro }) => (
  <>
    <button className="sit-btn" onClick={onClose} disabled={enviando}>Cancelar</button>
    <button className={`sit-btn ${peligro ? "ctl-btn-peligro" : "sit-btn--primary"}`} type="submit" form={form} disabled={enviando}>
      {enviando ? <i className="ti ti-loader-2 sit-spin" /> : <i className="ti ti-check" />} {texto}
    </button>
  </>
);

function SelectorRol({ roles, valor, onChange }) {
  const asignables = roles.filter((r) => r.asignable);
  return (
    <div className="sit-field">
      <label htmlFor="ctl-rol">Rol <span className="req">*</span></label>
      <select id="ctl-rol" className="sit-input" value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecciona un rol…</option>
        {asignables.map((r) => (
          <option key={r.idPermiso} value={r.idPermiso}>
            {r.rol}{r.esProvisional ? " (provisional)" : ""}
          </option>
        ))}
      </select>
      {valor && <small>{roles.find((r) => String(r.idPermiso) === String(valor))?.descripcion}</small>}
    </div>
  );
}

function ModalAutorizar({ roles, onClose, onListo }) {
  const [q, setQ] = useState("");
  const [candidatos, setCandidatos] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [rol, setRol] = useState("");
  const [motivo, setMotivo] = useState("");
  const { enviando, error, setError, enviar } = useEnvio(onListo);

  useEffect(() => {
    if (q.trim().length < 2) return setCandidatos([]);
    const t = setTimeout(() => sitApi(`/control/usuarios/buscar?q=${encodeURIComponent(q.trim())}`).then(setCandidatos).catch(() => setCandidatos([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const guardar = (e) => {
    e.preventDefault();
    if (!elegido) return setError("Elige a la persona que vas a autorizar.");
    if (!rol) return setError("Selecciona su rol.");
    enviar(() => sitApi("/control/usuarios", { method: "POST", body: { login: elegido.login, idPermiso: Number(rol), motivo } }));
  };

  return (
    <SitModal titulo="Autorizar usuario" icono="ti-user-plus" ancho={520} bloqueado={enviando} onClose={onClose}
      pie={<Pie onClose={onClose} enviando={enviando} form="ctl-form-autorizar" texto="Autorizar" />}>
      <form id="ctl-form-autorizar" onSubmit={guardar}>
        {error && <div className="sit-form-error" role="alert"><i className="ti ti-alert-circle" /> {error}</div>}
        <div className="sit-field">
          <label htmlFor="ctl-buscar">Persona <span className="req">*</span></label>
          {elegido ? (
            <div className="ctl-elegido">
              <span>
                <strong>{elegido.name}</strong>
                <small>{elegido.login} · {elegido.area || "Sin área"}</small>
              </span>
              <button type="button" className="sit-btn sit-btn--sm" onClick={() => setElegido(null)}>Cambiar</button>
            </div>
          ) : (
            <>
              <input id="ctl-buscar" className="sit-input" placeholder="Nombre o usuario del portal…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              {candidatos.length > 0 && (
                <ul className="ctl-candidatos">
                  {candidatos.map((c) => (
                    <li key={c.login}>
                      <button type="button" onClick={() => setElegido(c)}>
                        <strong>{c.name}</strong>
                        <small>{c.login} · {c.area || "Sin área"}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <small>Solo aparecen cuentas activas del portal que aún no tienen acceso al SIT.</small>
            </>
          )}
        </div>
        <SelectorRol roles={roles} valor={rol} onChange={setRol} />
        <div className="sit-field">
          <label htmlFor="ctl-motivo">Motivo</label>
          <input id="ctl-motivo" className="sit-input" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Consulta de fichas técnicas para cotizaciones" />
        </div>
      </form>
    </SitModal>
  );
}

function ModalRol({ usuario, roles, onClose, onListo }) {
  const actual = roles.find((r) => r.rol === usuario.rol && r.asignable);
  const [rol, setRol] = useState(actual ? String(actual.idPermiso) : "");
  const [motivo, setMotivo] = useState("");
  const { enviando, error, setError, enviar } = useEnvio(onListo);
  const guardar = (e) => {
    e.preventDefault();
    if (!rol) return setError("Selecciona el nuevo rol.");
    enviar(() => sitApi(`/control/usuarios/${encodeURIComponent(usuario.login)}/rol`, { method: "PUT", body: { idPermiso: Number(rol), motivo } }));
  };
  return (
    <SitModal titulo="Cambiar rol" subtitulo={`${usuario.name} · ${usuario.login}`} icono="ti-user-cog" ancho={480} bloqueado={enviando} onClose={onClose}
      pie={<Pie onClose={onClose} enviando={enviando} form="ctl-form-rol" texto="Guardar" />}>
      <form id="ctl-form-rol" onSubmit={guardar}>
        {error && <div className="sit-form-error" role="alert"><i className="ti ti-alert-circle" /> {error}</div>}
        <p className="ctl-nota">Rol actual: <strong>{usuario.rol}</strong> ({ORIGEN[usuario.origen].toLowerCase()}). El cambio aplica en su siguiente acción en el SIT.</p>
        <SelectorRol roles={roles} valor={rol} onChange={setRol} />
        <div className="sit-field">
          <label htmlFor="ctl-motivo-rol">Motivo</label>
          <input id="ctl-motivo-rol" className="sit-input" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      </form>
    </SitModal>
  );
}

function ModalEstado({ usuario, estado, onClose, onListo }) {
  const [motivo, setMotivo] = useState("");
  const { enviando, error, setError, enviar } = useEnvio(onListo);
  const textos = {
    SUSPENDIDO: { titulo: "Suspender acceso", boton: "Suspender", cuerpo: "No podrá entrar a Información Técnica hasta que lo reactives. Su rol se conserva." },
    REVOCADO: { titulo: "Revocar acceso", boton: "Revocar acceso", cuerpo: "Pierde el acceso a Información Técnica de inmediato: cualquier documento que tenga abierto deja de servirse en su siguiente petición." },
    ACTIVO: { titulo: "Reactivar acceso", boton: "Reactivar", cuerpo: "Vuelve a entrar a Información Técnica con su rol actual." },
  }[estado];
  const guardar = (e) => {
    e.preventDefault();
    if (estado !== "ACTIVO" && !motivo.trim()) return setError("Indica el motivo; queda en la auditoría.");
    enviar(() => sitApi(`/control/usuarios/${encodeURIComponent(usuario.login)}/estado`, { method: "PUT", body: { estado, motivo } }));
  };
  return (
    <SitModal titulo={textos.titulo} subtitulo={`${usuario.name} · ${usuario.login}`} icono={estado === "ACTIVO" ? "ti-player-play" : "ti-alert-triangle"} ancho={460} bloqueado={enviando} onClose={onClose}
      pie={<Pie onClose={onClose} enviando={enviando} form="ctl-form-estado" texto={textos.boton} peligro={estado === "REVOCADO"} />}>
      <form id="ctl-form-estado" onSubmit={guardar}>
        {error && <div className="sit-form-error" role="alert"><i className="ti ti-alert-circle" /> {error}</div>}
        <p className={`ctl-confirmar${estado === "REVOCADO" ? " ctl-confirmar--peligro" : ""}`}>{textos.cuerpo}</p>
        <div className="sit-field">
          <label htmlFor="ctl-motivo-estado">Motivo {estado !== "ACTIVO" && <span className="req">*</span>}</label>
          <input id="ctl-motivo-estado" className="sit-input" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </div>
      </form>
    </SitModal>
  );
}

function ModalEfectivos({ usuario, onClose }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    sitApi(`/control/usuarios/${encodeURIComponent(usuario.login)}/permisos`).then(setP).catch((e) => setError(e.message));
  }, [usuario.login]);
  const MOTIVO = { SIN_MODULO: "No tiene asignado el módulo Información Técnica.", SUSPENDIDO: "Acceso suspendido.", REVOCADO: "Acceso revocado.", SIN_PERFIL: "Su rol no permite entrar al módulo." };
  const filas = p?.acceso
    ? [
        ["Entrar al módulo", true],
        ["Consultar documentos", p.puedeConsultarDocs],
        ["Descargar documentos", p.puedeDescargar],
        ["Imprimir documentos", p.puedeImprimir],
        ["Cargar documentos", p.puedeCargarDoc],
        ["Validar documentos (Calidad)", p.puedeValidar],
        ["Ver artículos inactivos", p.puedeVerInactivos],
        ["Centro de control", p.esAdministradoraDocumental],
        ["Planta IAFSA", p.plantas?.includes(1)],
        ["Planta FDNC", p.plantas?.includes(2)],
      ]
    : [];
  return (
    <SitModal titulo="Permisos efectivos" subtitulo={`${usuario.name} · ${usuario.login}`} icono="ti-list-details" ancho={460} onClose={onClose}
      pie={<button className="sit-btn sit-btn--primary" onClick={onClose}>Cerrar</button>}>
      {error ? (
        <p className="ctl-nota">{error}</p>
      ) : !p ? (
        <div className="sit-state"><i className="ti ti-loader-2 sit-spin" /></div>
      ) : !p.acceso ? (
        <p className="ctl-confirmar ctl-confirmar--peligro"><i className="ti ti-lock" /> Sin acceso al SIT. {MOTIVO[p.motivo]}</p>
      ) : (
        <>
          <p className="ctl-nota">
            Tal como los calcula el servidor ahora. Rol <strong>{p.perfil}</strong> ({ORIGEN[p.origen].toLowerCase()}){p.perfilProvisional ? " · provisional" : ""}.
          </p>
          <ul className="ctl-efectivos">
            {filas.map(([l, v]) => (
              <li key={l}>
                <i className={`ti ${v ? "ti-circle-check ctl-si" : "ti-circle-minus ctl-no"}`} /> {l}
              </li>
            ))}
          </ul>
        </>
      )}
    </SitModal>
  );
}
