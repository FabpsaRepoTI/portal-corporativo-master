// pages/vigilancia/TabEvidencias.jsx
// Pestaña "Evidencias" del reporte de Vigilancia: fotos y documentos.
// Las fotos grandes se reducen en el navegador antes de subirse (más
// rápido desde el celular y menos espacio en el servidor).
// Props: idReporte, isBorrador, user, showToast
import { useCallback, useEffect, useRef, useState } from "react";
import "./TabEvidencias.css";

const MAX_MB = 10;
const LADO_MAX = 1920;          // px del lado mayor al reducir fotos
const REDUCIR_DESDE = 1.5e6;    // bytes: fotos más pesadas se reducen
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx";

const token = () => localStorage.getItem("fabpsa_token") || "";
const apiBase = () => process.env.REACT_APP_API_URL || "/api";
const urlArchivo = (id, descargar) =>
  `${apiBase()}/vigilancia/evidencias/${id}/archivo?${new URLSearchParams({ token: token(), ...(descargar ? { descargar: "1" } : {}) })}`;

const esImagen = (mime) => /^image\//.test(mime || "");
const iconoDoc = (mime) =>
  /pdf/.test(mime) ? "ti-file-type-pdf" : /word|msword/.test(mime) ? "ti-file-type-doc" : /sheet|excel/.test(mime) ? "ti-file-type-xls" : "ti-file";

const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fechaHora = (v) =>
  v ? new Date(v).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/** Reduce una foto a LADO_MAX px (JPEG 82%). Si algo falla, sube la original. */
async function reducirImagen(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < REDUCIR_DESDE) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function TabEvidencias({ idReporte, isBorrador, user, showToast }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [subiendo, setSubiendo] = useState(null); // { actual, total, nombre }
  const [quitando, setQuitando] = useState(null);
  const inputArchivos = useRef(null);

  const cargar = useCallback(async () => {
    try {
      setError("");
      const res = await fetch(`/api/vigilancia/reportes/${idReporte}/evidencias`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "No se pudieron cargar las evidencias");
      setData(d.data);
    } catch (e) {
      setError(e.message);
    }
  }, [idReporte]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const editable = isBorrador && data?.editable;
  const evidencias = data?.evidencias || [];
  const disponibles = (data?.maxPorReporte || 30) - evidencias.length;

  const subir = async (lista) => {
    const archivos = Array.from(lista || []);
    if (!archivos.length) return;
    if (archivos.length > disponibles) {
      showToast(`Solo puedes agregar ${disponibles} evidencia(s) más a este reporte`, "warning");
      return;
    }
    let ok = 0;
    for (let i = 0; i < archivos.length; i++) {
      const original = archivos[i];
      setSubiendo({ actual: i + 1, total: archivos.length, nombre: original.name });
      try {
        const archivo = await reducirImagen(original);
        if (archivo.size > MAX_MB * 1048576) throw new Error(`"${original.name}" supera ${MAX_MB} MB`);
        const form = new FormData();
        form.append("archivo", archivo);
        if (descripcion.trim()) form.append("descripcion", descripcion.trim());
        const res = await fetch(`/api/vigilancia/reportes/${idReporte}/evidencias`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}` },
          body: form,
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.ok) throw new Error(d.error || `No se pudo subir "${original.name}"`);
        ok++;
      } catch (e) {
        showToast(e.message, "error");
      }
    }
    setSubiendo(null);
    if (ok) {
      showToast(ok === 1 ? "Evidencia agregada" : `${ok} evidencias agregadas`);
      setDescripcion("");
    }
    cargar();
  };

  const quitar = async (ev) => {
    if (!window.confirm(`¿Quitar "${ev.nombreOriginal}" de las evidencias?`)) return;
    try {
      setQuitando(ev.idEvidencia);
      const res = await fetch(`/api/vigilancia/evidencias/${ev.idEvidencia}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "No se pudo quitar");
      showToast("Evidencia quitada");
      cargar();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setQuitando(null);
    }
  };

  const esMia = (ev) => String(ev.loginCarga || "").toUpperCase() === String(user?.login || "").toUpperCase();
  const imagenes = evidencias.filter((e) => esImagen(e.tipoMime));
  const documentos = evidencias.filter((e) => !esImagen(e.tipoMime));

  return (
    <div className="vigev">
      {editable && (
        <div className="vigev-carga">
          <div className="vigev-carga__texto">
            <strong>Agregar evidencias</strong>
            <span>
              Fotos (JPG, PNG, WEBP), PDF, Word o Excel · hasta {MAX_MB} MB cada uno · quedan {disponibles} de {data?.maxPorReporte || 30}
            </span>
          </div>
          <input
            className="vigev-desc"
            placeholder="Descripción (opcional), p. ej. «Daño en portón de andén 3»"
            maxLength={300}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={!!subiendo}
          />
          <div className="vigev-carga__botones">
            <button className="vig-btn vig-btn--primary" onClick={() => inputArchivos.current?.click()} disabled={!!subiendo || disponibles <= 0}>
              <i className="ti ti-upload" /> Subir archivos
            </button>
          </div>
          <input
            ref={inputArchivos}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              subir(e.target.files);
              e.target.value = "";
            }}
          />
          {subiendo && (
            <p className="vigev-progreso" role="status">
              <i className="ti ti-loader-2 vig-spin" /> Subiendo {subiendo.actual} de {subiendo.total}: {subiendo.nombre}
            </p>
          )}
        </div>
      )}

      {!editable && data && (
        <p className="vigev-nota">
          <i className="ti ti-lock" /> El reporte está cerrado: las evidencias son de solo lectura.
        </p>
      )}

      {error ? (
        <div className="vigev-vacio">
          <i className="ti ti-alert-circle" />
          <p>{error}</p>
          <button className="vig-btn vig-btn--ghost" onClick={cargar}>
            Reintentar
          </button>
        </div>
      ) : !data ? (
        <div className="vigev-vacio">
          <i className="ti ti-loader-2 vig-spin" />
        </div>
      ) : !evidencias.length ? (
        <div className="vigev-vacio">
          <i className="ti ti-photo-off" />
          <p>Sin evidencias en este reporte.</p>
        </div>
      ) : (
        <>
          {imagenes.length > 0 && (
            <section>
              <h4 className="vigev-titulo">
                <i className="ti ti-photo" /> Fotos <span>{imagenes.length}</span>
              </h4>
              <div className="vigev-galeria">
                {imagenes.map((ev) => (
                  <figure key={ev.idEvidencia} className="vigev-foto">
                    <a href={urlArchivo(ev.idEvidencia)} target="_blank" rel="noreferrer" title="Ver en tamaño completo">
                      <img src={urlArchivo(ev.idEvidencia)} alt={ev.descripcion || ev.nombreOriginal} loading="lazy" />
                    </a>
                    <figcaption>
                      {ev.descripcion && <strong>{ev.descripcion}</strong>}
                      <small>
                        {ev.cargadoPor} · {fechaHora(ev.fechaCarga)}
                      </small>
                    </figcaption>
                    {editable && esMia(ev) && (
                      <button className="vigev-quitar" onClick={() => quitar(ev)} disabled={quitando === ev.idEvidencia} title="Quitar evidencia" aria-label="Quitar evidencia">
                        <i className={`ti ${quitando === ev.idEvidencia ? "ti-loader-2 vig-spin" : "ti-trash"}`} />
                      </button>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {documentos.length > 0 && (
            <section>
              <h4 className="vigev-titulo">
                <i className="ti ti-files" /> Documentos <span>{documentos.length}</span>
              </h4>
              <ul className="vigev-docs">
                {documentos.map((ev) => (
                  <li key={ev.idEvidencia}>
                    <i className={`ti ${iconoDoc(ev.tipoMime)} vigev-docs__icono`} />
                    <div className="vigev-docs__info">
                      <strong title={ev.nombreOriginal}>{ev.nombreOriginal}</strong>
                      {ev.descripcion && <span>{ev.descripcion}</span>}
                      <small>
                        {tamano(ev.tamanoBytes)} · {ev.cargadoPor} · {fechaHora(ev.fechaCarga)}
                      </small>
                    </div>
                    <a className="vig-btn vig-btn--ghost" href={urlArchivo(ev.idEvidencia, !/pdf/.test(ev.tipoMime))} target="_blank" rel="noreferrer">
                      <i className={`ti ${/pdf/.test(ev.tipoMime) ? "ti-eye" : "ti-download"}`} /> {/pdf/.test(ev.tipoMime) ? "Ver" : "Descargar"}
                    </a>
                    {editable && esMia(ev) && (
                      <button className="vig-btn vig-btn--ghost vigev-docs__quitar" onClick={() => quitar(ev)} disabled={quitando === ev.idEvidencia} title="Quitar evidencia" aria-label="Quitar evidencia">
                        <i className={`ti ${quitando === ev.idEvidencia ? "ti-loader-2 vig-spin" : "ti-trash"}`} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
