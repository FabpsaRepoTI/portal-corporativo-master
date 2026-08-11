const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");
const { verifyToken } = require("../middleware/auth");
const { enviarCorreoSolicitudHardware } = require("../services/mailer");

router.use(verifyToken);

router.get("/catalogo", async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT idArticulo, nombreArticulo, categoria, requiereAutorizacion
      FROM catalogoHardware
      WHERE activo = 'S'
      ORDER BY categoria, nombreArticulo
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error catálogo hardware:", err.message);
    res.status(500).json({ error: "Error consultando el catálogo." });
  }
});

router.post("/solicitud", async (req, res) => {
  const { motivo, observaciones, articulos } = req.body;

  if (!Array.isArray(articulos) || articulos.length === 0) {
    return res
      .status(400)
      .json({ error: "Debes seleccionar al menos un artículo." });
  }

  const usuario = req.user.name || req.user.login;
  const loginUsuario = req.user.login; // ← nuevo
  const departamento = req.user.area || req.user.sitio || null;

  let transaction;

  try {
    const db = await getPool();
    transaction = new sql.Transaction(db);
    await transaction.begin();

    const cabeceraResult = await new sql.Request(transaction)
      .input("usuario", sql.VarChar, usuario)
      .input("loginUsuario", sql.VarChar, loginUsuario) // ← nuevo
      .input("departamento", sql.VarChar, departamento)
      .input("motivo", sql.VarChar, motivo || null)
      .input("observaciones", sql.VarChar, observaciones || null).query(`
        INSERT INTO solicitudHardware
          (fechaRegistro, usuario, loginUsuario, departamento, motivo, observaciones, estatus)
        OUTPUT INSERTED.idSolicitud
        VALUES
          (GETDATE(), @usuario, @loginUsuario, @departamento, @motivo, @observaciones, 'Pendiente')
      `);

    const idSolicitud = cabeceraResult.recordset[0].idSolicitud;
    const folio = "SH-" + String(idSolicitud).padStart(6, "0");

    await new sql.Request(transaction)
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("folio", sql.VarChar, folio)
      .query(
        `UPDATE solicitudHardware SET folio = @folio WHERE idSolicitud = @idSolicitud`,
      );

    for (const art of articulos) {
      const idArticulo = parseInt(art.idArticulo, 10);
      const cantidad = parseInt(art.cantidad, 10) || 1;
      if (!idArticulo || idArticulo <= 0) continue;

      await new sql.Request(transaction)
        .input("idSolicitud", sql.Int, idSolicitud)
        .input("folio", sql.VarChar, folio)
        .input("idArticulo", sql.Int, idArticulo)
        .input("cantidad", sql.Int, cantidad).query(`
          INSERT INTO solicitudHardwareDetalle (idSolicitud, folio, idArticulo, cantidad, estatusDetalle)
          VALUES (@idSolicitud, @folio, @idArticulo, @cantidad, 'Pendiente')
        `);
    }

    await transaction.commit();

    // Evento inicial en el hilo de actividad (fuera de la transaction)
    try {
      const dbEvento = await getPool();
      await new sql.Request(dbEvento)
        .input("folio", sql.VarChar, folio)
        .input("login", sql.VarChar, req.user.login)
        .input("nombre", sql.VarChar, usuario)
        .input("rol", sql.VarChar, "sistema")
        .input("mensaje", sql.NVarChar, `Solicitud creada por ${usuario}`)
        .input("esEvento", sql.Bit, 1).query(`
          INSERT INTO solicitudHardwareComentarios
            (folio, login, nombre, rol, mensaje, esEvento)
          VALUES
            (@folio, @login, @nombre, @rol, @mensaje, @esEvento)
        `);
    } catch (eventoErr) {
      console.error("Error insertando evento inicial:", eventoErr.message);
    }

    res.json({ success: true, folio, fecha: new Date().toISOString() });

    // Correo (asíncrono, no bloquea la respuesta)
    const catalogoDb = await getPool();
    const catalogoResult = await catalogoDb.request().query(`
      SELECT idArticulo, nombreArticulo, requiereAutorizacion FROM catalogoHardware
    `);
    const catalogo = catalogoResult.recordset;

    const articulosConNombre = articulos.map((a) => {
      const info = catalogo.find(
        (c) => c.idArticulo === parseInt(a.idArticulo, 10),
      );
      return {
        nombreArticulo: info?.nombreArticulo || "Artículo",
        cantidad: a.cantidad || 1,
        requiereAutorizacion: info?.requiereAutorizacion || "N",
      };
    });

    enviarCorreoSolicitudHardware({
      folio,
      usuario,
      departamento,
      motivo,
      fecha: new Date().toLocaleString("es-MX"),
      articulos: articulosConNombre,
    }).catch((err) =>
      console.error("Error enviando correo de Hardware:", err.message),
    );
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error("Error en rollback:", rollbackErr.message);
      }
    }
    console.error("Error creando solicitud de Hardware:", err.message);
    res.status(500).json({ error: "Error registrando la solicitud." });
  }
});

module.exports = router;
