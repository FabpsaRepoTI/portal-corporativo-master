// server/services/sgc.mesasgi.service.js
// Mesa de Servicio SGI: cualquier colaborador con sesión hace solicitudes al
// departamento SGI (altas de procedimiento, actualización de documentos,
// auditorías, capacitación, consultas) con trazabilidad completa, en lugar
// del correo.
//
// Quién es "equipo SGI": rol activo 1 (Coordinador) o 2 (Auditor) en
// sgc_usuario_roles. Ellos ven todas las solicitudes, comentarios internos,
// cambian estatus y asignan. El resto solo ve las suyas y sus comentarios
// visibles (esInterno = 0).
//
// Folio MSI-YYYY-0001. fechaLimite = fechaCreacion + slaHoras del servicio.
// Estatus: 1 Recibida, 2 En atención, 3 En espera, 4 Resuelta, 5 Cancelada.
// Cada cambio de estatus o asignación queda como comentario en el hilo (con
// los prefijos de EVENTO), así la línea de tiempo es la bitácora del ticket y
// la pestaña Seguimiento los distingue de los comentarios de personas.
// Cada cambio de estatus notifica al solicitante (TICKET_ACTUALIZADO).
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { generarFolio } = require("./sgcFolio.service");
const { obtenerUsuarioSgc, puedeModulo, ID_EMPRESA } = require("../middleware/sgcAuth.middleware");
const { notificar } = require("./sgc.notificaciones.service");
const { _err, _int, _texto, _mismo, _rollback, _abortar, MSI_ESTATUS, MSI_PRIORIDAD } = C;

const ROLES_SGI = [1, 2];
// Comentarios que genera el sistema (movimientos, no conversación)
const EVENTO_ESTATUS = "Cambió el estatus";
const EVENTO_ASIGNA = "Asignó la solicitud";
const esEvento = (m) => String(m || "").startsWith(EVENTO_ESTATUS) || String(m || "").startsWith(EVENTO_ASIGNA);
const ABIERTOS = [1, 2, 3];
const FINALES = [4, 5];

/** Deja req.esSGI (y req.sgcUser si tiene rol). */
async function cargarPerfil(req, res, next) {
  try {
    const u = await obtenerUsuarioSgc(req.user.login);
    req.login = req.user.login;
    req.sgcUser = u;
    // Equipo SGI = Coordinador o Auditor con el módulo Mesa SGI permitido
    req.esSGI = !!u && ROLES_SGI.includes(u.idRol) && puedeModulo(u, "mesa_sgi");
    next();
  } catch (err) {
    console.error("[sgc.mesasgi] perfil:", err.message);
    _err(res, 503, "No se pudieron verificar tus permisos. Intenta de nuevo.");
  }
}

function soloSGI(req, res, next) {
  if (!req.esSGI) return _err(res, 403, "Solo el equipo SGI puede hacer esta acción.");
  next();
}

const TICKET_SELECT = `
  SELECT t.idTicket, t.folio, t.idServicio, s.nombre AS servicio, t.titulo, t.descripcion,
         t.prioridad, t.idEstatus, t.fechaCreacion, t.fechaLimite, t.fechaCierre,
         t.loginSolicitante, LTRIM(RTRIM(us.name)) AS solicitante,
         t.loginAsignado, LTRIM(RTRIM(ua.name)) AS asignado,
         DATEDIFF(HOUR, GETDATE(), t.fechaLimite) AS horasRestantes,
         CASE WHEN t.idEstatus IN (1, 2, 3) AND t.fechaLimite < GETDATE() THEN 1 ELSE 0 END AS vencido,
         CASE WHEN t.idEstatus = 4 AND t.fechaLimite IS NOT NULL AND t.fechaCierre <= t.fechaLimite THEN 1
              WHEN t.idEstatus = 4 AND t.fechaLimite IS NOT NULL THEN 0 END AS cumplioSLA,
         (SELECT COUNT(*) FROM sgc_msi_comentarios c WHERE c.idTicket = t.idTicket AND c.esInterno = 0) AS comentarios
  FROM sgc_msi_tickets t
  JOIN sgc_msi_cat_servicios s ON s.idServicio = t.idServicio
  LEFT JOIN sec_users us ON us.login = t.loginSolicitante
  LEFT JOIN sec_users ua ON ua.login = t.loginAsignado
`;

const _formatear = (t) => ({
  ...t,
  vencido: !!t.vencido,
  cumplioSLA: t.cumplioSLA == null ? null : !!t.cumplioSLA,
  estatusLabel: MSI_ESTATUS[t.idEstatus],
  prioridadLabel: MSI_PRIORIDAD[t.prioridad],
  diasRestantes: t.horasRestantes == null ? null : Math.floor(t.horasRestantes / 24),
});

async function _comentar(tx, idTicket, login, mensaje, esInterno = false) {
  await new sql.Request(tx)
    .input("id", sql.Int, idTicket)
    .input("login", sql.VarChar(255), login)
    .input("mensaje", sql.NVarChar(sql.MAX), mensaje)
    .input("interno", sql.Bit, esInterno ? 1 : 0)
    .query(`INSERT INTO sgc_msi_comentarios (idTicket, login, mensaje, esInterno) VALUES (@id, @login, @mensaje, @interno)`);
}

/** GET /api/sgc/mesa-sgi/servicios — catálogo activo. */
async function getServicios(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`
        SELECT s.idServicio, s.nombre, s.descripcion, s.slaHoras, s.idResponsable,
               LTRIM(RTRIM(u.name)) AS responsable
        FROM sgc_msi_cat_servicios s
        LEFT JOIN sec_users u ON u.login = s.idResponsable
        WHERE s.idEmpresa = @idEmpresa AND s.activo = 1
        ORDER BY s.nombre
      `);
    res.json({ ok: true, data: r.recordset, esSGI: req.esSGI, idRol: req.sgcUser?.idRol || null });
  } catch (err) {
    console.error("[sgc.mesasgi] getServicios:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/mesa-sgi/tickets  body: { idServicio, titulo, descripcion, prioridad? } */
async function crearTicket(req, res) {
  const b = req.body || {};
  const idServicio = _int(b.idServicio);
  const titulo = _texto(b.titulo, 200);
  const descripcion = _texto(b.descripcion, 4000);
  const prioridad = _int(b.prioridad) || 2;
  if (!idServicio) return _err(res, 400, "Elige el servicio que necesitas.");
  if (!titulo) return _err(res, 400, "Escribe un título para tu solicitud.");
  if (!descripcion) return _err(res, 400, "Describe qué necesitas.");
  if (!MSI_PRIORIDAD[prioridad]) return _err(res, 400, "Prioridad inválida");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const s = (await new sql.Request(tx)
      .input("id", sql.Int, idServicio)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`SELECT idServicio, slaHoras, idResponsable FROM sgc_msi_cat_servicios
              WHERE idServicio = @id AND idEmpresa = @idEmpresa AND activo = 1`)).recordset[0];
    if (!s) return _abortar(tx, res, 400, "El servicio no existe o ya no está disponible.");

    const folio = await generarFolio("MSI", tx);
    const ins = await new sql.Request(tx)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .input("folio", sql.VarChar(20), folio)
      .input("idServicio", sql.Int, idServicio)
      .input("solicitante", sql.VarChar(255), req.login)
      .input("asignado", sql.VarChar(255), s.idResponsable || null)
      .input("titulo", sql.NVarChar(200), titulo)
      .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
      .input("prioridad", sql.TinyInt, prioridad)
      .input("sla", sql.Int, s.slaHoras)
      .query(`
        DECLARE @ahora DATETIME = GETDATE();
        INSERT INTO sgc_msi_tickets (idEmpresa, folio, idServicio, loginSolicitante, loginAsignado, idEstatus,
                                     titulo, descripcion, prioridad, fechaLimite, fechaCreacion)
        OUTPUT INSERTED.idTicket, INSERTED.fechaLimite
        VALUES (@idEmpresa, @folio, @idServicio, @solicitante, @asignado, 1, @titulo, @descripcion, @prioridad,
                CASE WHEN @sla IS NULL THEN NULL ELSE DATEADD(HOUR, @sla, @ahora) END, @ahora)
      `);
    await tx.commit();
    res.status(201).json({ ok: true, data: { idTicket: ins.recordset[0].idTicket, folio, fechaLimite: ins.recordset[0].fechaLimite } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.mesasgi] crearTicket:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * GET /api/sgc/mesa-sgi/tickets?estatus=1,2&idServicio=&asignado=login|sin&vencidos=1&q=
 * Equipo SGI: todas. Resto: solo las propias.
 */
async function getTickets(req, res) {
  try {
    const q = req.query;
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, ID_EMPRESA);
    const where = ["t.idEmpresa = @idEmpresa"];
    if (!req.esSGI) {
      request.input("login", sql.VarChar(255), req.login);
      where.push("t.loginSolicitante = @login");
    }
    const estatus = C._ints(q.estatus, [1, 2, 3, 4, 5]);
    if (estatus.length) where.push(C._in(request, "t.idEstatus", "est", estatus, sql.TinyInt));
    const idServicio = _int(q.idServicio);
    if (idServicio) {
      request.input("idServicio", sql.Int, idServicio);
      where.push("t.idServicio = @idServicio");
    }
    if (q.asignado === "sin") where.push("t.loginAsignado IS NULL");
    else if (_texto(q.asignado, 255)) {
      request.input("asignado", sql.VarChar(255), _texto(q.asignado, 255));
      where.push("t.loginAsignado = @asignado");
    }
    if (q.vencidos === "1") where.push("t.idEstatus IN (1, 2, 3) AND t.fechaLimite < GETDATE()");
    const texto = _texto(q.q, 60);
    if (texto) {
      request.input("q", sql.NVarChar(70), C._like(texto));
      where.push("(t.folio LIKE @q OR t.titulo LIKE @q OR t.descripcion LIKE @q)");
    }
    const r = await request.query(`
      ${TICKET_SELECT}
      WHERE ${where.join(" AND ")}
      ORDER BY CASE WHEN t.idEstatus IN (1, 2, 3) THEN 0 ELSE 1 END, t.prioridad DESC,
               ISNULL(t.fechaLimite, '9999-12-31'), t.idTicket DESC
      OFFSET 0 ROWS FETCH NEXT 300 ROWS ONLY
    `);
    res.json({ ok: true, data: r.recordset.map(_formatear) });
  } catch (err) {
    console.error("[sgc.mesasgi] getTickets:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/mesa-sgi/mis-tickets — las solicitudes del usuario y sus conteos. */
async function getMisTickets(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .input("login", sql.VarChar(255), req.login)
      .query(`${TICKET_SELECT}
              WHERE t.idEmpresa = @idEmpresa AND t.loginSolicitante = @login
              ORDER BY CASE WHEN t.idEstatus IN (1, 2, 3) THEN 0 ELSE 1 END, t.fechaCreacion DESC`);
    const data = r.recordset.map(_formatear);
    res.json({
      ok: true,
      data,
      resumen: {
        abiertos: data.filter((t) => ABIERTOS.includes(t.idEstatus)).length,
        vencidos: data.filter((t) => t.vencido).length,
        resueltos: data.filter((t) => t.idEstatus === 4).length,
      },
    });
  } catch (err) {
    console.error("[sgc.mesasgi] getMisTickets:", err);
    _err(res, 500, "Error interno");
  }
}

async function _cargarTicket(request, id) {
  const r = await request.input("id", sql.Int, id).input("idEmpresa", sql.Int, ID_EMPRESA)
    .query(`${TICKET_SELECT} WHERE t.idTicket = @id AND t.idEmpresa = @idEmpresa`);
  return r.recordset[0];
}

/** GET /api/sgc/mesa-sgi/tickets/:id — ticket + hilo (sin internos para el solicitante). */
async function getTicket(req, res) {
  try {
    const id = _int(req.params.id);
    if (!id) return _err(res, 400, "Solicitud inválida");
    const db = await getPool();
    const t = await _cargarTicket(db.request(), id);
    // Mismo 404 si no existe o si no es suya: no revela folios ajenos
    if (!t || (!req.esSGI && !_mismo(t.loginSolicitante, req.login))) return _err(res, 404, "Solicitud no encontrada");
    const c = await db.request()
      .input("id", sql.Int, id)
      .input("verInternos", sql.Bit, req.esSGI ? 1 : 0)
      .query(`
        SELECT c.idComentario, c.login, LTRIM(RTRIM(u.name)) AS nombre, c.mensaje, c.esInterno, c.fechaRegistro
        FROM sgc_msi_comentarios c
        LEFT JOIN sec_users u ON u.login = c.login
        WHERE c.idTicket = @id AND (@verInternos = 1 OR c.esInterno = 0)
        ORDER BY c.fechaRegistro, c.idComentario
      `);
    res.json({
      ok: true,
      data: {
        ..._formatear(t),
        comentarios: c.recordset.map((x) => ({ ...x, esInterno: !!x.esInterno, esSGI: !_mismo(x.login, t.loginSolicitante), esEvento: esEvento(x.mensaje) })),
        permisos: {
          esSGI: req.esSGI,
          comentar: req.esSGI || (_mismo(t.loginSolicitante, req.login) && t.idEstatus !== 5),
          cambiarEstatus: req.esSGI,
          cancelar: !req.esSGI && _mismo(t.loginSolicitante, req.login) && ABIERTOS.includes(t.idEstatus),
        },
      },
    });
  } catch (err) {
    console.error("[sgc.mesasgi] getTicket:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * PUT /api/sgc/mesa-sgi/tickets/:id/estatus  body: { idEstatus, motivo? }
 * Equipo SGI: cualquier cambio (resolver pide motivo / solución). El
 * solicitante solo puede cancelar la suya mientras siga abierta.
 */
async function cambiarEstatus(req, res) {
  const id = _int(req.params.id);
  const nuevo = _int(req.body?.idEstatus);
  const motivo = _texto(req.body?.motivo, 2000);
  if (!id) return _err(res, 400, "Solicitud inválida");
  if (!MSI_ESTATUS[nuevo]) return _err(res, 400, "Estatus inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const t = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`SELECT idTicket, folio, titulo, idEstatus, loginSolicitante FROM sgc_msi_tickets WITH (UPDLOCK)
              WHERE idTicket = @id AND idEmpresa = @idEmpresa`)).recordset[0];
    const propio = t && _mismo(t.loginSolicitante, req.login);
    if (!t || (!req.esSGI && !propio)) return _abortar(tx, res, 404, "Solicitud no encontrada");
    if (!req.esSGI && !(nuevo === 5 && ABIERTOS.includes(t.idEstatus))) {
      return _abortar(tx, res, 403, "Solo puedes cancelar tu solicitud mientras esté abierta.");
    }
    if (t.idEstatus === nuevo) return _abortar(tx, res, 400, `La solicitud ya está «${MSI_ESTATUS[nuevo]}».`);
    if (t.idEstatus === 5) return _abortar(tx, res, 400, "La solicitud está cancelada.");
    if ((nuevo === 4 || nuevo === 5 || nuevo === 3) && !motivo) {
      return _abortar(tx, res, 400, nuevo === 4 ? "Describe la solución entregada." : nuevo === 3 ? "Indica qué información esperas del solicitante." : "Indica el motivo de la cancelación.");
    }

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("nuevo", sql.TinyInt, nuevo)
      .input("final", sql.Bit, FINALES.includes(nuevo) ? 1 : 0)
      .query(`UPDATE sgc_msi_tickets
              SET idEstatus = @nuevo, fechaCierre = CASE WHEN @final = 1 THEN GETDATE() ELSE NULL END
              WHERE idTicket = @id`);
    await _comentar(tx, id, req.login, `${EVENTO_ESTATUS} de «${MSI_ESTATUS[t.idEstatus]}» a «${MSI_ESTATUS[nuevo]}».${motivo ? "\n" + motivo : ""}`);
    await notificar(tx, {
      login: t.loginSolicitante,
      actor: req.login,
      tipo: "TICKET_ACTUALIZADO",
      titulo: `${t.folio}: ${MSI_ESTATUS[nuevo]}`,
      mensaje: motivo || t.titulo,
      entidad: "MSI",
      idEntidad: id,
    });
    await tx.commit();
    res.json({ ok: true, data: { idTicket: id, idEstatus: nuevo, estatusLabel: MSI_ESTATUS[nuevo] } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.mesasgi] cambiarEstatus:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/mesa-sgi/tickets/:id/asignar  body: { loginAsignado } (equipo SGI) */
async function asignar(req, res) {
  const id = _int(req.params.id);
  const login = _texto(req.body?.loginAsignado, 255);
  if (!id) return _err(res, 400, "Solicitud inválida");
  if (!login) return _err(res, 400, "Elige a quién asignar la solicitud.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const t = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`SELECT idTicket, idEstatus, loginAsignado FROM sgc_msi_tickets WITH (UPDLOCK)
              WHERE idTicket = @id AND idEmpresa = @idEmpresa`)).recordset[0];
    if (!t) return _abortar(tx, res, 404, "Solicitud no encontrada");
    if (FINALES.includes(t.idEstatus)) return _abortar(tx, res, 400, "La solicitud ya está concluida.");
    if (_mismo(t.loginAsignado, login)) return _abortar(tx, res, 400, "La solicitud ya está asignada a esa persona.");
    const u = await obtenerUsuarioSgc(login);
    if (!u || !ROLES_SGI.includes(u.idRol) || !puedeModulo(u, "mesa_sgi")) return _abortar(tx, res, 400, "Solo se puede asignar a integrantes del equipo SGI.");

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("login", sql.VarChar(255), u.login)
      .query(`UPDATE sgc_msi_tickets SET loginAsignado = @login, idEstatus = CASE WHEN idEstatus = 1 THEN 2 ELSE idEstatus END
              WHERE idTicket = @id`);
    await _comentar(tx, id, req.login, `${EVENTO_ASIGNA} a ${u.nombre}.${t.idEstatus === 1 ? ` Estatus: «${MSI_ESTATUS[2]}».` : ""}`);
    await tx.commit();
    res.json({ ok: true, data: { idTicket: id, loginAsignado: u.login, asignado: u.nombre } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.mesasgi] asignar:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/mesa-sgi/tickets/:id/comentario  body: { mensaje, esInterno? } */
async function comentar(req, res) {
  const id = _int(req.params.id);
  const mensaje = _texto(req.body?.mensaje, 4000);
  const esInterno = req.esSGI && !!req.body?.esInterno;
  if (!id) return _err(res, 400, "Solicitud inválida");
  if (!mensaje) return _err(res, 400, "Escribe tu comentario.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const t = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`SELECT idTicket, idEstatus, loginSolicitante FROM sgc_msi_tickets WITH (UPDLOCK)
              WHERE idTicket = @id AND idEmpresa = @idEmpresa`)).recordset[0];
    const propio = t && _mismo(t.loginSolicitante, req.login);
    if (!t || (!req.esSGI && !propio)) return _abortar(tx, res, 404, "Solicitud no encontrada");
    if (!req.esSGI && t.idEstatus === 5) return _abortar(tx, res, 400, "La solicitud está cancelada.");

    await _comentar(tx, id, req.login, mensaje, esInterno);
    // Si SGI esperaba información y el solicitante responde, vuelve a «En atención»
    let reactivado = false;
    if (propio && !req.esSGI && t.idEstatus === 3) {
      await new sql.Request(tx).input("id", sql.Int, id).query(`UPDATE sgc_msi_tickets SET idEstatus = 2 WHERE idTicket = @id`);
      reactivado = true;
    }
    await tx.commit();
    res.status(201).json({ ok: true, data: { reactivado } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.mesasgi] comentar:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * GET /api/sgc/mesa-sgi/admin (equipo SGI) — KPIs de la mesa, carga por
 * servicio y el equipo SGI disponible para asignar.
 * % SLA cumplido: resueltas en el mes dentro de su fecha límite / resueltas en el mes.
 */
async function getAdmin(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`
        DECLARE @mes DATETIME = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
        SELECT
          (SELECT COUNT(*) FROM sgc_msi_tickets WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3)) AS abiertos,
          (SELECT COUNT(*) FROM sgc_msi_tickets WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3) AND fechaLimite < GETDATE()) AS vencidos,
          (SELECT COUNT(*) FROM sgc_msi_tickets WHERE idEmpresa = @idEmpresa AND idEstatus IN (1, 2, 3) AND loginAsignado IS NULL) AS sinAsignar,
          (SELECT COUNT(*) FROM sgc_msi_tickets WHERE idEmpresa = @idEmpresa AND idEstatus = 4 AND fechaCierre >= @mes) AS resueltosMes,
          (SELECT COUNT(*) FROM sgc_msi_tickets WHERE idEmpresa = @idEmpresa AND idEstatus = 4 AND fechaCierre >= @mes
             AND fechaLimite IS NOT NULL) AS conSlaMes,
          (SELECT COUNT(*) FROM sgc_msi_tickets WHERE idEmpresa = @idEmpresa AND idEstatus = 4 AND fechaCierre >= @mes
             AND fechaLimite IS NOT NULL AND fechaCierre <= fechaLimite) AS enSlaMes;

        SELECT s.idServicio, s.nombre,
               SUM(CASE WHEN t.idEstatus IN (1, 2, 3) THEN 1 ELSE 0 END) AS abiertos,
               SUM(CASE WHEN t.idEstatus IN (1, 2, 3) AND t.fechaLimite < GETDATE() THEN 1 ELSE 0 END) AS vencidos
        FROM sgc_msi_cat_servicios s
        LEFT JOIN sgc_msi_tickets t ON t.idServicio = s.idServicio
        WHERE s.idEmpresa = @idEmpresa AND s.activo = 1
        GROUP BY s.idServicio, s.nombre
        ORDER BY s.nombre;

        SELECT r.login, LTRIM(RTRIM(u.name)) AS nombre, r.idRol,
               (SELECT COUNT(*) FROM sgc_msi_tickets t WHERE t.loginAsignado = r.login AND t.idEstatus IN (1, 2, 3)) AS carga
        FROM sgc_usuario_roles r
        JOIN sec_users u ON u.login = r.login AND u.active = 'Y'
        WHERE r.idEmpresa = @idEmpresa AND r.activo = 1 AND r.idRol IN (1, 2)
        ORDER BY u.name;
      `);
    const k = r.recordsets[0][0];
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      data: {
        kpis: {
          abiertos: k.abiertos,
          vencidos: k.vencidos,
          sinAsignar: k.sinAsignar,
          resueltosMes: k.resueltosMes,
          slaPct: k.conSlaMes ? Math.round((100 * k.enSlaMes) / k.conSlaMes) : null,
        },
        porServicio: r.recordsets[1],
        equipo: r.recordsets[2],
      },
    });
  } catch (err) {
    console.error("[sgc.mesasgi] getAdmin:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/mesa-sgi/servicios  body: { nombre, descripcion, slaHoras } */
async function crearServicio(req, res) {
  const { nombre, descripcion, slaHoras } = req.body;
  if (!nombre || !String(nombre).trim()) return _err(res, 400, "El nombre es obligatorio.");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .input("nombre", sql.NVarChar(200), String(nombre).trim())
      .input("descripcion", sql.NVarChar(500), descripcion ? String(descripcion).trim() : null)
      .input("slaHoras", sql.Int, parseInt(slaHoras, 10) || 24)
      .query(`
        INSERT INTO sgc_msi_cat_servicios (idEmpresa, nombre, descripcion, slaHoras, activo)
        OUTPUT INSERTED.idServicio
        VALUES (@idEmpresa, @nombre, @descripcion, @slaHoras, 1)
      `);
    res.json({ ok: true, data: { idServicio: r.recordset[0].idServicio } });
  } catch (err) {
    console.error("[sgc.mesasgi] crearServicio:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/mesa-sgi/servicios/:id  body: { nombre, descripcion, slaHoras } */
async function actualizarServicio(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return _err(res, 400, "ID inválido.");
  const { nombre, descripcion, slaHoras } = req.body;
  if (!nombre || !String(nombre).trim()) return _err(res, 400, "El nombre es obligatorio.");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .input("nombre", sql.NVarChar(200), String(nombre).trim())
      .input("descripcion", sql.NVarChar(500), descripcion ? String(descripcion).trim() : null)
      .input("slaHoras", sql.Int, parseInt(slaHoras, 10) || 24)
      .query(`
        UPDATE sgc_msi_cat_servicios
        SET nombre = @nombre, descripcion = @descripcion, slaHoras = @slaHoras
        WHERE idServicio = @id AND idEmpresa = @idEmpresa
      `);
    if (!r.rowsAffected[0]) return _err(res, 404, "Servicio no encontrado.");
    res.json({ ok: true });
  } catch (err) {
    console.error("[sgc.mesasgi] actualizarServicio:", err);
    _err(res, 500, "Error interno");
  }
}

/** DELETE /api/sgc/mesa-sgi/servicios/:id */
async function desactivarServicio(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return _err(res, 400, "ID inválido.");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`UPDATE sgc_msi_cat_servicios SET activo = 0 WHERE idServicio = @id AND idEmpresa = @idEmpresa`);
    if (!r.rowsAffected[0]) return _err(res, 404, "Servicio no encontrado.");
    res.json({ ok: true });
  } catch (err) {
    console.error("[sgc.mesasgi] desactivarServicio:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = {
  cargarPerfil,
  soloSGI,
  getServicios,
  crearServicio,
  actualizarServicio,
  desactivarServicio,
  crearTicket,
  getTickets,
  getMisTickets,
  getTicket,
  cambiarEstatus,
  asignar,
  comentar,
  getAdmin,
};
