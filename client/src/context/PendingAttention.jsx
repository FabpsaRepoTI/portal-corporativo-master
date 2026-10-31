import {createContext,useContext,useEffect,useState,useRef} from "react";
import {useNavigate} from "react-router-dom";
import {AuthContext} from "./AuthContext";
import "./PendingAttention.css";
const PendingContext=createContext({counts:null,error:false});
export const usePendingAttention=()=>useContext(PendingContext);
export const notifyPendingChanged=()=>window.dispatchEvent(new Event("pending-attention:refresh"));
export function PendingAttentionProvider({children}){
 const {user,modulos=[]}=useContext(AuthContext),navigate=useNavigate();
 const allowed=!!user&&["SISTEMAS","SYSTEMS"].includes(user.area?.toUpperCase())&&modulos.includes("mesa_servicio");
 const [counts,setCounts]=useState(null),[error,setError]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{
  setCounts(null);setError(false);
  if(!allowed)return;
  let alive=true,inFlight=false,again=false,timer;
  const controller=new AbortController();
  async function refresh(){
   if(inFlight){again=true;return;}if(document.hidden)return;
   inFlight=true;
   try{
    const res=await fetch("/api/mesa-admin/pendientes-atencion",{cache:"no-store",signal:controller.signal,headers:{Authorization:"Bearer "+localStorage.getItem("fabpsa_token")}});
    if(!res.ok)throw new Error();
    const data=await res.json();
    if(!["incidencias","hardware","desarrollo","total"].every(k=>Number.isFinite(data[k])&&data[k]>=0))throw new Error();
    if(alive){setCounts(data);setError(false);}
   }catch{if(alive)setError(true);}
   finally{inFlight=false;if(alive&&again){again=false;refresh();}}
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(refresh,250);};
  refresh();const interval=setInterval(refresh,15000);
  window.addEventListener("pending-attention:refresh",schedule);
  window.addEventListener("focus",schedule);document.addEventListener("visibilitychange",schedule);
  return()=>{alive=false;controller.abort();clearInterval(interval);clearTimeout(timer);window.removeEventListener("pending-attention:refresh",schedule);window.removeEventListener("focus",schedule);document.removeEventListener("visibilitychange",schedule);};
 },[allowed,user?.login]);
 const panelRef=useRef(null);
 useEffect(()=>{if(!open)return;const outside=e=>{if(!panelRef.current?.contains(e.target))setOpen(false)};const esc=e=>{if(e.key==="Escape")setOpen(false)};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",esc);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",esc)};},[open]);
 const entries=[["incidencias","Tickets sin asignar"],["hardware","Hardware pendiente"],["desarrollo","Desarrollo pendiente sin responsable"]];
 // Más de 2 tickets pausados >24 h ponen la pastilla en rojo; con alguno pausado >24 h, en ámbar.
 const p24=counts?.pausados24h||0,pausaNivel=p24>2?"critico":p24>0?"alerta":"";
 const label=error?"Revisar solicitudes":pausaNivel?`${p24} pausado${p24>1?"s":""} +24 h sin atención`+(counts.total?` · ${counts.total} pendientes`:"")+" · Revisar":counts?.total+" solicitudes pendientes · Revisar";
 return <PendingContext.Provider value={{counts:allowed?counts:null,error:allowed&&error}}>{children}
 {allowed&&(counts?.total>0||p24>0||error)&&<aside ref={panelRef} className={"pending-attention"+(pausaNivel?" pending-attention--"+pausaNivel:"")}>
  {open&&<div className="pending-attention-panel" id="pending-attention-panel"><strong>Solicitudes pendientes de atención</strong>{error&&<p role="status">No se pudo actualizar el conteo. Se reintentará automáticamente.</p>}{entries.map(([key,label])=><button key={key} onClick={()=>{setOpen(false);navigate("/mesa-de-servicio/admin?tab="+key);}}><span>{label}</span><b>{counts?.[key]??"—"}</b></button>)}<button className="pending-attention-pausa" onClick={()=>{setOpen(false);navigate("/visor-ti");}}><span>Tickets pausados +24 h sin atención</span><b>{counts?.pausados24h??"—"}</b></button><small>Revisión automática cada 15 segundos.</small></div>}
  <button className="pending-attention-trigger" aria-expanded={open} aria-controls="pending-attention-panel" onClick={()=>setOpen(v=>!v)}><i className={"ti "+(pausaNivel?"ti-alarm":"ti-inbox")} aria-hidden="true"/><span>{label}</span>{!error&&<b>{pausaNivel?p24:counts.total}</b>}</button>
 </aside>}
 </PendingContext.Provider>;
}
