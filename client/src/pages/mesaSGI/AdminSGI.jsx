// pages/mesaSGI/AdminSGI.jsx
// Gestión de la Mesa SGI (equipo SGI): tarjetas por estatus, filtros, tabla de
// solicitudes con menú de acciones (ver / asignar) y catálogo de servicios.
import { useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { BotonGuardar, Campo, Encabezado, ErrorCarga, Modal, Pastilla, Persona, Skel, TarjetasEstado, Vacio, exportarCSV, useToast } from "../sgc/components/ui";
import { fechaCorta, sgcApi, sgcRespuesta, useSgc, MSI_ESTATUS, MSI_PRIORIDAD } from "../sgc/sgcApi";
import { SLA } from "./MesaSGILayout";

// ─── Tab Servicios ───────────────────────────────────────────────────────────

function ModalServicio({ servicio, onClose, onHecho }) {
  const toast = useToast();
  const nuevo = !servicio;
  const [nombre, setNombre] = useState(servicio?.nombre || "");
  const [descripcion, setDescripcion] = useState(servicio?.descripcion || "");
  const [slaHoras, setSlaHoras] = useState(servicio?.slaHoras ?? 24);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) return toast.error("El nombre es obligatorio.");
    try {
      setGuardando(true);
      if (nuevo) {
        await sgcApi("/mesa-sgi/servicios", { method: "POST", body: { nombre: nombre.trim(), descripcion: descripcion.trim(), slaHoras: Number(slaHoras) } });
        toast.ok("Servicio creado");
      } else {
        await sgcApi(`/mesa-sgi/servicios/${servicio.idServicio}`, { method: "PUT", body: { nombre: nombre.trim(), descripcion: descripcion.trim(), slaHoras: Number(slaHoras) } });
        toast.ok("Servicio actualizado");
      }
      onHecho();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={nuevo ? "Nuevo servicio" : "Editar servicio"}
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
          <BotonGuardar ocupado={guardando} onClick={guardar}>{nuevo ? "Crear" : "Guardar"}</BotonGuardar>
        </>
      }
    >
      <Campo etq="Nombre">
        <input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Capacitación ISO 9001" />
      </Campo>
      <Campo etq="Descripción (opcional)">
        <textarea className="inp" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Breve descripción del servicio…" />
      </Campo>
      <Campo etq="SLA (horas hábiles)">
        <input className="inp" type="number" min={1} max={720} value={slaHoras} onChange={(e) => setSlaHoras(e.target.value)} />
      </Campo>
    </Modal>
  );
}

function TabServicios({ esCoordinador, version, onActualizar }) {
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const { data, error, cargando, recargar } = useSgc(() => sgcApi("/mesa-sgi/servicios"), [version]);
  const lista = data || [];

  const desactivar = async (s) => {
    try {
      await sgcApi(`/mesa-sgi/servicios/${s.idServicio}`, { method: "DELETE" });
      toast.ok(`"${s.nombre}" desactivado`);
      onActualizar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (error) return <ErrorCarga error={error} onReintentar={recargar} />;
  if (cargando && !data) return <div className="pnl"><Skel filas={5} /></div>;

  return (
    <>
      {esCoordinador && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="btn btn--primario" onClick={() => setModal({ nuevo: true })}>
            <i className="ti ti-plus" /> Nuevo servicio
          </button>
        </div>
      )}
      {!lista.length ? (
        <div className="pnl">
          <Vacio icono="ti-lifebuoy-off" titulo="Sin servicios" texto="No hay servicios en el catálogo. Agrega el primero." />
        </div>
      ) : (
        <div className="pnl">
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>SLA</th>
                  {esCoordinador && <th className="der">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.idServicio}>
                    <td>
                      <span className="strong ink">{s.nombre}</span>
                      {s.descripcion && <div className="muted" style={{ fontSize: 12 }}>{s.descripcion}</div>}
                    </td>
                    <td className="muted">{s.slaHoras}h</td>
                    {esCoordinador && (
                      <td className="der" style={{ whiteSpace: "nowrap" }}>
                        <button className="btn btn--chico" onClick={() => setModal({ servicio: s })}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button className="btn btn--chico btn--peligro" style={{ marginLeft: 6 }} onClick={() => desactivar(s)}>
                          <i className="ti ti-trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {modal && (
        <ModalServicio
          servicio={modal.servicio}
          onClose={() => setModal(null)}
          onHecho={() => { setModal(null); onActualizar(); recargar(); }}
        />
      )}
    </>
  );
}

// ─── Menú de acciones por fila ───────────────────────────────────────────────

function MenuTicket({ ticket, equipo, onVer, onAsignar }) {
  const [abierto, setAbierto] = useState(false);
  const cerrado = [4, 5].includes(ticket.idEstatus);
  return (
    <div className="lst-menu" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn btn--fantasma btn--icono btn--sm" aria-label={`Acciones de ${ticket.folio}`} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <i className="ti ti-dots-vertical" />
      </button>
      {abierto && (
        <>
          <div className="lst-menu__fondo" onClick={() => setAbierto(false)} />
          <div className="lst-menu__lista" role="menu">
            <button type="button" role="menuitem" onClick={() => { setAbierto(false); onVer(); }}>
              <i className="ti ti-eye" /> Ver detalle
            </button>
            {!cerrado && equipo.length > 0 && (
              <>
                <span className="lst-menu__etq">Asignar a</span>
                {equipo.map((u) => (
                  <button key={u.login} type="button" role="menuitem" className={u.login === ticket.loginAsignado ? "is-on" : ""} onClick={() => { setAbierto(false); onAsignar(u.login); }}>
                    <i className={`ti ${u.login === ticket.loginAsignado ? "ti-check" : "ti-user"}`} /> {u.nombre}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const ICONOS_MSI = { 1: "ti-inbox", 2: "ti-loader", 3: "ti-clock-pause", 4: "ti-circle-check", 5: "ti-ban" };
const TARJETAS_MSI = [
  { id: 1, label: "Abiertas", estatus: [1] },
  { id: 2, label: "En proceso", estatus: [2] },
  { id: 3, label: "En espera", estatus: [3] },
  { id: 4, label: "Cerradas", estatus: [4, 5] },
];

export default function AdminSGI() {
  const toast = useToast();
  const navigate = useNavigate();
  const { esSGI, servicios, rol } = useOutletContext();
  const [vista, setVista] = useState("tickets");
  const [version, setVersion] = useState(0);
  const [estatus, setEstatus] = useState(null);
  const [q, setQ] = useState("");
  const [servicio, setServicio] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [desde, setDesde] = useState("");
  const panel = useSgc(() => (esSGI ? sgcRespuesta("/mesa-sgi/admin").then((r) => r.data) : Promise.resolve(null)), [esSGI, version]);
  const tickets = useSgc(() => (esSGI ? sgcApi("/mesa-sgi/tickets") : Promise.resolve([])), [esSGI, version]);

  if (!esSGI) return <Navigate to="/mesa-sgi" replace />;

  const equipo = panel.data?.equipo || [];
  const esCoordinador = rol === 1;
  const todos = tickets.data || [];
  const solicitantes = [...new Set(todos.map((t) => t.solicitante).filter(Boolean))].sort();
  const texto = q.trim().toLowerCase();

  const filtrados = todos.filter(
    (t) =>
      (!servicio || String(t.idServicio) === servicio || t.servicio === servicios.find((s) => String(s.idServicio) === servicio)?.nombre) &&
      (!prioridad || String(t.prioridad) === prioridad) &&
      (!solicitante || t.solicitante === solicitante) &&
      (!desde || String(t.fechaCreacion).slice(0, 10) >= desde) &&
      (!texto || `${t.folio} ${t.titulo}`.toLowerCase().includes(texto)),
  );
  const tarjetaSel = TARJETAS_MSI.find((c) => c.id === estatus);
  const lista = tarjetaSel ? filtrados.filter((t) => tarjetaSel.estatus.includes(t.idEstatus)) : filtrados;
  const tarjetas = TARJETAS_MSI.map((c) => {
    const del = filtrados.filter((t) => c.estatus.includes(t.idEstatus));
    return {
      id: c.id,
      label: c.label,
      total: del.length,
      vencidas: c.id === 4 ? 0 : del.filter((t) => t.horasRestantes != null && t.horasRestantes < 0).length,
      tono: MSI_ESTATUS[c.id].tono,
      icono: ICONOS_MSI[c.id],
    };
  });

  const asignar = async (t, login) => {
    try {
      const r = await sgcApi(`/mesa-sgi/tickets/${t.idTicket}/asignar`, { method: "PUT", body: { loginAsignado: login } });
      toast.ok(`${t.folio} asignada a ${r.asignado}`);
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportar = () =>
    exportarCSV(
      "mesa-sgi",
      ["Folio", "Solicitud", "Servicio", "Solicitante", "Estado", "Prioridad", "Creada", "Asignada a"],
      lista.map((t) => [t.folio, t.titulo, t.servicio, t.solicitante, MSI_ESTATUS[t.idEstatus]?.label, MSI_PRIORIDAD[t.prioridad]?.label, String(t.fechaCreacion || "").slice(0, 10), t.asignado || ""]),
    );

  return (
    <div className="msi__pagina lst-page">
      <Encabezado
        kicker={<>Mesa SGI <i className="ti ti-chevron-right" /> Solicitudes</>}
        titulo="Mesa de Servicio SGC"
        cuenta={tickets.data ? todos.length : null}
        desc="Solicitudes al departamento de Sistemas de Gestión."
        acciones={
          <>
            <button className={`btn${vista === "servicios" ? " is-on" : ""}`} onClick={() => setVista(vista === "servicios" ? "tickets" : "servicios")}>
              <i className={`ti ${vista === "servicios" ? "ti-list" : "ti-settings"}`} /> {vista === "servicios" ? "Solicitudes" : "Servicios"}
            </button>
            <button className="btn" onClick={exportar} disabled={!lista.length || vista !== "tickets"}>
              <i className="ti ti-download" /> Exportar
            </button>
            <button className="btn btn--primario" onClick={() => navigate("/mesa-sgi/nueva")}>
              <i className="ti ti-plus" /> Nueva solicitud
            </button>
          </>
        }
      />

      {vista === "servicios" ? (
        <TabServicios esCoordinador={esCoordinador} version={version} onActualizar={() => setVersion((v) => v + 1)} />
      ) : (
        <>
          {tickets.data && <TarjetasEstado items={tarjetas} sel={estatus} onSel={setEstatus} total={filtrados.length} />}

          <div className="lst-filtros" aria-label="Filtros">
            <div className="lst-buscar">
              <i className="ti ti-search" />
              <input className="inp" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio o descripción…" aria-label="Buscar solicitudes" />
            </div>
            <select className="inp" value={servicio} onChange={(e) => setServicio(e.target.value)} aria-label="Servicio">
              <option value="">Todos los servicios</option>
              {servicios.map((s) => <option key={s.idServicio} value={s.idServicio}>{s.nombre}</option>)}
            </select>
            <select className="inp" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} aria-label="Prioridad">
              <option value="">Todas las prioridades</option>
              {Object.entries(MSI_PRIORIDAD).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
            <select className="inp" value={solicitante} onChange={(e) => setSolicitante(e.target.value)} aria-label="Solicitante">
              <option value="">Cualquier solicitante</option>
              {solicitantes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" className="inp" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Creada desde" title="Creada desde" />
          </div>

          <section className="pnl lst-tabla">
            {tickets.error || panel.error ? (
              <ErrorCarga error={tickets.error || panel.error} onReintentar={() => setVersion((v) => v + 1)} />
            ) : tickets.cargando && !tickets.data ? (
              <Skel filas={8} />
            ) : !lista.length ? (
              <Vacio icono="ti-inbox" titulo="Sin solicitudes en esta vista" texto="Prueba con otro filtro." />
            ) : (
              <div className="tabla-wrap">
                <table className="tabla lst-t">
                  <thead>
                    <tr>
                      <th className="fit">Folio</th>
                      <th>Solicitud</th>
                      <th>Servicio</th>
                      <th>Solicitante</th>
                      <th className="fit">Estado</th>
                      <th className="fit">Prioridad</th>
                      <th className="fit">Plazo</th>
                      <th className="fit">Creada</th>
                      <th className="fit der">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((t) => {
                      const e = MSI_ESTATUS[t.idEstatus];
                      const p = MSI_PRIORIDAD[t.prioridad] || MSI_PRIORIDAD[2];
                      const ir = () => navigate(`/mesa-sgi/ticket/${t.idTicket}`);
                      return (
                        <tr key={t.idTicket} className="link" tabIndex={0} onClick={ir} onKeyDown={(ev) => ev.key === "Enter" && ir()}>
                          <td className="fit lst-folio">{t.folio}</td>
                          <td>
                            <span className="celda-titulo">{t.titulo}</span>
                            <span className="celda-sub">{t.asignado ? `Atiende ${t.asignado}` : "Sin asignar"}</span>
                          </td>
                          <td className="lst-sec">{t.servicio}</td>
                          <td><Persona nombre={t.solicitante} /></td>
                          <td className="fit"><Pastilla tono={e.tono}>{e.label}</Pastilla></td>
                          <td className="fit"><Pastilla tono={p.tono}>{p.label}</Pastilla></td>
                          <td className="fit"><SLA ticket={t} /></td>
                          <td className="fit lst-fecha">{fechaCorta(String(t.fechaCreacion).slice(0, 10), false)}</td>
                          <td className="fit der">
                            <MenuTicket ticket={t} equipo={equipo} onVer={ir} onAsignar={(login) => asignar(t, login)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
