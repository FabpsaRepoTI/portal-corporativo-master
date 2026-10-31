"use strict";

// These are Mesa de Servicio statuses, not the separate dev_proyectos enum.
const ACTIVE = new Set([2, 3, 4, 5]);
const CLOSED = new Set([6, 7]);
const STAGES = { 1: "Pendiente", 2: "En revisión", 3: "En proceso", 4: "En pruebas", 5: "Esperando información", 6: "Rechazado", 7: "Concluido" };
const hasOwner = row => Boolean(row.loginResponsable?.trim());

const UNASSIGNED_HOURS = 48;
const NO_COMMITMENT_DAYS = 7;

function openSeconds(row, now = Date.now()) {
  return row.segundosAbiertos == null
    ? (now - new Date(row.fechaCreacion).getTime()) / 1000
    : Number(row.segundosAbiertos);
}

function projectState(row, now = Date.now()) {
  if (Number(row.idEstatus) === 5) return { key: "pending", label: "Esperando información" };
  if (!hasOwner(row)) {
    return openSeconds(row, now) > UNASSIGNED_HOURS * 3600
      ? { key: "risk", label: "Sin asignar" }
      : { key: "pending", label: "Sin responsable" };
  }
  // Sin fecha compromiso por demasiado tiempo es un retraso real sin
  // importar si el estatus todavía es Pendiente/En revisión.
  const missingCommitment = !row.fechaCompromiso || row.tiempoEstado === "sin_fecha";
  if (missingCommitment && openSeconds(row, now) > NO_COMMITMENT_DAYS * 24 * 3600) {
    return { key: "risk", label: "Atrasado" };
  }
  if (!ACTIVE.has(Number(row.idEstatus))) return { key: "pending", label: "Sin iniciar" };
  if (Number(row.bloqueosActivos) > 0) return { key: "risk", label: "Bloqueado" };
  if (missingCommitment) return { key: "pending", label: "Sin compromiso" };
  if (row.tiempoEstado === "vencido") return { key: "risk", label: "En riesgo" };
  if (!row.fechaInicio && !Number(row.porcentajeAvance)) return { key: "pending", label: "Sin iniciar" };
  return { key: "ok", label: "En tiempo" };
}

function buildPortfolio(rows, capacities = [], now = Date.now()) {
  const open = rows.filter(row => row.alcanceDesarrollo !== "CAMBIO_SENCILLO" && !CLOSED.has(Number(row.idEstatus)));
  const normalize = row => ({ ...row, nombre: row.titulo, folio: row.folioDesarrollo,
    areaSolicitante: row.area, avancePct: Number(row.porcentajeAvance ?? 0),
    etapaNombre: row.estatusNombre || STAGES[Number(row.idEstatus)],
    estado: projectState(row, now) });
  const data = open.filter(row => ACTIVE.has(Number(row.idEstatus))).map(normalize);
  // A diferencia de `data`, incluye Pendiente (idEstatus 1): sin asignar o sin
  // fecha compromiso por demasiado tiempo debe alertar aunque nadie lo haya
  // movido de estatus todavía.
  const proyectosRiesgo = open.filter(row => projectState(row, now).key === "risk").map(normalize);
  const atencion = [];
  for (const row of open) {
    const seconds = openSeconds(row, now);
    if (!hasOwner(row) && seconds > UNASSIGNED_HOURS * 3600) atencion.push({
      id: `sinasignar-${row.idSolicitud}`, idSolicitud: row.idSolicitud, tipo: "pending",
      titulo: "Desarrollo sin asignar",
      proyecto: row.titulo, descripcion: `Más de ${UNASSIGNED_HOURS} horas desde su registro sin responsable asignado.`,
      fecha: row.fechaCreacion, etiqueta: "Sin asignar", antiguedad: seconds,
    });
    if (hasOwner(row) && (!row.fechaCompromiso || row.tiempoEstado === "sin_fecha") && seconds > NO_COMMITMENT_DAYS * 24 * 3600) atencion.push({
      id: `atrasado-${row.idSolicitud}`, idSolicitud: row.idSolicitud, tipo: "late",
      titulo: "Desarrollo atrasado",
      proyecto: row.titulo, descripcion: `Más de ${NO_COMMITMENT_DAYS} días asignado sin una fecha compromiso registrada.`,
      fecha: row.fechaCreacion, etiqueta: "Atrasado", antiguedad: seconds,
    });
    if (Number(row.bloqueosActivos) > 0) atencion.push({
      id: `bloqueo-${row.idSolicitud}`, idSolicitud: row.idSolicitud, tipo: "block",
      titulo: "Bloqueo técnico", proyecto: row.titulo,
      descripcion: `${row.bloqueosActivos} bloqueo(s) activo(s) sin resolver.`,
      fecha: row.fechaActualizacion, etiqueta: "Bloqueo", antiguedad: seconds,
    });
    if (ACTIVE.has(Number(row.idEstatus)) && row.tiempoEstado === "vencido") atencion.push({
      id: `retraso-${row.idSolicitud}`, idSolicitud: row.idSolicitud, tipo: "late",
      titulo: "Compromiso con retraso", proyecto: row.titulo,
      descripcion: "La fecha compromiso del desarrollo ha vencido.",
      fecha: row.fechaCompromiso, etiqueta: "Retraso", antiguedad: seconds,
    });
  }
  atencion.sort((a, b) => b.antiguedad - a.antiguedad);
  const owners = new Map();
  for (const row of open.filter(hasOwner)) {
    const owner = owners.get(row.loginResponsable) || {
      login: row.loginResponsable, nombre: row.nombreResponsable || row.loginResponsable,
      picture: row.fotoResponsable, proyectos: [], horasComprometidas: 0,
    };
    owner.proyectos.push(normalize(row));
    owner.horasComprometidas += Number(row.horasEstimadas ?? 0);
    owners.set(row.loginResponsable, owner);
  }
  const equipo = [...owners.values()].map(owner => {
    const capacity = capacities.find(c => c.loginUsuario === owner.login);
    const available = Number(capacity?.horasDisponibles ?? 0);
    const estimated = owner.proyectos.some(p => p.horasEstimadas != null);
    const cargaPct = available > 0 && estimated ? Math.round(owner.horasComprometidas / available * 100) : null;
    return { ...owner, horasDisponibles: capacity?.horasDisponibles ?? null, cargaPct, clasificacionCarga: cargaPct == null ? "Sin capacidad" :
      cargaPct < 60 ? "Disponible" : cargaPct <= 80 ? "Adecuada" : "Alta" };
  });
  return { data, proyectosRiesgo, hitos: rows.filter(row=>!CLOSED.has(Number(row.idEstatus)) && row.fechaCompromiso).map(normalize), atencion, equipo, resumen: {
    activos: data.length,
    entregas: data.filter(p => p.fechaCompromiso && Number(p.diasRestantes) >= 0 && Number(p.diasRestantes) <= 14).length,
    bloqueos: open.reduce((sum, p) => sum + Number(p.bloqueosActivos || 0), 0),
    enRiesgo: data.filter(p => p.estado.key === "risk").length,
  } };
}

module.exports = { buildPortfolio, projectState };
