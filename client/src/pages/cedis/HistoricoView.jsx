// src/pages/cedis/components/HistoricoView.jsx
import { useState, useEffect, useCallback } from "react";

function apiFetch(url) {
  const token = localStorage.getItem("fabpsa_token");
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function fmtFecha(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(val) {
  if (val == null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(val);
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const FILTROS = [
  { id: "", label: "Todas" },
  { id: "pendientes", label: "Pendientes" },
  { id: "surtidas", label: "Surtidas" },
  { id: "canceladas", label: "Canceladas" },
];

const now = new Date();

export default function HistoricoView() {
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [filtro, setFiltro] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mes, anio });
      if (filtro) params.set("status", filtro);
      if (q.trim()) params.set("q", q.trim());
      const res = await apiFetch(`/api/cedis/facturas/historico?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.message);
      setData(json);
    } catch (err) {
      setError(err.message || "Error al cargar histórico.");
    } finally {
      setLoading(false);
    }
  }, [mes, anio, filtro, q]);

  useEffect(() => {
    cargar();
  }, [mes, anio, filtro]);

  useEffect(() => {
    const t = setTimeout(() => cargar(), 400);
    return () => clearTimeout(t);
  }, [q]);

  const anios = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="cedis-list-pad">
      {/* Selector mes/año */}
      <div className="cedis-sel-row">
        <select
          className="cedis-ios-sel"
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
        >
          {MESES.map((m, i) => (
            <option key={i + 1} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="cedis-ios-sel"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Resumen */}
      {data?.resumen && (
        <div className="cedis-counters" style={{ marginBottom: 16 }}>
          <div className="cedis-ctr">
            <div className="cedis-ctr-n total">{data.resumen.total}</div>
            <div className="cedis-ctr-l">Total</div>
          </div>
          <div className="cedis-ctr">
            <div className="cedis-ctr-n green">{data.resumen.surtidas}</div>
            <div className="cedis-ctr-l">Surtidas</div>
          </div>
          <div className="cedis-ctr">
            <div className="cedis-ctr-n amber">{data.resumen.pendientes}</div>
            <div className="cedis-ctr-l">Pendientes</div>
          </div>
          <div className="cedis-ctr">
            <div className="cedis-ctr-n red">{data.resumen.canceladas}</div>
            <div className="cedis-ctr-l">Canceladas</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="cedis-pill-row">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            className={`cedis-pill${filtro === f.id ? " on" : ""}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="cedis-search">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          placeholder={`Buscar en ${MESES[mes - 1]} ${anio}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <p className="cedis-state-msg">Cargando…</p>}
      {error && <p className="cedis-state-msg error">{error}</p>}

      {!loading &&
        !error &&
        data &&
        (data.facturas.length === 0 ? (
          <p className="cedis-state-msg">Sin facturas para este período.</p>
        ) : (
          <div className="cedis-group">
            {data.facturas.map((f, i) => (
              <div
                key={f.numeroFactura}
                className={`cedis-row${i === data.facturas.length - 1 ? " last" : ""}`}
              >
                <div
                  className={`cedis-pip ${f.estado === "surtida" ? "green" : f.estado === "cancelada" ? "red" : "amber"}`}
                />
                <div className="cedis-rb">
                  <div className="cedis-rt">
                    <span className="cedis-r-folio">{f.numeroFactura}</span>
                    <span className="cedis-r-amt">
                      {fmtMoney(f.totalFactura)}
                    </span>
                  </div>
                  <div className="cedis-r-client">
                    {f.nombreCliente ?? f.codigoCliente}
                  </div>
                  <div className="cedis-r-foot">
                    <span
                      className={`cedis-badge ${f.estado === "surtida" ? "green" : f.estado === "cancelada" ? "red" : "amber"}`}
                    >
                      {f.estado === "surtida"
                        ? "Surtida"
                        : f.estado === "cancelada"
                          ? "Cancelada"
                          : "Pendiente"}
                    </span>
                    <span className="cedis-r-meta">
                      {fmtFecha(f.fechaFactura)}
                    </span>
                    {f.estado === "surtida" && (
                      <span className="cedis-r-meta">
                        {f.usuarioFacturaSurtida}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
