// src/pages/cedis/FacturasCedisPage.jsx
import { useState, useContext } from "react";
import { AuthContext } from "../../context/AuthContext";
import ScannerView from "./ScannerView";
import ResultSheet from "./ResultSheet";
import FacturasList from "./FacturasList";
import HistoricoView from "./HistoricoView";
import "./FacturasCedis.css";

const TABS = [
  { id: "scan", label: "Escanear" },
  { id: "hoy", label: "Hoy" },
  { id: "hist", label: "Histórico" },
];

export default function FacturasCedisPage() {
  const { name } = useContext(AuthContext);
  const [tab, setTab] = useState("scan");
  const [scanOpen, setScanOpen] = useState(false);
  const [resultado, setResultado] = useState(null); // resultado del último scan

  // Callback que recibe ScannerView cuando detecta y el backend responde
  function handleScanResult(result) {
    setScanOpen(false);
    setResultado(result);
  }

  function handleScanNext() {
    setResultado(null);
    setScanOpen(true);
  }

  function handleClose() {
    setResultado(null);
  }

  const initials = name
    ? name
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "US";

  return (
    <div className="cedis-root">
      {/* ── HEADER ── */}
      <header className="cedis-header">
        <div className="cedis-header-left">
          <span className="cedis-eyebrow">CEDIS · FABPSA</span>
          <span className="cedis-title">Facturas</span>
        </div>
        <div className="cedis-avatar">{initials}</div>
      </header>

      {/* ── TABS ── */}
      <nav className="cedis-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`cedis-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── CONTENIDO ── */}
      <main className="cedis-main">
        {tab === "scan" && (
          <ScanTab
            onOpenScanner={() => setScanOpen(true)}
            ultimoResultado={resultado}
          />
        )}

        {tab === "hoy" && <FacturasList />}

        {tab === "hist" && <HistoricoView />}
      </main>

      {/* ── SCANNER (fullscreen) ── */}
      {scanOpen && (
        <ScannerView
          onResult={handleScanResult}
          onClose={() => setScanOpen(false)}
        />
      )}

      {/* ── RESULTADO (bottom sheet) ── */}
      {resultado && (
        <ResultSheet
          resultado={resultado}
          onNext={handleScanNext}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

// ── Tab de escaneo ──────────────────────────────────────────────────────────
function ScanTab({ onOpenScanner, ultimoResultado }) {
  return (
    <div className="cedis-scan-pad">
      {/* Botón principal */}
      <button className="cedis-scan-btn" onClick={onOpenScanner}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Escanear factura
      </button>

      {/* Último resultado */}
      {ultimoResultado && (
        <div className="cedis-last-wrap">
          <p className="cedis-sec-lbl">Último escaneo</p>
          <LastScanCard resultado={ultimoResultado} />
        </div>
      )}
    </div>
  );
}

function LastScanCard({ resultado }) {
  const { status, factura } = resultado;

  const map = {
    SCANNED: { cls: "green", icon: "✓", label: "Surtida" },
    ALREADY_SCANNED: { cls: "amber", icon: "!", label: "Ya surtida" },
    CANCELLED: { cls: "red", icon: "✕", label: "Cancelada" },
    NOT_FOUND: { cls: "red", icon: "?", label: "No encontrada" },
  };

  const info = map[status] || { cls: "red", icon: "?", label: status };

  return (
    <div className="cedis-last-card">
      <div className={`cedis-last-icon ${info.cls}`}>{info.icon}</div>
      <div className="cedis-last-body">
        <div className="cedis-last-folio">{factura?.numeroFactura ?? "—"}</div>
        <div className="cedis-last-client">
          {factura?.nombreCliente ?? "Sin información"}
        </div>
      </div>
      <span className={`cedis-badge ${info.cls}`}>{info.label}</span>
    </div>
  );
}
