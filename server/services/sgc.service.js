// server/services/sgc.service.js
// Módulo SGC/SGI — catálogos, rol del usuario y dashboard.
// NC, AC, auditorías, indicadores, riesgos y archivos viven en sus propios
// services (sgcNC, sgcAC, sgcAuditorias, sgcIndicadores, sgc.riesgos, sgcArchivos…).
const { getPool, sql } = require("../db");
const { obtenerUsuarioSgc, ROLES } = require("../middleware/sgcAuth.middleware");
const C = require("./sgcComun.service");
const { _err } = C;

/** GET /api/sgc/mi-rol — rol SGI del usuario o null (no exige rol). */
async function getMiRol(req, res) {
  try {
    const u = await obtenerUsuarioSgc(req.user.login);
    res.json({ ok: true, data: u ? { ...u, rol: ROLES[u.idRol] } : null });
  } catch (err) {
    console.error("[sgc.service] getMiRol:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/catalogos — catálogos activos + etiquetas de estatus. */
async function getCatalogos(req, res) {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT idOrigen, nombre FROM sgc_cat_origenes WHERE activo = 1 ORDER BY idOrigen;
      SELECT idClasificacion, nombre FROM sgc_cat_clasificaciones WHERE activo = 1 ORDER BY idClasificacion;
      SELECT idAfectacion, nombre FROM sgc_cat_afectaciones WHERE activo = 1 ORDER BY idAfectacion;
      SELECT idHerramienta, nombre FROM sgc_cat_herramientas WHERE activo = 1 ORDER BY idHerramienta;
    `);
    const [origenes, clasificaciones, afectaciones, herramientas] = r.recordsets;
    res.json({
      ok: true,
      data: {
        origenes,
        clasificaciones,
        afectaciones,
        herramientas,
        estatus: {
          nc: C.NC_ESTATUS,
          ac: C.AC_ESTATUS,
          plan: C.PLAN_ESTATUS,
          auditoria: C.AUD_ESTATUS,
        },
        auditoriaTipos: C.AUD_TIPO,
        hallazgoTipos: C.HALLAZGO_TIPO,
        frecuencias: C.FRECUENCIA,
        riesgoTipos: C.RIESGO_TIPO,
        riesgoEstatus: C.RIESGO_ESTATUS,
        riesgoCategorias: C.RIESGO_CATEGORIA,
        procesoTipos: C.PROCESO_TIPO,
        relacionTipos: C.RELACION_TIPO,
      },
    });
  } catch (err) {
    console.error("[sgc.service] getCatalogos:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/usuarios — usuarios activos para selectores. */
async function getUsuarios(req, res) {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT login, LTRIM(RTRIM(name)) AS nombre, area, sitio
      FROM sec_users
      WHERE active = 'Y'
      ORDER BY name
    `);
    res.json({ ok: true, data: r.recordset });
  } catch (err) {
    console.error("[sgc.service] getUsuarios:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/departamentos */
async function getDepartamentos(req, res) {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT d.idDepartamento, d.codigoDepartamento, d.codigoSitio,
             LTRIM(RTRIM(d.departamento)) AS departamento, LTRIM(RTRIM(s.nombreCorto)) AS sitio
      FROM dbo.DEPARTAMENTOS d
      LEFT JOIN dbo.SITIOS s ON s.codigoSitio = d.codigoSitio
      WHERE d.codigoDepartamento IS NOT NULL
      ORDER BY d.departamento
    `);
    res.json({ ok: true, data: r.recordset });
  } catch (err) {
    console.error("[sgc.service] getDepartamentos:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/sitios */
async function getSitios(req, res) {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT idSitio, codigoSitio, LTRIM(RTRIM(nombreCorto)) AS nombre
      FROM dbo.SITIOS
      WHERE codigoSitio IS NOT NULL
      ORDER BY nombreCorto
    `);
    res.json({ ok: true, data: r.recordset });
  } catch (err) {
    console.error("[sgc.service] getSitios:", err);
    _err(res, 500, "Error interno");
  }
}

// Filtros de visibilidad por rol (el Responsable de área solo ve lo suyo)
const NC_MIAS = "(@soloMias = 0 OR nc.loginResponsable = @login)";
const AC_MIAS = "(@soloMias = 0 OR ac.loginResponsable = @login OR nc.loginResponsable = @login)";

function _requestRol(db, req) {
  return db.request()
    .input("idEmpresa", sql.Int, req.idEmpresa)
    .input("login", sql.VarChar(255), req.login)
    .input("soloMias", sql.Bit, req.sgcRol === 3 ? 1 : 0);
}

/**
 * GET /api/sgc/dashboard — centro de control:
 *   kpis, NCs por estatus y por origen (abiertas), tendencia de 6 meses
 *   (registradas vs cerradas), NCs más vencidas, NCs recientes y ACs que
 *   vencen en 15 días con avance del plan.
 */
async function getDashboard(req, res) {
  try {
    const db = await getPool();
    const r = await _requestRol(db, req).query(`
        DECLARE @hoy DATE = ${C.HOY_SQL};
        DECLARE @desde DATE = DATEADD(MONTH, -5, DATEFROMPARTS(YEAR(@hoy), MONTH(@hoy), 1));
        DECLARE @desde90 DATE = DATEADD(DAY, -89, @hoy);

        SELECT
          (SELECT COUNT(*) FROM sgc_no_conformidades nc
            WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4) AND ${NC_MIAS}) AS ncAbiertas,
          (SELECT COUNT(*) FROM sgc_no_conformidades nc
            WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus NOT IN (5, 6) AND nc.fechaCompromiso < @hoy AND ${NC_MIAS}) AS ncVencidas,
          (SELECT COUNT(*) FROM sgc_no_conformidades nc
            WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus NOT IN (5, 6)
              AND nc.fechaCompromiso BETWEEN @hoy AND DATEADD(DAY, 7, @hoy) AND ${NC_MIAS}) AS ncPorVencer7,
          (SELECT COUNT(*) FROM sgc_no_conformidades nc
            JOIN sgc_cat_clasificaciones c ON c.idClasificacion = nc.idClasificacion
            WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4)
              AND LOWER(c.nombre) LIKE '%criti%' AND ${NC_MIAS}) AS ncCriticas,
          (SELECT COUNT(*) FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
            WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3) AND ${AC_MIAS}) AS acAbiertas,
          (SELECT COUNT(*) FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
            WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3) AND ac.fechaCompromiso < @hoy AND ${AC_MIAS}) AS acVencidas,
          (SELECT ISNULL(ROUND(AVG(CAST(x.avance AS FLOAT)), 0), 0) FROM (
             SELECT CASE WHEN COUNT(p.idAccion) = 0 THEN 0
                         ELSE 100.0 * SUM(CASE WHEN p.idEstatus = 3 THEN 1 ELSE 0 END) / COUNT(p.idAccion) END AS avance
             FROM sgc_acciones_correctivas ac
             LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
             LEFT JOIN sgc_acciones_plan p ON p.idAC = ac.idAC
             WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3) AND ${AC_MIAS}
             GROUP BY ac.idAC) x) AS acAvancePromedio,
          (SELECT COUNT(*) FROM sgc_auditorias a
            WHERE a.idEmpresa = @idEmpresa AND a.idEstatus = 2) AS auditoriasEnCurso,
          (SELECT COUNT(*) FROM sgc_auditorias a
            WHERE a.idEmpresa = @idEmpresa AND YEAR(a.fechaPlan) = YEAR(@hoy) AND a.idEstatus <> 4) AS auditoriasAnio,
          (SELECT COUNT(*) FROM sgc_auditorias a
            WHERE a.idEmpresa = @idEmpresa AND YEAR(a.fechaPlan) = YEAR(@hoy) AND a.idEstatus = 3) AS auditoriasCompletadas,
          (SELECT COUNT(*) FROM sgc_riesgos rg
            WHERE rg.idEmpresa = @idEmpresa AND rg.activo = 1 AND rg.idEstatus = 1
              AND rg.tipo = 1 AND rg.probabilidad * rg.impacto >= ${C.NIVEL_ALTO_MIN}) AS riesgosAlto,
          ISNULL((SELECT SUM(ISNULL(rg.impactoEconomico, 0)) FROM sgc_riesgos rg
            WHERE rg.idEmpresa = @idEmpresa AND rg.activo = 1 AND rg.tipo = 1), 0) AS exposicionEconomica,
          (SELECT COUNT(*) FROM sgc_acciones_correctivas ac
            WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus = 4
              AND ac.fechaCompromiso < @hoy) AS acEficaces,
          (SELECT COUNT(*) FROM sgc_acciones_correctivas ac
            WHERE ac.idEmpresa = @idEmpresa AND ac.fechaCompromiso < @hoy
              AND ac.idEstatus NOT IN (5)) AS acConCompromisoVencido;

        -- Distribución por estatus (todas, para el flujo)
        SELECT nc.idEstatus, COUNT(*) AS total
        FROM sgc_no_conformidades nc
        WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS}
        GROUP BY nc.idEstatus;

        -- Abiertas por origen
        SELECT o.idOrigen, o.nombre, COUNT(*) AS total
        FROM sgc_no_conformidades nc JOIN sgc_cat_origenes o ON o.idOrigen = nc.idOrigen
        WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4) AND ${NC_MIAS}
        GROUP BY o.idOrigen, o.nombre
        ORDER BY total DESC;

        -- Tendencia: NCs registradas y cerradas por mes (6 meses)
        SELECT m.mes,
               (SELECT COUNT(*) FROM sgc_no_conformidades nc
                 WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS}
                   AND nc.fechaCreacion >= m.mes AND nc.fechaCreacion < DATEADD(MONTH, 1, m.mes)) AS registradas,
               (SELECT COUNT(*) FROM sgc_no_conformidades nc
                 WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS} AND nc.idEstatus = 5
                   AND nc.fechaCierre >= m.mes AND nc.fechaCierre < DATEADD(MONTH, 1, m.mes)) AS cerradas
        FROM (SELECT DATEADD(MONTH, n, @desde) AS mes FROM (VALUES (0), (1), (2), (3), (4), (5)) v(n)) m
        ORDER BY m.mes;

        -- Más vencidas
        SELECT TOP 5 nc.idNC, nc.folioNC AS folio, LEFT(nc.descripcion, 160) AS descripcion, nc.idEstatus,
               nc.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable, nc.fechaCompromiso,
               DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS diasRestantes
        FROM sgc_no_conformidades nc
        LEFT JOIN sec_users u ON u.login = nc.loginResponsable
        WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus NOT IN (5, 6) AND nc.fechaCompromiso < @hoy AND ${NC_MIAS}
        ORDER BY nc.fechaCompromiso, nc.idNC;

        -- Recientes
        SELECT TOP 8 nc.idNC, nc.folioNC AS folio, LEFT(nc.descripcion, 200) AS descripcion,
               o.nombre AS origen, c.nombre AS clasificacion, nc.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
               nc.fechaCompromiso, nc.fechaCreacion, nc.idEstatus,
               DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS diasRestantes,
               CASE WHEN nc.idEstatus NOT IN (5, 6) AND nc.fechaCompromiso < @hoy THEN 1 ELSE 0 END AS esVencida
        FROM sgc_no_conformidades nc
        JOIN sgc_cat_origenes o ON o.idOrigen = nc.idOrigen
        JOIN sgc_cat_clasificaciones c ON c.idClasificacion = nc.idClasificacion
        LEFT JOIN sec_users u ON u.login = nc.loginResponsable
        WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS}
        ORDER BY nc.fechaCreacion DESC, nc.idNC DESC;

        -- ACs por vencer (30 días)
        SELECT ac.idAC, ac.folioAC AS folio, ac.idNC, nc.folioNC,
               COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 120)) AS titulo,
               ac.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
               ac.fechaCompromiso, ac.idEstatus,
               DATEDIFF(DAY, @hoy, ac.fechaCompromiso) AS diasRestantes,
               pl.total AS totalLineas, pl.completadas AS lineasCompletadas
        FROM sgc_acciones_correctivas ac
        LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
        LEFT JOIN sec_users u ON u.login = ac.loginResponsable
        OUTER APPLY (SELECT COUNT(*) AS total, ISNULL(SUM(CASE WHEN p.idEstatus = 3 THEN 1 ELSE 0 END), 0) AS completadas
                     FROM sgc_acciones_plan p WHERE p.idAC = ac.idAC) pl
        WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3)
          AND ac.fechaCompromiso BETWEEN @hoy AND DATEADD(DAY, 30, @hoy) AND ${AC_MIAS}
        ORDER BY ac.fechaCompromiso, ac.idAC;

        -- Tendencia 90 días (NCs por semana)
        SELECT w.semana,
               (SELECT COUNT(*) FROM sgc_no_conformidades nc
                 WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS}
                   AND CAST(nc.fechaCreacion AS DATE) >= w.semana
                   AND CAST(nc.fechaCreacion AS DATE) < DATEADD(DAY, 7, w.semana)) AS abiertas,
               (SELECT COUNT(*) FROM sgc_no_conformidades nc
                 WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS} AND nc.idEstatus = 5
                   AND nc.fechaCierre >= w.semana AND nc.fechaCierre < DATEADD(DAY, 7, w.semana)) AS cerradas
        FROM (
          SELECT DATEADD(DAY, n * 7, @desde90) AS semana
          FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) v(n)
          WHERE DATEADD(DAY, n * 7, @desde90) <= @hoy
        ) w
        ORDER BY w.semana;

        -- Próximas auditorías (5)
        SELECT TOP 5 a.idAuditoria, a.folio, a.titulo AS nombre, a.idEstatus,
               a.fechaPlan, DATEDIFF(DAY, @hoy, a.fechaPlan) AS diasRestantes,
               LTRIM(RTRIM(u.name)) AS lider
        FROM sgc_auditorias a
        LEFT JOIN sec_users u ON u.login = a.loginAuditor
        WHERE a.idEmpresa = @idEmpresa AND a.idEstatus IN (1, 2) AND a.fechaPlan >= @hoy
        ORDER BY a.fechaPlan, a.idAuditoria;

        -- Top 5 riesgos por nivel
        SELECT TOP 5 r.idRiesgo, r.nombre, r.categoria, r.probabilidad, r.impacto,
               r.probabilidad * r.impacto AS nivel,
               r.impactoEconomico, LTRIM(RTRIM(u.name)) AS responsable
        FROM sgc_riesgos r
        LEFT JOIN sec_users u ON u.login = r.loginResponsable
        WHERE r.idEmpresa = @idEmpresa AND r.activo = 1 AND r.tipo = 1
        ORDER BY r.probabilidad * r.impacto DESC, r.idRiesgo;
      `);

    const [k, porEstatus, porOrigen, tendencia, vencidas, recientes, acs, tendencia90, proximasAuditorias, top5Riesgos] = r.recordsets;
    const kpis = k[0];
    const eficaciaAC = kpis.acConCompromisoVencido > 0
      ? Math.round((100 * kpis.acEficaces) / kpis.acConCompromisoVencido) : 0;
    res.json({
      ok: true,
      data: {
        kpis: { ...kpis, eficaciaAC },
        ncPorEstatus: Object.keys(C.NC_ESTATUS).map((id) => ({
          idEstatus: Number(id),
          label: C.NC_ESTATUS[id],
          total: porEstatus.find((x) => x.idEstatus === Number(id))?.total || 0,
        })),
        ncPorOrigen: porOrigen,
        tendencia: tendencia.map((t) => ({ mes: t.mes, registradas: t.registradas, cerradas: t.cerradas })),
        tendencia90: tendencia90.map((t) => ({ semana: t.semana, abiertas: t.abiertas, cerradas: t.cerradas })),
        ncMasVencidas: vencidas.map((n) => ({ ...n, diasVencido: Math.abs(n.diasRestantes), estatusLabel: C.NC_ESTATUS[n.idEstatus] })),
        ncRecientes: recientes.map((n) => ({ ...n, esVencida: !!n.esVencida, estatusLabel: C.NC_ESTATUS[n.idEstatus] })),
        acPorVencer: acs.map((a) => ({
          ...a,
          avance: a.totalLineas ? Math.round((100 * a.lineasCompletadas) / a.totalLineas) : 0,
          estatusLabel: C.AC_ESTATUS[a.idEstatus],
        })),
        proximasAuditorias: proximasAuditorias.map((a) => ({ ...a, fechaPlan: a.fechaPlan, estatusLabel: C.AUD_ESTATUS[a.idEstatus] })),
        top5Riesgos,
      },
    });
  } catch (err) {
    console.error("[sgc.service] getDashboard:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/contadores — conteos operativos para la navegación del SGI. */
async function getContadores(req, res) {
  try {
    const db = await getPool();
    const r = await _requestRol(db, req).query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      SELECT
        (SELECT COUNT(*) FROM sgc_no_conformidades nc
          WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4) AND ${NC_MIAS}) AS ncAbiertas,
        (SELECT COUNT(*) FROM sgc_no_conformidades nc
          WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus NOT IN (5, 6) AND nc.fechaCompromiso < @hoy AND ${NC_MIAS}) AS ncVencidas,
        (SELECT COUNT(*) FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
          WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3) AND ${AC_MIAS}) AS acAbiertas,
        (SELECT COUNT(*) FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
          WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3) AND ac.fechaCompromiso < @hoy AND ${AC_MIAS}) AS acVencidas,
        (SELECT COUNT(*) FROM sgc_auditorias a WHERE a.idEmpresa = @idEmpresa AND a.idEstatus IN (1, 2)) AS auditoriasPendientes,
        (SELECT COUNT(*) FROM sgc_riesgos rg WHERE rg.idEmpresa = @idEmpresa AND rg.activo = 1 AND rg.idEstatus = 1 AND rg.tipo = 1 AND rg.probabilidad * rg.impacto >= ${C.NIVEL_ALTO_MIN}) AS riesgosAltos
    `);
    res.json({ ok: true, data: r.recordset[0] });
  } catch (err) {
    console.error("[sgc.service] getContadores:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/buscar?q= — búsqueda global por folio o texto (5 por tipo). */
async function buscar(req, res) {
  const texto = C._texto(req.query.q, 60);
  if (!texto || texto.length < 2) return res.json({ ok: true, data: [] });
  try {
    const db = await getPool();
    const r = await _requestRol(db, req)
      .input("q", sql.NVarChar(70), C._like(texto))
      .query(`
        SELECT TOP 5 'nc' AS tipo, nc.idNC AS id, nc.folioNC AS folio, LEFT(nc.descripcion, 120) AS titulo, nc.idEstatus
        FROM sgc_no_conformidades nc
        WHERE nc.idEmpresa = @idEmpresa AND ${NC_MIAS} AND (nc.folioNC LIKE @q OR nc.descripcion LIKE @q)
        ORDER BY nc.fechaCreacion DESC;

        SELECT TOP 5 'ac' AS tipo, ac.idAC AS id, ac.folioAC AS folio, COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 120)) AS titulo, ac.idEstatus
        FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
        WHERE ac.idEmpresa = @idEmpresa AND ${AC_MIAS} AND (ac.folioAC LIKE @q OR ac.titulo LIKE @q OR ac.d2_descripcion LIKE @q)
        ORDER BY ac.fechaCreacion DESC;

        SELECT TOP 5 'aud' AS tipo, a.idAuditoria AS id, a.folio, COALESCE(a.titulo, LEFT(a.alcance, 120)) AS titulo, a.idEstatus
        FROM sgc_auditorias a
        WHERE a.idEmpresa = @idEmpresa AND (a.folio LIKE @q OR a.titulo LIKE @q OR a.alcance LIKE @q)
        ORDER BY a.fechaPlan DESC;

        SELECT TOP 5 'ind' AS tipo, i.idIndicador AS id, i.clave AS folio, i.nombre AS titulo, NULL AS idEstatus
        FROM sgc_indicadores i
        WHERE i.idEmpresa = @idEmpresa AND (i.clave LIKE @q OR i.nombre LIKE @q)
        ORDER BY i.nombre;

        SELECT TOP 5 'riesgo' AS tipo, rg.idRiesgo AS id, CAST(rg.probabilidad * rg.impacto AS VARCHAR(5)) AS folio, rg.nombre AS titulo, NULL AS idEstatus
        FROM sgc_riesgos rg
        WHERE rg.idEmpresa = @idEmpresa AND rg.activo = 1 AND rg.nombre LIKE @q
        ORDER BY rg.probabilidad * rg.impacto DESC;
      `);
    res.json({ ok: true, data: r.recordsets.flat() });
  } catch (err) {
    console.error("[sgc.service] buscar:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getMiRol, getCatalogos, getUsuarios, getDepartamentos, getSitios, getDashboard, getContadores, buscar };
