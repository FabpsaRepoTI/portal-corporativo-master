// ============================================================
// VigilanciaFirmasPage.jsx
// Módulo: Vigilancia — Administración de firmas precargadas
// Se sube una sola vez por persona; el PDF del reporte las toma
// automáticamente según quién aparezca como reportó/recibió/enterado.
// ============================================================

import { useState, useEffect, useRef } from "react";
import "./VigilanciaPage.css";
import "./VigilanciaReporte.css";
import PageHero from "../../components/PageHero";

const API = (path) => `/api/vigilancia${path}`;
const token = () => localStorage.getItem("fabpsa_token");
const apiFetch = (path, opts = {}) =>
  fetch(API(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, ...opts.headers },
  });

export default function VigilanciaFirmasPage() {
  const [firmas, setFirmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, tipo = "success") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    fetchFirmas();
  }, []);

  const fetchFirmas = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/firmas");
      const d = await res.json();
      if (d.ok) setFirmas(d.data);
      else showToast(d.error || "Error al cargar firmas", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vig-page">
      {toast && (
        <div className={`vig-toast vig-toast--${toast.tipo}`}>
          <i
            className={`ti ${toast.tipo === "success" ? "ti-circle-check" : "ti-alert-circle"}`}
          />
          {toast.msg}
        </div>
      )}

      <PageHero
        eyebrow="Vigilancia · SUR 121"
        titulo="Firmas"
        resalte="precargadas"
        sub="Se usan automáticamente al generar el PDF."
        volver={{ to: "/vigilancia", label: "Volver a reportes" }}
      />

      {loading ? (
        <div className="vig-center" style={{ padding: "2rem" }}>
          <i className="ti ti-loader-2 vig-spin" />
        </div>
      ) : (
        <div className="vigr-firmas-grid">
          {firmas.map((f) => (
            <FirmaCard key={f.login} f={f} onSaved={fetchFirmas} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}

function FirmaCard({ f, onSaved, showToast }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));

    const body = new FormData();
    body.append("firma", file);

    try {
      setUploading(true);
      const res = await apiFetch(`/firmas/${f.login}`, {
        method: "PUT",
        body,
      });
      const d = await res.json();
      if (d.ok) {
        showToast(`Firma de ${f.name} actualizada`);
        onSaved();
      } else showToast(d.error || "Error al subir la firma", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setUploading(false);
    }
  };

  const imgSrc = preview || (f.rutaArchivo ? f.rutaArchivo : null);

  return (
    <div className="vigr-firma-card">
      <div className="vigr-firma-card__name">{f.name}</div>
      <div
        className="vigr-firma-card__preview"
        onClick={() => inputRef.current?.click()}
      >
        {imgSrc ? (
          <img src={imgSrc} alt={`Firma de ${f.name}`} />
        ) : (
          <span className="vigr-firma-card__empty">
            <i className="ti ti-signature" /> Sin firma — clic para subir
          </span>
        )}
        {uploading && (
          <div className="vigr-firma-card__loading">
            <i className="ti ti-loader-2 vig-spin" />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        className="vig-btn vig-btn--ghost vig-btn--sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <i className="ti ti-upload" /> {f.rutaArchivo ? "Reemplazar" : "Subir firma"}
      </button>
    </div>
  );
}
