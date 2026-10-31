// src/pages/cedis/components/ResultSheet.jsx

const ESTADOS = {
  SCANNED: {
    cls: "green",
    icon: "✅",
    titulo: "Escaneo exitoso",
    mensaje: "Factura surtida correctamente.",
    btnNext: "Escanear siguiente",
    btnAlt: "Ver facturas de hoy",
  },
  ALREADY_SCANNED: {
    cls: "amber",
    icon: "⚠️",
    titulo: "Ya estaba surtida",
    mensaje: "Esta factura fue registrada anteriormente.",
    btnNext: "Escanear otra",
    btnAlt: "Cerrar",
  },
  CANCELLED: {
    cls: "red",
    icon: "🚫",
    titulo: "Factura cancelada",
    mensaje: "Esta factura está cancelada. No se realizará ningún cambio.",
    btnNext: "Escanear otra",
    btnAlt: "Cerrar",
  },
  NOT_FOUND: {
    cls: "red",
    icon: "❓",
    titulo: "No encontrada",
    mensaje: "No hay ninguna factura asociada al código leído.",
    btnNext: "Reintentar",
    btnAlt: "Cerrar",
  },
  UNKNOWN_STATUS: {
    cls: "red",
    icon: "⚠️",
    titulo: "Estado desconocido",
    mensaje: "La factura tiene un estado no reconocido. Contacta a sistemas.",
    btnNext: "Escanear otra",
    btnAlt: "Cerrar",
  },
  ERROR: {
    cls: "red",
    icon: "📡",
    titulo: "Error de conexión",
    mensaje: "No se pudo conectar con el servidor. Verifica tu red.",
    btnNext: "Reintentar",
    btnAlt: "Cerrar",
  },
};

function fmt(fecha) {
  if (!fecha) return "—";
  const d = new Date(fecha);
  return (
    d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function fmtMoney(val) {
  if (val == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(val);
}

export default function ResultSheet({ resultado, onNext, onClose }) {
  const { status, factura } = resultado;
  const cfg = ESTADOS[status] || ESTADOS.ERROR;

  return (
    <div className="cedis-sheet-bg" onClick={onClose}>
      <div className="cedis-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cedis-sheet-handle-row">
          <div className="cedis-sheet-handle" />
        </div>

        <div className="cedis-sheet-body">
          {/* Ícono */}
          <div className="cedis-r-icon-row">
            <div className={`cedis-r-icon ${cfg.cls}`}>{cfg.icon}</div>
          </div>

          {/* Título y mensaje */}
          <p className={`cedis-r-title ${cfg.cls}`}>{cfg.titulo}</p>
          <p className="cedis-r-sub">{resultado.message || cfg.mensaje}</p>

          {/* Info de la factura */}
          {factura && (
            <div className="cedis-info-block">
              <InfoRow label="Factura" value={factura.numeroFactura} accent />
              <InfoRow label="Cliente" value={factura.nombreCliente} />
              <InfoRow label="Pedido" value={factura.numeroPedido} />
              <InfoRow label="Fecha" value={fmt(factura.fechaFactura)} />
              <InfoRow label="Total" value={fmtMoney(factura.totalFactura)} />
              {factura.estado === "surtida" && (
                <>
                  <InfoRow
                    label="Surtió"
                    value={factura.usuarioFacturaSurtida}
                  />
                  <InfoRow
                    label="Hora"
                    value={fmt(factura.fechaFacturaSurtida)}
                  />
                </>
              )}
            </div>
          )}

          {/* Acciones */}
          <button className="cedis-s-btn primary" onClick={onNext}>
            {cfg.btnNext}
          </button>
          <button className="cedis-s-btn ghost" onClick={onClose}>
            {cfg.btnAlt}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, accent }) {
  return (
    <div className="cedis-i-row">
      <span className="cedis-i-k">{label}</span>
      <span className={`cedis-i-v${accent ? " accent" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}
