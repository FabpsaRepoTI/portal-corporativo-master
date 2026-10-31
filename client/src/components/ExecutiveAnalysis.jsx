import {useState} from "react";
import "./ExecutiveAnalysis.css";

const sections=[
 {key:"riesgoPrincipal",label:"Riesgo principal",icon:"ti-alert-triangle"},
 {key:"cuelloBottella",label:"Cuello de botella",icon:"ti-filter"},
 {key:"tendencia",label:"Tendencia",icon:"ti-chart-line"},
];
const brief=text=>{const value=String(text||"Sin información disponible.");return value.length>155?value.slice(0,155).replace(/\s+\S*$/,"")+"…":value;};
export default function ExecutiveAnalysis({analysis,nivel,periodo,sitio,contextLabel}){
 const [selected,setSelected]=useState(null);
 const textFor=key=>{const v=analysis[key];return typeof v==="string"?v:v?.titulo||v?.descripcion||v?.detalle;};
 const value=selected?analysis[selected]:null;
 const label=sections.find(s=>s.key===selected)?.label || ({situacionGeneral:"Situación general",recomendacion:"Acción recomendada",basadoEn:"Fuentes del análisis"}[selected]);
 return <section className="exec-analysis" aria-label="Informe ejecutivo">
  <header className="exec-analysis-context"><span className="exec-analysis-risk" style={{color:nivel?.col}}><span aria-hidden="true">●</span> {nivel?.txt||"Sin clasificación"}</span><span>{contextLabel || ((sitio||"Corporativo")+" · Últimos "+periodo+" días")}</span></header>
  {selected ? <div className="exec-analysis-detail">
   <button type="button" onClick={()=>setSelected(null)}>← Volver al resumen</button>
   <h3>{label}</h3>
   {typeof value==="string"?<p>{value}</p>:Array.isArray(value)?<ul>{value.map((v,i)=><li key={i}>{v}</li>)}</ul>:<>{value?.titulo&&<h4>{value.titulo}</h4>}{value?.detalle&&<p>{value.detalle}</p>}{value?.descripcion&&<p>{value.descripcion}</p>}{value?.donde&&<p><strong>Dónde:</strong> {value.donde}</p>}{value?.impacto&&<p><strong>Impacto:</strong> {value.impacto}</p>}{value?.evidencia?.length>0&&<><h4>Evidencia</h4><ul>{value.evidencia.map((e,i)=><li key={i}>{e}</li>)}</ul></>}</>}
  </div>:<>
   <div className="exec-analysis-lead"><div><span className="exec-analysis-caption">PANORAMA</span><p>{brief(analysis.situacionGeneral)}</p><button type="button" onClick={()=>setSelected("situacionGeneral")}>Leer situación completa</button></div>
   <div className="exec-analysis-action"><span className="exec-analysis-caption"><i className="ti ti-target-arrow" aria-hidden="true"/> ACCIÓN RECOMENDADA</span><p>{brief(analysis.recomendacion)}</p><button type="button" onClick={()=>setSelected("recomendacion")}>Ver recomendación</button></div></div>
   <div className="exec-analysis-grid">{sections.map(s=><button type="button" key={s.key} className="exec-analysis-card" onClick={()=>setSelected(s.key)}><i className={"ti "+s.icon} aria-hidden="true"/><strong>{s.label}</strong><span>{brief(textFor(s.key))}</span><small>Ver detalle →</small></button>)}</div>
   <footer><span>Conclusiones generadas con IA · Verifica antes de decidir</span><button type="button" onClick={()=>setSelected("basadoEn")}>Ver fuentes ({analysis.basadoEn?.length||0})</button></footer>
  </>}
 </section>;
}
