// src/pages/cedis/components/FacturasList.jsx
import { useState, useEffect, useCallback } from 'react';

function apiFetch(url) {
  const token = localStorage.getItem('fabpsa_token');
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function fmt(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtMoney(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
  }).format(val);
}

const FILTROS = [
  { id: '',           label: 'Todas'      },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'surtidas',   label: 'Surtidas'   },
  { id: 'canceladas', label: 'Canceladas' },
];

export default function FacturasList() {
  const [filtro,   setFiltro]   = useState('');
  const [q,        setQ]        = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtro) params.set('status', filtro);
      if (q.trim()) params.set('q', q.trim());
      const res  = await apiFetch(`/api/cedis/facturas/hoy?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.message);
      setData(json);
    } catch (err) {
      setError(err.message || 'Error al cargar facturas.');
    } finally {
      setLoading(false);
    }
  }, [filtro, q]);

  useEffect(() => { cargar(); }, [cargar]);

  // Búsqueda con debounce 400ms
  useEffect(() => {
    const t = setTimeout(() => cargar(), 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="cedis-list-pad">

      {/* Resumen */}
      {data?.resumen && <Resumen r={data.resumen} />}

      {/* Filtros */}
      <div className="cedis-pill-row">
        {FILTROS.map(f => (
          <button
            key={f.id}
            className={`cedis-pill${filtro === f.id ? ' on' : ''}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            {f.id === ''           && data ? ` (${data.resumen.total})`      : ''}
            {f.id === 'pendientes' && data ? ` (${data.resumen.pendientes})` : ''}
            {f.id === 'surtidas'   && data ? ` (${data.resumen.surtidas})`   : ''}
            {f.id === 'canceladas' && data ? ` (${data.resumen.canceladas})` : ''}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="cedis-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="search"
          placeholder="Factura, cliente o pedido…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {/* Estados */}
      {loading && <p className="cedis-state-msg">Cargando…</p>}
      {error   && <p className="cedis-state-msg error">{error}</p>}

      {/* Lista */}
      {!loading && !error && data && (
        data.facturas.length === 0
          ? <p className="cedis-state-msg">Sin facturas para este filtro.</p>
          : (
            <div className="cedis-group">
              {data.facturas.map((f, i) => (
                <FacturaRow key={f.numeroFactura} factura={f} last={i === data.facturas.length - 1} />
              ))}
            </div>
          )
      )}

    </div>
  );
}

function Resumen({ r }) {
  return (
    <div className="cedis-counters" style={{ marginBottom: 16 }}>
      <div className="cedis-ctr"><div className="cedis-ctr-n total">{r.total}</div><div className="cedis-ctr-l">Total</div></div>
      <div className="cedis-ctr"><div className="cedis-ctr-n green">{r.surtidas}</div><div className="cedis-ctr-l">Surtidas</div></div>
      <div className="cedis-ctr"><div className="cedis-ctr-n amber">{r.pendientes}</div><div className="cedis-ctr-l">Pendientes</div></div>
      <div className="cedis-ctr"><div className="cedis-ctr-n red">{r.canceladas}</div><div className="cedis-ctr-l">Canceladas</div></div>
    </div>
  );
}

function FacturaRow({ factura: f, last }) {
  const pipCls = f.estado === 'surtida'   ? 'green'
               : f.estado === 'cancelada' ? 'red'
               : 'amber';

  const badgeCls   = pipCls;
  const badgeLabel = f.estado === 'surtida'   ? 'Surtida'
                   : f.estado === 'cancelada' ? 'Cancelada'
                   : 'Pendiente';

  return (
    <div className={`cedis-row${last ? ' last' : ''}`}>
      <div className={`cedis-pip ${pipCls}`} />
      <div className="cedis-rb">
        <div className="cedis-rt">
          <span className="cedis-r-folio">{f.numeroFactura}</span>
          <span className="cedis-r-amt">{fmtMoney(f.totalFactura)}</span>
        </div>
        <div className="cedis-r-client">{f.nombreCliente ?? f.codigoCliente}</div>
        <div className="cedis-r-foot">
          <span className={`cedis-badge ${badgeCls}`}>{badgeLabel}</span>
          {f.estado === 'surtida' && (
            <span className="cedis-r-meta">
              {f.usuarioFacturaSurtida} · {fmt(f.fechaFacturaSurtida)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
