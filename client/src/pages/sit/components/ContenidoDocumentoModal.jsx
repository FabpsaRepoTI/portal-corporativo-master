// pages/sit/components/ContenidoDocumentoModal.jsx
// "También contiene": qué otros tipos de documento trae dentro un PDF y en
// qué página (p. ej. una Ficha Técnica que incluye la Tabla Nutrimental).
// La IA puede sugerirlo leyendo el PDF; la persona confirma. Cuenta para el
// cumplimiento de requisitoriedad mientras el documento esté vigente.
import { useEffect, useMemo, useState } from "react";
import SitModal from "./SitModal";
import { sitApi } from "../sitApi";

export default function ContenidoDocumentoModal({ documento, showToast, onClose, onSuccess }) {
  const [tipos, setTipos] = useState(null);
  // idTipoDoc → { pagina: string, origen, evidencia }
  const [marcados, setMarcados] = useState(() =>
    Object.fromEntries((documento.contenidos || []).map((c) => [c.idTipoDoc, { pagina: c.pagina ? String(c.pagina) : "", origen: c.origen, evidencia: null }])),
  );
  const [sugiriendo, setSugiriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    sitApi("/tipos-documento")
      .then((t) => setTipos((t || []).filter((x) => x.idTipoDocumento !== documento.idTipoDoc)))
      .catch(() => setError("No se pudo cargar el catálogo de tipos de documento"));
  }, [documento.idTipoDoc]);

  const ordenados = useMemo(() => [...(tipos || [])].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [tipos]);

  const alternar = (id) =>
    setMarcados((m) => {
      const n = { ...m };
      if (n[id]) delete n[id];
      else n[id] = { pagina: "", origen: "MANUAL", evidencia: null };
      return n;
    });
  const ponerPagina = (id, valor) => setMarcados((m) => ({ ...m, [id]: { ...m[id], pagina: valor.replace(/\D/g, "").slice(0, 4), origen: "MANUAL" } }));

  const sugerir = async () => {
    setError("");
    setNota("");
    try {
      setSugiriendo(true);
      const s = await sitApi(`/documentos/sharepoint/${encodeURIComponent(documento.sharepointId)}/sugerir-contenido`);
      if (!s.length) {
        setNota("La lectura del PDF no encontró otros documentos dentro de este archivo.");
        return;
      }
      setMarcados((m) => {
        const n = { ...m };
        for (const x of s) n[x.idTipoDoc] = { pagina: x.pagina ? String(x.pagina) : n[x.idTipoDoc]?.pagina || "", origen: "IA", evidencia: x.evidencia };
        return n;
      });
      setNota(`Sugerencia: ${s.map((x) => x.nombre + (x.pagina ? ` (pág. ${x.pagina})` : "")).join(", ")}. Revisa y guarda.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSugiriendo(false);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setGuardando(true);
      const contenidos = Object.entries(marcados).map(([id, v]) => ({ idTipoDoc: Number(id), pagina: v.pagina ? Number(v.pagina) : null, origen: v.origen }));
      await sitApi(`/documentos/sharepoint/${encodeURIComponent(documento.sharepointId)}/contenido`, { method: "PUT", body: { contenidos } });
      showToast?.(contenidos.length ? "Contenido del documento guardado" : "Se quitó el contenido del documento");
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const ocupado = sugiriendo || guardando;
  return (
    <SitModal
      titulo="También contiene"
      subtitulo={`${documento.tipoOficial || documento.tipoDocumento} · ${documento.nombreArchivo}`}
      icono="ti-files"
      ancho={560}
      bloqueado={ocupado}
      onClose={onClose}
      pie={
        <>
          <button className="sit-btn" onClick={onClose} disabled={ocupado}>Cancelar</button>
          <button className="sit-btn sit-btn--primary" type="submit" form="sit-form-contenido" disabled={ocupado || !tipos}>
            {guardando ? <i className="ti ti-loader-2 sit-spin" /> : <i className="ti ti-check" />} Guardar
          </button>
        </>
      }
    >
      <form id="sit-form-contenido" onSubmit={guardar} className="sit-contenido">
        <p className="sit-contenido__ayuda">
          Marca los documentos que vienen <strong>dentro de este PDF</strong> y, si la sabes, la página donde empiezan. Así aparecen al buscarlos en la
          ficha y cuentan para el cumplimiento mientras este documento esté vigente.
        </p>
        <button type="button" className="sit-btn sit-contenido__ia" onClick={sugerir} disabled={ocupado}>
          {sugiriendo ? <i className="ti ti-loader-2 sit-spin" /> : <i className="ti ti-sparkles" />}
          {sugiriendo ? "Leyendo el PDF… puede tardar hasta un minuto" : "Sugerir con IA"}
        </button>
        {nota && <p className="sit-contenido__nota"><i className="ti ti-info-circle" /> {nota}</p>}
        {error && <div className="sit-form-error" role="alert"><i className="ti ti-alert-circle" /> {error}</div>}

        {!tipos ? (
          !error && <div className="sit-state"><i className="ti ti-loader-2 sit-spin" /></div>
        ) : (
          <ul className="sit-contenido__lista">
            {ordenados.map((t) => {
              const m = marcados[t.idTipoDocumento];
              return (
                <li key={t.idTipoDocumento} className={m ? "is-marcado" : ""}>
                  <label>
                    <input type="checkbox" checked={!!m} onChange={() => alternar(t.idTipoDocumento)} disabled={ocupado} />
                    <span>
                      {t.nombre}
                      {m?.origen === "IA" && <span className="sit-contenido__ia-tag" title={m.evidencia || "Sugerido por la lectura del PDF"}>IA</span>}
                      {m?.evidencia && <small>“{m.evidencia}”</small>}
                    </span>
                  </label>
                  {m && (
                    <input
                      className="sit-input sit-contenido__pagina"
                      inputMode="numeric"
                      placeholder="Pág."
                      aria-label={`Página donde empieza ${t.nombre}`}
                      value={m.pagina}
                      onChange={(e) => ponerPagina(t.idTipoDocumento, e.target.value)}
                      disabled={ocupado}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </form>
    </SitModal>
  );
}
