// pages/sgc/components/Archivos.jsx
// Evidencia de una NC, AC o auditoría: lista, subida (clic o arrastrar),
// vista previa de imágenes, descarga y borrado. Los archivos se piden con la
// sesión (no son URLs públicas).
import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../../../context/AuthContext";
import { Confirmar, Modal, Panel, Vacio, useToast } from "./ui";
import { sgcApi, urlArchivo, hace, fechaHora } from "../sgcApi";

const EXT_OK = [".jpg", ".jpeg", ".png", ".pdf", ".xlsx", ".docx"];
const MAX = 10 * 1024 * 1024;
const esImagen = (a) => /^image\//.test(a.mimeType || "");
const icono = (a) =>
  esImagen(a) ? "ti-photo" : /pdf/.test(a.mimeType) ? "ti-file-type-pdf" : /sheet/.test(a.mimeType) ? "ti-file-spreadsheet" : /word/.test(a.mimeType) ? "ti-file-type-doc" : "ti-file";

function Miniatura({ archivo, onVer }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!esImagen(archivo)) return undefined;
    let vivo = true;
    let creada;
    urlArchivo(archivo.idArchivo)
      .then((u) => {
        creada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [archivo]);
  return (
    <button type="button" className="archivo__icono" onClick={onVer} aria-label={`Ver ${archivo.nombreOriginal}`}>
      {url ? <img src={url} alt="" /> : <i className={`ti ${icono(archivo)}`} />}
    </button>
  );
}

/** base: "/nc/12" | "/ac/3" | "/auditorias/4" */
export default function Archivos({ base, archivos, puedeAdjuntar, onCambio, rolCoordinador, titulo = "Evidencia" }) {
  const { user } = useContext(AuthContext);
  const toast = useToast();
  const input = useRef(null);
  const [subiendo, setSubiendo] = useState(null);
  const [sobre, setSobre] = useState(false);
  const [viendo, setViendo] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => () => viendo?.url && URL.revokeObjectURL(viendo.url), [viendo]);

  const subir = async (file) => {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!EXT_OK.includes(ext)) return toast.error("Solo se aceptan archivos JPG, PNG, PDF, XLSX o DOCX.");
    if (file.size > MAX) return toast.error("El archivo supera el límite de 10 MB.");
    const form = new FormData();
    form.append("archivo", file);
    try {
      setSubiendo(file.name);
      await sgcApi(`${base}/archivo`, { method: "POST", form });
      toast.ok(`«${file.name}» adjuntado`);
      onCambio();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubiendo(null);
      if (input.current) input.current.value = "";
    }
  };

  const abrir = async (a, descargar = false) => {
    try {
      const url = await urlArchivo(a.idArchivo);
      if (esImagen(a) && !descargar) return setViendo({ archivo: a, url });
      const link = document.createElement("a");
      link.href = url;
      if (descargar || !/pdf/.test(a.mimeType)) link.download = a.nombreOriginal;
      else link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const eliminar = async () => {
    try {
      setOcupado(true);
      await sgcApi(`${base}/archivo/${borrando.idArchivo}`, { method: "DELETE" });
      toast.ok("Archivo eliminado");
      setBorrando(null);
      onCambio();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const puedeBorrar = (a) => rolCoordinador || String(a.login).toUpperCase() === String(user?.login).toUpperCase();

  return (
    <Panel titulo={titulo} cuenta={archivos.length} flush>
      {!archivos.length && !puedeAdjuntar && <Vacio compacto icono="ti-paperclip" titulo="Sin evidencia" texto="Aún no se han adjuntado archivos." />}
      {archivos.map((a) => (
        <div key={a.idArchivo} className="archivo">
          <Miniatura archivo={a} onVer={() => abrir(a)} />
          <div style={{ minWidth: 0 }}>
            <div className="archivo__nombre" title={a.nombreOriginal}>
              {a.nombreOriginal}
            </div>
            <span className="celda-sub" title={fechaHora(a.fechaSubida)}>
              {a.nombre || a.login} · {hace(a.fechaSubida)}
            </span>
          </div>
          <div className="archivo__acciones">
            <button className="btn btn--fantasma btn--sm btn--icono" onClick={() => abrir(a)} title="Ver" aria-label={`Ver ${a.nombreOriginal}`}>
              <i className="ti ti-eye" />
            </button>
            <button className="btn btn--fantasma btn--sm btn--icono" onClick={() => abrir(a, true)} title="Descargar" aria-label={`Descargar ${a.nombreOriginal}`}>
              <i className="ti ti-download" />
            </button>
            {puedeBorrar(a) && (
              <button className="btn btn--fantasma btn--sm btn--icono btn--peligro" onClick={() => setBorrando(a)} title="Eliminar" aria-label={`Eliminar ${a.nombreOriginal}`}>
                <i className="ti ti-trash" />
              </button>
            )}
          </div>
        </div>
      ))}
      {puedeAdjuntar && (
        <label
          className={`soltar${sobre ? " is-sobre" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            subir(e.dataTransfer.files?.[0]);
          }}
        >
          <i className={`ti ${subiendo ? "ti-loader-2 giro" : "ti-cloud-upload"}`} />
          <span>
            <b>{subiendo ? `Subiendo «${subiendo}»…` : "Arrastra un archivo o haz clic"}</b>
            JPG, PNG, PDF, XLSX o DOCX · hasta 10 MB
          </span>
          <input ref={input} type="file" accept={EXT_OK.join(",")} disabled={!!subiendo} onChange={(e) => subir(e.target.files?.[0])} />
        </label>
      )}

      {viendo && (
        <Modal titulo={viendo.archivo.nombreOriginal} ancho onClose={() => setViendo(null)}>
          <div className="visor">
            <img src={viendo.url} alt={viendo.archivo.nombreOriginal} />
          </div>
        </Modal>
      )}
      {borrando && (
        <Confirmar
          titulo="¿Eliminar archivo?"
          mensaje={`«${borrando.nombreOriginal}» se eliminará del servidor. Esta acción no se puede deshacer.`}
          textoConfirmar="Eliminar"
          onConfirmar={eliminar}
          onCancelar={() => setBorrando(null)}
          ocupado={ocupado}
        />
      )}
    </Panel>
  );
}
