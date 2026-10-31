import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { getResultadosEncuesta } from "../../../services/encuestaMesaServicio";
import "./EncuestaResultados.css";

const ADMIN_LOGIN = "JMRAMIREZ";

const COLOR_SATISFACCION = {
  "Muy satisfecho": "#108976",
  Satisfecho: "#4cc9a6",
  Neutral: "#f6c177",
  Insatisfecho: "#e58a5e",
  "Muy insatisfecho": "#f38ba8",
};

function fmtFecha(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EncuestaResultadosPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && user.login !== ADMIN_LOGIN) {
      navigate("/mesa-de-servicio", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user || user.login !== ADMIN_LOGIN) return;
    getResultadosEncuesta()
      .then((r) => setRows(r.data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || user.login !== ADMIN_LOGIN) return null;

  const total = rows.length;
  const conteo = rows.reduce((acc, r) => {
    acc[r.Satisfaccion] = (acc[r.Satisfaccion] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="encr-root">
      <div className="encr-header">
        <div>
          <span className="encr-eyebrow">MESA DE SERVICIO · CONFIDENCIAL</span>
          <h1>Resultados de la encuesta</h1>
          <p>Visible únicamente para tu cuenta.</p>
        </div>
        <button className="encr-back" onClick={() => navigate("/mesa-de-servicio")}>
          ← Volver
        </button>
      </div>

      {loading && <div className="encr-empty">Cargando resultados…</div>}
      {error && <div className="encr-empty encr-empty--error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="encr-summary">
            <div className="encr-summary-card encr-summary-card--total">
              <span>Total de respuestas</span>
              <strong>{total}</strong>
            </div>
            {Object.entries(conteo).map(([label, n]) => (
              <div key={label} className="encr-summary-card">
                <span
                  className="encr-dot"
                  style={{ background: COLOR_SATISFACCION[label] || "#94a3b8" }}
                />
                <span>{label}</span>
                <strong>{n}</strong>
              </div>
            ))}
          </div>

          {!total && (
            <div className="encr-empty">Aún no hay respuestas registradas.</div>
          )}

          <div className="encr-list">
            {rows.map((r) => (
              <div className="encr-card" key={r.ID}>
                <div className="encr-card-top">
                  <span
                    className="encr-chip"
                    style={{
                      background: `${COLOR_SATISFACCION[r.Satisfaccion] || "#94a3b8"}1f`,
                      color: COLOR_SATISFACCION[r.Satisfaccion] || "#64748b",
                    }}
                  >
                    {r.Satisfaccion || "—"}
                  </span>
                  <time>{fmtFecha(r.FechaRegistro)}</time>
                </div>
                <div className="encr-card-body">
                  <div className="encr-field">
                    <label>Qué cambiaría</label>
                    <p>{r.Oportunidades || "—"}</p>
                  </div>
                  {r.comentarios && (
                    <div className="encr-field">
                      <label>Comentarios adicionales</label>
                      <p>{r.comentarios}</p>
                    </div>
                  )}
                </div>
                <div className="encr-card-foot">
                  <span>{r.nombre || "Sin nombre"}</span>
                  <span>{r.Correo || "—"}</span>
                  <span>{r.IP || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
