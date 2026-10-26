"use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/ejecutivo.service.js
// Vista resumida para Alta Dirección.
// Sin detalles técnicos, sin horas individuales,
// sin comparaciones entre desarrolladores.
// ─────────────────────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../../db");

const ETAPAS = {
  1: "Análisis", 2: "Desarrollo", 3: "Revisión", 4: "Pruebas", 5: "Liberación",
};
const ESTATUS = {
  1: "En análisis", 2: "En desarrollo", 3: "En pruebas",
  4: "En revisión", 5: "Liberado", 6: "Cancelado", 7: "En pausa",
};

async function getEjecutivo(query = {}) {
  const pool = await getPool();
  const req  = pool.request();
  const conds = ["p.idEstatus NOT IN (6)"]; // excluye cancelados

  if (query.soloEstrategicos === "true") {
    conds.push("p.prioridad = 1");
  }

  const proyectos = await req.query(`
    SELECT
      p.idProyecto, p.folio, p.nombre, p.objetivo, p.areaSolicitante,
      p.avancePct, p.etapaActual, p.idEstatus,
      p.fechaCompromiso, p.fechaEstimadaLib, p.fechaLiberacion,
      p.enRiesgo, p.motivoRiesgo,
      p.cierresolicitado,

      -- Entregables completados en el periodo
      (SELECT COUNT(*) FROM dev_tareas t
       WHERE t.idProyecto = p.idProyecto AND t.esEntregable = 1 AND t.idEstatus = 3) AS entregablesCompletados,

      -- Próximo entregable
      (SELECT TOP 1 t.titulo FROM dev_tareas t
       WHERE t.idProyecto = p.idProyecto AND t.esEntregable = 1 AND t.idEstatus IN (1,2)
       ORDER BY t.fechaCompromiso ASC) AS proximoEntregable,
      (SELECT TOP 1 t.fechaCompromiso FROM dev_tareas t
       WHERE t.idProyecto = p.idProyecto AND t.esEntregable = 1 AND t.idEstatus IN (1,2)
       ORDER BY t.fechaCompromiso ASC) AS fechaProximoEntregable,

      -- Decisiones pendientes (bloqueos tipo 4)
      (SELECT COUNT(*) FROM solicitudTI_desarrollo_bloqueos b
       WHERE b.idProyecto = p.idProyecto AND b.tipo = 4 AND b.fechaResolucion IS NULL) AS decisionesPendientes,

      -- Descripción del bloqueo/decisión más urgente
      (SELECT TOP 1 b.motivo FROM solicitudTI_desarrollo_bloqueos b
       WHERE b.idProyecto = p.idProyecto AND b.fechaResolucion IS NULL
       ORDER BY b.fechaBloqueo ASC) AS motivoBloqueoActual,

      -- Días de desviación respecto a fecha compromiso original
      CASE WHEN p.fechaCompromiso IS NOT NULL AND p.idEstatus NOT IN (5,6)
           THEN DATEDIFF(DAY, p.fechaCompromiso, GETDATE())
           ELSE NULL END AS diasDesviacion

    FROM dev_proyectos p
    WHERE ${conds.join(" AND ")}
    ORDER BY p.prioridad ASC, p.enRiesgo DESC, p.fechaCompromiso ASC
  `);

  const data = proyectos.recordset.map(p => ({
    ...p,
    etapaNombre:  ETAPAS[p.etapaActual] ?? "—",
    estatusNombre:ESTATUS[p.idEstatus]  ?? "—",
    enTiempo:     !p.enRiesgo && (p.diasDesviacion === null || p.diasDesviacion <= 0),
  }));

  // KPIs ejecutivos
  const activos           = data.filter(p => ![5,6].includes(p.idEstatus));
  const enRiesgo          = data.filter(p => p.enRiesgo);
  const conDecisionPend   = data.filter(p => p.decisionesPendientes > 0);
  const liberadosMes      = data.filter(p => {
    if (p.idEstatus !== 5 || !p.fechaLiberacion) return false;
    const lib = new Date(p.fechaLiberacion);
    const hoy = new Date();
    return lib.getMonth() === hoy.getMonth() && lib.getFullYear() === hoy.getFullYear();
  });

  return {
    data,
    kpis: {
      proyectosActivos:   activos.length,
      proyectosEnRiesgo:  enRiesgo.length,
      decisionesPendientes: conDecisionPend.length,
      liberadosEsteMes:   liberadosMes.length,
    },
  };
}

module.exports = { getEjecutivo };
