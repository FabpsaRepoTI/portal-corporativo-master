// pages/sgc/GestionDocumental.jsx
// Gestión Documental SGC/SGI — ruta /sgc/documentos
// SharePoint es el repositorio físico. El usuario NUNCA ve URLs de SP.
// Layout integrado con el portal: sin segunda barra lateral.
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { sgcApi } from "./sgcApi";
import { apiFetch } from "../../utils/apiFetch";
import { Encabezado, Skel, ToastProvider, useToast } from "./components/ui";
import { SGCEmptyState } from "./components/sgcComponents";
import PanelLateral from "../../components/sgc/PanelLateral";

// ── Constantes ────────────────────────────────────────────────────────
const TIPOS = {
  1: { label: "Procedimiento", color: "#8b5cf6", icono: "ti-file-text" },
  2: { label: "Instructivo",   color: "#22d3ee", icono: "ti-file-description" },
  3: { label: "Formato",       color: "#22c55e", icono: "ti-file-check" },
  4: { label: "Registro",      color: "#eab308", icono: "ti-file-spreadsheet" },
  5: { label: "Manual",        color: "#6366f1", icono: "ti-book" },
};
const ESTATUS = {
  1: { label: "Borrador",    color: "neutral" },
  2: { label: "En revisión", color: "proceso" },
  3: { label: "Vigente",     color: "cerrada" },
  4: { label: "Obsoleto",    color: "vencida" },
};

function fmtSize(bytes) {
  if (!bytes) return "—";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function esOffice(n) { return /\.(docx?|xlsx?|pptx?)$/i.test(n || ""); }
function esPdf(n) { return /\.pdf$/i.test(n || ""); }

// ── Breadcrumb de navegación en carpetas ──────────────────────────────
function Breadcrumb({ stack, onNavegar }) {
  return (
    <nav className="gd-breadcrumb" aria-label="Ruta del repositorio">
      <button
        type="button"
        className={`gd-breadcrumb__item${stack.length === 1 ? " is-on" : ""}`}
        onClick={() => onNavegar([null])}
      >
        <i className="ti ti-home" style={{ fontSize: 12 }} />
        Raíz
      </button>
      {stack.slice(1).map((ruta, i) => (
        <span key={ruta} style={{ display: "flex", alignItems: "center" }}>
          <i className="ti ti-chevron-right gd-breadcrumb__sep" />
          <button
            type="button"
            className={`gd-breadcrumb__item${i === stack.length - 2 ? " is-on" : ""}`}
            onClick={() => onNavegar(stack.slice(0, i + 2))}
          >
            {ruta.split("/").pop()}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ── Lista de archivos + navegación de subcarpetas ─────────────────────
function ListaArchivos({
  carpeta, docs, rol, busqueda, filtroTipo, filtroEstatus,
  onEntrarCarpeta, onRegistrar, onVerDoc, onSeleccionarVisor,
}) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (carpeta === "__registrados") { setCargando(false); return; }
    setCargando(true);
    setError(false);
    sgcApi(`/documentos/explorador${carpeta != null ? `?carpeta=${encodeURIComponent(carpeta)}` : ""}`)
      .then((r) => setDatos(r))
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [carpeta]);

  // ── Vista "Registrados" ──────────────────────────────────────────
  if (carpeta === "__registrados") {
    const filtrados = (docs || []).filter((d) => {
      if (filtroTipo && d.tipo !== Number(filtroTipo)) return false;
      if (filtroEstatus && d.idEstatus !== Number(filtroEstatus)) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        return d.titulo?.toLowerCase().includes(q) || d.codigo?.toLowerCase().includes(q);
      }
      return true;
    });

    if (!filtrados.length) return (
      <SGCEmptyState icono="ti-files" titulo="Sin documentos registrados"
        desc="Navega el repositorio y registra archivos, o sube uno nuevo." />
    );

    return (
      <div className="gd-tabla-wrap">
        <table className="gd-tabla">
          <thead>
            <tr><th></th><th>Código</th><th>Título</th><th>Tipo</th><th>Ver.</th><th>Estatus</th><th></th></tr>
          </thead>
          <tbody>
            {filtrados.map((d) => (
              <tr key={d.idDocumento} className="gd-tabla__fila" onClick={() => onSeleccionarVisor(d, null)}>
                <td><span style={{ color: TIPOS[d.tipo]?.color, fontSize: 14 }}><i className={`ti ${TIPOS[d.tipo]?.icono || "ti-file"}`} /></span></td>
                <td><span className="gd-cod">{d.codigo}</span></td>
                <td className="gd-col-titulo">{d.titulo}</td>
                <td><span style={{ fontSize: 11, color: TIPOS[d.tipo]?.color }}>{TIPOS[d.tipo]?.label}</span></td>
                <td><span className="gd-ver">v{d.version}</span></td>
                <td><span className={`tag t-${ESTATUS[d.idEstatus]?.color || "neutral"}`} style={{ fontSize: 11 }}>{ESTATUS[d.idEstatus]?.label}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn--xs" onClick={() => onVerDoc(d)}><i className="ti ti-info-circle" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Vista repositorio SP ──────────────────────────────────────────
  if (cargando) return <div className="pnl" style={{ padding: 24 }}><Skel filas={5} /></div>;
  if (error) return <SGCEmptyState icono="ti-cloud-off" titulo="No se pudo conectar con el repositorio" desc="Verifica tu conexión o contacta al administrador." />;

  const subcarpetas = (datos?.subcarpetas || []);
  const archivos    = (datos?.archivos || []).filter((a) => !a.esCarpeta);
  const registrados = new Map((docs || []).map((d) => [d.spItemId, d]));

  if (!subcarpetas.length && !archivos.length) return (
    <SGCEmptyState icono="ti-folder-open" titulo="Carpeta vacía"
      desc={`No hay archivos en ${carpeta ? `"${carpeta.split("/").pop()}"` : "la raíz"}.`} />
  );

  return (
    <div className="gd-tabla-wrap">
      <table className="gd-tabla">
        <thead>
          <tr><th></th><th>Nombre</th><th>Modificado</th><th>Tamaño</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          {/* Subcarpetas primero */}
          {subcarpetas.map((c) => (
            <tr key={c.id} className="gd-tabla__fila gd-tabla__fila--carpeta" onClick={() => onEntrarCarpeta(c.ruta)}>
              <td><i className="ti ti-folder-filled" style={{ color: "#eab308", fontSize: 14 }} /></td>
              <td className="gd-col-titulo" colSpan={3}>{c.nombre}</td>
              <td></td>
              <td><i className="ti ti-chevron-right" style={{ color: "var(--faint)", fontSize: 12 }} /></td>
            </tr>
          ))}
          {/* Archivos */}
          {archivos.map((a) => {
            const doc = registrados.get(a.id);
            return (
              <tr key={a.id} className="gd-tabla__fila" onClick={() => onSeleccionarVisor(doc || null, a)}>
                <td><i className="ti ti-file" style={{ color: "var(--faint)", fontSize: 14 }} /></td>
                <td className="gd-col-titulo">{a.nombre}</td>
                <td className="gd-col-meta">{a.modificado ? new Date(a.modificado).toLocaleDateString("es-MX") : "—"}</td>
                <td className="gd-col-meta">{fmtSize(a.tamano)}</td>
                <td>
                  {doc
                    ? <span className="tag t-cerrada" style={{ fontSize: 11 }}><i className="ti ti-check" /> Registrado</span>
                    : <span className="tag t-neutral" style={{ fontSize: 11 }}>Sin registrar</span>}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {!doc && rol === 1 && (
                    <button className="btn btn--xs btn--primario" onClick={() => onRegistrar(a)}>
                      <i className="ti ti-plus" /> Registrar
                    </button>
                  )}
                  {doc && (
                    <button className="btn btn--xs" onClick={() => onVerDoc(doc)}>
                      <i className="ti ti-info-circle" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Visor de documento ────────────────────────────────────────────────
// Vista previa directa de SharePoint para cualquier archivo de la biblioteca,
// esté o no registrado en el SGI.
function VisorDocumento({ doc, archivo, rol, onCerrar, onReemplazar }) {
  const [vista, setVista] = useState({ url: null, error: null, cargando: false });
  const [descargando, setDescargando] = useState(false);
  const toast = useToast();

  const nombre = doc?.spNombre || archivo?.nombre || "";
  const idDoc  = doc?.idDocumento;
  const spId   = archivo?.id || doc?.spItemId || null;

  useEffect(() => {
    if (!spId) {
      setVista({ url: null, error: "Este documento no tiene archivo en SharePoint.", cargando: false });
      return undefined;
    }
    let vivo = true;
    setVista({ url: null, error: null, cargando: true });
    sgcApi(`/documentos/sp/${encodeURIComponent(spId)}/preview`)
      .then((r) => vivo && setVista({ url: r.url, error: null, cargando: false }))
      .catch((e) => vivo && setVista({ url: null, error: e.message, cargando: false }));
    return () => { vivo = false; };
  }, [spId]);

  const descargar = async () => {
    if (!spId) return;
    try {
      setDescargando(true);
      const res = await apiFetch(`/api/sgc/documentos/sp/${encodeURIComponent(spId)}/descargar`);
      if (!res.ok) throw new Error("No se pudo descargar el archivo");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre || "archivo";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="gd-visor">
      {/* Header del visor */}
      <div className="gd-visor__head">
        <div className="gd-visor__meta">
          <i className={`ti ${esPdf(nombre) ? "ti-file-type-pdf" : esOffice(nombre) ? "ti-file-word" : "ti-file"}`}
            style={{ fontSize: 16, color: "var(--brand)", flexShrink: 0 }} />
          <div className="gd-visor__info">
            <span className="gd-visor__nombre">{nombre || (doc ? doc.titulo : "—")}</span>
            {archivo?.tamano && <span className="gd-visor__dato">{fmtSize(archivo.tamano)}</span>}
          </div>
        </div>
        <div className="gd-visor__acciones">
          {spId && (
            <button className="btn btn--chico" onClick={descargar} disabled={descargando} title="Descargar">
              <i className={`ti ${descargando ? "ti-loader-2 giro" : "ti-download"}`} />
            </button>
          )}
          {idDoc && rol === 1 && (
            <button className="btn btn--chico" onClick={() => onReemplazar(doc)} title="Reemplazar">
              <i className="ti ti-replace" />
            </button>
          )}
          <button className="btn btn--chico" onClick={onCerrar} title="Cerrar visor">
            <i className="ti ti-x" />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="gd-visor__body">
        {vista.cargando ? (
          <div className="gd-visor__placeholder"><Skel filas={4} /></div>
        ) : vista.url ? (
          <iframe key={vista.url} src={vista.url} title={nombre} className="gd-iframe" allow="fullscreen" />
        ) : (
          <div className="gd-visor__placeholder">
            <i className="ti ti-eye-off" style={{ fontSize: 28 }} />
            <span>{vista.error || "No se pudo cargar la vista previa"}</span>
            {spId && (
              <button className="btn btn--chico btn--primario" onClick={descargar} disabled={descargando} style={{ marginTop: 8 }}>
                <i className="ti ti-download" /> Descargar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal detalle ─────────────────────────────────────────────────────
function ModalDetalle({ doc, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("info");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDetalle(await sgcApi(`/documentos/${doc.idDocumento}`)); }
    catch { /* no cargó */ }
    finally { setCargando(false); }
  }, [doc.idDocumento]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="gd-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gd-modal">
        <button className="gd-modal__cerrar" onClick={onClose}><i className="ti ti-x" /></button>
        {cargando ? (
          <div style={{ padding: 32 }}><Skel filas={6} /></div>
        ) : !detalle ? (
          <SGCEmptyState icono="ti-alert-circle" titulo="No se pudo cargar" />
        ) : (
          <>
            <div className="gd-modal__head">
              <i className={`ti ${TIPOS[detalle.tipo]?.icono || "ti-file"}`}
                style={{ fontSize: 22, color: TIPOS[detalle.tipo]?.color, flexShrink: 0 }} />
              <div>
                <span className="gd-cod">{detalle.codigo}</span>
                <h2 className="gd-modal__titulo">{detalle.titulo}</h2>
              </div>
              <a className="btn btn--chico" style={{ marginLeft: "auto" }}
                href={`/api/sgc/documentos/${doc.idDocumento}/descargar`} download>
                <i className="ti ti-download" /> Descargar
              </a>
            </div>
            <div className="tabs gd-modal__tabs">
              {[["info","Info"],["versiones","Versiones"],["accesos","Accesos"]].map(([k,lbl]) => (
                <button key={k} type="button" className={`tabs__tab${tab===k?" is-on":""}`} onClick={() => setTab(k)}>{lbl}</button>
              ))}
            </div>
            <div className="gd-modal__body">
              {tab === "info" && (
                <dl className="gd-info">
                  {[
                    ["Tipo", <span style={{ color: TIPOS[detalle.tipo]?.color }}>{TIPOS[detalle.tipo]?.label}</span>],
                    ["Versión", `v${detalle.version}`],
                    ["Estatus", ESTATUS[detalle.idEstatus]?.label],
                    detalle.clausulaISO && ["Cláusula ISO", detalle.clausulaISO],
                    detalle.fechaVencimiento && ["Vencimiento", new Date(detalle.fechaVencimiento).toLocaleDateString("es-MX")],
                    detalle.spCarpeta && ["Carpeta", detalle.spCarpeta],
                    detalle.spNombre && ["Archivo", detalle.spNombre],
                  ].filter(Boolean).map(([lbl, val]) => (
                    <div key={lbl} className="gd-info__fila">
                      <dt className="gd-info__lbl">{lbl}</dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {tab === "versiones" && (
                detalle.versiones?.length ? (
                  <table className="gd-tabla"><thead><tr><th>Ver.</th><th>Fecha</th><th>Cambios</th></tr></thead>
                    <tbody>{detalle.versiones.map((v) => (
                      <tr key={v.idVersion}>
                        <td><span className="gd-cod">v{v.version}</span></td>
                        <td className="gd-col-meta">{new Date(v.fechaRegistro).toLocaleDateString("es-MX")}</td>
                        <td className="gd-col-meta">{v.cambios || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <SGCEmptyState icono="ti-git-branch" titulo="Sin versiones registradas" />
              )}
              {tab === "accesos" && (
                detalle.accesos?.length ? (
                  <table className="gd-tabla"><thead><tr><th>Usuario</th><th>Fecha</th></tr></thead>
                    <tbody>{detalle.accesos.map((a) => (
                      <tr key={a.idAcceso}>
                        <td style={{ fontSize: 12 }}>{a.nombre || a.login}</td>
                        <td className="gd-col-meta">{new Date(a.fechaAcceso).toLocaleString("es-MX")}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <SGCEmptyState icono="ti-users" titulo="Sin accesos registrados" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal registrar archivo existente de SP ───────────────────────────
function ModalRegistrar({ archivo, onClose, onGuardado }) {
  const [form, setForm] = useState({
    titulo: archivo?.nombre?.replace(/\.[^.]+$/, "") || "",
    codigo: "", tipo: "1", loginElabora: "", loginRevisa: "",
    loginAprueba: "", fechaVencimiento: "", clausulaISO: "",
  });
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await sgcApi("/documentos/registrar", { method: "POST", body: { ...form, tipo: parseInt(form.tipo, 10), spItemId: archivo.id } });
      toast.ok("Documento registrado en el SGI");
      onGuardado(); onClose();
    } catch (err) { toast.error(err.message || "Error al registrar"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="gd-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gd-modal gd-modal--sm">
        <button className="gd-modal__cerrar" onClick={onClose}><i className="ti ti-x" /></button>
        <h3 className="gd-modal__titulo" style={{ marginBottom: 4 }}>Registrar en el SGI</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
          <i className="ti ti-file" style={{ marginRight: 4 }} />{archivo?.nombre}
        </p>
        <form onSubmit={submit}>
          <div className="gd-form__grid">
            {[["Título *","titulo","text",true],["Código *","codigo","text",true],
              ["Elabora (login) *","loginElabora","text",true],["Revisa (login)","loginRevisa","text",false],
              ["Aprueba (login)","loginAprueba","text",false],["Cláusula ISO","clausulaISO","text",false],
            ].map(([lbl,campo,t,req]) => (
              <div key={campo} className="gd-form__campo">
                <label>{lbl}</label>
                <input className="inp" type={t} required={req} value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} />
              </div>
            ))}
            <div className="gd-form__campo">
              <label>Tipo *</label>
              <select className="inp" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="gd-form__campo">
              <label>Fecha vencimiento</label>
              <input type="date" className="inp" value={form.fechaVencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn--primario" disabled={guardando}>
              {guardando ? "Registrando…" : <><i className="ti ti-check" /> Registrar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal subir documento nuevo ───────────────────────────────────────
function ModalSubirNuevo({ carpetaInicial, onClose, onGuardado }) {
  const [form, setForm] = useState({ titulo: "", codigo: "", tipo: "1",
    carpeta: carpetaInicial || "SGC", loginElabora: "", loginRevisa: "",
    loginAprueba: "", fechaVencimiento: "", clausulaISO: "" });
  const [archivo, setArchivo] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const dropRef = useRef();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (!archivo) return;
    setGuardando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      fd.append("archivo", archivo);
      await sgcApi("/documentos/subir-nuevo", { method: "POST", form: fd });
      toast.ok("Documento subido y registrado");
      onGuardado(); onClose();
    } catch (err) { toast.error(err.message || "Error al subir"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="gd-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gd-modal gd-modal--sm">
        <button className="gd-modal__cerrar" onClick={onClose}><i className="ti ti-x" /></button>
        <h3 className="gd-modal__titulo" style={{ marginBottom: 16 }}>Subir documento nuevo</h3>
        <form onSubmit={submit}>
          <div ref={dropRef}
            className={`gd-dropzone${arrastrando ? " gd-dropzone--sobre" : ""}${archivo ? " gd-dropzone--con-archivo" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (e.dataTransfer.files[0]) setArchivo(e.dataTransfer.files[0]); }}
            onClick={() => dropRef.current.querySelector("input").click()}
          >
            <input type="file" accept=".pdf,.docx,.xlsx,.pptx" style={{ display: "none" }}
              onChange={(e) => setArchivo(e.target.files[0])} />
            {archivo
              ? <><i className="ti ti-file-check" style={{ fontSize: 24, color: "#22c55e" }} /><span style={{ color: "#22c55e", fontSize: 13 }}>{archivo.name}</span></>
              : <><i className="ti ti-upload" style={{ fontSize: 24, color: "var(--brand)", opacity: 0.6 }} /><span style={{ fontSize: 13, color: "var(--muted)" }}>Arrastra el archivo o haz clic</span></>}
          </div>
          <div className="gd-form__grid" style={{ marginTop: 12 }}>
            {[["Título *","titulo","text",true],["Código *","codigo","text",true],
              ["Carpeta destino","carpeta","text",false],["Elabora (login) *","loginElabora","text",true],
              ["Revisa (login)","loginRevisa","text",false],["Cláusula ISO","clausulaISO","text",false],
            ].map(([lbl,campo,t,req]) => (
              <div key={campo} className="gd-form__campo">
                <label>{lbl}</label>
                <input className="inp" type={t} required={req} value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))} />
              </div>
            ))}
            <div className="gd-form__campo">
              <label>Tipo *</label>
              <select className="inp" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="gd-form__campo">
              <label>Fecha vencimiento</label>
              <input type="date" className="inp" value={form.fechaVencimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn--primario" disabled={guardando || !archivo}>
              {guardando ? "Subiendo…" : <><i className="ti ti-upload" /> Subir al repositorio</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal reemplazar ──────────────────────────────────────────────────
function ModalReemplazar({ doc, onClose, onGuardado }) {
  const [form, setForm] = useState({ version: "", cambios: "" });
  const [archivo, setArchivo] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const dropRef = useRef();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (!archivo || !form.version.trim()) return;
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("version", form.version.trim());
      if (form.cambios) fd.append("cambios", form.cambios);
      await sgcApi(`/documentos/${doc.idDocumento}/reemplazar`, { method: "POST", form: fd });
      toast.ok("Documento reemplazado correctamente");
      onGuardado(); onClose();
    } catch (err) { toast.error(err.message || "Error al reemplazar"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="gd-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gd-modal gd-modal--sm">
        <button className="gd-modal__cerrar" onClick={onClose}><i className="ti ti-x" /></button>
        <h3 className="gd-modal__titulo" style={{ marginBottom: 4 }}>Reemplazar documento</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>{doc.titulo}</p>
        <form onSubmit={submit}>
          <div ref={dropRef}
            className={`gd-dropzone${arrastrando ? " gd-dropzone--sobre" : ""}${archivo ? " gd-dropzone--con-archivo" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (e.dataTransfer.files[0]) setArchivo(e.dataTransfer.files[0]); }}
            onClick={() => dropRef.current.querySelector("input").click()}
          >
            <input type="file" accept=".pdf,.docx,.xlsx,.pptx" style={{ display: "none" }}
              onChange={(e) => setArchivo(e.target.files[0])} />
            {archivo
              ? <><i className="ti ti-file-check" style={{ fontSize: 24, color: "#22c55e" }} /><span style={{ color: "#22c55e", fontSize: 13 }}>{archivo.name}</span></>
              : <><i className="ti ti-replace" style={{ fontSize: 24, color: "var(--brand)", opacity: 0.6 }} /><span style={{ fontSize: 13, color: "var(--muted)" }}>Arrastra el archivo nuevo o haz clic</span></>}
          </div>
          <div className="gd-form__campo" style={{ marginTop: 12 }}>
            <label>Nueva versión *</label>
            <input className="inp" required value={form.version}
              onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="Ej. 2.0" />
          </div>
          <div className="gd-form__campo">
            <label>Descripción de cambios</label>
            <textarea className="inp" rows={3} value={form.cambios}
              onChange={(e) => setForm((f) => ({ ...f, cambios: e.target.value }))}
              placeholder="¿Qué cambió en esta versión?" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn--primario" disabled={guardando || !archivo || !form.version.trim()}>
              {guardando ? "Subiendo…" : <><i className="ti ti-replace" /> Reemplazar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function GestionDocumental() {
  const { rol } = useOutletContext();

  // Datos
  const [docs, setDocs]               = useState([]);
  const [cargandoDocs, setCargandoDocs] = useState(true);

  // Filtros
  const [busqueda, setBusqueda]         = useState("");
  const [filtroTipo, setFiltroTipo]     = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [tabVista, setTabVista]         = useState("repo"); // "repo" | "registrados"

  // Navegación en carpetas SP
  const [stack, setStack] = useState([null]); // null = raíz
  const carpetaActual = stack[stack.length - 1];

  // Visor
  const [docVisor,     setDocVisor]    = useState(null);
  const [archivoVisor, setArchivoVisor] = useState(null);
  const visorAbierto = !!(docVisor || archivoVisor);

  // Modales
  const [modalDetalle,   setModalDetalle]   = useState(null);
  const [panelDoc,       setPanelDoc]       = useState(null);
  const cerrarPanelDoc = useCallback(() => setPanelDoc(null), []);
  const [modalRegistrar, setModalRegistrar] = useState(null);
  const [modalSubir,     setModalSubir]     = useState(false);
  const [modalReemplazar,setModalReemplazar] = useState(null);

  const cargarDocs = useCallback(async () => {
    setCargandoDocs(true);
    try { const r = await sgcApi("/documentos"); setDocs(Array.isArray(r) ? r : []); }
    catch { setDocs([]); }
    finally { setCargandoDocs(false); }
  }, []);

  useEffect(() => { cargarDocs(); }, [cargarDocs]);

  const seleccionarVisor = (doc, archivo) => {
    setDocVisor(doc || null);
    setArchivoVisor(archivo || null);
  };

  const entrarCarpeta = (ruta) => setStack((s) => [...s, ruta]);
  const navegarStack  = (nuevoStack) => setStack(nuevoStack);

  const carpetaLista = tabVista === "registrados" ? "__registrados" : carpetaActual;

  return (
    <ToastProvider>
      <div className="sg-page">
        <Encabezado
          kicker="ISO 9001 · 4.4"
          titulo="Gestión Documental"
          desc="Repositorio SharePoint + documentos registrados en el SGI."
          acciones={
            rol === 1 && (
              <button className="btn btn--primario" onClick={() => setModalSubir(true)}>
                <i className="ti ti-upload" /> Subir documento
              </button>
            )
          }
        />

        {/* ── Tabs Repositorio / Registrados ── */}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tabVista === "repo"}
            className={`tabs__tab${tabVista === "repo" ? " is-on" : ""}`}
            onClick={() => setTabVista("repo")}>
            <i className="ti ti-folder" />
            Repositorio
          </button>
          <button type="button" role="tab" aria-selected={tabVista === "registrados"}
            className={`tabs__tab${tabVista === "registrados" ? " is-on" : ""}`}
            onClick={() => setTabVista("registrados")}>
            <i className="ti ti-list" />
            Registrados {!cargandoDocs && <span className="tabs__cuenta">{docs.length}</span>}
          </button>
        </div>

        {/* ── Toolbar: búsqueda + filtros ── */}
        <div className="filtros">
          <input
            className="inp inp--auto"
            placeholder="Buscar por título o código…"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setTabVista("registrados"); }}
            style={{ minWidth: 220 }}
          />
          {tabVista === "registrados" && (
            <>
              <select className="inp inp--auto" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="inp inp--auto" value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)}>
                <option value="">Todos los estatus</option>
                {Object.entries(ESTATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </>
          )}
          {tabVista === "repo" && (
            <Breadcrumb stack={stack} onNavegar={navegarStack} />
          )}
        </div>

        {/* ── Workspace: lista + visor ── */}
        <div className={`gd-workspace${visorAbierto ? " gd-workspace--con-visor" : ""}`}>
          <div className="gd-workspace__lista">
            <ListaArchivos
              carpeta={carpetaLista}
              docs={docs}
              rol={rol}
              busqueda={busqueda}
              filtroTipo={filtroTipo}
              filtroEstatus={filtroEstatus}
              onEntrarCarpeta={entrarCarpeta}
              onRegistrar={(a) => setModalRegistrar(a)}
              onVerDoc={(d) => setPanelDoc(d)}
              onSeleccionarVisor={seleccionarVisor}
            />
          </div>

          {visorAbierto && (
            <div className="gd-workspace__visor">
              <VisorDocumento
                doc={docVisor}
                archivo={archivoVisor}
                rol={rol}
                onCerrar={() => { setDocVisor(null); setArchivoVisor(null); }}
                onReemplazar={(d) => setModalReemplazar(d)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Panel lateral (superpuesto: la derecha la ocupa el visor) → "Abrir completo" = detalle con versiones y accesos */}
      {panelDoc && (
        <PanelLateral
          modo="cajon"
          modulo="documento"
          registro={{ id: panelDoc.idDocumento, folio: panelDoc.codigo }}
          onClose={cerrarPanelDoc}
          onAbrirCompleto={() => { setModalDetalle(panelDoc); setPanelDoc(null); }}
          onEditar={rol === 1 ? () => { setModalReemplazar(panelDoc); setPanelDoc(null); } : undefined}
        />
      )}

      {/* Modales */}
      {modalDetalle  &&<ModalDetalle   doc={modalDetalle}   onClose={() => setModalDetalle(null)} />}
      {modalRegistrar && <ModalRegistrar archivo={modalRegistrar} onClose={() => setModalRegistrar(null)} onGuardado={cargarDocs} />}
      {modalSubir    && <ModalSubirNuevo carpetaInicial={carpetaActual} onClose={() => setModalSubir(false)} onGuardado={cargarDocs} />}
      {modalReemplazar && <ModalReemplazar doc={modalReemplazar} onClose={() => setModalReemplazar(null)} onGuardado={() => { cargarDocs(); setDocVisor(null); }} />}
    </ToastProvider>
  );
}
