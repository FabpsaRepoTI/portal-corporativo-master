// components/PageHero.jsx
// Encabezado de página estándar del portal (SIT, Vigilancia…) con el mismo hero que usa el resto del
// portal (clases .apps-* de App.css: Aplicativos), para que el módulo no se
// vea como un sistema aparte.
import { useNavigate } from "react-router-dom";

// arte (opcional): imagen a la derecha, sin recuadro (como Información Técnica)
export default function PageHero({ eyebrow, titulo, resalte, sub, volver, acciones, arte }) {
  const navigate = useNavigate();
  return (
    <div className="apps-hero page-hero">
      <div className="apps-hero-glow" />
      <div className="apps-hero-grid" />
      <div className="apps-hero-inner">
        {volver && (
          <button className="apps-back" onClick={() => navigate(volver.to)}>
            <i className="ti ti-arrow-left" /> {volver.label}
          </button>
        )}
        <span className="apps-eyebrow">{eyebrow}</span>
        <h1 className="apps-title">
          {titulo} {resalte && <em>{resalte}</em>}
        </h1>
        {sub && <p className="apps-sub">{sub}</p>}
      </div>
      {arte && <img className="page-hero__arte" src={arte} alt="" aria-hidden="true" />}
      {acciones && <div className="page-hero__acciones">{acciones}</div>}
    </div>
  );
}
