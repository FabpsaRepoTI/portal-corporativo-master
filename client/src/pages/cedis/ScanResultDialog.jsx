import { useEffect, useRef } from 'react';

const states = {
  SCANNED: { tone: 'success', title: 'Factura leída correctamente', text: 'El surtido quedó registrado.' },
  ALREADY_SCANNED: { tone: 'warning', title: 'Esta factura ya fue leída', text: 'Ya estaba registrada como surtida. Se conserva la lectura original.' },
  CANCELLED: { tone: 'danger', title: 'Factura cancelada', text: 'No se registró el surtido de esta factura.' },
  NOT_FOUND: { tone: 'danger', title: 'Factura no encontrada', text: 'Revisa el código de barras. No se registró ningún surtido.' },
  UNKNOWN_STATUS: { tone: 'warning', title: 'Factura pendiente de revisión', text: 'El estado de la factura no permite registrar el surtido.' },
  ERROR: { tone: 'danger', title: 'No se pudo confirmar la lectura', text: 'Consulta el estado de la factura antes de repetir la lectura.' },
};

export default function ScanResultDialog({ result, onClose, formatTime }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const state = states[result.status] || states.ERROR;
  const recorded = ['SCANNED', 'ALREADY_SCANNED'].includes(result.status);
  useEffect(() => {
    dialog.current?.showModal();
    const timer = window.setTimeout(() => close.current(), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  return <dialog ref={dialog} className={`cdf-scan-alert ${state.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="cdf-scan-title" aria-describedby="cdf-scan-description" onCancel={event => event.preventDefault()}>
    <div className="cdf-scan-alert-body">
      <span className="cdf-scan-alert-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="32" r="26" />
          {state.tone === 'success' ? <path d="m19 32 9 9 18-19" /> : state.tone === 'warning' ? <><path d="M32 17v18" /><circle cx="32" cy="44" r="1" /></> : <path d="m23 23 18 18m0-18L23 41" />}
        </svg>
      </span>
      <h2 id="cdf-scan-title">{state.title}</h2>
      <p id="cdf-scan-description">{state.text}</p>
      <div className="cdf-scan-receipt"><span>FACTURA</span><strong>{result.code}</strong>
        {recorded && <dl><div><dt>{result.status === 'ALREADY_SCANNED' ? 'Lectura original' : 'Fecha de lectura'}</dt><dd>{formatTime(result.factura?.fechaFacturaSurtida)}</dd></div><div><dt>Registrada por</dt><dd>{result.factura?.usuarioFacturaSurtida || 'Sin dato registrado'}</dd></div></dl>}
      </div>
    </div>
  </dialog>;
}
