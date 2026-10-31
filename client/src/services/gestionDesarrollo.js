// client/src/services/gestionDesarrollo.service.js
const BASE = "/api/dev";

function headers() {
  const token = localStorage.getItem("fabpsa_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function request(method, path, body) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false)
    throw new Error(data.message || "Error en la solicitud");
  return data;
}

async function upload(path, formData) {
  const token = localStorage.getItem("fabpsa_token");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false)
    throw new Error(data.message || "Error al subir archivo");
  return data;
}

// ── Proyectos ─────────────────────────────────────────────────
export const getPortafolio = (q = {}) =>
  request("GET", `/proyectos?${new URLSearchParams(q)}`);
export const getCatalogos = () => request("GET", "/proyectos/catalogos");
export const getProyecto = (id) => request("GET", `/proyectos/${id}`);
export const crearProyecto = (body) => request("POST", "/proyectos", body);
export const actualizarProyecto = (id, b) =>
  request("PUT", `/proyectos/${id}`, b);
export const cambiarEstatus = (id, b) =>
  request("PUT", `/proyectos/${id}/estatus`, b);
export const solicitarCierre = (id) =>
  request("POST", `/proyectos/${id}/solicitar-cierre`);
export const aprobarCierre = (id) =>
  request("POST", `/proyectos/${id}/aprobar-cierre`);
export const rechazarCierre = (id, b) =>
  request("POST", `/proyectos/${id}/rechazar-cierre`, b);
export const promoverSolicitud = (b) =>
  request("POST", "/proyectos/promover", b);

// ── Tareas ────────────────────────────────────────────────────
export const getTareas = (idProyecto) =>
  request("GET", `/tareas?idProyecto=${idProyecto}`);
export const crearTarea = (body) => request("POST", "/tareas", body);
export const actualizarTarea = (id, body) =>
  request("PUT", `/tareas/${id}`, body);
export const completarTarea = (id) =>
  request("POST", `/tareas/${id}/completar`);
export const cancelarTarea = (id) => request("DELETE", `/tareas/${id}`);

// ── Hitos ─────────────────────────────────────────────────────
export const getHitos = (idProyecto) =>
  request("GET", `/hitos?idProyecto=${idProyecto}`);
export const crearHito = (body) => request("POST", "/hitos", body);
export const actualizarHito = (id, body) =>
  request("PUT", `/hitos/${id}`, body);
export const validarHito = (id) => request("POST", `/hitos/${id}/validar`);

// ── Avances ───────────────────────────────────────────────────
export const getAvances = (idProyecto) =>
  request("GET", `/avances?idProyecto=${idProyecto}`);
export const getBorrador = (idProyecto) =>
  request("GET", `/avances/borrador?idProyecto=${idProyecto}`);
export const guardarBorrador = (body) =>
  request("POST", "/avances/borrador", body);
export const publicarAvance = (formData) => upload("/avances", formData);

// ── Equipo ────────────────────────────────────────────────────
export const getEquipo = (periodo) =>
  request("GET", `/equipo${periodo ? `?periodo=${periodo}` : ""}`);
export const getDesarrollador = (login, periodo) =>
  request("GET", `/equipo/${login}${periodo ? `?periodo=${periodo}` : ""}`);
export const setCapacidad = (body) => request("PUT", "/equipo/capacidad", body);

// ── Cronograma ────────────────────────────────────────────────
export const getCronograma = (q = {}) =>
  request("GET", `/cronograma?${new URLSearchParams(q)}`);

// ── Ejecutivo ─────────────────────────────────────────────────
export const getEjecutivo = (q = {}) =>
  request("GET", `/ejecutivo?${new URLSearchParams(q)}`);

// This screen shares the original Mesa de Servicio request ids and data.
async function mesaRequest(path, options = {}) {
  const res = await fetch(path, { cache: "no-store", ...options, headers: headers() });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message || "No fue posible cargar el desarrollo");
  return data;
}
export const getPortafolioMesa = periodo => mesaRequest('/api/gestion-desarrollo/portafolio?' + new URLSearchParams(periodo ? {periodo} : {}));
export const getFinalizados = () => mesaRequest('/api/gestion-desarrollo/finalizados');
export const getTrazabilidad = id => mesaRequest('/api/gestion-desarrollo/proyectos/' + id + '/trazabilidad');
export const getDetalleMesa = id => mesaRequest('/api/solicitudes-desarrollo/' + id);
export const getBorradorMesa = async id => {
  const res = await mesaRequest('/api/gestion-desarrollo/proyectos/' + id);
  const b = res.data?.borrador;
  return {data: b ? {tipoActividad:b.tipoActividad,observaciones:b.observaciones,queTermine:b.terminado,enQueEstoy:b.trabajando,queSigue:b.siguiente,horasInvertidas:b.minutosInvertidos/60,avancePctNuevo:b.avanceNuevo,numeroEtapa:b.numeroEtapa || "",fechaInicioEtapa:b.fechaInicioEtapa?.slice(0,10) || "",fechaFinEtapa:b.fechaFinEtapa?.slice(0,10) || ""} : null};
};
// Historial de avances publicados de un desarrollo (misma fuente que el borrador).
export const getHistorialAvancesMesa = async id => {
  const res = await mesaRequest('/api/gestion-desarrollo/proyectos/' + id);
  return (res.data?.avances || []).filter(a => a.estado === 'PUBLICADO');
};
export const guardarAvanceMesa = (form, estado = 'PUBLICADO') => mesaRequest('/api/gestion-desarrollo/proyectos/' + form.idProyecto + '/avances', {
  method:'POST', body:JSON.stringify({estado,tipoActividad:form.tipoActividad,observaciones:form.observaciones,numeroEtapa:form.numeroEtapa,fechaInicioEtapa:form.fechaInicioEtapa,fechaFinEtapa:form.fechaFinEtapa,terminado:form.queTermine,trabajando:form.enQueEstoy,siguiente:form.queSigue,
    minutosInvertidos:Number(form.horasInvertidas||0)*60,minutosRestantes:form.tiempoRestanteHoras == null ? undefined : form.tiempoRestanteHoras === '' ? '' : Number(form.tiempoRestanteHoras)*60,
    proximoCompromiso:form.proximaFechaEntrega,avanceNuevo:form.avancePctNuevo == null ? undefined : Number(form.avancePctNuevo),tieneBloqueo:form.tieneBloqueo,
    bloqueo:form.apoyoRequerido,apoyoRequerido:form.apoyoRequerido})
});
export const concluirDesarrolloMesa = (idSolicitud, body) => mesaRequest('/api/solicitudes-desarrollo/' + idSolicitud + '/concluir', {
  method: 'POST', body: JSON.stringify(body)
});
export async function adjuntarArchivosMesa(id, archivos) {
  const body = new FormData(); archivos.forEach(f => body.append('archivos', f));
  const res = await fetch('/api/solicitudes-desarrollo/' + id + '/adjuntos', {method:'POST',headers:{Authorization:headers().Authorization},body});
  const result = await res.json();
  if (!res.ok || result.ok === false) throw new Error(result.message || 'No fue posible adjuntar los archivos');
  return result;
}

export const getEtapasDesarrollo = (origen,id) => mesaRequest('/api/gestion-desarrollo/etapas/'+origen+'/'+id);
export const guardarEtapasDesarrollo = (origen,id,etapas) => mesaRequest('/api/gestion-desarrollo/etapas/'+origen+'/'+id,{method:'PUT',body:JSON.stringify({etapas})});

export const limpiarEtapasDesarrollo = (origen,id) => mesaRequest('/api/gestion-desarrollo/etapas/'+origen+'/'+id,{method:'DELETE'});

export const generarReporteDesarrollo = id => mesaRequest('/api/gestion-desarrollo/proyectos/'+id+'/reporte',{method:'POST'});

export const generarAnalisisEjecutivoDesarrollo = () => mesaRequest('/api/gestion-desarrollo/analisis-ia',{method:'POST',body:'{}'}).then(res=>res.data);
