// ─── AGREGAR ESTAS RUTAS a solicitudesUsuario.routes.js ───────────────────────
// O crear un archivo separado y montarlo en index.js como:
// const hwUsuarioRoutes = require("./routes/hardwareUsuario.routes");
// app.use("/api/solicitudes-usuario/hardware", hwUsuarioRoutes);
// ──────────────────────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

// GET /api/solicitudes-usuario/hardware/kpis
router.get("/kpis", async (req, res) => {
  const login = req.user.login;
  try {
    const db = await getPool();
    const result = await db.request().input("login", sql.VarChar, login).query(`
        SELECT
          COUNT(*)                                                            AS total,
          SUM(CASE WHEN estatus = 'Pendiente'             THEN 1 ELSE 0 END) AS pendientes,
          SUM(CASE WHEN estatus = 'En proceso'            THEN 1 ELSE 0 END) AS enProceso,
          SUM(CASE WHEN estatus = 'Completada'            THEN 1 ELSE 0 END) AS completadas,
          SUM(CASE WHEN estatus = 'Parcialmente atendida' THEN 1 ELSE 0 END) AS parciales,
          SUM(CASE WHEN estatus = 'Rechazada'             THEN 1 ELSE 0 END) AS rechazadas
        FROM solicitudHardware
        WHERE loginUsuario = @login
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("getKpisHardware:", err);
    res.status(500).json({ error: "Error al obtener KPIs" });
  }
});

// GET /api/solicitudes-usuario/hardware
// Lista las solicitudes de hardware del usuario autenticado
router.get("/", async (req, res) => {
  const login = req.user.login;
  const { estatus, buscar } = req.query;

  try {
    const db = await getPool();
    const req2 = db.request().input("login", sql.VarChar, login);

    let where = "s.loginUsuario = @login";

    if (estatus) {
      req2.input("estatus", sql.VarChar, estatus);
      where += " AND s.estatus = @estatus";
    }
    if (buscar) {
      req2.input("buscar", sql.NVarChar, `%${buscar}%`);
      where += " AND (s.folio LIKE @buscar OR s.motivo LIKE @buscar)";
    }

    const result = await req2.query(`
      SELECT
        s.idSolicitud,
        s.folio,
        s.usuario,
        s.departamento,
        s.motivo,
        s.observaciones,
        s.estatus,
        s.fechaRegistro,
        -- artículos como texto concatenado para mostrar en la fila
        (
          SELECT STRING_AGG(ch.nombreArticulo + ' ×' + CAST(d.cantidad AS VARCHAR), ', ')
          FROM solicitudHardwareDetalle d
          JOIN catalogoHardware ch ON ch.idArticulo = d.idArticulo
          WHERE d.idSolicitud = s.idSolicitud
        ) AS articulos,
        -- total de artículos
        (
          SELECT COUNT(*) FROM solicitudHardwareDetalle d
          WHERE d.idSolicitud = s.idSolicitud
        ) AS totalArticulos,
        -- total de comentarios del hilo
        (
          SELECT COUNT(*) FROM solicitudHardwareComentarios c
          WHERE c.folio = s.folio AND c.esEvento = 0
        ) AS totalMensajes
      FROM solicitudHardware s
      WHERE ${where}
      ORDER BY s.fechaRegistro DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getMisHardware:", err);
    res.status(500).json({ error: "Error al obtener solicitudes de hardware" });
  }
});

// GET /api/solicitudes-usuario/hardware/:id/detalle
// Detalle completo de una solicitud de hardware
router.get("/:id/detalle", async (req, res) => {
  const login = req.user.login;
  const id = parseInt(req.params.id);

  try {
    const db = await getPool();

    // Verificar ownership
    const check = await db
      .request()
      .input("id", sql.Int, id)
      .input("login", sql.VarChar, login)
      .query(
        `SELECT idSolicitud FROM solicitudHardware WHERE idSolicitud = @id AND loginUsuario = @login`,
      );

    if (!check.recordset.length)
      return res.status(403).json({ error: "No autorizado" });

    // Cabecera
    const cab = await db.request().input("id", sql.Int, id).query(`
      SELECT idSolicitud, folio, usuario, departamento, motivo, observaciones, estatus, fechaRegistro
      FROM solicitudHardware WHERE idSolicitud = @id
    `);

    // Artículos del detalle
    const arts = await db.request().input("id", sql.Int, id).query(`
      SELECT
        d.idDetalle, d.idArticulo, d.cantidad, d.estatusDetalle,
        d.fechaEstimadaEntrega, d.observacionAtencion,
        ch.nombreArticulo, ch.categoria, ch.requiereAutorizacion
      FROM solicitudHardwareDetalle d
      JOIN catalogoHardware ch ON ch.idArticulo = d.idArticulo
      WHERE d.idSolicitud = @id
      ORDER BY d.idDetalle
    `);

    // Comentarios / hilo de actividad
    const coms = await db
      .request()
      .input("folio", sql.VarChar, cab.recordset[0].folio).query(`
        SELECT id, folio, login, nombre, rol, mensaje, esEvento, fechaCreacion
        FROM solicitudHardwareComentarios
        WHERE folio = @folio
        ORDER BY fechaCreacion ASC
      `);

    res.json({
      ...cab.recordset[0],
      articulos: arts.recordset,
      comentarios: coms.recordset,
    });
  } catch (err) {
    console.error("getDetalleHardwareUsuario:", err);
    res.status(500).json({ error: "Error al obtener detalle" });
  }
});

// POST /api/solicitudes-usuario/hardware/:id/comentario
router.post("/:id/comentario", async (req, res) => {
  const login = req.user.login;
  const nombre = req.user.name || login;
  const id = parseInt(req.params.id);
  const { comentario } = req.body;

  if (!comentario?.trim())
    return res.status(400).json({ error: "Comentario vacío" });

  try {
    const db = await getPool();

    const check = await db
      .request()
      .input("id", sql.Int, id)
      .input("login", sql.VarChar, login)
      .query(
        `SELECT folio FROM solicitudHardware WHERE idSolicitud = @id AND loginUsuario = @login`,
      );

    if (!check.recordset.length)
      return res.status(403).json({ error: "No autorizado" });

    const folio = check.recordset[0].folio;

    await db
      .request()
      .input("folio", sql.VarChar, folio)
      .input("login", sql.VarChar, login)
      .input("nombre", sql.VarChar, nombre)
      .input("rol", sql.VarChar, "usuario")
      .input("mensaje", sql.NVarChar, comentario.trim())
      .input("esEvento", sql.Bit, 0).query(`
        INSERT INTO solicitudHardwareComentarios (folio, login, nombre, rol, mensaje, esEvento)
        VALUES (@folio, @login, @nombre, @rol, @mensaje, @esEvento)
      `);

    const result = await db
      .request()
      .input("folio", sql.VarChar, folio)
      .input("login", sql.VarChar, login).query(`
        SELECT TOP 1 id, folio, login, nombre, rol, mensaje, esEvento, fechaCreacion
        FROM solicitudHardwareComentarios
        WHERE folio = @folio AND login = @login AND esEvento = 0
        ORDER BY fechaCreacion DESC
      `);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("postComentarioHardware:", err);
    res.status(500).json({ error: "Error al enviar comentario" });
  }
});

module.exports = router;
