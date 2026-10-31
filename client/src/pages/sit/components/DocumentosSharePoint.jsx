// pages/sit/components/DocumentosSharePoint.jsx
// Documentos del artículo en la biblioteca de SharePoint de proveedores,
// agrupados por proveedor, con su semáforo de vigencia y la validación de Calidad.
// Props: documentos (array | null si SharePoint falló), showToast, onActualizado
// Cada documento puede traer "contenidos": otros tipos que vienen dentro del
// mismo PDF (con su página). El buscador "¿Qué documento buscas?" los
// encuentra aunque el archivo se llame distinto.
import { useMemo, useState } from "react";
import SITDocumentoViewer from "./SITDocumentoViewer";
import RegistrarVencimientoModal from "./RegistrarVencimientoModal";
import ValidarDocumentoModal from "./ValidarDocumentoModal";
import ContenidoDocumentoModal from "./ContenidoDocumentoModal";
import EstadoValidacion from "./EstadoValidacion";
import { fecha, fechaHora } from "../sitApi";
import "./DocumentosSharePoint.css";

const SEMAFORO = {
  VERDE: { clase: "verde", label: "Vigente" },
  AMARILLO: { clase: "amarillo", label: "Por vencer" },
  ROJO: { clase: "rojo", label: "Vencido" },
  SIN_FECHA: { clase: "gris", label: "Sin fecha" },
};

// De dónde salió la fecha de vencimiento (ver _vigencia en sharepoint.service.js)
const TITULO_ORIGEN = {
  MANUAL: "Fecha registrada manualmente",
  IA: "Fecha leída del PDF y confirmada en el SIT",
  REGLA: "Fecha calculada por la regla de vigencia del tipo de documento",
};

/** Minúsculas y sin acentos, para buscar "tabla nutrimental" igual que "Tabla Nutrimental" */
const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function EditarFecha({ onClick }) {
  return (
    <button type="button" className="sit-spdocs__editar" onClick={onClick} title="Editar vencimiento" aria-label="Editar vencimiento">
      <i className="ti ti-pencil" />
    </button>
  );
}

export default function DocumentosSharePoint({ documentos, showToast, onActualizado }) {
  const [viendo, setViendo] = useState(null);
  const [registrando, setRegistrando] = useState(null);
  const [validando, setValidando] = useState(null);
  const [editandoContenido, setEditandoContenido] = useState(null);
  const [busco, setBusco] = useState(""); // lo que la persona escribe, p. ej. "tabla nutrimental"

  const tipoDe = (d) => d.tipoOficial || d.tipoDocumento;
  // Sugerencias mientras se escribe: tipos del artículo y lo que viene dentro de cada archivo
  const tiposDisponibles = useMemo(() => {
    const t = new Set();
    for (const d of documentos || []) {
      if (tipoDe(d)) t.add(tipoDe(d));
      for (const c of d.contenidos || []) t.add(c.nombre);
    }
    return [...t].sort((a, b) => a.localeCompare(b, "es"));
  }, [documentos]);

  /**
   * Resultados de la búsqueda (sin acentos ni mayúsculas):
   *  - "es": el documento es de ese tipo
   *  - "dentro": lo trae dentro (por su nombre o marcado en el SIT, con página)
   *  - "menciona": la descripción o el nombre del archivo lo mencionan
   *    ("Ref Normativa", "Dec País de Origen"…)
   */
  const encontrados = useMemo(() => {
    const q = normalizar(busco);
    if (q.length < 2) return null;
    const res = [];
    for (const d of documentos || []) {
      if (normalizar(tipoDe(d)).includes(q)) {
        res.push({ d, como: "es" });
        continue;
      }
      const c = (d.contenidos || []).find((x) => normalizar(x.nombre).includes(q) || normalizar(x.texto).includes(q));
      if (c) {
        res.push({ d, como: "dentro", c });
        continue;
      }
      if (normalizar(d.tipoDocumento).includes(q) || normalizar(d.nombreArchivo).includes(q)) res.push({ d, como: "menciona" });
    }
    return res;
  }, [busco, documentos]);

  const porProveedor = (documentos || []).reduce((acc, d) => {
    (acc[d.proveedor] ||= []).push(d);
    return acc;
  }, {});

  const resumen = (documentos || []).reduce((acc, d) => {
    acc[d.semaforo] = (acc[d.semaforo] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="sit-card sit-spdocs">
      <h2 className="sit-card__title">
        <i className="ti ti-brand-onedrive" /> Documentos en SharePoint
        {documentos && <span className="sit-tag">{documentos.length}</span>}
        {documentos?.length > 0 && (
          <span className="sit-spdocs__resumen">
            {Object.entries(SEMAFORO).map(([k, s]) =>
              resumen[k] ? (
                <span key={k} title={s.label}>
                  <span className={`sit-spdocs__dot sit-spdocs__dot--${s.clase}`} /> {resumen[k]}
                </span>
              ) : null,
            )}
          </span>
        )}
      </h2>

      {documentos === null ? (
        <div className="sit-state sit-state--error">
          <i className="ti ti-cloud-off" />
          <p>No se pudo consultar SharePoint. Intenta de nuevo más tarde.</p>
        </div>
      ) : !documentos.length ? (
        <div className="sit-state">
          <i className="ti ti-folder-off" />
          <p>Este artículo no tiene carpeta de documentos en SharePoint.</p>
        </div>
      ) : (
        <>
        <div className="sit-spdocs__buscar">
          <label htmlFor="sit-busco"><i className="ti ti-search" /> ¿Qué documento buscas?</label>
          <input
            id="sit-busco"
            className="sit-input"
            list="sit-busco-tipos"
            placeholder="Escribe, p. ej. tabla nutrimental, GMO, FDA…"
            value={busco}
            onChange={(e) => setBusco(e.target.value)}
            autoComplete="off"
            maxLength={60}
          />
          <datalist id="sit-busco-tipos">
            {tiposDisponibles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {busco && (
            <button type="button" className="sit-btn sit-btn--sm" onClick={() => setBusco("")}>
              <i className="ti ti-x" /> Limpiar
            </button>
          )}
        </div>
        {encontrados && (
          <div className="sit-spdocs__hallazgos" role="status">
            {!encontrados.length && (
              <p className="sit-spdocs__sin">
                Ningún documento de este artículo es ni menciona «{busco.trim()}». Revisa los nombres de los archivos abajo o consulta a Calidad.
              </p>
            )}
            {encontrados.map(({ d, como, c }) => (
              <div key={d.sharepointId} className={`sit-spdocs__hallazgo${como !== "es" ? " sit-spdocs__hallazgo--dentro" : ""}`}>
                <i className={`ti ${como === "es" ? "ti-file-check" : "ti-file-search"}`} />
                <span>
                  {como === "es" && (
                    <>
                      <strong>{tipoDe(d)}</strong> · {d.proveedor}
                    </>
                  )}
                  {como === "dentro" && (
                    <>
                      La <strong>{c.nombre}</strong> está dentro de <strong>{tipoDe(d)}</strong> ({d.proveedor})
                      {c.pagina ? <> · página <b>{c.pagina}</b></> : null}
                    </>
                  )}
                  {como === "menciona" && (
                    <>
                      Mencionado en <strong>{tipoDe(d)}</strong> ({d.proveedor})
                    </>
                  )}
                  {/* La descripción siempre visible: es donde se ve qué trae el archivo */}
                  {d.tipoDocumento && d.tipoDocumento !== tipoDe(d) && <em className="sit-spdocs__desc">{d.tipoDocumento}</em>}
                  <small title={d.nombreArchivo}>{d.nombreArchivo}</small>
                </span>
                <button
                  className={`sit-btn sit-btn--sm${como !== "es" ? " sit-btn--primary" : ""}`}
                  onClick={() => setViendo({ ...d, pagina: c?.pagina || null })}
                >
                  <i className="ti ti-eye" /> Ver PDF{c?.pagina ? ` · pág. ${c.pagina}` : ""}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="sit-spdocs__grupos">
          {Object.entries(porProveedor).map(([proveedor, docs]) => (
            <div key={proveedor} className="sit-spdocs__grupo">
              <h3>
                <i className="ti ti-building-factory-2" /> {proveedor}
                {/\(b\)/i.test(proveedor) && <span className="sit-tag">Alterno</span>}
              </h3>
              <ul>
                {docs.map((d) => {
                  const s = SEMAFORO[d.semaforo] || SEMAFORO.SIN_FECHA;
                  const vencido = d.semaforo === "ROJO";
                  return (
                    <li key={d.sharepointId}>
                      <span className={`sit-spdocs__dot sit-spdocs__dot--${s.clase}`} title={s.label} aria-label={s.label} />
                      <span className="sit-spdocs__info">
                        <strong>
                          {d.tipoOficial || d.tipoDocumento}
                          {d.tipoOficial && d.tipoOficial !== d.tipoDocumento && <em> · {d.tipoDocumento}</em>}
                        </strong>
                        <small title={d.nombreArchivo}>{d.nombreArchivo}</small>
                        {d.contenidos?.length > 0 && (
                          <span className="sit-spdocs__contiene">
                            <span>También contiene:</span>
                            {d.contenidos.map((c) => (
                              <button
                                type="button"
                                key={c.idTipoDoc}
                                onClick={() => setViendo({ ...d, pagina: c.pagina })}
                                title={c.pagina ? `Abrir el PDF en la página ${c.pagina}` : "Abrir el PDF"}
                              >
                                {c.nombre}{c.pagina ? ` · p. ${c.pagina}` : ""}
                              </button>
                            ))}
                          </span>
                        )}
                        <span
                          className="sit-spdocs__validacion"
                          title={
                            d.validadoPor
                              ? `${d.validadoPor} · ${fechaHora(d.fechaValidacion)}${d.notasValidacion ? " · " + d.notasValidacion : ""}`
                              : "Pendiente de validar por Calidad"
                          }
                        >
                          <EstadoValidacion estado={d.estadoValidacion} />
                        </span>
                        {d.origenFecha === "NO_VENCE" && (
                          <small className="sit-spdocs__venc" title={d.noVence ? "Marcado como «No vence» en el SIT" : "Este tipo de documento no vence"}>
                            Sin vencimiento
                            {d.noVence && <span className="sit-spdocs__manual">Manual</span>}
                            {d.noVence && <EditarFecha onClick={() => setRegistrando(d)} />}
                          </small>
                        )}
                        {d.fechaVencimiento && (
                          <small
                            className={`sit-spdocs__venc sit-spdocs__venc--${s.clase}`}
                            title={TITULO_ORIGEN[d.origenFecha] || undefined}
                          >
                            {vencido ? "Venció" : "Vence"} {fecha(d.fechaVencimiento)}
                            {d.origenFecha === "MANUAL" && <span className="sit-spdocs__manual">Manual</span>}
                            <EditarFecha onClick={() => setRegistrando(d)} />
                          </small>
                        )}
                      </span>
                      <span className="sit-spdocs__acciones">
                        {d.semaforo === "SIN_FECHA" && (
                          <button className="sit-btn sit-btn--sm" onClick={() => setRegistrando(d)}>
                            <i className="ti ti-calendar-plus" /> Registrar vencimiento
                          </button>
                        )}
                        <button
                          className="sit-btn sit-btn--sm"
                          onClick={() => setValidando(d)}
                          title={d.estadoValidacion ? "Cambiar la validación de Calidad" : "Validar (Calidad)"}
                        >
                          <i className="ti ti-checklist" /> {d.estadoValidacion ? "Revalidar" : "Validar"}
                        </button>
                        <button className="sit-btn sit-btn--sm" onClick={() => setEditandoContenido(d)} title="Qué otros documentos trae este PDF">
                          <i className="ti ti-files" /> Contenido
                        </button>
                        <button className="sit-btn sit-btn--sm" onClick={() => setViendo({ ...d, pagina: null })}>
                          <i className="ti ti-eye" /> Ver PDF
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        </>
      )}

      {viendo && (
        <SITDocumentoViewer documento={{ tipo: "sharepoint", id: viendo.sharepointId }} nombreArchivo={viendo.nombreArchivo} pagina={viendo.pagina} onClose={() => setViendo(null)} />
      )}
      {validando && (
        <ValidarDocumentoModal
          endpoint={`/documentos/sharepoint/${encodeURIComponent(validando.sharepointId)}/validar`}
          nombreArchivo={`${validando.tipoOficial || validando.tipoDocumento} · ${validando.nombreArchivo}`}
          estadoActual={validando.estadoValidacion}
          notasActuales={validando.notasValidacion}
          showToast={showToast}
          onClose={() => setValidando(null)}
          onSuccess={() => {
            setValidando(null);
            onActualizado?.();
          }}
        />
      )}
      {editandoContenido && (
        <ContenidoDocumentoModal
          documento={editandoContenido}
          showToast={showToast}
          onClose={() => setEditandoContenido(null)}
          onSuccess={() => {
            setEditandoContenido(null);
            onActualizado?.();
          }}
        />
      )}
      {registrando && (
        <RegistrarVencimientoModal
          documento={registrando}
          showToast={showToast}
          onClose={() => setRegistrando(null)}
          onSuccess={() => {
            setRegistrando(null);
            onActualizado?.();
          }}
        />
      )}
    </section>
  );
}
