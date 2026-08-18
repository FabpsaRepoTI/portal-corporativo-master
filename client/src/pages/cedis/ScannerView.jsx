// src/pages/cedis/components/ScannerView.jsx
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ID = "cedis-qr-reader";
const DEBOUNCE_MS = 2500;

function apiFetch(url, options = {}) {
  const token = localStorage.getItem("fabpsa_token");
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

export default function ScannerView({ onResult, onClose }) {
  const lastCode = useRef(null);
  const lastTime = useRef(0);
  const isProcessing = useRef(false);
  const [hint, setHint] = useState("Centra el código de barras en el recuadro");
  const [error, setError] = useState(null);

  useEffect(() => {
    let html5Qr = null;
    let started = false;

    const config = {
      fps: 15,
      qrbox: { width: 280, height: 120 },
      aspectRatio: 1.5,
      formatsToSupport: [0, 4, 6, 1], // QR, CODE_128, CODE_39, AZTEC
    };

    // 100ms evita crash del doble-mount de React StrictMode en desarrollo
    const timer = setTimeout(() => {
      html5Qr = new Html5Qrcode(SCANNER_ID);
      html5Qr
        .start({ facingMode: "environment" }, config, onCodeDetected, () => {})
        .then(() => {
          started = true;
        })
        .catch((err) => {
          console.error("[ScannerView] start error:", err);
          setError(
            "No se pudo acceder a la cámara. Verifica los permisos del navegador.",
          );
        });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (html5Qr && started) html5Qr.stop().catch(() => {});
    };
  }, []); 

  async function onCodeDetected(decodedText) {
    const now = Date.now();
    if (
      decodedText === lastCode.current &&
      now - lastTime.current < DEBOUNCE_MS
    )
      return;
    if (isProcessing.current) return;
    lastCode.current = decodedText;
    lastTime.current = now;
    isProcessing.current = true;
    setHint("Procesando…");
    try {
      const res = await apiFetch("/api/cedis/facturas/scan", {
        method: "POST",
        body: JSON.stringify({ numeroFactura: decodedText.trim() }),
      });
      const data = await res.json();
      onResult(data);
    } catch (err) {
      onResult({
        ok: false,
        status: "ERROR",
        message: "Sin conexión.",
        factura: null,
      });
    } finally {
      isProcessing.current = false;
    }
  }

  return (
    <div className="cedis-cam-wrap">
      <div className="cedis-cam-top">
        <div>
          <p className="cedis-cam-ey">CEDIS · FABPSA</p>
          <p className="cedis-cam-ttl">Escanear factura</p>
        </div>
        <button className="cedis-cam-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="cedis-cam-body">
        <div id={SCANNER_ID} className="cedis-cam-feed" />
        <div className="cedis-cam-hint">
          <span>{hint}</span>
        </div>
        {error && (
          <div className="cedis-cam-error">
            <p>{error}</p>
            <button onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
