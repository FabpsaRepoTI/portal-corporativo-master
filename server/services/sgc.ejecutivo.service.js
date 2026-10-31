// server/services/sgc.ejecutivo.service.js
// Dashboard ejecutivo del SGC/SGI (Coordinador y Dirección): una sola lectura
// con los indicadores que la dirección revisa. Fab-i usa el mismo resumen
// (resumenEjecutivo) para responder con las mismas cifras que ve la pantalla.
//
// Definiciones:
//   nc_criticas        NCs abiertas con clasificación «Crítica»
//   ac_eficacia_pct    ACs verificadas eficaces (idEstatus = 4) entre las
//                      que ya pasaron su fechaCompromiso
//   riesgo_alto_count  riesgos (no oportunidades) activos con nivel > 12
//   exposicion_economica  suma del impacto económico de los riesgos activos
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");

const CLASIFICACION_CRITICA = 3;

async function resumenEjecutivo(idEmpresa) {
  const db = await getPool();
  const r = await db.request()
    .input("idEmpresa", sql.Int, idEmpresa)
    .input("critica", sql.TinyInt, CLASIFICACION_CRITICA)
    .input("altoMin", sql.Int, C.NIVEL_ALTO_MIN)
    .query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      -- Lunes de la semana actual (independiente de DATEFIRST)
      DECLARE @lunes DATE = DATEADD(DAY, -((DATEDIFF(DAY, '19000101', @hoy)) % 7), @hoy);
      DECLARE @desde DATE = DATEADD(WEEK, -12, @lunes);

      SELECT
        (SELECT COUNT(*) FROM sgc_no_conformidades
          WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3, 4)) AS nc_abiertas,
        (SELECT COUNT(*) FROM sgc_no_conformidades
          WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3, 4) AND fechaCompromiso < @hoy) AS nc_vencidas,
        (SELECT COUNT(*) FROM sgc_no_conformidades
          WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3, 4) AND idClasificacion = @critica) AS nc_criticas,
        (SELECT COUNT(*) FROM sgc_acciones_correctivas
          WHERE idEmpresa = @idEmpresa AND fechaCompromiso < @hoy AND idEstatus = 4) AS ac_eficaces,
        (SELECT COUNT(*) FROM sgc_acciones_correctivas
          WHERE idEmpresa = @idEmpresa AND fechaCompromiso < @hoy) AS ac_exigibles,
        (SELECT COUNT(*) FROM sgc_acciones_correctivas
          WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3)) AS ac_abiertas,
        (SELECT COUNT(*) FROM sgc_riesgos
          WHERE idEmpresa = @idEmpresa AND activo = 1 AND idEstatus = 1 AND tipo = 1
            AND probabilidad * impacto >= @altoMin) AS riesgo_alto_count,
        (SELECT ISNULL(SUM(impactoEconomico), 0) FROM sgc_riesgos
          WHERE idEmpresa = @idEmpresa AND activo = 1 AND idEstatus = 1 AND tipo = 1) AS exposicion_economica,
        (SELECT COUNT(*) FROM sgc_msi_tickets
          WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3)) AS tickets_abiertos;

      -- NCs por origen (todas las registradas)
      SELECT o.nombre AS origen, COUNT(*) AS total,
             SUM(CASE WHEN nc.idEstatus = 5 THEN 1 ELSE 0 END) AS cerradas,
             SUM(CASE WHEN nc.idEstatus IN (1, 2, 3, 4) THEN 1 ELSE 0 END) AS abiertas
      FROM sgc_no_conformidades nc
      JOIN sgc_cat_origenes o ON o.idOrigen = nc.idOrigen
      WHERE nc.idEmpresa = @idEmpresa
      GROUP BY o.nombre
      ORDER BY total DESC, o.nombre;

      -- Tendencia de 90 días por semana: NCs abiertas (registradas) y cerradas
      SELECT s.semana,
             (SELECT COUNT(*) FROM sgc_no_conformidades
               WHERE idEmpresa = @idEmpresa AND fechaDeteccion >= s.semana AND fechaDeteccion < DATEADD(DAY, 7, s.semana)) AS abiertas,
             (SELECT COUNT(*) FROM sgc_no_conformidades
               WHERE idEmpresa = @idEmpresa AND idEstatus = 5
                 AND fechaCierre >= s.semana AND fechaCierre < DATEADD(DAY, 7, s.semana)) AS cerradas
      FROM (SELECT DATEADD(WEEK, n, @desde) AS semana
            FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) v(n)) s
      ORDER BY s.semana;

      -- Top 5 riesgos activos
      SELECT TOP 5 idRiesgo, nombre, probabilidad * impacto AS nivel, impactoEconomico, categoria
      FROM sgc_riesgos
      WHERE idEmpresa = @idEmpresa AND activo = 1 AND idEstatus = 1 AND tipo = 1
      ORDER BY probabilidad * impacto DESC, impactoEconomico DESC, nombre;

      -- Próximas auditorías (planeadas; las atrasadas salen con días negativos)
      SELECT TOP 6 idAuditoria, folio, COALESCE(titulo, alcance) AS alcance, fechaPlan,
             DATEDIFF(DAY, @hoy, fechaPlan) AS diasRestantes
      FROM sgc_auditorias
      WHERE idEmpresa = @idEmpresa AND idEstatus = 1
      ORDER BY fechaPlan, idAuditoria;

      -- ACs por vencer en 30 días (incluye vencidas)
      SELECT TOP 8 ac.idAC, ac.folioAC, nc.folioNC,
             COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 160), LEFT(ac.descripcion, 160)) AS descripcion,
             DATEDIFF(DAY, @hoy, ac.fechaCompromiso) AS diasRestantes,
             LTRIM(RTRIM(u.name)) AS responsable
      FROM sgc_acciones_correctivas ac
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      LEFT JOIN sec_users u ON u.login = ac.loginResponsable
      WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3)
        AND ac.fechaCompromiso <= DATEADD(DAY, 30, @hoy)
      ORDER BY ac.fechaCompromiso, ac.idAC;

      -- Documentos por vencer en 30 días (defensivo: tabla puede no existir aún)
      IF OBJECT_ID('sgc_documentos') IS NOT NULL
        SELECT TOP 8 d.idDocumento, d.codigo, d.titulo, d.tipo, d.version, d.idEstatus,
               d.fechaVencimiento,
               DATEDIFF(DAY, @hoy, d.fechaVencimiento) AS diasRestantes,
               LTRIM(RTRIM(ue.name)) AS elabora
        FROM sgc_documentos d
        LEFT JOIN sec_users ue ON ue.login = d.loginElabora
        WHERE d.idEmpresa = @idEmpresa
          AND d.fechaVencimiento IS NOT NULL
          AND d.fechaVencimiento <= DATEADD(DAY, 30, @hoy)
          AND d.idEstatus <> 4
        ORDER BY d.fechaVencimiento, d.idDocumento;
      ELSE
        SELECT TOP 0 NULL AS idDocumento, NULL AS codigo, NULL AS titulo,
               NULL AS tipo, NULL AS version, NULL AS idEstatus,
               NULL AS fechaVencimiento, NULL AS diasRestantes, NULL AS elabora
        WHERE 1=0;
    `);

  const [k, origen, tendencia, riesgos, auditorias, acciones, docVencimientos] = r.recordsets;
  const x = k[0];
  return {
    generado: new Date().toISOString(),
    kpis: {
      nc_abiertas: x.nc_abiertas,
      nc_vencidas: x.nc_vencidas,
      nc_criticas: x.nc_criticas,
      ac_eficacia_pct: x.ac_exigibles ? Math.round((100 * x.ac_eficaces) / x.ac_exigibles) : null,
      riesgo_alto_count: x.riesgo_alto_count,
      exposicion_economica: Number(x.exposicion_economica),
    },
    // Para Fab-i; la pantalla no los usa
    extra: { ac_abiertas: x.ac_abiertas, tickets_abiertos: x.tickets_abiertos },
    nc_por_origen: origen,
    nc_tendencia_90d: tendencia,
    riesgos_top5: riesgos.map((g) => ({
      ...g,
      impactoEconomico: g.impactoEconomico == null ? null : Number(g.impactoEconomico),
      categoria: C.RIESGO_CATEGORIA[g.categoria] || null,
    })),
    proximas_auditorias: auditorias,
    acciones_por_vencer: acciones,
    docs_por_vencer: (docVencimientos || []).map((d) => ({
      ...d,
      tipoLabel: { 1: "Procedimiento", 2: "Instructivo", 3: "Formato", 4: "Registro", 5: "Manual" }[d.tipo] || null,
    })),
  };
}

/** GET /api/sgc/dashboard/ejecutivo (Coordinador y Dirección) */
async function getDashboardEjecutivo(req, res) {
  try {
    const { extra, ...data } = await resumenEjecutivo(req.idEmpresa);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[sgc.ejecutivo.service] getDashboardEjecutivo:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = { resumenEjecutivo, getDashboardEjecutivo };
