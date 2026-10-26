import {
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import "./NuevaSolicitud.css";

const API = (path) => `/api/mantenimiento${path}`;
const token = () => localStorage.getItem("fabpsa_token");
const apiFetch = (path, opts = {}) =>
  fetch(API(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, ...(opts.headers || {}) },
  });
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4",
  "video/quicktime",
];
const MAX_SIZE = 20 * 1024 * 1024;
const INIT = {
  servicio: null,
  codigoDepartamento: "",
  zonaAlergenos: null,
  ubicacionDetalle: "",
  descripcion: "",
  especifica: "",
  archivos: [],
  enviando: false,
  errorGlobal: null,
};
const fmt = (bytes) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
const reducer = (state, action) =>
  action.type === "SET"
    ? { ...state, ...action.payload }
    : action.type === "SET_ARCHIVOS"
      ? { ...state, archivos: action.payload }
      : state;

export default function NuevaSolicitud() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, INIT);
  const [catalogo, setCatalogo] = useReducer(
    (current, patch) => ({ ...current, ...patch }),
    {
      sitio: null,
      esPlanta: false,
      areas: [],
      servicios: [],
      cargando: true,
      error: null,
    },
  );
  const [busqueda, setBusqueda] = useState("");
  const [resultadosAbiertos, setResultadosAbiertos] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const dropRef = useRef(null);
  const fileRef = useRef(null);
  const set = (payload) => dispatch({ type: "SET", payload });

  {
    /*useEffect(() => {
    apiFetch("/catalogos")
      .then((response) => {
        if (!response.ok) throw new Error("Error al cargar catálogos.");
        return response.json();
      })
      .then((data) =>
        setCatalogo({
          sitio: data.sitio,
          esPlanta: data.esPlanta,
          areas: data.areas ?? [],
          servicios: data.servicios ?? [],
          cargando: false,
          error: null,
        }),
      )
      .catch((error) => setCatalogo({ cargando: false, error: error.message }));
  }, []);*/
  }

  useEffect(() => {
    const sitioUsuario = user?.sitio;

    apiFetch("/catalogos")
      .then((response) => {
        if (!response.ok) throw new Error("Error al cargar catálogos.");
        return response.json();
      })
      .then(async (data) => {
        // Traer áreas del sitio del usuario
        let areas = [];
        if (sitioUsuario) {
          const areasRes = await apiFetch(
            `/catalogos/areas/${encodeURIComponent(sitioUsuario)}`,
          );
          if (areasRes.ok) {
            const areasData = await areasRes.json();
            areas = areasData;
          }
        }

        // esPlanta = true si el sitio del usuario es PLANTA o PFV
        const esPlanta = sitioUsuario === "PLANTA" || sitioUsuario === "PFV";

        setCatalogo({
          sitio: {
            nombreVisible: sitioUsuario === "SUR 121" ? "CEDIS" : sitioUsuario,
          },
          esPlanta,
          areas,
          servicios: data.servicios ?? [],
          cargando: false,
          error: null,
        });
      })
      .catch((error) => setCatalogo({ cargando: false, error: error.message }));
  }, [user?.sitio]);

  useEffect(() => {
    if (!modalAbierto) return undefined;
    const close = (event) => event.key === "Escape" && setModalAbierto(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [modalAbierto]);

  const serviciosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLocaleLowerCase("es");
    if (!term) return catalogo.servicios;
    return catalogo.servicios.filter((service) =>
      service.descripcion?.toLocaleLowerCase("es").includes(term),
    );
  }, [busqueda, catalogo.servicios]);
  const destacados = catalogo.servicios.slice(0, 5);
  const area = catalogo.areas.find(
    (item) => item.codigoDepartamento === state.codigoDepartamento,
  );
  const sitio = catalogo.sitio?.nombreVisible || user?.sitio || "—";
  const archivosValidos = state.archivos.filter((item) => !item.error);

  const seleccionarServicio = (servicio) => {
    set({ servicio, especifica: "", zonaAlergenos: null, errorGlobal: null });
    setBusqueda(servicio.descripcion);
    setResultadosAbiertos(false);
    setModalAbierto(false);
  };

  const procesarArchivos = (fileList) => {
    const nuevos = Array.from(fileList).map((file) => ({
      file,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
      error: !ALLOWED_TYPES.includes(file.type)
        ? "Tipo no permitido."
        : file.size > MAX_SIZE
          ? "Supera los 20 MB."
          : null,
    }));
    dispatch({ type: "SET_ARCHIVOS", payload: [...state.archivos, ...nuevos] });
  };
  const pegarArchivos = (event) => {
    const archivosPegados = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!archivosPegados.length) return;
    event.preventDefault();
    procesarArchivos(archivosPegados);
  };
  const quitarArchivo = (index) => {
    const next = [...state.archivos];
    if (next[index].preview) URL.revokeObjectURL(next[index].preview);
    next.splice(index, 1);
    dispatch({ type: "SET_ARCHIVOS", payload: next });
  };

  const errores = {};
  if (!state.servicio) errores.servicio = "Selecciona un servicio.";
  if (!state.codigoDepartamento) errores.area = "Selecciona un área.";
  if (catalogo.esPlanta && state.zonaAlergenos === null)
    errores.zona = "Selecciona ALÉRGENOS o NO ALÉRGENOS.";
  if (!state.ubicacionDetalle.trim())
    errores.ubicacion = "Indica la ubicación exacta.";
  else if (state.ubicacionDetalle.trim().length < 5)
    errores.ubicacion = "Sé más específico (mínimo 5 caracteres).";
  if (!state.descripcion.trim()) errores.descripcion = "Describe la necesidad.";
  else if (state.descripcion.trim().length < 10)
    errores.descripcion = "Mínimo 10 caracteres.";
  if (state.servicio?.requiere_especifica && !state.especifica.trim())
    errores.especifica = "Especifica el tipo de mantenimiento requerido.";
  if (state.servicio?.requiere_evidencia && !archivosValidos.length)
    errores.archivos = "Este servicio requiere al menos una evidencia.";
  const hayErrores = Object.keys(errores).length > 0;

  const enviar = async () => {
    if (hayErrores || state.enviando) return;
    set({ enviando: true, errorGlobal: null });
    try {
      const body = new FormData();
      body.append("idServicio", String(state.servicio.id));
      body.append("codigoDepartamento", state.codigoDepartamento);
      body.append("ubicacionDetalle", state.ubicacionDetalle.trim());
      body.append("descripcion", state.descripcion.trim());
      if (state.especifica) body.append("especifica", state.especifica);
      if (catalogo.esPlanta && state.zonaAlergenos !== null) {
        body.append("zonaAlergenos", String(state.zonaAlergenos));
      }
      archivosValidos.forEach((item) => body.append("archivos", item.file));

      const response = await apiFetch("/solicitudes", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear la solicitud.");
      }
      const solicitudCreada = await response.json();
      navigate(`/mantenimiento/solicitudes/${solicitudCreada.idSolicitud}`, {
        state: {
          solicitudRegistrada: true,
          folio: solicitudCreada.folio,
        },
      });
    } catch (error) {
      set({ errorGlobal: error.message, enviando: false });
    }
  };

  return (
    <main className="ns-page">
      <button
        className="ns-back"
        type="button"
        onClick={() => navigate("/mantenimiento")}
      >
        <i className="ti ti-arrow-left" /> Volver al Centro de Mantenimiento
      </button>
      <header className="ns-heading">
        <h1>Nueva solicitud de Mantenimiento</h1>
        <p>Selecciona el servicio y completa los datos de la solicitud.</p>
      </header>

      <section className="ns-service-panel">
        <div className="ns-section-heading">
          <h2>¿Qué necesitas atender?</h2>
          <p>La prioridad y el nivel de atención se asignan automáticamente.</p>
        </div>
        <div className="ns-selector-row">
          <div className="ns-combobox">
            <label className="ns-search">
              <i className="ti ti-search" />
              <input
                value={busqueda}
                placeholder="Buscar un servicio…"
                onFocus={() => setResultadosAbiertos(true)}
                onChange={(event) => {
                  setBusqueda(event.target.value);
                  setResultadosAbiertos(true);
                }}
                aria-expanded={resultadosAbiertos}
              />
              <i className="ti ti-chevron-down" />
            </label>
            {resultadosAbiertos && busqueda.trim() && (
              <div className="ns-results">
                {catalogo.cargando ? (
                  <span className="ns-result-message">
                    <i className="ti ti-loader-2 ns-spin" /> Cargando servicios…
                  </span>
                ) : serviciosFiltrados.length ? (
                  serviciosFiltrados
                    .slice(0, 7)
                    .map((service) => (
                      <ServiceOption
                        key={service.id}
                        service={service}
                        selected={state.servicio?.id === service.id}
                        onSelect={seleccionarServicio}
                      />
                    ))
                ) : (
                  <span className="ns-result-message">
                    No encontramos servicios con ese nombre.
                  </span>
                )}
              </div>
            )}
          </div>
          {state.servicio && <PriorityPills service={state.servicio} />}
        </div>
        <div className="ns-quick-services">
          {destacados.map((service) => (
            <button
              key={service.id}
              type="button"
              className={state.servicio?.id === service.id ? "active" : ""}
              onClick={() => seleccionarServicio(service)}
            >
              <i className={`ti ${serviceIcon(service)}`} />
              <span>{service.descripcion}</span>
            </button>
          ))}
          <button
            className="ns-all-services"
            type="button"
            onClick={() => setModalAbierto(true)}
          >
            <i className="ti ti-grid-dots" /> Ver todos los servicios
          </button>
        </div>
        {catalogo.error && (
          <div className="ns-catalog-error">
            <i className="ti ti-alert-circle" /> {catalogo.error}
            <button type="button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        )}
      </section>

      {!state.servicio ? (
        <section className="ns-awaiting">
          <i className="ti ti-tool" />
          <div>
            <strong>Selecciona el servicio que necesitas</strong>
            <span>
              El formulario se configurará automáticamente con sus requisitos y
              nivel de atención.
            </span>
          </div>
        </section>
      ) : (
        <>
          <div className="ns-content-grid">
            <section className="ns-card ns-work-card">
              <h2>Información del trabajo</h2>
              {state.servicio.requiere_especifica && (
                <Field
                  label="Especifica el tipo de mantenimiento requerido"
                  error={errores.especifica}
                >
                  <input
                    autoFocus
                    value={state.especifica}
                    onChange={(event) =>
                      set({ especifica: event.target.value })
                    }
                    placeholder="Ej. Reparación de puerta, instalación de estantería…"
                  />
                </Field>
              )}
              <div className="ns-two-columns">
                <div className="ns-field">
                  <label>Sitio</label>
                  <div className="ns-site">
                    <i className="ti ti-circle-check" />
                    <div>
                      <small>Sitio</small>
                      <strong>{sitio}</strong>
                    </div>
                    <span>
                      Asignado de acuerdo
                      <br />
                      con tu perfil
                    </span>
                    <i className="ti ti-lock" />
                  </div>
                </div>
                <Field label="Área" error={errores.area}>
                  {catalogo.cargando ? (
                    <div className="ns-select-message">
                      <i className="ti ti-loader-2 ns-spin" /> Cargando áreas…
                    </div>
                  ) : (
                    <select
                      value={state.codigoDepartamento}
                      onChange={(event) =>
                        set({ codigoDepartamento: event.target.value })
                      }
                    >
                      <option value="">Selecciona un área…</option>
                      {catalogo.areas.map((item) => (
                        <option
                          key={item.codigoDepartamento}
                          value={item.codigoDepartamento}
                        >
                          {item.departamento}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              {catalogo.esPlanta && (
                <Field label="Zona" error={errores.zona}>
                  <div className="ns-zone">
                    <button
                      type="button"
                      className={state.zonaAlergenos === true ? "active" : ""}
                      onClick={() => set({ zonaAlergenos: true })}
                    >
                      ALÉRGENOS{" "}
                      {state.zonaAlergenos === true && (
                        <i className="ti ti-circle-check-filled" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={state.zonaAlergenos === false ? "active" : ""}
                      onClick={() => set({ zonaAlergenos: false })}
                    >
                      NO ALÉRGENOS{" "}
                      {state.zonaAlergenos === false && (
                        <i className="ti ti-circle-check-filled" />
                      )}
                    </button>
                  </div>
                </Field>
              )}
              <div className="ns-location-field">
                <Field label="Ubicación exacta" error={errores.ubicacion}>
                  <input
                    value={state.ubicacionDetalle}
                    onChange={(event) =>
                      set({ ubicacionDetalle: event.target.value })
                    }
                    placeholder="Ej. Línea 3, junto al acceso principal."
                  />
                </Field>
              </div>
              <Field label="Describe la necesidad" error={errores.descripcion}>
                <textarea
                  maxLength={1000}
                  rows={4}
                  value={state.descripcion}
                  onChange={(event) => set({ descripcion: event.target.value })}
                  placeholder="Describe qué sucede, desde cuándo y cualquier detalle útil."
                />
                <div className="ns-field-footer">
                  <span>
                    Indica qué sucede, desde cuándo y cualquier detalle útil.
                  </span>
                  <span>{state.descripcion.length} / 1000 caracteres</span>
                </div>
              </Field>
            </section>

            <section className="ns-card ns-evidence-card">
              <div className="ns-section-heading">
                <h2>Evidencias</h2>
                <p>
                  Agrega fotografías o documentos que ayuden a identificar la
                  necesidad.
                </p>
              </div>
              <div
                ref={dropRef}
                className="ns-dropzone"
                tabIndex={0}
                onPaste={pegarArchivos}
                onDragOver={(event) => {
                  event.preventDefault();
                  dropRef.current?.classList.add("is-over");
                }}
                onDragLeave={() => dropRef.current?.classList.remove("is-over")}
                onDrop={(event) => {
                  event.preventDefault();
                  dropRef.current?.classList.remove("is-over");
                  procesarArchivos(event.dataTransfer.files);
                }}
              >
                <i className="ti ti-cloud-upload" />
                <span>
                  Arrastra archivos, pega una imagen con <strong>Ctrl+V</strong>{" "}
                  o{" "}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                  >
                    selecciónalos
                  </button>
                </span>
                <button
                  className="ns-add-files"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  Agregar archivos
                </button>
                <small>
                  JPG, PNG, PDF, DOC, DOCX, XLS, XLSX, MP4 · Máx. 20 MB
                </small>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  accept={ALLOWED_TYPES.join(",")}
                  onChange={(event) => procesarArchivos(event.target.files)}
                />
              </div>
              {errores.archivos && (
                <span className="ns-error">{errores.archivos}</span>
              )}
              {!!state.archivos.length && (
                <ul className="ns-files">
                  {state.archivos.map((item, index) => (
                    <li
                      key={`${item.file.name}-${index}`}
                      className={item.error ? "error" : ""}
                    >
                      {item.preview ? (
                        <img src={item.preview} alt="" />
                      ) : (
                        <i className="ti ti-file" />
                      )}
                      <div>
                        <strong>{item.file.name}</strong>
                        <span>{item.error || fmt(item.file.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarArchivo(index)}
                        aria-label={`Quitar ${item.file.name}`}
                      >
                        <i className="ti ti-x" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <RequestSummary
                service={state.servicio}
                site={sitio}
                area={area?.departamento}
                zone={state.zonaAlergenos}
                location={state.ubicacionDetalle}
                description={state.descripcion}
                files={archivosValidos.length}
              />
            </section>
          </div>
          {state.errorGlobal && (
            <div className="ns-global-error">
              <i className="ti ti-alert-circle" /> {state.errorGlobal}
            </div>
          )}
          <footer className="ns-submit-bar">
            <div>
              <i
                className={`ti ${hayErrores ? "ti-info-circle" : "ti-circle-check"}`}
              />
              <span>
                {hayErrores
                  ? "Completa los campos requeridos"
                  : "Todo está listo para enviar"}
              </span>
            </div>
            <p>
              {state.servicio.descripcion}
              <b>•</b>
              {sitio}
              {area && (
                <>
                  <b>•</b>
                  {area.departamento}
                </>
              )}
            </p>
            <div>
              <button
                type="button"
                className="ns-cancel"
                onClick={() => navigate("/mantenimiento")}
                disabled={state.enviando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ns-submit"
                onClick={enviar}
                disabled={hayErrores || state.enviando}
              >
                <i
                  className={`ti ${state.enviando ? "ti-loader-2 ns-spin" : "ti-send"}`}
                />{" "}
                {state.enviando ? "Enviando…" : "Enviar solicitud"}
              </button>
            </div>
          </footer>
        </>
      )}

      {modalAbierto && (
        <ServicesModal
          services={catalogo.servicios}
          selectedId={state.servicio?.id}
          onSelect={seleccionarServicio}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </main>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="ns-field">
      <label>
        {label} <span>*</span>
      </label>
      {children}
      {error && <small className="ns-error">{error}</small>}
    </div>
  );
}
function serviceIcon(service) {
  const nombre = String(service?.descripcion || "").toLocaleLowerCase("es");
  if (/cosedora|costura|coser/.test(nombre)) return "ti-needle-thread";
  if (/b[aá]scula|peso|pesaje/.test(nombre)) return "ti-scale";
  if (/plomer|tuber|lavabo|wc|agua/.test(nombre)) return "ti-droplet";
  if (/limpieza|limpiar|sanit/.test(nombre)) return "ti-spray";
  if (/secador|el[eé]ctric|motor/.test(nombre)) return "ti-bolt";
  if (/aire|clima|ventila/.test(nombre)) return "ti-wind";
  if (/pat[ií]n hidr[aá]ulico/.test(nombre)) return "ti-truck-loading";
  if (/montacargas/.test(nombre)) return "ti-truck";
  if (/señal/.test(nombre)) return "ti-sign-right";
  if (/cctv|c[aá]mara/.test(nombre)) return "ti-camera";
  if (/solicitud de necesidades/.test(nombre)) return "ti-clipboard-list";
  if (/puerta|acceso|cerradura/.test(nombre)) return "ti-door";
  if (/pintura|pintar/.test(nombre)) return "ti-paint";
  if (/soldadura|soldar/.test(nombre)) return "ti-flame";
  if (/maquinaria|equipo|m[aá]quina/.test(nombre)) return "ti-settings";
  if (/otro/.test(nombre)) return "ti-dots-circle-horizontal";
  return service?.icono && service.icono !== "ti-tool" ? service.icono : "ti-tools";
}
function ServiceOption({ service, selected, onSelect }) {
  return (
    <button
      type="button"
      className={selected ? "selected" : ""}
      onClick={() => onSelect(service)}
    >
      <i className={`ti ${serviceIcon(service)}`} />
      <span>
        <strong>{service.descripcion}</strong>
        <small>{attentionLabel(service)}</small>
      </span>
      {selected && <i className="ti ti-check" />}
    </button>
  );
}
function PriorityPills({ service }) {
  return (
    <div className="ns-priority">
      <span>
        <i className="ti ti-flag" /> {service.nombrePrioridad}
      </span>
      <span>
        <i className="ti ti-clock" /> {attentionLabel(service)}
      </span>
    </div>
  );
}
function RequestSummary({
  service,
  site,
  area,
  zone,
  location,
  description,
  files,
}) {
  return (
    <div className="ns-summary">
      <h3>Resumen de la solicitud</h3>
      <div className="ns-summary-meta">
        <span>
          <i className={`ti ${serviceIcon(service)}`} /> {service.descripcion}
        </span>
        <span>
          <i className="ti ti-map-pin" /> {site}
        </span>
        {area && (
          <span>
            <i className="ti ti-layout-grid" /> {area}
          </span>
        )}
        {zone !== null && (
          <span>
            <i className="ti ti-shield-check" />{" "}
            {zone ? "Alérgenos" : "No alérgenos"}
          </span>
        )}
      </div>
      <dl>
        <div>
          <dt>Ubicación</dt>
          <dd>{location || "Pendiente"}</dd>
        </div>
        <div>
          <dt>Detalle</dt>
          <dd>{description || "Pendiente"}</dd>
        </div>
        <div>
          <dt>Nivel de atención</dt>
          <dd>{attentionLabel(service)}</dd>
        </div>
        <div>
          <dt>Archivos adjuntos</dt>
          <dd>
            {files
              ? `${files} archivo${files === 1 ? "" : "s"}`
              : "Sin archivos adjuntos"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
function ServicesModal({ services, selectedId, onSelect, onClose }) {
  const [term, setTerm] = useState("");
  const filtered = services.filter((item) =>
    item.descripcion
      ?.toLocaleLowerCase("es")
      .includes(term.trim().toLocaleLowerCase("es")),
  );
  return (
    <div
      className="ns-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="ns-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ns-modal-title"
      >
        <header>
          <div>
            <h2 id="ns-modal-title">Todos los servicios</h2>
            <p>Selecciona el trabajo de mantenimiento que necesitas.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" />
          </button>
        </header>
        <label className="ns-modal-search">
          <i className="ti ti-search" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar servicio…"
          />
        </label>
        <div className="ns-modal-grid">
          {filtered.map((service) => (
            <button
              key={service.id}
              type="button"
              className={selectedId === service.id ? "active" : ""}
              onClick={() => onSelect(service)}
            >
              <i className={`ti ${serviceIcon(service)}`} />
              <span>
                <strong>{service.descripcion}</strong>
                <small>{attentionLabel(service)}</small>
              </span>
              {selectedId === service.id && <i className="ti ti-check" />}
            </button>
          ))}
        </div>
        {!filtered.length && (
          <div className="ns-modal-empty">
            No encontramos servicios con ese nombre.
          </div>
        )}
      </section>
    </div>
  );
}
function attentionLabel(service) {
  const source =
    `${service.codigoPrioridad || ""} ${service.nombrePrioridad || ""}`.toUpperCase();
  const number = Number(source.match(/\d+/)?.[0]);
  if (number === 1 || /CR[IÍ]TIC|URGENT/.test(source))
    return "Atención prioritaria";
  if (number === 2 || /ALTA/.test(source)) return "Atención requerida";
  if (number === 3 || /MEDIA|NORMAL/.test(source)) return "Atención programada";
  return "Atención estándar";
}
