import PageHero from "../../components/PageHero";
import arteHero from "../../assets/hero-accesos.svg";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import useUsuariosAccess from '../../hooks/useUsuariosAccess';
import './AccesosPage.css';

const children={escaner:'escaner_contabilidad',usuarios_admin:'usuarios_crear'};
const groups=[['Portal',['portal']],['Soporte y atención',['mesa_servicio','desarrollo_software','gestion_desarrollo']],['Operación y facturas',['mantenimiento','escaner']],['Recursos',['cultura_digital']],['Administración',['usuarios_admin']]];
const descriptions={portal:'Entrada al Portal Corporativo.',mesa_servicio:'Solicitudes y atención de servicios TI.',desarrollo_software:'Solicitudes de desarrollo de software.',gestion_desarrollo:'Portafolio, cronograma y documentación.',mantenimiento:'Solicitudes y seguimiento de mantenimiento.',escaner:'Consulta de facturas y registro de surtidos.',cultura_digital:'Contenidos y actividades de Cultura Digital.',usuarios_admin:'Habilita Usuarios. No concede acceso a la administración de permisos.'};
const empty={modulos:[],esMto:false,esAdminVigilancia:false};
const sorted=v=>JSON.stringify({modulos:[...v.modulos].sort(),esMto:!!v.esMto,esAdminVigilancia:!!v.esAdminVigilancia});
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const initials=u=>(u.name||u.login||'?').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
async function api(path,options={}){const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('fabpsa_token')},cache:'no-store'});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'No se pudo completar la operación.'),{status:r.status});return data;}
function changes(before,after){return [...after.modulos.filter(k=>!before.modulos.includes(k)).map(key=>({key,add:true})),...before.modulos.filter(k=>!after.modulos.includes(k)).map(key=>({key,add:false})),...(!!before.esMto!==!!after.esMto?[{key:'tecnico_mantenimiento',add:!!after.esMto}]:[]),...(!!before.esAdminVigilancia!==!!after.esAdminVigilancia?[{key:'admin_vigilancia',add:!!after.esAdminVigilancia}]:[])];}

export default function AccesosPage(){
 const access=useUsuariosAccess(),{user}=useAuth(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const login=params.get('usuario')||'';
 const [users,setUsers]=useState([]),[catalog,setCatalog]=useState([]),[search,setSearch]=useState(''),[moduleSearch,setModuleSearch]=useState('');
 const [boot,setBoot]=useState(true),[bootError,setBootError]=useState(''),[retry,setRetry]=useState(0);
 const [loadedLogin,setLoadedLogin]=useState('');
 const [base,setBase]=useState(null),[draft,setDraft]=useState(empty),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[pending,setPending]=useState(null),[tab,setTab]=useState('permisos');
 const [history,setHistory]=useState([]),[cursor,setCursor]=useState(null),[historyError,setHistoryError]=useState(''),[historyLoading,setHistoryLoading]=useState(false),[historyReload,setHistoryReload]=useState(0);
 const [openGroups,setOpenGroups]=useState(()=>new Set(['Portal']));
 const [copyDept,setCopyDept]=useState('');
 const [copyFrom,setCopyFrom]=useState('');
 const [savedAlert,setSavedAlert]=useState(false);
 const sequence=useRef(0),historySequence=useRef(0);
 const dirty=!!base&&loadedLogin===login&&sorted(base)!==sorted(draft),diff=base?changes(base,draft):[];
 const storageKey='fabpsa:accesos:'+user?.login+':'+login;
 useEffect(()=>{if(!access.loading&&!access.puedeAsignarPermisos)navigate('/',{replace:true});},[access.loading,access.puedeAsignarPermisos,navigate]);
 useEffect(()=>{
  if(!access.puedeAsignarPermisos)return;
  const c=new AbortController();setBoot(true);setBootError('');
  Promise.all([api('usuarios',{signal:c.signal}),api('permisos/modulos',{signal:c.signal})]).then(([u,m])=>{if(!c.signal.aborted){setUsers(u);setCatalog(m);}}).catch(e=>{if(!c.signal.aborted)setBootError(e.message);}).finally(()=>{if(!c.signal.aborted)setBoot(false);});return()=>c.abort();
 },[access.puedeAsignarPermisos,retry]);
 useEffect(()=>{
  if(!login||!access.puedeAsignarPermisos)return;
  const c=new AbortController();setLoading(true);setBase(null);setError('');setMessage('');setPending(null);setTab('permisos');
  api('permisos/usuarios/'+encodeURIComponent(login)+'/modulos',{signal:c.signal}).then(value=>{
   if(c.signal.aborted)return;setLoadedLogin(login);setBase(value);let next=value;
   try{const stored=JSON.parse(sessionStorage.getItem(storageKey));if(stored&&Array.isArray(stored.draft?.modulos)){next=stored.draft;setBase(stored.base);setMessage('Recuperamos tus cambios pendientes. Revisa el resumen antes de guardar.');}}catch{}
   setDraft({modulos:next.modulos,esMto:!!next.esMto,esAdminVigilancia:!!next.esAdminVigilancia});
  }).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
 },[login,access.puedeAsignarPermisos,retry,storageKey]);
 useEffect(()=>{if(!base||loadedLogin!==login)return;try{if(dirty)sessionStorage.setItem(storageKey,JSON.stringify({base,draft}));else sessionStorage.removeItem(storageKey);}catch{}},[base,draft,dirty,storageKey,loadedLogin,login]);
 useEffect(()=>{if(!dirty)return;const guard=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 useEffect(()=>{if(!savedAlert)return;const id=setTimeout(()=>setSavedAlert(false),2800);return()=>clearTimeout(id);},[savedAlert]);
 useEffect(()=>{
  if(!login||!access.puedeVerHistorialAccesos)return;
  const id=++historySequence.current,c=new AbortController();setHistory([]);setCursor(null);setHistoryError('');setHistoryLoading(true);
  api('permisos/usuarios/'+encodeURIComponent(login)+'/historial',{signal:c.signal}).then(r=>{if(id===historySequence.current&&!c.signal.aborted){setHistory(r.items);setCursor(r.nextCursor);}}).catch(e=>{if(!c.signal.aborted)setHistoryError(e.message);}).finally(()=>{if(!c.signal.aborted)setHistoryLoading(false);});return()=>c.abort();
 },[login,access.puedeVerHistorialAccesos,historyReload]);
 async function moreHistory(){const id=historySequence.current;setHistoryLoading(true);setHistoryError('');try{const r=await api('permisos/usuarios/'+encodeURIComponent(login)+'/historial?cursor='+cursor);if(id===historySequence.current){setHistory(h=>[...h,...r.items]);setCursor(r.nextCursor);}}catch(e){if(id===historySequence.current)setHistoryError(e.message);}finally{if(id===historySequence.current)setHistoryLoading(false);}}
 function move(target){if(saving)return;if(dirty){setPending(target);return;}go(target);}
 function go(target){setPending(null);if(target==='back')navigate('/configuracion/usuarios');else if(target===login)setRetry(n=>n+1);else setParams({usuario:target});}
 function discard(){try{sessionStorage.removeItem(storageKey);}catch{}setDraft({modulos:base.modulos,esMto:base.esMto,esAdminVigilancia:base.esAdminVigilancia});setMessage('Cambios descartados.');}
 function toggleGroup(label){setOpenGroups(current=>{const next=new Set(current);if(next.has(label))next.delete(label);else next.add(label);return next;});}
 async function copyPermissions(sourceLogin){if(!sourceLogin||saving)return;setMessage('');setError('');try{const value=await api('permisos/usuarios/'+encodeURIComponent(sourceLogin)+'/modulos');setDraft({modulos:value.modulos,esMto:!!value.esMto,esAdminVigilancia:!!value.esAdminVigilancia});setMessage('Se copiaron los permisos de '+sourceLogin+'. Revisa y guarda para aplicarlos.');}catch(e){setError(e.message);}finally{setCopyFrom('');}}
 function toggle(key){if(saving||!base)return;setMessage('');setError('');setDraft(current=>{const off=current.modulos.includes(key);const modulos=off?current.modulos.filter(k=>k!==key&&k!==children[key]):[...current.modulos,key];return {modulos,esMto:modulos.includes('mantenimiento')&&current.esMto,esAdminVigilancia:modulos.includes('vigilancia')&&current.esAdminVigilancia};});}
 async function save(){if(!dirty||saving)return;const id=++sequence.current;setSaving(true);setError('');setMessage('');try{const r=await api('permisos/usuarios/'+encodeURIComponent(login)+'/modulos',{method:'PUT',body:JSON.stringify({...draft,revision:base.revision})});if(id!==sequence.current)return;setBase(r);setDraft({modulos:r.modulos,esMto:r.esMto,esAdminVigilancia:r.esAdminVigilancia});try{sessionStorage.removeItem(storageKey);}catch{}setSavedAlert(true);setHistoryReload(n=>n+1);window.dispatchEvent(new Event('focus'));}catch(e){setError(e.message);}finally{setSaving(false);}}
 const selected=users.find(u=>u.login===login),nameFor=key=>key==='tecnico_mantenimiento'?'Técnico de mantenimiento':key==='admin_vigilancia'?'Administrador de Vigilancia':catalog.find(m=>m.clave===key)?.nombre||key;
 const filteredUsers=useMemo(()=>users.filter(u=>normalize([u.name,u.login,u.area].join(' ')).includes(normalize(search))),[users,search]);
 const primary=catalog.filter(m=>!Object.values(children).includes(m.clave));
 const grouped=[...groups,['Otros módulos',primary.filter(m=>!groups.some(([,keys])=>keys.includes(m.clave))).map(m=>m.clave)]];
 const copyDeptOptions=useMemo(()=>[...new Set(users.map(u=>u.area).filter(Boolean))].sort(),[users]);
 const copyUserOptions=useMemo(()=>users.filter(u=>u.login!==login&&(!copyDept||u.area===copyDept)),[users,login,copyDept]);
 const date=value=>new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(value));
 if(!access.puedeAsignarPermisos)return null;
 return <main className="access-page">
  <PageHero arte={arteHero} eyebrow="Administración · FABPSA" titulo="Administración de" resalte="accesos" sub="Define qué módulos y funciones puede utilizar cada colaborador." volver={{ to: "/configuracion/usuarios", label: "Volver a Usuarios" }} />
  {bootError?<div role="alert" className="access-notice error">{bootError} <button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>:boot?<div className="access-empty" role="status">Cargando usuarios y permisos…</div>:<div className="access-layout">
   <aside className="access-users"><div className="access-users-head"><h2>Colaboradores <span>{users.length}</span></h2><input aria-label="Buscar colaborador" placeholder="Nombre, login o área" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="access-user-list">{filteredUsers.map(u=><button key={u.login} disabled={saving} className={u.login===login?'selected':''} aria-pressed={u.login===login} onClick={()=>{if(u.login!==login)move(u.login);}}><span className="access-avatar">{initials(u)}</span><span><strong>{u.name||u.login}</strong><small>{u.login} · {u.area||'Sin área'}</small>{u.active==='N'&&<small>Cuenta inactiva</small>}</span></button>)}{!filteredUsers.length&&<p className="access-empty">Sin coincidencias.</p>}</div></aside>
   <section className="access-workspace">{!login?<div className="access-empty"><i className="ti ti-user-shield"/><h2>Selecciona un colaborador</h2><p>Consulta sus accesos y configura las funciones que necesita.</p></div>:<>
    <header className="access-person"><span className="access-avatar large">{initials(selected||{login})}</span><div><h2>{selected?.name||login}</h2><p>{login} · {selected?.area||'Colaborador'} · {selected?.sitio||'Sin ubicación'}</p></div><span className="access-count">{draft.modulos.filter(k=>!Object.values(children).includes(k)).length} módulos habilitados</span></header>
    {login.toUpperCase()===user.login.toUpperCase()&&<p className="access-owner-note">Tu cuenta conserva la administración exclusiva de accesos como responsable autorizado.</p>}
    {pending&&<div className="access-notice" role="alert"><strong>Tienes cambios sin guardar.</strong><span>Guárdalos antes de cambiar o descártalos para continuar.</span><button onClick={()=>setPending(null)}>Seguir editando</button><button onClick={()=>{discard();go(pending);}}>Descartar y continuar</button></div>}
    {error&&<div className="access-notice error" role="alert">{error}<button disabled={saving} onClick={()=>{if(dirty)setPending(login);else setRetry(n=>n+1);}}>Recargar permisos</button></div>}
    {message&&<div className="access-notice success" role="status">{message}</div>}
    <div className="access-tabs"><button aria-pressed={tab==='permisos'} onClick={()=>setTab('permisos')}>Permisos</button>{access.puedeVerHistorialAccesos&&<button aria-pressed={tab==='historial'} onClick={()=>setTab('historial')}>Historial de cambios</button>}{tab==='permisos'&&<>
      <select aria-label="Filtrar por departamento" disabled={saving} value={copyDept} onChange={e=>{setCopyDept(e.target.value);setCopyFrom('');}}><option value="">Todos los departamentos</option>{copyDeptOptions.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select aria-label="Copiar permisos de otro usuario" disabled={saving} value={copyFrom} onChange={e=>{const v=e.target.value;setCopyFrom(v);if(v)copyPermissions(v);}}><option value="">Copiar permisos de…</option>{copyUserOptions.map(u=><option key={u.login} value={u.login}>{u.name||u.login}{u.area?' · '+u.area:''}</option>)}</select>
      <button type="button" onClick={()=>setOpenGroups(new Set(grouped.map(([label])=>label)))}>Expandir todo</button>
      <button type="button" onClick={()=>setOpenGroups(new Set())}>Colapsar todo</button>
      <input aria-label="Buscar módulo" placeholder="Buscar módulo…" value={moduleSearch} onChange={e=>setModuleSearch(e.target.value)}/>
      {base&&<div className="access-tabs-save">{dirty&&<details className="access-diff"><summary>{diff.length} cambios pendientes</summary><ul>{diff.map(c=><li key={c.key}>{c.add?'Conceder':'Retirar'} · {nameFor(c.key)}</li>)}</ul></details>}<button type="button" disabled={!dirty||saving} onClick={discard}>Descartar</button><button type="button" className="primary" disabled={!dirty||saving||loading} onClick={save}>{saving?'Guardando…':'Guardar accesos'}</button></div>}
    </>}</div>
    {tab==='permisos'?(loading?<div className="access-empty" role="status">Consultando accesos…</div>:base&&<div className="access-groups">{grouped.map(([label,keys])=>{const mods=primary.filter(m=>keys.includes(m.clave)&&normalize(m.nombre+' '+label).includes(normalize(moduleSearch)));if(!mods.length)return null;const isOpen=!!moduleSearch||openGroups.has(label);const enabledCount=mods.filter(m=>draft.modulos.includes(m.clave)).length;return <details className="access-group" key={label} open={isOpen} onToggle={e=>{if(!moduleSearch&&e.target.open!==openGroups.has(label))toggleGroup(label);}}><summary><span>{label}</span><small>{enabledCount}/{mods.length} habilitados</small></summary><div className="access-module-rows">{mods.map(m=>{const checked=draft.modulos.includes(m.clave),child=children[m.clave];return <div key={m.clave} className={'access-module-row '+(checked?'enabled':'')}><label className="access-module-main"><input type="checkbox" aria-label={m.nombre} checked={checked} disabled={saving} onChange={()=>toggle(m.clave)}/><i className={'ti '+(m.icono||'ti-layout-grid')}/><span><strong>{m.nombre}</strong><small>{descriptions[m.clave]||'Acceso al módulo.'}</small></span></label>{checked&&child&&catalog.some(c=>c.clave===child)&&<label className="access-subpermission"><input type="checkbox" checked={draft.modulos.includes(child)} disabled={saving} onChange={()=>toggle(child)}/><span><strong>{nameFor(child)}</strong><small>{child==='escaner_contabilidad'?'Consulta facturas; no puede registrar surtidos.':'Permite dar de alta cuentas nuevas.'}</small></span></label>}{checked&&m.clave==='mantenimiento'&&<label className="access-subpermission"><input type="checkbox" checked={draft.esMto} disabled={saving} onChange={e=>setDraft(d=>({...d,esMto:e.target.checked}))}/><span><strong>Técnico de mantenimiento</strong><small>Puede atender solicitudes y cambiar su estado.</small></span></label>}{checked&&m.clave==='vigilancia'&&<label className="access-subpermission"><input type="checkbox" checked={draft.esAdminVigilancia} disabled={saving} onChange={e=>setDraft(d=>({...d,esAdminVigilancia:e.target.checked}))}/><span><strong>Administrador de Vigilancia</strong><small>Ve y crea reportes de todos los sitios, sin importar su área.</small></span></label>}</div>})}</div></details>})}</div>):<div className="access-history">{historyError&&<div className="access-notice error" role="alert">{historyError}<button onClick={()=>setHistoryReload(n=>n+1)}>Reintentar</button></div>}{historyLoading&&!history.length?<p role="status">Consultando historial…</p>:!history.length&&!historyError?<div className="access-empty"><h3>Sin cambios registrados</h3><p>El historial comienza con los cambios guardados desde esta versión.</p></div>:history.map(item=><article key={item.id}><header><strong>{item.nombreResponsable||item.responsable}</strong><time>{date(item.fecha)}</time></header><small>{item.responsable}</small><ul>{changes(item.antes,item.despues).map(c=><li key={c.key} className={c.add?'added':'removed'}><span>{c.add?'Concedido':'Retirado'}</span>{nameFor(c.key)}</li>)}</ul></article>)}{cursor&&<button disabled={historyLoading} onClick={moreHistory}>{historyLoading?'Cargando…':'Ver cambios anteriores'}</button>}</div>}
   </>}</section>
  </div>}
  {savedAlert&&<div className="access-saved-overlay" role="alert" onClick={()=>setSavedAlert(false)}><div className="access-saved-card" onClick={e=>e.stopPropagation()}><i className="ti ti-circle-check"/><h3>Accesos guardados</h3><p>Los permisos de {selected?.name||login} se actualizaron correctamente.</p><button onClick={()=>setSavedAlert(false)}>Listo</button></div></div>}
 </main>;
}
