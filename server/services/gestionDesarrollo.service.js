"use strict";
const { getPool, sql } = require("../db");
const etapas = require("./desarrolloEtapas.service");
const desarrollo = require("./solicitudesDesarrollo.service");
const { buildPortfolio } = require("./portafolio.model");

async function ensureSchema(pool) {
  await pool.request().query(`IF OBJECT_ID('dbo.solicitudTI_desarrollo_avances','U') IS NULL BEGIN
    CREATE TABLE dbo.solicitudTI_desarrollo_avances(
      idAvance INT IDENTITY(1,1) PRIMARY KEY,idSolicitud INT NOT NULL,
      loginUsuario VARCHAR(255) NOT NULL,nombreUsuario NVARCHAR(255) NOT NULL,
      terminado NVARCHAR(MAX),trabajando NVARCHAR(MAX),siguiente NVARCHAR(MAX),
      minutosInvertidos INT NOT NULL DEFAULT(0),minutosRestantes INT NULL,
      proximoCompromiso DATE NULL,avanceAnterior TINYINT NULL,avanceNuevo TINYINT NOT NULL,
      tieneBloqueo BIT NOT NULL DEFAULT(0),bloqueo NVARCHAR(MAX),apoyoRequerido NVARCHAR(255),
      estado VARCHAR(12) NOT NULL DEFAULT('PUBLICADO'),fechaRegistro DATETIME2 NOT NULL DEFAULT(SYSDATETIME()),
      CONSTRAINT CK_dev_avance_pct CHECK(avanceNuevo BETWEEN 0 AND 100),
      CONSTRAINT CK_dev_avance_estado CHECK(estado IN ('BORRADOR','PUBLICADO'))
    ); CREATE INDEX IX_dev_avance_solicitud ON dbo.solicitudTI_desarrollo_avances(idSolicitud,fechaRegistro DESC); END`);
  await pool.request().query("IF COL_LENGTH('dbo.solicitudTI_desarrollo_avances','tipoActividad') IS NULL ALTER TABLE dbo.solicitudTI_desarrollo_avances ADD tipoActividad TINYINT NULL; IF COL_LENGTH('dbo.solicitudTI_desarrollo_avances','observaciones') IS NULL ALTER TABLE dbo.solicitudTI_desarrollo_avances ADD observaciones NVARCHAR(MAX) NULL;");
  await etapas.ensureSchema(pool);
  await pool.request().query("IF COL_LENGTH('dbo.solicitudTI_desarrollo_avances','numeroEtapa') IS NULL ALTER TABLE dbo.solicitudTI_desarrollo_avances ADD numeroEtapa TINYINT NULL,fechaInicioEtapa DATE NULL,fechaFinEtapa DATE NULL;");
}

async function getPortafolio(query = {}) {
  // Read every page from the same source used by Mesa de Servicio. Pending
  // requests must remain available for the 84-hour attention rule.
  const rows = [];
  let page = 1;
  do {
    const result = await desarrollo.getLista({ page, limit: 100, orderBy: "fecha", dir: "asc" });
    rows.push(...(result.data || []));
    if (!result.data?.length || rows.length >= result.total) break;
    page++;
  } while (true);
  const pool = await getPool();
  const periodo = /^\d{4}-\d{2}$/.test(query.periodo || "") ? query.periodo : new Date().toISOString().slice(0, 7);
  const capacity = await pool.request().input("periodo", sql.Char(7), periodo).query(
    "IF OBJECT_ID('dbo.dev_capacidad','U') IS NOT NULL SELECT loginUsuario,horasDisponibles FROM dbo.dev_capacidad WHERE periodo=@periodo ELSE SELECT CAST(NULL AS varchar(255)) AS loginUsuario, CAST(NULL AS int) AS horasDisponibles WHERE 1=0"
  );
  return { ...buildPortfolio(rows, capacity.recordset), periodo };
}

async function getProyecto(id, login) {
  const pool = await getPool(); await ensureSchema(pool);
  const [detalle, avances] = await Promise.all([desarrollo.getDetalle(id), pool.request().input("id", sql.Int, id)
    .query("SELECT * FROM dbo.solicitudTI_desarrollo_avances WHERE idSolicitud=@id ORDER BY fechaRegistro DESC,idAvance DESC")]);
  const legacy = await pool.request().input('id',sql.Int,id).query("IF OBJECT_ID('dbo.dev_avances','U') IS NOT NULL AND OBJECT_ID('dbo.dev_proyectos','U') IS NOT NULL SELECT a.* FROM dev_avances a JOIN dev_proyectos p ON p.idProyecto=a.idProyecto WHERE p.idSolicitudOrigen=@id AND a.idEstado=1 ELSE SELECT 1 AS unused WHERE 1=0");
  const allAdvances=[...avances.recordset,...legacy.recordset.map(a=>({idAvance:'dev-'+a.idAvance,loginUsuario:a.loginDesarrollador,nombreUsuario:a.nombreDesarrollador,terminado:a.queTermine,trabajando:a.enQueEstoy,siguiente:a.queSigue,minutosInvertidos:Number(a.horasInvertidas||0)*60,avanceAnterior:a.avancePctAnterior,avanceNuevo:a.avancePctNuevo,numeroEtapa:a.numeroEtapa,fechaInicioEtapa:a.fechaInicioEtapa,fechaFinEtapa:a.fechaFinEtapa,fechaRegistro:a.fechaRegistro,estado:'PUBLICADO',tieneBloqueo:a.tieneBloqueo,bloqueo:a.apoyoRequerido,tipoActividad:a.tipoActividad,observaciones:a.observaciones}))].sort((a,b)=>new Date(b.fechaRegistro)-new Date(a.fechaRegistro));
  const latestOwn = avances.recordset.find(a => a.loginUsuario === login);
  return detalle ? { ...detalle, avances: allAdvances, borrador: latestOwn?.estado === "BORRADOR" ? latestOwn : null } : null;
}

async function guardarAvance(id, body, user) {
  const pool = await getPool(); await ensureSchema(pool);
  const detalle = await desarrollo.getDetalle(id);
  if (!detalle) { const e = new Error("Trabajo no encontrado"); e.status = 404; throw e; }
  if (!detalle.tecnicoAsignado?.trim()) throw new Error("Asigna un responsable en Mesa de Servicio antes de registrar avances.");
  if ([6, 7].includes(Number(detalle.idEstatus))) throw new Error("Este desarrollo ya no está activo.");
  if(body.tipoActividad != null && ![1,2,3,4,5,6,7].includes(Number(body.tipoActividad))) throw new Error('Tipo de actividad inválido');
  const estado = body.estado === "BORRADOR" ? "BORRADOR" : "PUBLICADO";
  const avance = Number(body.avanceNuevo);
  if (!Number.isInteger(avance) || avance < 0 || avance > 100) throw new Error("El avance debe estar entre 0 y 100");
  if (estado === "PUBLICADO" && (!body.terminado?.trim() || !body.trabajando?.trim() || !body.siguiente?.trim())) throw new Error("Completa qué terminaste, en qué trabajas y qué sigue");
  if (estado === "PUBLICADO" && body.tieneBloqueo && !body.bloqueo?.trim()) throw new Error("Describe el bloqueo y el apoyo requerido.");
  if (detalle.alcanceDesarrollo === "CAMBIO_SENCILLO") throw new Error("Los cambios sencillos se atienden en Mesa de Servicio.");
  const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const active = await new sql.Request(tx).input("id",sql.Int,id).query("SELECT numeroEtapa,fechaInicio,fechaCompromiso FROM dbo.desarrollo_etapas WITH (UPDLOCK,HOLDLOCK) WHERE origen='mesa' AND idEntidad=@id AND activa=1");
    const etapa = active.recordset[0];
    const result = await new sql.Request(tx).input("id",sql.Int,id).input("login",sql.VarChar(255),user.login)
      .input("nombre",sql.NVarChar(255),user.nombre || user.name || user.login).input("t",sql.NVarChar(sql.MAX),body.terminado || null)
      .input("w",sql.NVarChar(sql.MAX),body.trabajando || null).input("s",sql.NVarChar(sql.MAX),body.siguiente || null)
      .input("mi",sql.Int,Math.max(0,Number(body.minutosInvertidos)||0)).input("mr",sql.Int,body.minutosRestantes === "" ? null : Math.max(0,Number(body.minutosRestantes)||0))
      .input("pc",sql.Date,body.proximoCompromiso || null).input("aa",sql.TinyInt,Number(detalle.porcentajeAvance||0))
      .input("an",sql.TinyInt,avance).input("tb",sql.Bit,!!body.tieneBloqueo).input("b",sql.NVarChar(sql.MAX),body.tieneBloqueo ? body.bloqueo || null : null)
      .input("ar",sql.NVarChar(255),body.tieneBloqueo ? body.apoyoRequerido || null : null).input("e",sql.VarChar(12),estado)
      .input("tipoActividad",sql.TinyInt,body.tipoActividad == null ? null : Number(body.tipoActividad)).input("observaciones",sql.NVarChar(sql.MAX),body.observaciones?.trim() || null)
      .input("etapa",sql.TinyInt,etapa?.numeroEtapa ?? null).input("ei",sql.Date,etapa?.fechaInicio ?? null).input("ef",sql.Date,etapa?.fechaCompromiso ?? null)
      .query(`INSERT dbo.solicitudTI_desarrollo_avances(idSolicitud,loginUsuario,nombreUsuario,terminado,trabajando,siguiente,minutosInvertidos,minutosRestantes,proximoCompromiso,avanceAnterior,avanceNuevo,tieneBloqueo,bloqueo,apoyoRequerido,estado,numeroEtapa,fechaInicioEtapa,fechaFinEtapa,tipoActividad,observaciones)
        OUTPUT INSERTED.* VALUES(@id,@login,@nombre,@t,@w,@s,@mi,@mr,@pc,@aa,@an,@tb,@b,@ar,@e,@etapa,@ei,@ef,@tipoActividad,@observaciones)`);
    if (estado === "PUBLICADO") {

      await new sql.Request(tx).input("id",sql.Int,id).input("a",sql.TinyInt,avance).input("pc",sql.Date,body.proximoCompromiso || null)
        .query("UPDATE solicitudTI_desarrollo_detalle SET porcentajeAvance=@a,fechaCompromiso=COALESCE(@pc,fechaCompromiso) WHERE idSolicitud=@id; UPDATE solicitudTI SET fechaActualizacion=GETDATE() WHERE idSolicitud=@id");
      if (Number(body.minutosInvertidos) > 0) await new sql.Request(tx).input("id",sql.Int,id)
        .input("login",sql.VarChar(255),user.login).input("nombre",sql.NVarChar(255),user.nombre || user.name || user.login)
        .input("min",sql.Int,Math.round(Number(body.minutosInvertidos))).input("desc",sql.NVarChar(sql.MAX),body.trabajando)
        .query("INSERT solicitudTI_desarrollo_horas(idSolicitud,loginUsuario,nombreUsuario,minutosTrabajos,descripcion,fechaRegistro,fechaTrabajo) VALUES(@id,@login,@nombre,@min,@desc,GETDATE(),CAST(GETDATE() AS DATE))");
      if (body.tieneBloqueo) await new sql.Request(tx).input("id",sql.Int,id)
        .input("login",sql.VarChar(255),user.login).input("nombre",sql.NVarChar(255),user.nombre || user.name || user.login)
        .input("motivo",sql.NVarChar(500),body.bloqueo.trim().slice(0,500))
        .query("INSERT solicitudTI_desarrollo_bloqueos(idSolicitud,motivo,registradoPor,nombreRegistro,fechaBloqueo) VALUES(@id,@motivo,@login,@nombre,GETDATE())");
    }
    await tx.commit(); return result.recordset[0];
  } catch(e) { await tx.rollback(); throw e; }
}
async function getFinalizados() {
  const rows = [];
  for (let page=1; ; page++) {
    const result=await desarrollo.getLista({page,limit:100,estatus:'7',orderBy:'actualizado',dir:'desc'});
    rows.push(...(result.data || []));
    if (!result.data?.length || rows.length >= result.total) break;
  }
  return rows.filter(p=>p.alcanceDesarrollo !== 'CAMBIO_SENCILLO' && Number(p.idEstatus)===7);
}

async function getTrazabilidad(id,login) {
  const detail=await getProyecto(id,login);
  if (!detail || Number(detail.idEstatus)!==7) throw new Error('El desarrollo no está finalizado.');
  const pool=await getPool();
  const [stages,history,files,hours,blocks,legacyStages,legacyNotes,milestones]=await Promise.all([
    pool.request().input('id',sql.Int,id).query("SELECT * FROM desarrollo_etapas WHERE origen='mesa' AND idEntidad=@id ORDER BY numeroEtapa"),
    pool.request().input('id',sql.Int,id).query("SELECT idCambio,loginUsuario,accion,datos,fechaRegistro FROM desarrollo_etapas_historial WHERE origen='mesa' AND idEntidad=@id ORDER BY fechaRegistro,idCambio"),
    pool.request().input('id',sql.Int,id).query('SELECT idArchivo,nombreArchivo,rutaServidor,mimeType,fechaSubida FROM solicitudTI_archivos WHERE idSolicitud=@id OR idProyecto IN (SELECT idProyecto FROM dev_proyectos WHERE idSolicitudOrigen=@id) ORDER BY fechaSubida'),
    pool.request().input('id',sql.Int,id).query('SELECT idRegistro,loginUsuario,nombreUsuario,minutosTrabajos,descripcion,fechaRegistro,fechaTrabajo FROM solicitudTI_desarrollo_horas WHERE idSolicitud=@id OR idProyecto IN (SELECT idProyecto FROM dev_proyectos WHERE idSolicitudOrigen=@id) ORDER BY fechaRegistro'),
    pool.request().input('id',sql.Int,id).query('SELECT idBloqueo,motivo,nombreRegistro,fechaBloqueo,fechaResolucion,resueltoPor FROM solicitudTI_desarrollo_bloqueos WHERE idSolicitud=@id OR idProyecto IN (SELECT idProyecto FROM dev_proyectos WHERE idSolicitudOrigen=@id) ORDER BY fechaBloqueo'),
    pool.request().input('id',sql.Int,id).query('SELECT e.* FROM dev_etapas_proyecto e JOIN dev_proyectos p ON p.idProyecto=e.idProyecto WHERE p.idSolicitudOrigen=@id ORDER BY e.numeroEtapa'),
    pool.request().input('id',sql.Int,id).query("SELECT a.idAvance AS idBitacora,a.nombreDesarrollador AS nombreUsuario,a.fechaRegistro AS fecha,a.queTermine AS nota FROM dev_avances a JOIN dev_proyectos p ON p.idProyecto=a.idProyecto WHERE p.idSolicitudOrigen=@id AND a.idEstado=2 ORDER BY a.fechaRegistro"),
    pool.request().input('id',sql.Int,id).query('SELECT h.* FROM dev_hitos h JOIN dev_proyectos p ON p.idProyecto=h.idProyecto WHERE p.idSolicitudOrigen=@id ORDER BY h.fechaCompromiso'),
  ]);
  return {...detail,hitos:milestones.recordset,adjuntos:files.recordset,horas:hours.recordset,bloqueos:blocks.recordset,
    bitacora:[...(detail.bitacora || []),...legacyNotes.recordset],
    etapas:[...legacyStages.recordset.filter(e=>!stages.recordset.some(s=>s.numeroEtapa===e.numeroEtapa)),...stages.recordset].sort((a,b)=>a.numeroEtapa-b.numeroEtapa),historialEtapas:history.recordset};
}
module.exports = { getPortafolio, getProyecto, guardarAvance, getFinalizados, getTrazabilidad };
