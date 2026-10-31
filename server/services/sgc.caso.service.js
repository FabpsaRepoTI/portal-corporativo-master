// server/services/sgc.caso.service.js
// GET /api/sgc/caso/:tipo/:folio — un caso NC o AC con su línea de tiempo y sus vínculos.
//   :tipo   'nc' | 'ac'
//   :folio  folio (NC-2026-0003) o id numérico
// Historial: sgc_historial_nc / sgc_historial_ac + el alta de cada AC de la NC
// (evento "acción creada"). Documentos: adjuntos del registro (sgc_archivos).
// Visibilidad igual que en las pantallas: el Responsable de área solo ve lo suyo.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");

const _nombre = (n, login) => n || login || null;

/** Evento de historial → { fecha, evento, usuario, detalle, tono } */
function _evento(h, catalogo) {
  const alta = h.estatusAnterior == null;
  const nuevo = catalogo[h.estatusNuevo];
  let tono = "proceso";
  if (alta) tono = "creada";
  else if (/cerrad|eficaz/i.test(nuevo || "")) tono = "completado";
  else if (/cancelad/i.test(nuevo || "")) tono = "neutral";
  return {
    fecha: h.fechaRegistro,
    evento: alta ? "Registrada" : `${catalogo[h.estatusAnterior]} → ${nuevo}`,
    usuario: _nombre(h.nombre, h.login),
    detalle: h.motivo || null,
    tono,
  };
}

async function getCaso(req, res) {
  const tipo = String(req.params.tipo || "").toLowerCase();
  if (!["nc", "ac"].includes(tipo)) return C._err(res, 400, "Tipo inválido: usa nc o ac.");
  const clave = C._texto(req.params.folio, 30);
  if (!clave) return C._err(res, 400, "Folio inválido");
  const id = /^\d+$/.test(clave) ? C._int(clave) : null;

  try {
    const db = await getPool();
    const r = db.request()
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("id", sql.Int, id)
      .input("folio", sql.VarChar(30), clave);

    if (tipo === "nc") {
      const q = await r.query(`
        DECLARE @hoy DATE = ${C.HOY_SQL};
        DECLARE @idNC INT = (SELECT idNC FROM sgc_no_conformidades
                             WHERE idEmpresa = @idEmpresa AND (idNC = @id OR folioNC = @folio));

        SELECT nc.idNC AS id, nc.folioNC AS folio, nc.idEstatus, nc.descripcion, nc.descripcionDetallada,
               o.nombre AS origen, c.nombre AS clasificacion, af.nombre AS afectacion,
               nc.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
               nc.fechaDeteccion, nc.fechaCompromiso, nc.fechaCierre,
               CASE WHEN nc.idEstatus IN (5, 6) THEN NULL ELSE DATEDIFF(DAY, @hoy, nc.fechaCompromiso) END AS diasRestantes,
               nc.idProceso, pr.nombre AS proceso
        FROM sgc_no_conformidades nc
        JOIN sgc_cat_origenes o ON o.idOrigen = nc.idOrigen
        JOIN sgc_cat_clasificaciones c ON c.idClasificacion = nc.idClasificacion
        LEFT JOIN sgc_cat_afectaciones af ON af.idAfectacion = nc.idAfectacion
        LEFT JOIN sec_users u ON u.login = nc.loginResponsable
        LEFT JOIN sgc_procesos pr ON pr.idProceso = nc.idProceso
        WHERE nc.idNC = @idNC;

        SELECT h.estatusAnterior, h.estatusNuevo, h.login, LTRIM(RTRIM(u.name)) AS nombre, h.motivo, h.fechaRegistro
        FROM sgc_historial_nc h LEFT JOIN sec_users u ON u.login = h.login
        WHERE h.idNC = @idNC;

        SELECT ac.idAC AS id, ac.folioAC AS folio, COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 160), LEFT(ac.descripcion, 160)) AS descripcion,
               ac.idEstatus, ac.fechaCreacion, ac.loginResponsable, LTRIM(RTRIM(u.name)) AS nombre
        FROM sgc_acciones_correctivas ac LEFT JOIN sec_users u ON u.login = ac.loginResponsable
        WHERE ac.idNC = @idNC ORDER BY ac.fechaCreacion;

        SELECT TOP 1 a.idAuditoria AS id, a.folio, COALESCE(a.titulo, LEFT(a.alcance, 120)) AS nombre
        FROM sgc_hallazgos h JOIN sgc_auditorias a ON a.idAuditoria = h.idAuditoria
        WHERE h.idNC = @idNC;

        SELECT idArchivo AS id, nombreOriginal AS nombre, mimeType AS tipo
        FROM sgc_archivos WHERE entidad = 'NC' AND idEntidad = @idNC ORDER BY fechaSubida;
      `);
      const [[nc], hist, acs, [auditoria], documentos] = q.recordsets;
      if (!nc) return C._err(res, 404, "No conformidad no encontrada");
      if (req.sgcRol === 3 && !C._mismo(nc.loginResponsable, req.login)) return C._err(res, 403, "Solo puedes consultar las no conformidades a tu cargo.");

      const historial = [
        ...hist.map((h) => _evento(h, C.NC_ESTATUS)),
        ...acs.map((a) => ({ fecha: a.fechaCreacion, evento: `Acción creada: ${a.folio}`, usuario: _nombre(a.nombre, a.loginResponsable), detalle: a.descripcion, tono: "accion" })),
      ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      if (nc.diasRestantes != null && nc.diasRestantes < 0) {
        historial.push({ fecha: null, evento: `Vencida hace ${-nc.diasRestantes} días`, usuario: null, detalle: "La fecha compromiso ya pasó.", tono: "vencido" });
      }

      return res.json({
        ok: true,
        data: {
          tipo,
          registro: { ...nc, estatusLabel: C.NC_ESTATUS[nc.idEstatus] },
          historial,
          relacionados: {
            auditoria: auditoria || null,
            ac: acs[0] ? { id: acs[0].id, folio: acs[0].folio, descripcion: acs[0].descripcion } : null,
            acs: acs.map((a) => ({ id: a.id, folio: a.folio, descripcion: a.descripcion, estatusLabel: C.AC_ESTATUS[a.idEstatus] })),
            nc_origen: null,
            proceso: nc.idProceso ? { id: nc.idProceso, nombre: nc.proceso } : null,
            documentos,
          },
        },
      });
    }

    const q = await r.query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      DECLARE @idAC INT = (SELECT idAC FROM sgc_acciones_correctivas
                           WHERE idEmpresa = @idEmpresa AND (idAC = @id OR folioAC = @folio));

      SELECT ac.idAC AS id, ac.folioAC AS folio, ac.idEstatus,
             COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 200), LEFT(ac.descripcion, 200)) AS descripcion,
             ac.causaRaiz, ac.d4_causaRaiz, ac.pctAvance, ac.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
             ac.fechaCompromiso, ac.fechaCierre, ac.fechaCreacion,
             CASE WHEN ac.idEstatus IN (4, 5) THEN NULL ELSE DATEDIFF(DAY, @hoy, ac.fechaCompromiso) END AS diasRestantes,
             ac.idNC, nc.folioNC, LEFT(nc.descripcion, 200) AS descripcionNC, nc.loginResponsable AS loginResponsableNC,
             nc.idProceso, pr.nombre AS proceso
      FROM sgc_acciones_correctivas ac
      LEFT JOIN sec_users u ON u.login = ac.loginResponsable
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      LEFT JOIN sgc_procesos pr ON pr.idProceso = nc.idProceso
      WHERE ac.idAC = @idAC;

      SELECT h.estatusAnterior, h.estatusNuevo, h.login, LTRIM(RTRIM(u.name)) AS nombre, h.motivo, h.fechaRegistro
      FROM sgc_historial_ac h LEFT JOIN sec_users u ON u.login = h.login
      WHERE h.idAC = @idAC;

      SELECT TOP 1 a.idAuditoria AS id, a.folio, COALESCE(a.titulo, LEFT(a.alcance, 120)) AS nombre
      FROM sgc_acciones_correctivas ac
      JOIN sgc_hallazgos h ON h.idNC = ac.idNC
      JOIN sgc_auditorias a ON a.idAuditoria = h.idAuditoria
      WHERE ac.idAC = @idAC;

      SELECT idArchivo AS id, nombreOriginal AS nombre, mimeType AS tipo
      FROM sgc_archivos WHERE entidad = 'AC' AND idEntidad = @idAC ORDER BY fechaSubida;
    `);
    const [[ac], hist, [auditoria], documentos] = q.recordsets;
    if (!ac) return C._err(res, 404, "Acción correctiva no encontrada");
    if (req.sgcRol === 3 && !C._mismo(ac.loginResponsable, req.login) && !C._mismo(ac.loginResponsableNC, req.login)) {
      return C._err(res, 403, "Solo puedes consultar las acciones a tu cargo.");
    }
    const { folioNC, descripcionNC, loginResponsableNC, ...registro } = ac;
    const historial = hist.map((h) => _evento(h, C.AC_ESTATUS)).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    if (ac.diasRestantes != null && ac.diasRestantes < 0) {
      historial.push({ fecha: null, evento: `Vencida hace ${-ac.diasRestantes} días`, usuario: null, detalle: "La fecha compromiso ya pasó.", tono: "vencido" });
    }
    res.json({
      ok: true,
      data: {
        tipo,
        registro: { ...registro, estatusLabel: C.AC_ESTATUS[ac.idEstatus] },
        historial,
        relacionados: {
          auditoria: auditoria || null,
          ac: null,
          acs: [],
          nc_origen: ac.idNC ? { id: ac.idNC, folio: folioNC, descripcion: descripcionNC } : null,
          proceso: ac.idProceso ? { id: ac.idProceso, nombre: ac.proceso } : null,
          documentos,
        },
      },
    });
  } catch (err) {
    console.error("[sgc.caso] getCaso:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = { getCaso };
