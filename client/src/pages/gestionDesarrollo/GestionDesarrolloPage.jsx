import {Link} from "react-router-dom";
import ReferenceHero,{ReferenceHeadingIcon} from "./components/ReferenceHero";
// client/src/pages/gestionDesarrollo/GestionDesarrolloPage.jsx
import { useState } from "react";
import PortafolioPage    from "./portafolio/PortafolioPage";
import CronogramaPage    from "./cronograma/CronogramaPage";
import DocumentacionPage from "./documentacion/DocumentacionPage";
import "./GestionDesarrolloPage.css";
import "./ReferenceDesign.css";
import "./ExecutiveDesign.css";
import "./VisualReference.css";
import "./documentacion/DocumentacionReference.css";
import "./InternalBanners.css";

const TABS = [
  { id: "portafolio",    label: "Portafolio" },
  { id: "cronograma",    label: "Cronograma" },
  { id: "documentacion", label: "Documentación" },
];

export default function GestionDesarrolloPage() {

  const [tab, setTab] = useState("portafolio");

  if (tab === "portafolio") return <div className="gd-root gd-view-portafolio"><PortafolioPage onTabChange={setTab}/></div>;

  return (
    <div className={`gd-root gd-view-${tab}`}>
      {tab === "documentacion" && <Link to="/" className="doc-back-home">← <span>Volver al inicio</span></Link>}
      {/* ── Header ── */}
      <div className="gd-header">
        <div className="gd-header__left">
          <div className="gd-header__icon">
            {tab === "cronograma" ? <ReferenceHeadingIcon schedule/> : <ReferenceHeadingIcon documentation/>}
          </div>
          <div>
            <span className="gd-reference-eyebrow">{tab === "cronograma"?"CRONOGRAMA":"DOCUMENTACIÓN"}</span><h1 className="gd-header__title">{TABS.find(t=>t.id===tab)?.label} de <em>proyectos</em></h1>
            <p className="gd-header__sub">{tab === "cronograma" ? "Etapas, compromisos y resultados" : "Biblioteca de proyectos · SharePoint"}</p>
          </div>
        </div>
        {tab === "cronograma" ? <ReferenceHero schedule/> : <ReferenceHero documentation/>}
      </div>

      {/* ── Tabs ── */}
      <div className="gd-tabs-wrap">
        <div className="gd-tabs" role="tablist" aria-label="Gestión de Desarrollo">
          {TABS.map((t) => (
            <button
              role="tab" aria-selected={tab===t.id}
              key={t.id}
              className={`gd-tab ${tab === t.id ? "gd-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="gd-body">
        {tab === "portafolio"    && <PortafolioPage onTabChange={setTab} />}
        {tab === "cronograma"    && <CronogramaPage />}
        {tab === "documentacion" && <DocumentacionPage />}
      </div>
    </div>
  );
}
