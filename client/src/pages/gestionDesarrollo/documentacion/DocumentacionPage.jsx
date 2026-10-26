import DevIcon from "../components/DevIcon";
import SubirDocumento from './SubirDocumento';
import {AuthContext} from '../../../context/AuthContext';
// client/src/pages/gestionDesarrollo/DocumentacionPage.jsx
// Pestaña Documentación — documentos desde SharePoint FABPSA TI

import { useState, useEffect, useContext } from "react";
import "./DocumentacionPage.css";

const API = "/api/dev/sharepoint";
const token = () => localStorage.getItem("fabpsa_token");

const COLECCIONES = [
  { slug: "todo", nombre: "Todo" },
  { slug: "diagramas", nombre: "Diagramas" },
  { slug: "pruebas", nombre: "Pruebas" },
  { slug: "manuales", nombre: "Manuales" },
  { slug: "notas-liberacion", nombre: "Notas de liberación" },
  { slug: "otro", nombre: "Otro" },
];

function formatTamano(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso+'T12:00:00':iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data=await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function DocumentacionPage() {
 const {user}=useContext(AuthContext);
 const [uploadOpen,setUploadOpen]=useState(false),[uploadNotice,setUploadNotice]=useState('');
 const [coleccion,setColeccion]=useState('todo'),[documentos,setDocumentos]=useState([]),[recientes,setRecientes]=useState([]);
 const [busqueda,setBusqueda]=useState(''),[proyecto,setProyecto]=useState(''),[modo,setModo]=useState('todos');
 const [customProject,setCustomProject]=useState(false);
 const [fileType,setFileType]=useState(""),[catalog,setCatalog]=useState([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[reload,setReload]=useState(0);
 const [preview,setPreview]=useState({loading:false,url:'',error:''}),[previewReload,setPreviewReload]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');const timer=setTimeout(()=>{const params=new URLSearchParams();if(coleccion!=='todo')params.set('coleccion',coleccion);if(busqueda)params.set('q',busqueda);if(proyecto)params.set('proyecto',proyecto);apiFetch('/documentos?'+params).then(data=>{if(active){setDocumentos(data.data||[]);if(coleccion==='todo'&&!busqueda&&!proyecto)setCatalog(data.data||[]);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});},200);return()=>{active=false;clearTimeout(timer);};},[coleccion,busqueda,proyecto,reload]);
 useEffect(()=>{let active=true;apiFetch('/recientes').then(data=>{if(active)setRecientes(data.data||[]);}).catch(()=>{});return()=>{active=false;};},[reload]);
 useEffect(()=>{let active=true;if(!selected){setPreview({loading:false,url:'',error:''});return;}setPreview({loading:true,url:'',error:''});apiFetch('/documentos/'+encodeURIComponent(selected.id)+'/preview').then(data=>{if(active)setPreview({loading:false,url:data.url,error:''});}).catch(e=>{if(active)setPreview({loading:false,url:'',error:e.message});});return()=>{active=false;};},[selected,previewReload]);
 const projectCode=doc=>doc.nombre?.match(/^(DEVTI-[A-Z]+-\d+-\d+|DEV-\d+)(?=[ _.-]|$)/i)?.[1] || '';
 const projects=[...new Set(catalog.map(projectCode).filter(Boolean))].sort();
 const source=modo==='recientes'?recientes.filter(d=>documentos.some(item=>item.id===d.id)):documentos;
 const visible=source.filter(d=>!fileType || d.extension?.toLowerCase()===fileType).slice().sort((a,b)=>modo==='nombre'?a.nombre.localeCompare(b.nombre,'es'):modo==='antiguos'?new Date(a.actualizado||0)-new Date(b.actualizado||0):new Date(b.actualizado||0)-new Date(a.actualizado||0));
 const types=[...new Set([...catalog,...documentos].map(d=>d.extension?.toLowerCase()).filter(Boolean))].sort();
 const shortCollection=slug=>({'analisis-funcional':'Análisis','documentacion-tecnica':'Técnica',diagramas:'Diagrama',pruebas:'Pruebas',manuales:'Manual','notas-liberacion':'Liberación',api:'API','decision-tecnica':'Decisión',otro:'Otro'})[slug] || slug;
 const age=iso=>{if(!iso || !Number.isFinite(+new Date(iso)))return 'Sin fecha';const parsed=new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso+'T12:00:00':iso);const days=Math.round((new Date(new Date().toDateString())-new Date(parsed.toDateString()))/86400000);return new Intl.RelativeTimeFormat('es-MX',{numeric:'auto'}).format(-days,'day');};
 const fileMark=ext=><span className={'doc-file-mark doc-file-'+ext}><DevIcon name="file" size={24}/><small>{ext?.toUpperCase()}</small></span>;
 const canUpload=user?.area==='SISTEMAS';
 const collectionName=slug=>COLECCIONES.find(c=>c.slug===slug)?.nombre||slug;
 function selectCollection(slug){setColeccion(slug);setSelected(null);}
 return <div className="doc-layout">
  <div className="doc-toolbar">
   <label className="doc-search-wrap"><DevIcon name="search" size={20}/><input aria-label="Buscar documentos" placeholder="Buscar documento, palabra clave…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/></label>
   <label className="doc-filter">Proyecto{customProject?<span className="doc-custom-project"><input autoFocus aria-label="Filtrar por proyecto" placeholder="Nombre o folio" value={proyecto} onChange={e=>setProyecto(e.target.value)}/><button type="button" aria-label="Mostrar proyectos" onClick={()=>{setProyecto('');setCustomProject(false)}}>×</button></span>:<select aria-label="Filtrar por proyecto" value={proyecto} onChange={e=>{if(e.target.value==='__custom'){setProyecto('');setCustomProject(true)}else setProyecto(e.target.value)}}><option value="">Todos</option>{projects.map(code=><option key={code}>{code}</option>)}<option value="__custom">Buscar por nombre o folio…</option></select>}</label>
   <label className="doc-filter">Tipo de archivo<select aria-label="Tipo de archivo" value={fileType} onChange={e=>setFileType(e.target.value)}><option value="">Todos</option>{types.map(ext=><option key={ext} value={ext}>{ext.toUpperCase()}</option>)}</select></label>
   {canUpload&&<button className="doc-upload-button" onClick={()=>setUploadOpen(true)}><DevIcon name="upload" size={18}/>Subir documento</button>}
   <a className="doc-sharepoint" href={selected?.url || 'https://fabp.sharepoint.com/sites/TI2/Shared%20Documents'} target="_blank" rel="noopener noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 5H4v16h16v-6"/></svg>Abrir en SharePoint</a>
  </div>
  {uploadNotice&&<p className="doc-upload-notice" role="status">{uploadNotice}</p>}
  {uploadOpen&&<SubirDocumento colecciones={COLECCIONES} initial={coleccion} onClose={()=>setUploadOpen(false)} onUploaded={(doc,destino,notice)=>{setUploadOpen(false);setCatalog(prev=>[...prev.filter(d=>d.id!==doc.id),doc]);setColeccion(destino);setBusqueda('');setProyecto('');setFileType('');setModo('todos');setSelected(doc);setUploadNotice(notice||'Documento guardado en SharePoint: '+doc.nombre);setReload(v=>v+1);}}/>}
  <aside className="doc-sidebar" aria-label="Colecciones de documentos"><header><h2>Colecciones</h2>{canUpload&&<button className="doc-collection-add" aria-label="Subir documento a una colección" title="Subir documento a una colección" onClick={()=>setUploadOpen(true)}><DevIcon name="plus" size={16}/></button>}</header><nav>{COLECCIONES.map(c=><button key={c.slug} className={'doc-collection'+(coleccion===c.slug?' is-active':'')} aria-pressed={coleccion===c.slug} onClick={()=>selectCollection(c.slug)}>{c.slug==='todo'?<DevIcon name="file" size={17}/>:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h6l2 2h10v12H3Z"/><path d="M8 12h3"/></svg>}<span>{c.nombre}</span><small>{loading?'—':error?'—':(c.slug==='todo'?catalog.length:catalog.filter(d=>d.coleccion===c.slug).length)}</small></button>)}</nav><div className="doc-source"><span className="doc-sharepoint-symbol" aria-hidden="true"/><div><strong>SharePoint · FABPSA TI</strong><span className={error?'doc-connection-error':''}>{loading?'Consultando…':error?'Conexión no disponible':'✓ Conectado'}</span><small>Biblioteca de proyectos</small></div></div></aside>
  <section className="doc-library" aria-label="Lista de documentos"><header><div className="doc-list-heading"><h2>Documentos</h2><span>{loading?'…':error?'—':visible.length}</span></div><label className="doc-order"><span aria-hidden="true">⇅</span><select aria-label="Ordenar documentos" value={modo} onChange={e=>setModo(e.target.value)}><option value="todos">Más recientes</option><option value="antiguos">Más antiguos</option><option value="nombre">Nombre A–Z</option><option value="recientes">Recientes destacados</option></select></label></header>
   <div className="doc-list" aria-busy={loading}>{loading?<p className="doc-state" role="status">Cargando documentos…</p>:error?<div className="doc-state" role="alert"><p>{error}</p><button onClick={()=>setReload(v=>v+1)}>Reintentar</button></div>:!visible.length?<div className="doc-state"><DevIcon name="file" size={32}/><p>No hay documentos para esta selección.</p></div>:visible.map(doc=><button key={doc.id} className={'doc-row'+(selected?.id===doc.id?' is-selected':'')} aria-pressed={selected?.id===doc.id} onClick={()=>setSelected(doc)}>{fileMark(doc.extension)}<span className="doc-row-text"><strong title={doc.nombre}>{doc.nombre}</strong><span>{collectionName(doc.coleccion)} · {formatTamano(doc.tamano)}</span><small><DevIcon name="users" size={14}/>{doc.autor || 'Sin autor'} · {formatFecha(doc.actualizado)}</small></span><span className="doc-row-tags"><span className={'doc-tag tag-'+doc.coleccion}>{shortCollection(doc.coleccion)}</span>{projectCode(doc)&&<span className="doc-tag doc-project-tag" title={projectCode(doc)}>{projectCode(doc)}</span>}</span><time className="doc-row-age" dateTime={doc.actualizado} title={formatFecha(doc.actualizado)}>{age(doc.actualizado)}</time><span className="doc-row-more" aria-hidden="true">···</span></button>)}</div>
  </section>
  <section className="doc-reader" aria-label="Visor de documentos">{selected?<><header><div><span className="doc-reader-eyebrow">Vista previa</span><h2>{selected.nombre}</h2></div><button aria-label="Cerrar documento" onClick={()=>setSelected(null)}>×</button></header><div className="doc-metadata"><span>{collectionName(selected.coleccion)}</span><span>{formatTamano(selected.tamano)}</span><span>{selected.autor}</span>{selected.desarrollador&&<span>Carpeta: {selected.desarrollador}</span>}<span>Actualizado {formatFecha(selected.actualizado)}</span></div>{selected.descripcion&&<p className="doc-description">{selected.descripcion}</p>}<div className="doc-preview">{preview.loading?<p className="doc-state" role="status">Preparando vista previa…</p>:preview.error?<div className="doc-state" role="alert"><DevIcon name="file" size={32}/><p>{preview.error}</p><button onClick={()=>setPreviewReload(v=>v+1)}>Reintentar vista previa</button></div>:preview.url?<iframe key={selected.id} src={preview.url} title={'Vista previa de '+selected.nombre} allowFullScreen referrerPolicy="no-referrer"/>:null}</div><p className="doc-preview-note">Si el visor solicita iniciar sesión o no permite visualizar el archivo, utiliza Abrir en SharePoint.</p></>:<div className="doc-reader-empty"><div className="doc-reader-illustration" aria-hidden="true"/><h2>Vista previa del documento</h2><p>Selecciona un documento de la biblioteca para consultarlo aquí.</p><div className="doc-supported-types" aria-label="Formatos de documento">{['pdf','xlsx','docx','ppt','txt'].map(ext=><span key={ext}>{fileMark(ext)}</span>)}</div><div className="doc-reader-info"><span aria-hidden="true">i</span><p>Documentos de Office e imágenes compatibles con SharePoint.</p></div></div>}</section>
 </div>;
}
