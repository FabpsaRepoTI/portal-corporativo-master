import {useLayoutEffect,useRef,useState,useEffect} from "react";
import {Routes,useLocation,useNavigate} from "react-router-dom";
import "./ApplicationTabs.css";

const MODULES=[
 ["/gestion-desarrollo","Gestión de Desarrollo"],
 ["/mesa-de-servicio/encuesta-resultados","Resultados de encuesta"],
 ["/mesa-de-servicio","Mesa de Servicio"],
 ["/visor-ti","Panel de Operación TI"],
 ["/mantenimiento","Mantenimiento"],
 ["/aplicativos","Aplicativos"],
 ["/cultura-digital","Cultura Digital"],
 ["/cedis","Escáner"],
 ["/configuracion","Administración"],
 ["/vigilancia","Vigilancia"],
 ["/sit","Información Técnica"],
 ["/guia-diseno","Guía de Diseño UI"],
];
export function applicationFor(path){
 const entry=MODULES.find(([prefix])=>path===prefix||path.startsWith(prefix+"/"));
 return entry?{id:entry[0],label:entry[1]}:{id:"/",label:"Inicio"};
}
const address=loc=>loc.pathname+loc.search+loc.hash;

// Ícono de Día de Muertos por pestaña — varía según el id de la pestaña
// (determinístico, no aleatorio en cada render) y lleva un resplandor que
// pulsa, no un ícono estático.
const TAB_ICONOS={
 calabaza:<svg viewBox="-11 -13 22 26" aria-hidden="true"><path d="M-1.2 -10 Q3 -12.5 4.5 -9.5 Q1.5 -8 -1.2 -10 Z" fill="#3f8a3f"/><ellipse cx="-5" cy="1.5" rx="5.4" ry="7.2" fill="#e8650b"/><ellipse cx="0" cy="0" rx="6.2" ry="8.2" fill="#f0790d"/><ellipse cx="5" cy="1.5" rx="5.4" ry="7.2" fill="#e8650b"/><path d="M-3.6 -1.2 L-1.6 -1.2 L-2.6 -3.2 Z" fill="#2a1408"/><path d="M3.6 -1.2 L1.6 -1.2 L2.6 -3.2 Z" fill="#2a1408"/><path d="M0 0.3 L-1.3 2.4 L1.3 2.4 Z" fill="#2a1408"/></svg>,
 fantasma:<svg viewBox="-11 -13 22 26" aria-hidden="true"><path d="M-7.5 9 L-7.5 -1.5 C-7.5 -8 -4 -11 0 -11 C4 -11 7.5 -8 7.5 -1.5 L7.5 9 L5 6.8 L2.5 9 L0 6.8 L-2.5 9 L-5 6.8 Z" fill="#fff6ea" stroke="#e7d9c4" strokeWidth="0.5"/><circle cx="-2.8" cy="-2.4" r="1.4" fill="#2a1408"/><circle cx="2.8" cy="-2.4" r="1.4" fill="#2a1408"/><path d="M-1.5 1.8 Q0 3.2 1.5 1.8" fill="none" stroke="#2a1408" strokeWidth="0.8"/></svg>,
 calavera:<svg viewBox="-11 -13 22 26" aria-hidden="true"><path d="M0 -11 C6.4 -11 8.2 -5.6 8.2 -1 C8.2 2.6 6.4 4.4 5 5.2 L5 7.8 L-5 7.8 L-5 5.2 C-6.4 4.4 -8.2 2.6 -8.2 -1 C-8.2 -5.6 -6.4 -11 0 -11 Z" fill="#fbe3ea" stroke="#c9a46a" strokeWidth="0.5"/><circle cx="-3.1" cy="-1.6" r="2" fill="#2a1408"/><circle cx="3.1" cy="-1.6" r="2" fill="#2a1408"/><path d="M0 0.9 L-1.1 2.9 L1.1 2.9 Z" fill="#2a1408"/><circle cx="-6.1" cy="-6" r="1.1" fill="#c2185b"/><circle cx="6.1" cy="-6" r="1.1" fill="#c2185b"/><circle cx="0" cy="-9.2" r="1.1" fill="#ffb347"/></svg>,
 flor:<svg viewBox="-11 -11 22 22" aria-hidden="true">{[0,60,120,180,240,300].map(a=><ellipse key={a} cx="0" cy="-4.6" rx="2.3" ry="4" fill="#f0790d" transform={"rotate("+a+")"}/>)}<circle r="2.3" fill="#ffc25c"/></svg>,
}
const TAB_ICONO_TIPOS=Object.keys(TAB_ICONOS);
// Ícono del módulo en cada pestaña (antes: calaveras y flores de temporada)
const ICONOS_MODULO=[["/mesa-de-servicio","ti-device-laptop"],["/sit","ti-flask"],["/vigilancia","ti-shield-check"],["/gestion-desarrollo","ti-chart-dots-3"],["/visor-ti","ti-layout-dashboard"],["/cedis","ti-barcode"],["/aplicativos","ti-apps"],["/mantenimiento","ti-tool"],["/cultura-digital","ti-news"],["/configuracion","ti-settings"]];
function iconoModulo(id){const p=String(id||"");return (ICONOS_MODULO.find(([r])=>p.startsWith(r))||[0,"ti-file"])[1];}
function iconoDePestana(id){
 let h=0;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;
 return TAB_ICONO_TIPOS[h%TAB_ICONO_TIPOS.length];
}
export default function ApplicationTabs({children}){
 const location=useLocation(),navigate=useNavigate();
 const [tabs,setTabs]=useState(()=>location.pathname==="/" ? [] : [{...applicationFor(location.pathname),location}]);
 const [active,setActive]=useState(()=>location.pathname==="/" ? null : applicationFor(location.pathname).id);
 const [notice,setNotice]=useState("");
 const positions=useRef({});
 const previous=useRef(active);
 const focusRef=useRef(null);
 const emptyHome=useRef(false);
 useLayoutEffect(()=>{
  if(location.pathname==="/"){setActive(null);setNotice("");return;}
  emptyHome.current=false;
  const module=applicationFor(location.pathname);
  const exists=tabs.some(t=>t.id===module.id);
  if(!exists&&tabs.length>=7){
   setNotice("Puedes abrir hasta 7 aplicaciones. Cierra una pestaña para abrir otra.");
   const last=tabs.find(t=>t.id===active);
   if(last)navigate(address(last.location),{replace:true,state:last.location.state});
   return;
  }
  if(previous.current!==module.id){
   positions.current[previous.current]=window.scrollY;
   window.scrollTo(0,positions.current[module.id]||0);
   previous.current=module.id;
  }
  setTabs(current=>{
   const found=current.find(t=>t.id===module.id);
   if(found?.location===location)return current;
   return found?current.map(t=>t.id===module.id?{...t,location}:t):[...current,{...module,location}];
  });
  setActive(module.id);
  // Only actual router changes update a tab's retained location.
 },[location]);
 useEffect(()=>{
  const item=focusRef.current,list=item?.parentElement;
  if(!list)return;
  const reveal=()=>{
    const target=item.getBoundingClientRect(),viewport=list.getBoundingClientRect();
    if(target.left<viewport.left)list.scrollLeft-=viewport.left-target.left;
    else if(target.right>viewport.right)list.scrollLeft+=target.right-viewport.right;
  };
  reveal();
  const observer=new ResizeObserver(reveal);observer.observe(list);
  return ()=>observer.disconnect();
 },[active,tabs.length]);
 function select(tab){setNotice("");navigate(address(tab.location),{state:tab.location.state});}
 function close(tab){
  if(tabs.length===1){
   emptyHome.current=true;
   setTabs([]);setActive(null);setNotice("");
   positions.current={};previous.current=null;
   window.scrollTo(0,0);
   navigate("/",{replace:true});
   return;
  }
  const remaining=tabs.filter(t=>t.id!==tab.id);
  if(tab.id===active){
   const index=tabs.findIndex(t=>t.id===tab.id);
   const next=remaining[Math.min(index,remaining.length-1)];
   setActive(next.id);select(next);
  }
  setTabs(remaining);delete positions.current[tab.id];setNotice("");
 }
 return <>
  {tabs.length>0&&<nav className="app-tabs" aria-label="Aplicaciones abiertas">
   <div className="app-tabs-list">{tabs.map((tab,i)=><div key={tab.id} className={"app-tab"+(tab.id===active?" app-tab--active":"")} ref={tab.id===active?focusRef:null}>
    <button type="button" aria-current={tab.id===active?"page":undefined} onClick={()=>select(tab)} className="app-tab-select">
     <i className={"ti "+iconoModulo(tab.id)+" app-tab-ti"} aria-hidden="true" />
     {tab.label}
    </button>
    <button type="button" className="app-tab-close" aria-label={"Cerrar "+tab.label} onClick={()=>close(tab)}>×</button>
   </div>)}</div><span className="app-tabs-count" aria-label={tabs.length+" de 7 aplicaciones abiertas"}>{tabs.length}/7</span>
  </nav>}
  {notice&&<div className="app-tabs-notice" role="alert">{notice}<button type="button" aria-label="Cerrar aviso" onClick={()=>setNotice("")}>×</button></div>}
  <main className="main-content">{active===null&&<Routes location={location}>{children}</Routes>}{tabs.map(tab=><div key={tab.id} className="app-tab-panel" hidden={tab.id!==active}><Routes location={tab.location}>{children}</Routes></div>)}</main>
 </>;
}
