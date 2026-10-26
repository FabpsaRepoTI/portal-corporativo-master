import {useState, useEffect} from "react";
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 360;
export const SIDEBAR_WIDTH_DEFAULT = 248;
export const readSidebarMode=()=>{try{const v=localStorage.getItem("sidebar-mode");return v==="fixed"||v==="hidden"?v:"compact";}catch{return "compact";}};
export const setSidebarMode=(next)=>{try{localStorage.setItem("sidebar-mode",next);}catch{}document.dispatchEvent(new CustomEvent("sidebar:mode",{detail:next}));};
export const readSidebarWidth=()=>{try{const w=parseInt(localStorage.getItem("sidebar-width"),10);return Number.isFinite(w)?Math.min(SIDEBAR_WIDTH_MAX,Math.max(SIDEBAR_WIDTH_MIN,w)):SIDEBAR_WIDTH_DEFAULT;}catch{return SIDEBAR_WIDTH_DEFAULT;}};
export default function SidebarMode(){
 const [mode,setMode]=useState(readSidebarMode);
 useEffect(()=>{const h=e=>setMode(e.detail);document.addEventListener("sidebar:mode",h);return()=>document.removeEventListener("sidebar:mode",h);},[]);
 const label=mode==="fixed"?"Cerrar barra lateral":"Abrir barra lateral";
 function toggle(){setSidebarMode(mode==="fixed"?"compact":"fixed");}
 return <div className="sidebar-mode-control"><button type="button" aria-label={label} aria-expanded={mode==="fixed"} onClick={toggle}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg><span className="sb-toggle-tooltip" role="tooltip">{label}</span></button></div>;
}
