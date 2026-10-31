// pages/sgc/EquipoSGI.jsx
// Control del equipo SGI (solo Coordinador): quién tiene rol en el SGC, qué
// rol tiene y a qué módulos entra. Sin módulos marcados = acceso completo.
// "Última actividad" = movimiento más reciente de la persona en el SGC (el
// portal no registra inicios de sesión).
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { BotonGuardar, Campo, Confirmar, Encabezado, ErrorCarga, Modal, Skel, Vacio, iniciales, useMigas, useToast } from "./components/ui";
import { hace, sgcApi, sgcRespuesta, useSgc } from "./sgcApi";

const TONO_ROL = { 1: "brand", 2: "cyan", 3: "ok", 4: "warn" };
const BADGE_AUTO = (
  <span className="tag t-ok" style={{ fontSize: 11 }} title="Acceso automático por área SGI">
    <i className="ti ti-shield-check" /> Auto-SGI
  </span>
);

/** Buscador de usuarios que llama a GET /api/sgc/equipo/buscar */
function BuscadorUsuario({ value, onChange }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [elegido, setElegido] = useState(null);
  const timer = useRef(null);

  const buscar = useCallback(async (texto) => {
    if (texto.length < 2) { setResultados([]); return; }
    setCargando(true);
    try {
      const r = await sgcRespuesta(`/equipo/buscar?q=${encodeURIComponent(texto)}`);
      setResultados(r.data || []);
    } catch { setResultados([]); }
    finally { setCargando(false); }
  }, []);

  const cambiar = (e) => {
    const v = e.target.value;
    setQ(v);
    setElegido(null);
    onChange("", null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => buscar(v), 300);
  };

  const elegir = (u) => {
    setElegido(u);
    setQ(u.nombre);
    setResultados([]);
    onChange(u.login, u);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div style={{ position: "relative" }}>
      <input
        className="inp"
        value={elegido ? q : q}
        onChange={cambiar}
        placeholder="Buscar por nombre o usuario…"
        autoComplete="off"
      />
      {cargando && <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 4 }}>Buscando…</span>}
      {resultados.length > 0 && (
        <div className="sg-buscar__lista" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 9999 }}>
          {resultados.map((u) => (
            <button key={u.login} type="button" className="sg-buscar__item" onClick={() => elegir(u)}>
              <span className="eq-av" style={{ width: 24, height: 24, fontSize: 11 }}>{iniciales(u.nombre)}</span>
              <span style={{ flex: 1 }}>
                <b>{u.nombre}</b>
                <small className="muted" style={{ display: "block" }}>{u.login}{u.area ? ` · ${u.area}` : ""}</small>
              </span>
              {u.autoSgi && BADGE_AUTO}
            </button>
          ))}
        </div>
      )}
      {!cargando && q.length >= 2 && !resultados.length && !elegido && (
        <span className="muted" style={{ fontSize: 12, display: "block", marginTop: 4 }}>Sin resultados.</span>
      )}
    </div>
  );
}
const DESC_ROL = {
  1: "Acceso total y administración del equipo.",
  2: "Auditorías, hallazgos y Mesa SGI.",
  3: "Registra NCs y atiende lo suyo.",
  4: "Lectura e indicadores.",
};

function Iniciales({ nombre }) {
  return (
    <span className="eq-av" aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

/** Rol + módulos. modulos = null (todos) o arreglo de claves. */
function EditorAcceso({ roles, catalogo, idRol, modulos, onRol, onModulos }) {
  const completo = modulos == null;
  const claves = Object.keys(catalogo);
  const toggle = (m) => {
    const base = completo ? claves : modulos;
    const sig = base.includes(m) ? base.filter((x) => x !== m) : [...base, m];
    onModulos(sig.length === claves.length ? null : sig);
  };
  return (
    <>
      <div className="campo">
        <span className="campo__etq">Rol</span>
        <div className="eq-roles" role="radiogroup" aria-label="Rol">
          {Object.entries(roles).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={idRol === Number(id)} className={`eq-roles__op t-${TONO_ROL[id]}${idRol === Number(id) ? " is-on" : ""}`} onClick={() => onRol(Number(id))}>
              <b>{label}</b>
              <small>{DESC_ROL[id]}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="campo">
        <span className="campo__etq">
          Módulos
          <label className="check" style={{ marginLeft: "auto", fontWeight: 500 }}>
            <input type="checkbox" checked={completo} onChange={(e) => onModulos(e.target.checked ? null : claves)} /> Acceso completo
          </label>
        </span>
        <div className="eq-modulos">
          {claves.map((m) => {
            const on = completo || modulos.includes(m);
            return (
              <label key={m} className={`eq-switch${on ? " is-on" : ""}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(m)} />
                <span className="eq-switch__riel" aria-hidden="true" />
                {catalogo[m]}
              </label>
            );
          })}
        </div>
        {!completo && !modulos.length && <span className="campo__error">Elige al menos un módulo.</span>}
      </div>
    </>
  );
}

function ModalMiembro({ miembro, catalogo, roles, yo, onClose, onHecho }) {
  const toast = useToast();
  const nuevo = !miembro;
  const [login, setLogin] = useState("");
  const [usuarioElegido, setUsuarioElegido] = useState(null);
  const [idRol, setIdRol] = useState(miembro?.idRol || 3);
  const [modulos, setModulos] = useState(miembro ? miembro.modulos : null);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const esYo = miembro && String(miembro.login).toUpperCase() === String(yo).toUpperCase();
  const invalido = modulos != null && !modulos.length;

  const guardar = async () => {
    if (nuevo && !login) return toast.error("Elige a la persona.");
    if (invalido) return toast.error("Elige al menos un módulo.");
    try {
      setGuardando(true);
      if (nuevo) {
        const r = await sgcApi("/equipo", { method: "POST", body: { login, idRol, modulos } });
        toast.ok(r.reactivado ? `${r.nombre} volvió al equipo` : `${r.nombre} se agregó al equipo`);
      } else {
        await sgcApi(`/equipo/${encodeURIComponent(miembro.login)}`, { method: "PUT", body: { idRol, modulos, ...(miembro.activo ? {} : { activo: true }) } });
        toast.ok("Acceso actualizado");
      }
      onHecho();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };
  const desactivar = async () => {
    try {
      setGuardando(true);
      await sgcApi(`/equipo/${encodeURIComponent(miembro.login)}`, { method: "DELETE" });
      toast.ok(`${miembro.nombre} ya no tiene acceso al SGC`);
      onHecho();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
      setConfirmar(false);
    }
  };

  return (
    <Modal
      titulo={nuevo ? "Agregar miembro" : miembro.nombre}
      ancho
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          {!nuevo && miembro.activo && !esYo && (
            <button className="btn btn--fantasma btn--peligro" style={{ marginRight: "auto" }} onClick={() => setConfirmar(true)} disabled={guardando}>
              <i className="ti ti-user-off" /> Desactivar
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <BotonGuardar ocupado={guardando} icono={nuevo ? "ti-user-plus" : "ti-device-floppy"} onClick={guardar} disabled={invalido}>
            {nuevo ? "Agregar" : miembro.activo ? "Guardar" : "Reactivar y guardar"}
          </BotonGuardar>
        </>
      }
    >
      {nuevo ? (
        <Campo etq="Persona" ayuda="Busca por nombre. No aparecen quienes ya tienen acceso.">
          <BuscadorUsuario
            value={login}
            onChange={(l, u) => { setLogin(l); setUsuarioElegido(u); if (u?.autoSgi) setIdRol(1); }}
          />
          {usuarioElegido?.autoSgi && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              {BADGE_AUTO}
              <span className="muted" style={{ fontSize: 12 }}>El rol se asignará como Coordinador (área SGI).</span>
            </div>
          )}
        </Campo>
      ) : (
        <p className="texto muted" style={{ marginBottom: 12 }}>
          {miembro.email || miembro.login}
          {esYo && " · eres tú: no puedes quitarte el rol de Coordinador ni desactivarte."}
        </p>
      )}
      <EditorAcceso roles={roles} catalogo={catalogo} idRol={idRol} modulos={modulos} onRol={(r) => (esYo && r !== 1 ? toast.aviso("No puedes quitarte el rol de Coordinador.") : setIdRol(r))} onModulos={setModulos} />
      {confirmar && (
        <Confirmar
          titulo={`¿Quitar el acceso de ${miembro.nombre}?`}
          mensaje="Dejará de entrar al SGC. Sus registros e historial se conservan y puedes reactivarla después."
          textoConfirmar="Sí, desactivar"
          onConfirmar={desactivar}
          onCancelar={() => setConfirmar(false)}
          ocupado={guardando}
        />
      )}
    </Modal>
  );
}

// ─── Tab: Equipo SGI (gestión de miembros) ──────────────────────────────────
function TabEquipo({ data, error, cargando, recargar, login, onModal }) {
  const miembros = data?.miembros || [];
  if (error) return <ErrorCarga error={error} onReintentar={recargar} />;
  if (cargando && !data) return <div className="pnl"><Skel filas={6} /></div>;
  return (
    <div className="pnl">
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Rol</th>
              <th>Módulos</th>
              <th>Estado</th>
              <th className="der">Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => (
              <tr key={m.login} className={`link${m.activo ? "" : " is-inactivo"}`} tabIndex={0} onClick={() => onModal({ miembro: m })} onKeyDown={(e) => e.key === "Enter" && onModal({ miembro: m })}>
                <td>
                  <span className="eq-persona">
                    <Iniciales nombre={m.nombre} />
                    <span>
                      <b className="ink">{m.nombre}</b>
                      <small className="muted">{m.email || m.login}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span className={`tag t-${TONO_ROL[m.idRol]}`}>{m.rol}</span>
                    {m.area && /SGI/i.test(m.area) && BADGE_AUTO}
                  </span>
                </td>
                <td>
                  {m.modulos == null ? (
                    <span className="eq-chip eq-chip--todo">Acceso completo</span>
                  ) : (
                    <span className="eq-chips">
                      {m.modulos.map((k) => (
                        <span key={k} className="eq-chip">{data.modulos[k]}</span>
                      ))}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`tag t-${m.activo ? "ok" : "neutral"}`}>
                    <i className={`ti ${m.activo ? "ti-circle-check" : "ti-circle-off"}`} /> {m.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="der muted">{m.ultimaActividad ? hace(m.ultimaActividad) : "Sin actividad"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Accesos y permisos (matriz módulo × persona) ───────────────────────
function TabAccesos({ data }) {
  if (!data) return null;
  const modulos = Object.entries(data.modulos); // [[clave, label], ...]
  const activos = (data.miembros || []).filter((m) => m.activo);
  return (
    <div className="pnl" style={{ overflowX: "auto" }}>
      <table className="tabla">
        <thead>
          <tr>
            <th>Módulo</th>
            {activos.map((m) => (
              <th key={m.login} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                <span title={m.nombre} style={{ fontSize: 12 }}>{m.nombre.split(" ")[0]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modulos.map(([clave, label]) => (
            <tr key={clave}>
              <td className="strong ink">{label}</td>
              {activos.map((m) => {
                const tiene = m.modulos == null || m.modulos.includes(clave);
                return (
                  <td key={m.login} style={{ textAlign: "center" }}>
                    {tiene ? (
                      <i className="ti ti-circle-check" style={{ color: "var(--ok)" }} />
                    ) : (
                      <i className="ti ti-circle-x" style={{ color: "var(--danger)", opacity: 0.4 }} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab: Actividad reciente ──────────────────────────────────────────────────
const TONO_TIPO_ACT = { nc: "danger", ac: "info", msi: "cyan" };

function TabActividad() {
  const { data, error, cargando, recargar } = useSgc(() => sgcApi("/equipo/actividad"), []);
  const lista = data || [];
  if (error) return <ErrorCarga error={error} onReintentar={recargar} />;
  if (cargando && !data) return <div className="pnl"><Skel filas={8} /></div>;
  if (!lista.length) return <div className="pnl"><Vacio icono="ti-activity" titulo="Sin actividad registrada" texto="Aún no hay movimientos del equipo en el SGC." /></div>;
  return (
    <div className="pnl">
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Persona</th>
              <th>Referencia</th>
              <th className="der">Hace</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a, i) => (
              <tr key={i}>
                <td>
                  <span className={`tag t-${TONO_TIPO_ACT[a.tipo] || "neutral"}`}>{a.act}</span>
                </td>
                <td className="ink">{a.nombre}</td>
                <td className="mono muted">{a.referencia || "—"}</td>
                <td className="der muted">{hace(a.fecha)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const TABS_EQ = [
  { id: "equipo", label: "Equipo SGI" },
  { id: "accesos", label: "Accesos y permisos" },
  { id: "actividad", label: "Actividad reciente" },
];

export default function EquipoSGI() {
  const { rol, login } = useOutletContext();
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("equipo");
  const [modal, setModal] = useState(null);
  const { data, error, cargando, recargar } = useSgc(() => (rol === 1 ? sgcApi("/equipo") : Promise.resolve(null)), [rol, version]);
  useMigas([{ to: "/sgc/dashboard", label: "SGI" }, { label: "Equipo SGI" }]);

  if (rol !== 1) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <Vacio icono="ti-lock" titulo="Solo para el Coordinador SGI" texto="La administración del equipo y sus módulos la hace el Coordinador SGI." />
        </div>
      </div>
    );
  }

  const activos = (data?.miembros || []).filter((m) => m.activo).length;

  return (
    <div className="sg-page">
      <Encabezado
        kicker="Administración"
        titulo="Equipo SGI"
        cuenta={data ? activos : null}
        desc="Rol y módulos de cada persona con acceso al SGC. Sin restricción de módulos = acceso completo."
        acciones={
          tab === "equipo" && (
            <button className="btn btn--primario" onClick={() => setModal({ nuevo: true })}>
              <i className="ti ti-user-plus" /> Agregar miembro
            </button>
          )
        }
      />

      <div className="eq-tabs" role="tablist">
        {TABS_EQ.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`eq-tab${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "equipo" && <TabEquipo data={data} error={error} cargando={cargando} recargar={recargar} login={login} onModal={setModal} />}
      {tab === "accesos" && (data ? <TabAccesos data={data} /> : cargando ? <div className="pnl"><Skel filas={6} /></div> : null)}
      {tab === "actividad" && <TabActividad />}

      {modal && (
        <ModalMiembro
          miembro={modal.miembro}
          catalogo={data.modulos}
          roles={data.roles}
          yo={login}
          onClose={() => setModal(null)}
          onHecho={() => { setModal(null); setVersion((v) => v + 1); }}
        />
      )}
    </div>
  );
}
