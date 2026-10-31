// pages/sit/components/SITDocumentoViewer.jsx
// Visor protegido de documentos del SIT.
//
// - Consultar, descargar e imprimir se autorizan por separado en el servidor
//   (POST /documentos/ticket). Este componente solo muestra los botones que
//   el rol permite; si alguien los fuerza, el servidor responde 403.
// - El PDF se dibuja con pdf.js en <canvas> dentro de la app: no se usa el
//   visor nativo del navegador (que trae guardar e imprimir) ni se expone la
//   URL del archivo — el enlace es de un solo uso y caduca en 60 s.
// - Marca de agua con el usuario, la fecha y la hora sobre cada página.
//
// LÍMITES (no es protección absoluta): para mostrarlo, el navegador tiene
// que recibir el contenido; alguien con conocimientos técnicos puede
// extraerlo de la memoria o tomar capturas o fotos de la pantalla. Esto
// reduce y disuade, y deja auditoría de cada consulta, descarga e impresión.
//
// Props: documento { tipo: 'sharepoint' | 'sit', id, historial? }, nombreArchivo, onClose
import { useContext, useEffect, useRef, useState } from "react";
import SitModal from "./SitModal";
import { AuthContext } from "../../../context/AuthContext";
import { misPermisos, urlDocumento } from "../sitApi";
import "./SITDocumentoViewer.css";

// pdf.js procesa el PDF en un worker (archivo static/media/pdf.worker…js).
// Si el servidor no entrega ese archivo como JavaScript (404, tipo MIME
// incorrecto, política de seguridad…), pdf.js cae a un "worker falso" en la
// propia página, que necesita window.pdfjsWorker: por eso también se carga
// pdf.worker.entry (en el mismo chunk diferido, solo al abrir un documento).
let _pdfjs = null;
async function cargarPdfJs() {
  if (!_pdfjs) {
    const [pdfjs] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf"),
      import("pdfjs-dist/legacy/build/pdf.worker.entry"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.js", import.meta.url).toString();
    _pdfjs = pdfjs;
  }
  return _pdfjs;
}

// pagina (opcional): al terminar de dibujarla, el visor se coloca en esa página
// (p. ej. la Tabla Nutrimental que viene dentro de una Ficha Técnica).
export default function SITDocumentoViewer({ documento, nombreArchivo, onClose, pagina: paginaInicial = null }) {
  const { user } = useContext(AuthContext) || {};
  const [permisos, setPermisos] = useState(null);
  const [estado, setEstado] = useState("cargando"); // cargando | listo | error | sinPermiso
  const [mensaje, setMensaje] = useState("");
  const [paginas, setPaginas] = useState(0);
  const [accion, setAccion] = useState(null); // 'descargar' | 'imprimir' en curso
  const contenedor = useRef(null);
  // Nombre y apellidos de la sesión (sec_users.name); el login solo si no hay nombre
  const marca = `${user?.name?.trim() || user?.login || ""} · ${new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`;

  useEffect(() => {
    let vivo = true;
    let pdfDoc = null;
    (async () => {
      try {
        const p = await misPermisos();
        if (!vivo) return;
        setPermisos(p);
        if (!p.puedeConsultarDocs) {
          setEstado("sinPermiso");
          return;
        }
        const [pdfjs, url] = await Promise.all([cargarPdfJs(), urlDocumento(documento, "ver")]);
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) {
          const cuerpo = await resp.json().catch(() => null);
          throw new Error(cuerpo?.error || "No se pudo obtener el documento");
        }
        const datos = new Uint8Array(await resp.arrayBuffer());
        pdfDoc = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise;
        if (!vivo) return;
        setPaginas(pdfDoc.numPages);
        setEstado("listo");

        const ancho = Math.min(contenedor.current?.clientWidth || 900, 1000) - 32;
        for (let n = 1; n <= pdfDoc.numPages && vivo; n++) {
          const pagina = await pdfDoc.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const escala = ancho / base.width;
          const ratio = window.devicePixelRatio || 1;
          const vp = pagina.getViewport({ scale: escala * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = `${vp.width / ratio}px`;
          canvas.style.height = `${vp.height / ratio}px`;
          await pagina.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          const hoja = contenedor.current?.querySelector(`[data-pagina="${n}"] .sit-viewer__lienzo`);
          if (hoja) {
            hoja.replaceChildren(canvas);
            hoja.style.aspectRatio = `${vp.width} / ${vp.height}`;
            if (n === paginaInicial) hoja.closest(".sit-viewer__pagina")?.scrollIntoView({ block: "start" });
          }
        }
      } catch (err) {
        if (!vivo) return;
        setMensaje(err.message);
        setEstado(err.status === 403 ? "sinPermiso" : "error");
      }
    })();
    return () => {
      vivo = false;
      pdfDoc?.destroy();
    };
  }, [documento]);

  // Disuasión: sin menú contextual ni atajos de guardar / imprimir dentro del visor
  useEffect(() => {
    const teclas = (e) => {
      if ((e.ctrlKey || e.metaKey) && ["s", "p"].includes(e.key.toLowerCase())) e.preventDefault();
    };
    window.addEventListener("keydown", teclas, true);
    return () => window.removeEventListener("keydown", teclas, true);
  }, []);

  const descargar = async () => {
    try {
      setAccion("descargar");
      const url = await urlDocumento(documento, "descargar");
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setAccion(null);
    }
  };

  const imprimir = async () => {
    try {
      setAccion("imprimir");
      const url = await urlDocumento(documento, "imprimir");
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || "No se pudo preparar la impresión");
      const blobUrl = URL.createObjectURL(await resp.blob());
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
      frame.src = blobUrl;
      frame.onload = () => {
        frame.contentWindow?.print();
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      };
      document.body.appendChild(frame);
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setAccion(null);
    }
  };

  return (
    <SitModal
      titulo="Documento"
      subtitulo={nombreArchivo}
      icono="ti-file-type-pdf"
      ancho={1100}
      onClose={onClose}
      pie={
        <>
          {estado === "listo" && permisos && !permisos.puedeDescargar && !permisos.puedeImprimir && (
            <span className="sit-viewer__aviso">
              <i className="ti ti-lock" /> Solo consulta: tu rol no permite descargar ni imprimir
            </span>
          )}
          {estado === "listo" && permisos?.puedeDescargar && (
            <button className="sit-btn" onClick={descargar} disabled={!!accion}>
              <i className={`ti ${accion === "descargar" ? "ti-loader-2 sit-spin" : "ti-download"}`} /> Descargar
            </button>
          )}
          {estado === "listo" && permisos?.puedeImprimir && (
            <button className="sit-btn" onClick={imprimir} disabled={!!accion}>
              <i className={`ti ${accion === "imprimir" ? "ti-loader-2 sit-spin" : "ti-printer"}`} /> Imprimir
            </button>
          )}
          <button className="sit-btn sit-btn--primary" onClick={onClose}>
            Cerrar
          </button>
        </>
      }
    >
      <div className="sit-viewer" ref={contenedor} onContextMenu={(e) => e.preventDefault()}>
        {estado === "cargando" && (
          <div className="sit-viewer__estado">
            <i className="ti ti-loader-2 sit-spin" /> Abriendo documento…
          </div>
        )}
        {estado === "sinPermiso" && (
          <div className="sit-viewer__estado">
            <i className="ti ti-lock" />
            <strong>No tienes permiso para consultar este documento</strong>
            <span>{mensaje || "Tu rol en Información Técnica no incluye la consulta de documentos. Solicítala a las responsables de la documentación."}</span>
          </div>
        )}
        {estado === "error" && (
          <div className="sit-viewer__estado sit-viewer__estado--error">
            <i className="ti ti-alert-circle" />
            <strong>No se pudo abrir el documento</strong>
            <span>{mensaje}</span>
          </div>
        )}
        {estado === "listo" &&
          Array.from({ length: paginas }, (_, i) => (
            <div key={i} className="sit-viewer__pagina" data-pagina={i + 1}>
              {/* Sin hijos de React: el canvas de pdf.js se inserta aquí */}
              <div className="sit-viewer__lienzo" />
              <div className="sit-viewer__marca" aria-hidden="true">
                {Array.from({ length: 6 }, (_, k) => (
                  <span key={k}>{marca}</span>
                ))}
              </div>
            </div>
          ))}
        {estado === "listo" && mensaje && <p className="sit-viewer__error-accion">{mensaje}</p>}
      </div>
    </SitModal>
  );
}
