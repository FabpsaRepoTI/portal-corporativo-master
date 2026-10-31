// pages/sit/components/SitHeroNube.jsx
// Encabezado del SIT con el estilo "nube" (azul hielo, títulos azul marino,
// palabra clave en degradado violeta → azul, buscador grande con chips e
// ilustración 3D). Se usa dentro de <main className="sit-root sit-nube">.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import IlustracionDocumental from "./IlustracionDocumental";

export default function SitHeroNube({ eyebrow, antes, resalte, despues, sub, volver, acciones, buscador, chips = [] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const buscar = (e) => {
    e.preventDefault();
    if (q.trim()) buscador.onBuscar(q.trim());
  };

  return (
    <header className="nube-hero">
      <div className="nube-hero__barra">
        {volver ? (
          <button type="button" className="nube-volver" onClick={() => navigate(volver.to)}>
            <i className="ti ti-arrow-left" /> {volver.label}
          </button>
        ) : (
          <span />
        )}
        {acciones && <div className="nube-hero__acciones">{acciones}</div>}
      </div>

      <div className="nube-hero__cuerpo">
        <div className="nube-hero__texto">
          <span className="nube-pill">
            <span className="nube-pill__dot" aria-hidden="true" /> {eyebrow}
          </span>
          <h1 className="nube-titulo">
            {antes} <span className="nube-grad">{resalte}</span> {despues}
          </h1>
          {sub && <p className="nube-sub">{sub}</p>}

          {buscador && (
            <form className="nube-buscador" onSubmit={buscar} role="search">
              <i className="ti ti-search" aria-hidden="true" />
              <input
                id="nube-buscar"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={buscador.placeholder}
                aria-label={buscador.placeholder}
                maxLength={80}
              />
              <button type="submit" className="nube-buscador__ir" disabled={!q.trim()} aria-label="Buscar">
                <i className="ti ti-arrow-up" />
              </button>
            </form>
          )}

          {chips.length > 0 && (
            <div className="nube-chips">
              {chips.map((c) => (
                <button type="button" key={c.label} className={`nube-chip${c.tono ? ` nube-chip--${c.tono}` : ""}`} onClick={c.onClick}>
                  <span className="nube-chip__dot" aria-hidden="true" /> {c.label}
                  {c.valor != null && <b>{c.valor}</b>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="nube-hero__arte" aria-hidden="true">
          <IlustracionDocumental className="nube-hero__ilustracion" />
        </div>
      </div>
    </header>
  );
}
