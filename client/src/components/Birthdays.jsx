import { useState, useEffect } from "react";
import { useReveal } from "../hooks/useReveal";

const COLORS = [
  "#c4a058",
  "#60a5fa",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f87171",
  "#2dd4bf",
  "#e0bf7a",
];

// En desarrollo: proxy de CRA redirige al servidor Node (puerto 3001)
// En producción: misma URL relativa funciona si el build está servido por Node
//const API = '/api/birthdays';

//const API = 'http://localhost:3001/api/birthdays';

//const API = "http://192.168.16.198:3001/api/birthdays";

const API = `${process.env.REACT_APP_API_URL}/birthdays`;

function BdayCard({ bday, index }) {
  const { ref, visible } = useReveal();
  const color = COLORS[index % COLORS.length];
  const initials = (
    (bday.nombre?.[0] || "") + (bday.apellidoPaterno?.[0] || "")
  ).toUpperCase();

  return (
    <div
      ref={ref}
      className={`bday-card reveal d${(index % 4) + 1} ${visible ? "visible" : ""}`}
    >
      <div className="bday-date">
        <div className="bday-day">{bday.diaNacimiento}</div>
        <div className="bday-mon">Jun</div>
      </div>
      <div className="bday-av" style={{ "--c": color }}>
        {initials}
      </div>
      <div className="bday-info">
        <div className="bday-name">
          {bday.nombre} {bday.apellidoPaterno}
        </div>
        <div className="bday-dept">{bday.departamento}</div>
        <span className="bday-site-tag">{bday.sitio}</span>
      </div>
      <i className="ti ti-cake bday-cake-ico" />
    </div>
  );
}

export default function Birthdays() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="dash-bdays" id="cumpleanos">
      <div className="sec-header">
        <span className="sec-tag">Cumpleaños del mes</span>
      </div>

      {loading && (
        <div className="bday-state">
          <i className="ti ti-loader-2 spin" />
          Cargando cumpleaños...
        </div>
      )}

      {error && (
        <div className="bday-state bday-state--err">
          <i className="ti ti-wifi-off" />
          <div>
            <strong>Sin conexión con el servidor Node</strong>
            <br />
            <small>
              Verifica que el servidor esté corriendo:
              <br />
              <code>cd server &amp;&amp; node index.js</code>
            </small>
          </div>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="bday-state">
          <i className="ti ti-cake" /> Sin cumpleaños este mes.
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="bday-scroll">
          {data.map((b, i) => (
            <BdayCard
              key={`${b.nombre}-${b.diaNacimiento}-${i}`}
              bday={b}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
