// ============================================================
// vigilancia.service.js
// Módulo: Vigilancia — Reporte de Novedades
// Portal Corporativo v4 · FABPSA
// Pool: DB_RHFABPSA (pool principal)
// ============================================================

const { getVigilanciaPool: getPool, sql } = require('../db.vigilancia')

// ── Control de acceso por área (sec_users.area) ──────────────────────────
// 'VIGILANCIA' (exacto) es el visor general: ve y crea reportes de TODOS
// los sitios. Las demás áreas quedan restringidas a un único sitio. Un área
// que no aparezca aquí (ej. 'SISTEMAS') no tiene acceso a ningún sitio.
const AREA_SITIO_CLAVE = {
  'VIGILANCIA ALERGENOS': 'ALERGENOS',
  'VIGILANCIA NA': 'NO_ALERGENOS',
  'VIGILANCIA FDNC': 'NO_CARNICOS',
  'VIGILANCIA AC': 'BODEGA_FV',
}
// Inverso — para armar la lista de "quién recibe el turno" por sitio.
const SITIO_CLAVE_AREA = Object.fromEntries(
  Object.entries(AREA_SITIO_CLAVE).map(([area, clave]) => [clave, area])
)
SITIO_CLAVE_AREA.SUR_121 = 'VIGILANCIA'

// Área especial para vigilantes que dan servicio en todos los sitios
// EXCEPTO SUR 121 (ej. Marco Cárdenas): ven/crean reportes de los 4 sitios
// y aparecen en el desplegable "Recibió" de cada uno de ellos.
const AREA_MULTISITIO = 'VIGILANCIA MULTISITIO'
const CLAVES_MULTISITIO = Object.values(AREA_SITIO_CLAVE)

function _normalizaArea(area) {
  // Quita acentos (NFD + strip de marcas combinadas) para que 'Alérgenos'
  // y 'Alergenos' (como se haya tecleado en sec_users) empaten igual.
  return (area || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Resuelve qué puede ver/crear el usuario en Vigilancia según su área —
 * salvo que tenga el flag esAdmin para este módulo en
 * portal_usuario_modulos (administración de accesos), en cuyo caso ve todo
 * sin importar su área — pensado para poder hacer pruebas o dar soporte
 * desde cualquier área (ej. Sistemas) sin tener que cambiarle el área real.
 * { general: true }               → todos los sitios (área 'VIGILANCIA' o esAdmin)
 * { general: false, clave: 'X' }  → solo el sitio con esa clave
 * { general: false, clave: null } → ningún sitio (área sin mapeo)
 */
async function resolveAccesoVigilancia(user) {
  const area = _normalizaArea(user?.area)
  if (area === 'VIGILANCIA') return { general: true }

  if (user?.login) {
    const db = await getPool()
    const adminRes = await db.request()
      .input('login', sql.VarChar(255), user.login)
      .query(`
        SELECT TOP 1 pum.esAdmin
        FROM portal_usuario_modulos pum
        INNER JOIN portal_modulos pm ON pm.idModulo = pum.idModulo
        WHERE pum.login = @login AND pm.clave = 'vigilancia'
      `)
    if (adminRes.recordset[0]?.esAdmin) return { general: true }
  }

  if (area === AREA_MULTISITIO) return { general: false, claves: CLAVES_MULTISITIO }

  const clave = AREA_SITIO_CLAVE[area] || null
  return { general: false, claves: clave ? [clave] : [] }
}

const JEFE_VIGILANCIA_SUR_121_LOGIN = 'JOLVERA'


// ────────────────────────────────────────────────────────────
// UTILIDADES INTERNAS
// ────────────────────────────────────────────────────────────

/**
 * Genera el siguiente folio IAF-XXXXXX a partir del máximo existente.
 * Usa una transacción para evitar duplicados en concurrencia.
 */
async function _generarFolio(transaction) {
  const result = await transaction.request().query(`
    SELECT TOP 1 folioReporte
    FROM vig_reportes WITH (UPDLOCK, HOLDLOCK)
    ORDER BY idReporte DESC
  `)

  if (!result.recordset.length) return 'IAF-000001'

  const ultimo = result.recordset[0].folioReporte // 'IAF-000093'
  const num = parseInt(ultimo.replace('IAF-', ''), 10) + 1
  return 'IAF-' + String(num).padStart(6, '0')
}

// ── Kilometraje centralizado (vig_km_lecturas) ────────────────────────────
// El km se lleva por unidad del catálogo (vig_vehiculos), no por renglón de
// sitio: el mismo camión tiene un idVehiculo distinto en cada sitio pero un
// solo idVehiculoCatalogo. Cada captura se guarda al momento (no al cerrar
// el reporte) y el último km válido es el MAX de las lecturas no anuladas.

const KM_TIPO = { SALIDA: 1, ENTRADA: 2, INICIAL: 3, AJUSTE: 4 }

/**
 * Última lectura válida de una unidad, opcionalmente excluyendo las del
 * propio renglón (para que corregir el km de un renglón no se compare
 * contra sí mismo). Devuelve { km, sitio, fechaRegistro } o null.
 */
async function _ultimaLecturaKm(request, idVehiculoCatalogo, excluirIdVehiculoRep = null) {
  const r = await request
    .input('idCatUlt',  sql.Int, idVehiculoCatalogo)
    .input('idRepExcl', sql.Int, excluirIdVehiculoRep)
    .query(`
      SELECT TOP 1 l.km, s.nombre AS sitio, l.fechaRegistro
      FROM vig_km_lecturas l
      LEFT JOIN vig_sitios s ON s.idSitio = l.idSitio
      WHERE l.idVehiculoCatalogo = @idCatUlt
        AND l.anulada = 0
        AND (@idRepExcl IS NULL OR l.idVehiculoRep IS NULL OR l.idVehiculoRep <> @idRepExcl)
      ORDER BY l.km DESC, l.idLectura DESC
    `)
  return r.recordset[0] || null
}

/**
 * Deja como vigente la lectura `km` del renglón para el tipo dado: anula
 * la anterior (si había) e inserta la nueva. km = null solo anula.
 */
async function _registrarLecturaKm(transaction, { idVehiculoCatalogo, idVehiculoRep, idReporte, idSitio, tipo, km, login }) {
  await transaction.request()
    .input('idVehiculoRep', sql.Int,          idVehiculoRep)
    .input('tipo',          sql.TinyInt,      tipo)
    .input('login',         sql.VarChar(255), login)
    .query(`
      UPDATE vig_km_lecturas SET
        anulada         = 1,
        motivoAnulacion = N'Corregida desde el reporte',
        loginAnulacion  = @login,
        fechaAnulacion  = GETDATE()
      WHERE idVehiculoRep = @idVehiculoRep AND tipo = @tipo AND anulada = 0
    `)

  if (km == null) return

  await transaction.request()
    .input('idVehiculoCatalogo', sql.Int,          idVehiculoCatalogo)
    .input('idVehiculoRep',      sql.Int,          idVehiculoRep)
    .input('idReporte',          sql.Int,          idReporte)
    .input('idSitio',            sql.Int,          idSitio)
    .input('tipo',               sql.TinyInt,      tipo)
    .input('km',                 sql.Int,          km)
    .input('login',              sql.VarChar(255), login)
    .query(`
      INSERT INTO vig_km_lecturas
        (idVehiculoCatalogo, idVehiculoRep, idReporte, idSitio, tipo, km, loginUsuario)
      VALUES (@idVehiculoCatalogo, @idVehiculoRep, @idReporte, @idSitio, @tipo, @km, @login)
    `)
}

/**
 * Bloquea la unidad del catálogo hasta el fin de la transacción, para que
 * dos vigilantes que capturan km de la misma unidad a la vez se validen
 * uno después del otro (y no ambos contra el mismo "último km").
 */
async function _bloquearUnidadKm(transaction, idVehiculoCatalogo) {
  await transaction.request()
    .input('idVehiculoCatalogo', sql.Int, idVehiculoCatalogo)
    .query(`
      SELECT idVehiculoCatalogo
      FROM vig_vehiculos WITH (UPDLOCK, HOLDLOCK)
      WHERE idVehiculoCatalogo = @idVehiculoCatalogo
    `)
}

function _fmtKm(n) {
  return Number(n).toLocaleString('es-MX')
}

function _detalleUltimaLectura(ult) {
  const partes = []
  if (ult.sitio) partes.push(`en ${ult.sitio}`)
  if (ult.fechaRegistro) {
    partes.push(new Date(ult.fechaRegistro).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }))
  }
  return partes.length ? ` (${partes.join(', ')})` : ''
}

// ────────────────────────────────────────────────────────────
// CONFIGURACIÓN / CATÁLOGOS
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/sitios
 * Devuelve todos los sitios activos con su configuración.
 */
async function getSitios(req, res) {
  try {
    const acceso = await resolveAccesoVigilancia(req.user)
    const db = await getPool()
    const request = db.request()
    let where = 'WHERE activo = 1'
    if (!acceso.general) {
      if (!acceso.claves.length) return res.json({ ok: true, data: [] })
      const placeholders = acceso.claves.map((c, i) => {
        request.input(`clave${i}`, sql.VarChar(30), c)
        return `@clave${i}`
      }).join(',')
      where += ` AND clave IN (${placeholders})`
    }
    const result = await request.query(`
      SELECT
        idSitio, clave, nombre, encabezadoPDF, dirigidoA,
        horarioOpInicio, horarioOpFin, numRondines,
        tieneSiniestrosSimple, tieneSiniestrosEstructura,
        tieneUbicacionIncidencia, tieneObservacionesGen,
        tienePersonalDespues, posPersonalDespues,
        etiquetaEnterado, vehiculosManuales
      FROM vig_sitios
      ${where}
      ORDER BY nombre
    `)
    res.json({ ok: true, data: result.recordset })
  } catch (err) {
    console.error('[vigilancia.service] getSitios:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * GET /api/vigilancia/config/:idSitio
 * Devuelve la configuración completa del sitio:
 * sitio + ejecutivos + vehículos + rondines + último km por vehículo.
 */
async function getConfigSitio(req, res) {
  try {
    const idSitio = parseInt(req.params.idSitio)
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0]
    const db = await getPool()

    // Sitio
    const sitioRes = await db.request()
      .input('idSitio', sql.Int, idSitio)
      .query(`
        SELECT
          idSitio, clave, nombre, encabezadoPDF, dirigidoA,
          horarioOpInicio, horarioOpFin, numRondines,
          tieneSiniestrosSimple, tieneSiniestrosEstructura,
          tieneUbicacionIncidencia, tieneObservacionesGen,
          tienePersonalDespues, posPersonalDespues,
          etiquetaEnterado, vehiculosManuales
        FROM vig_sitios
        WHERE idSitio = @idSitio AND activo = 1
      `)

    if (!sitioRes.recordset.length) {
      return res.status(404).json({ ok: false, error: 'Sitio no encontrado' })
    }

    // Ejecutivos
    const ejecutivosRes = await db.request()
      .input('idSitio', sql.Int, idSitio)
      .query(`
        SELECT idEjecutivo, nombre, puesto, orden
        FROM vig_config_ejecutivos
        WHERE idSitio = @idSitio AND activo = 1
        ORDER BY orden
      `)

    // Vehículos + último km heredado
    const vehiculosRes = await db.request()
      .input('idSitio', sql.Int, idSitio)
      .input('fecha', sql.Date, fecha)
      .query(`
        SELECT
          v.idVehiculo, v.numero, v.descripcion, v.esFijo, v.orden,
          -- Último km válido de la unidad, capturado en cualquier sitio
          (
            SELECT MAX(l.km)
            FROM vig_km_lecturas l
            WHERE l.idVehiculoCatalogo = v.idVehiculoCatalogo
              AND l.anulada = 0
          ) AS kmHeredado
        FROM vig_config_vehiculos v
        WHERE v.idSitio = @idSitio AND v.activo = 1
        ORDER BY v.orden
      `)

    // Rondines configurados
    const rondinesRes = await db.request()
      .input('idSitio', sql.Int, idSitio)
      .query(`
        SELECT idRondinConfig, orden, etiqueta, horaReferencia
        FROM vig_config_rondines
        WHERE idSitio = @idSitio
        ORDER BY orden
      `)

    res.json({
      ok: true,
      data: {
        sitio:      sitioRes.recordset[0],
        ejecutivos: ejecutivosRes.recordset,
        vehiculos:  vehiculosRes.recordset,
        rondines:   rondinesRes.recordset
      }
    })
  } catch (err) {
    console.error('[vigilancia.service] getConfigSitio:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// REPORTES
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/reportes
 * Lista de reportes con filtros opcionales.
 * Query params: idSitio, estatus, fechaDesde, fechaHasta, pagina, limite
 */
async function getReportes(req, res) {
  try {
    const acceso = await resolveAccesoVigilancia(req.user)
    if (!acceso.general && !acceso.claves.length) {
      return res.json({ ok: true, data: [], total: 0, pagina: 1, limite: 20 })
    }

    const {
      estatus,
      fechaDesde, fechaHasta,
      pagina = 1, limite = 20
    } = req.query
    // Un usuario restringido solo puede listar los sitios de su acceso — se
    // fuerza aquí, ignorando cualquier idSitio que venga en la query fuera
    // de ese conjunto, para que no pueda pedir el de otro sitio.
    let idSitiosFiltro = null // null = sin restricción (acceso general)
    if (!acceso.general) {
      const reqSitios = (await getPool()).request()
      const placeholders = acceso.claves.map((c, i) => {
        reqSitios.input(`c${i}`, sql.VarChar(30), c)
        return `@c${i}`
      }).join(',')
      const sitiosRes = await reqSitios.query(`SELECT idSitio FROM vig_sitios WHERE clave IN (${placeholders})`)
      const idsPermitidos = sitiosRes.recordset.map(r => r.idSitio)
      if (!idsPermitidos.length) return res.json({ ok: true, data: [], total: 0, pagina: 1, limite: 20 })
      if (req.query.idSitio) {
        const pedido = parseInt(req.query.idSitio)
        if (!idsPermitidos.includes(pedido)) return res.json({ ok: true, data: [], total: 0, pagina: 1, limite: 20 })
        idSitiosFiltro = [pedido]
      } else {
        idSitiosFiltro = idsPermitidos
      }
    } else if (req.query.idSitio) {
      idSitiosFiltro = [parseInt(req.query.idSitio)]
    }

    const offset = (parseInt(pagina) - 1) * parseInt(limite)
    const db = await getPool()

    // Mismos inputs/condiciones aplicados a las dos queries (datos + total)
    // para no repetir el WHERE armado a mano con interpolación de texto.
    const filtros = []
    const aplicarInputs = (request) => {
      request.input('offset', sql.Int, offset).input('limite', sql.Int, parseInt(limite))
      if (idSitiosFiltro && idSitiosFiltro.length) {
        const ph = idSitiosFiltro.map((id, i) => {
          request.input(`idSitio${i}`, sql.Int, id)
          return `@idSitio${i}`
        }).join(',')
        filtros.push(`r.idSitio IN (${ph})`)
      }
      if (estatus) { request.input('estatus', sql.TinyInt, parseInt(estatus)); filtros.push('r.estatus = @estatus') }
      if (fechaDesde) { request.input('fechaDesde', sql.Date, fechaDesde); filtros.push('r.fechaInicio >= @fechaDesde') }
      if (fechaHasta) { request.input('fechaHasta', sql.Date, fechaHasta); filtros.push('r.fechaInicio <= @fechaHasta') }
    }

    const dataRequest = db.request()
    aplicarInputs(dataRequest)
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''

    const result = await dataRequest.query(`
      SELECT
        r.idReporte, r.folioReporte, r.idSitio,
        s.nombre AS nombreSitio,
        r.fechaInicio, r.horaInicio, r.fechaFin, r.horaFin,
        r.turno, r.estatus, r.reporto, r.recibio,
        r.loginRegistro, r.fechaRegistro,
        r.loginCierre, r.fechaCierre,
        u.name AS nombreRegistro
      FROM vig_reportes r
      INNER JOIN vig_sitios s ON s.idSitio = r.idSitio
      INNER JOIN sec_users u ON u.login = r.loginRegistro
      ${where}
      ORDER BY r.idReporte DESC
      OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `)

    // Total para paginación — mismos filtros parametrizados, no interpolados.
    filtros.length = 0
    const countRequest = db.request()
    aplicarInputs(countRequest)
    const whereCount = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM vig_reportes r
      ${whereCount}
    `)

    res.json({
      ok: true,
      data: result.recordset,
      total: countResult.recordset[0].total,
      pagina: parseInt(pagina),
      limite: parseInt(limite)
    })
  } catch (err) {
    console.error('[vigilancia.service] getReportes:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * Arma el objeto completo de un reporte (todas sus secciones) — usado
 * tanto por el GET de detalle como por el generador de PDF, para no
 * mantener la misma consulta duplicada en dos lugares.
 * Devuelve null si el reporte no existe.
 */
async function _fetchReporteCompleto(idReporte) {
    const db = await getPool()

    // Cabecera
    const repRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT
          r.idReporte, r.folioReporte, r.idSitio,
          s.clave AS claveSitio,
          s.nombre AS nombreSitio, s.encabezadoPDF, s.dirigidoA,
          s.tieneSiniestrosSimple, s.tieneSiniestrosEstructura,
          s.tieneUbicacionIncidencia, s.tieneObservacionesGen,
          s.tienePersonalDespues, s.etiquetaEnterado,
          s.horarioOpInicio, s.horarioOpFin,
          r.fechaInicio, r.horaInicio, r.fechaFin, r.horaFin,
          r.observacionesGenerales, r.estatus,
          r.reporto, r.recibio, r.enterado1, r.enterado2,
          r.loginRegistro, r.fechaRegistro, r.loginCierre, r.fechaCierre
        FROM vig_reportes r
        INNER JOIN vig_sitios s ON s.idSitio = r.idSitio
        WHERE r.idReporte = @idReporte
      `)

    if (!repRes.recordset.length) {
      return null
    }

    // Personal
    const personalRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT
          idPersonalRep, deptAdministracion, deptAlmacen, deptReparto,
          retardos, faltas, incapacitados, pasesAutorizados,
          personalExtraNum, personalExtraDepts, autorizadoPor, horarioAutorizado
        FROM vig_personal_reporte
        WHERE idReporte = @idReporte
      `)

    // Ejecutivos + movimientos
    const ejecutivosRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT
          er.idEjecutivoRep, er.idEjecutivo,
          COALESCE(ce.nombre, er.nombreManual) AS nombre,
          COALESCE(ce.puesto, er.puestoManual) AS puesto,
          er.observaciones, er.orden
        FROM vig_ejecutivos_reporte er
        LEFT JOIN vig_config_ejecutivos ce ON ce.idEjecutivo = er.idEjecutivo
        WHERE er.idReporte = @idReporte
        ORDER BY er.orden
      `)

    const movEjecRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT em.idMovEjec, em.idEjecutivoRep, em.tipo, em.hora, em.orden
        FROM vig_ejecutivos_movimientos em
        INNER JOIN vig_ejecutivos_reporte er ON er.idEjecutivoRep = em.idEjecutivoRep
        WHERE er.idReporte = @idReporte
        ORDER BY em.idEjecutivoRep, em.orden
      `)

    // Agrupar movimientos por ejecutivo
    const movEjecMap = {}
    movEjecRes.recordset.forEach(m => {
      if (!movEjecMap[m.idEjecutivoRep]) movEjecMap[m.idEjecutivoRep] = []
      movEjecMap[m.idEjecutivoRep].push(m)
    })
    const ejecutivos = ejecutivosRes.recordset.map(e => ({
      ...e,
      movimientos: movEjecMap[e.idEjecutivoRep] || []
    }))

    // Vehículos + movimientos
    const vehiculosRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT
          vr.idVehiculoRep, vr.idVehiculo,
          COALESCE(cv.numero, vr.numeroManual) AS numero,
          cv.descripcion, cv.esFijo,
          vr.kmSalida, vr.kmEntrada, vr.kmRecorridos,
          vr.kmInicialHeredado, vr.estado, vr.observacion, vr.orden,
          -- Último km válido de la unidad capturado fuera de este renglón
          -- (cualquier sitio/turno, sin esperar cierres): sugerencia de km salida
          ult.km AS kmUltimo, ult.sitio AS kmUltimoSitio, ult.fechaRegistro AS kmUltimoFecha
        FROM vig_vehiculos_reporte vr
        LEFT JOIN vig_config_vehiculos cv ON cv.idVehiculo = vr.idVehiculo
        OUTER APPLY (
          SELECT TOP 1 l.km, s.nombre AS sitio, l.fechaRegistro
          FROM vig_km_lecturas l
          LEFT JOIN vig_sitios s ON s.idSitio = l.idSitio
          WHERE l.idVehiculoCatalogo = cv.idVehiculoCatalogo
            AND l.anulada = 0
            AND (l.idVehiculoRep IS NULL OR l.idVehiculoRep <> vr.idVehiculoRep)
          ORDER BY l.km DESC, l.idLectura DESC
        ) ult
        WHERE vr.idReporte = @idReporte
        ORDER BY vr.orden
      `)

    const movVehRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT vm.idMovVehiculo, vm.idVehiculoRep, vm.tipo, vm.hora, vm.orden
        FROM vig_vehiculos_movimientos vm
        INNER JOIN vig_vehiculos_reporte vr ON vr.idVehiculoRep = vm.idVehiculoRep
        WHERE vr.idReporte = @idReporte
        ORDER BY vm.idVehiculoRep, vm.orden
      `)

    const movVehMap = {}
    movVehRes.recordset.forEach(m => {
      if (!movVehMap[m.idVehiculoRep]) movVehMap[m.idVehiculoRep] = []
      movVehMap[m.idVehiculoRep].push(m)
    })
    const vehiculos = vehiculosRes.recordset.map(v => ({
      ...v,
      movimientos: movVehMap[v.idVehiculoRep] || []
    }))

    // Rondines
    const rondinesRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT
          rr.idRondinRep, rr.idRondinConfig,
          COALESCE(rc.etiqueta, rr.area) AS etiqueta,
          rc.horaReferencia,
          rr.area, rr.observaciones, rr.orden
        FROM vig_rondines_reporte rr
        LEFT JOIN vig_config_rondines rc ON rc.idRondinConfig = rr.idRondinConfig
        WHERE rr.idReporte = @idReporte
        ORDER BY rr.orden
      `)

    // Ubicaciones (solo SUR 121) + unidades asignadas (M:N)
    const ubicRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT idUbicacionRep, destino, observaciones, orden
        FROM vig_ubicacion_reporte
        WHERE idReporte = @idReporte
        ORDER BY orden
      `)

    const ubicVehRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT urv.idUbicacionRep, cv.idVehiculo, cv.numero
        FROM vig_ubicacion_reporte_vehiculos urv
        INNER JOIN vig_ubicacion_reporte ur ON ur.idUbicacionRep = urv.idUbicacionRep
        INNER JOIN vig_config_vehiculos cv ON cv.idVehiculo = urv.idVehiculo
        WHERE ur.idReporte = @idReporte
        ORDER BY cv.numero
      `)

    const ubicVehMap = {}
    ubicVehRes.recordset.forEach(uv => {
      if (!ubicVehMap[uv.idUbicacionRep]) ubicVehMap[uv.idUbicacionRep] = []
      ubicVehMap[uv.idUbicacionRep].push({ idVehiculo: uv.idVehiculo, numero: uv.numero })
    })
    const ubicaciones = ubicRes.recordset.map(u => ({
      ...u,
      vehiculos: ubicVehMap[u.idUbicacionRep] || []
    }))

    // Siniestros
    const sinRes = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT
          sr.idSiniestroRep, sr.idVehiculo,
          COALESCE(cv.numero, sr.numeroManual) AS numero,
          sr.camposExtra, sr.orden
        FROM vig_siniestros_reporte sr
        LEFT JOIN vig_config_vehiculos cv ON cv.idVehiculo = sr.idVehiculo
        WHERE sr.idReporte = @idReporte
        ORDER BY sr.orden
      `)

    // Parsear JSON en siniestros
    const siniestros = sinRes.recordset.map(s => ({
      ...s,
      camposExtra: (() => { try { return JSON.parse(s.camposExtra) } catch { return {} } })()
    }))

    // Vigilantes para el desplegable "Recibió" y el bloque de
    // responsables/firmas — los usuarios cuya área (sec_users.area)
    // corresponde al sitio de este reporte (ver SITIO_CLAVE_AREA).
    let vigilantesRecibio = []
    const claveDelSitio = repRes.recordset[0].claveSitio
    const areaDelSitio = SITIO_CLAVE_AREA[claveDelSitio]
    if (areaDelSitio) {
      // Además del área propia del sitio, se incluyen los vigilantes
      // "multisitio" (dan servicio en todos los sitios salvo SUR 121).
      const incluirMultisitio = claveDelSitio !== 'SUR_121'
      const vigRes = await db.request()
        .input('area', sql.NVarChar(100), areaDelSitio)
        .input('areaMultisitio', sql.NVarChar(100), AREA_MULTISITIO)
        .query(`
          SELECT u.login, u.name, f.rutaArchivo
          FROM sec_users u
          LEFT JOIN vig_firmas f ON f.login = u.login
          WHERE LTRIM(RTRIM(u.area)) COLLATE Latin1_General_CI_AI = @area COLLATE Latin1_General_CI_AI
          ${incluirMultisitio ? "OR LTRIM(RTRIM(u.area)) COLLATE Latin1_General_CI_AI = @areaMultisitio COLLATE Latin1_General_CI_AI" : ''}
        `)
      vigilantesRecibio = vigRes.recordset.map(v => ({
        ...v,
        esJefeVigilancia: v.login === JEFE_VIGILANCIA_SUR_121_LOGIN
      }))
    }

    // Unidades de la sección Ubicación e Incidencia: SUR 121 es la fuente de verdad para todos los sitios
    const catalogoUbicacionRes = await db.request().query(`
      SELECT v.idVehiculo, v.numero
      FROM vig_config_vehiculos v
      INNER JOIN vig_sitios s ON s.idSitio = v.idSitio
      WHERE s.clave = 'SUR_121' AND v.activo = 1 AND v.numero <> ''
      ORDER BY v.orden
    `)

    return {
      reporte:    repRes.recordset[0],
      personal:   personalRes.recordset[0] || null,
      ejecutivos,
      vehiculos,
      rondines:   rondinesRes.recordset,
      ubicaciones,
      catalogoUbicacion: catalogoUbicacionRes.recordset,
      siniestros,
      vigilantesRecibio
    }
}

/**
 * GET /api/vigilancia/reportes/:idReporte
 * Detalle completo de un reporte con todas sus secciones.
 */
async function getReporteById(req, res) {
  try {
    const idReporte = parseInt(req.params.idReporte)
    const data = await _fetchReporteCompleto(idReporte)
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Reporte no encontrado' })
    }
    res.json({ ok: true, data })
  } catch (err) {
    console.error('[vigilancia.service] getReporteById:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * POST /api/vigilancia/reportes
 * Crea un nuevo reporte en BORRADOR.
 * Inicializa automáticamente:
 *  - filas de ejecutivos (del catálogo del sitio)
 *  - filas de vehículos (del catálogo, con km heredado)
 *  - filas de rondines (del catálogo del sitio)
 *  - fila de personal vacía
 *  - filas de ubicaciones (si tieneUbicacionIncidencia)
 * Body: { idSitio, fechaInicio, horaInicio, fechaFin, horaFin, reporto }
 */
async function crearReporte(req, res) {
  const { idSitio, fechaInicio, horaInicio, fechaFin, horaFin, turno } = req.body
  const login = req.user.login
  // "Reportó" siempre es quien está logueado creando el reporte — no se
  // captura manualmente ni se puede sobreescribir.
  const reporto = req.user.name

  if (!idSitio || !fechaInicio) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos (idSitio, fechaInicio)' })
  }

  const acceso = await resolveAccesoVigilancia(req.user)
  if (!acceso.general) {
    if (!acceso.claves.length) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a Vigilancia' })
    }
    const reqSitios = (await getPool()).request()
    const placeholders = acceso.claves.map((c, i) => {
      reqSitios.input(`c${i}`, sql.VarChar(30), c)
      return `@c${i}`
    }).join(',')
    const sitiosPermitidos = await reqSitios.query(`SELECT idSitio FROM vig_sitios WHERE clave IN (${placeholders})`)
    const idsPermitidos = sitiosPermitidos.recordset.map(r => r.idSitio)
    if (!idsPermitidos.includes(parseInt(idSitio))) {
      return res.status(403).json({ ok: false, error: 'No puedes crear reportes para ese sitio' })
    }
  }

  const db = await getPool()
  const transaction = new sql.Transaction(db)

  try {
    await transaction.begin()

    // 1. Generar folio
    const folio = await _generarFolio(transaction)

    // 2. Crear reporte principal (horas y fechaFin pueden ser null en borrador)
    const repRes = await transaction.request()
      .input('folio',        sql.VarChar(20),     folio)
      .input('idSitio',      sql.Int,             parseInt(idSitio))
      .input('fechaInicio',  sql.Date,            fechaInicio)
      .input('horaInicio',   sql.VarChar(5),      horaInicio || null)
      .input('fechaFin',     sql.Date,            fechaFin || null)
      .input('horaFin',      sql.VarChar(5),      horaFin || null)
      .input('reporto',      sql.NVarChar(200),   reporto || null)
      .input('turno',        sql.NVarChar(20),    turno || null)
      .input('login',        sql.VarChar(255),    login)
      .query(`
        INSERT INTO vig_reportes
          (folioReporte, idSitio, fechaInicio, horaInicio, fechaFin, horaFin, reporto, turno, loginRegistro)
        OUTPUT INSERTED.idReporte
        VALUES (@folio, @idSitio, @fechaInicio, @horaInicio, @fechaFin, @horaFin, @reporto, @turno, @login)
      `)

    const idReporte = repRes.recordset[0].idReporte

    // 3. Personal vacío
    await transaction.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        INSERT INTO vig_personal_reporte (idReporte)
        VALUES (@idReporte)
      `)

    // 4. Ejecutivos del catálogo
    const ejecutivos = await transaction.request()
      .input('idSitio', sql.Int, parseInt(idSitio))
      .query(`
        SELECT idEjecutivo, orden
        FROM vig_config_ejecutivos
        WHERE idSitio = @idSitio AND activo = 1
        ORDER BY orden
      `)

    for (const ej of ejecutivos.recordset) {
      await transaction.request()
        .input('idReporte',   sql.Int, idReporte)
        .input('idEjecutivo', sql.Int, ej.idEjecutivo)
        .input('orden',       sql.Int, ej.orden)
        .query(`
          INSERT INTO vig_ejecutivos_reporte (idReporte, idEjecutivo, orden)
          VALUES (@idReporte, @idEjecutivo, @orden)
        `)
    }

    // 5. Vehículos del catálogo. El km salida NO se copia aquí: una copia
    // tomada al crear el reporte se queda vieja en cuanto otro sitio captura
    // km de la unidad. Se sugiere en vivo al consultar el reporte (kmUltimo)
    // y se guarda cuando el vigilante lo captura o registra la salida.
    const vehiculos = await transaction.request()
      .input('idSitio', sql.Int, parseInt(idSitio))
      .query(`
        SELECT idVehiculo, numero, esFijo, orden
        FROM vig_config_vehiculos
        WHERE idSitio = @idSitio AND activo = 1
        ORDER BY orden
      `)

    for (const veh of vehiculos.recordset) {
      await transaction.request()
        .input('idReporte',  sql.Int, idReporte)
        .input('idVehiculo', sql.Int, veh.idVehiculo)
        .input('orden',      sql.Int, veh.orden)
        .query(`
          INSERT INTO vig_vehiculos_reporte
            (idReporte, idVehiculo, kmSalida, kmInicialHeredado, estado, orden)
          VALUES (@idReporte, @idVehiculo, NULL, 0, 1, @orden)
        `)
    }

    // 6. Rondines del catálogo
    const rondines = await transaction.request()
      .input('idSitio', sql.Int, parseInt(idSitio))
      .query(`
        SELECT idRondinConfig, etiqueta, orden
        FROM vig_config_rondines
        WHERE idSitio = @idSitio
        ORDER BY orden
      `)

    for (const ron of rondines.recordset) {
      await transaction.request()
        .input('idReporte',      sql.Int,          idReporte)
        .input('idRondinConfig', sql.Int,          ron.idRondinConfig)
        .input('area',           sql.NVarChar(100), 'General')
        .input('observaciones',  sql.NVarChar(sql.MAX), 'SIN NOVEDAD')
        .input('orden',          sql.TinyInt,      ron.orden)
        .query(`
          INSERT INTO vig_rondines_reporte (idReporte, idRondinConfig, area, observaciones, orden)
          VALUES (@idReporte, @idRondinConfig, @area, @observaciones, @orden)
        `)
    }

    // 7. Ubicaciones iniciales (solo SUR 121 — tieneUbicacionIncidencia=1)
    const sitioRes = await transaction.request()
      .input('idSitio', sql.Int, parseInt(idSitio))
      .query(`SELECT tieneUbicacionIncidencia FROM vig_sitios WHERE idSitio = @idSitio`)

    if (sitioRes.recordset[0]?.tieneUbicacionIncidencia) {
      const destinosRes = await transaction.request()
        .input('idSitio', sql.Int, parseInt(idSitio))
        .query(`
          SELECT idDestino, nombre, orden
          FROM vig_config_destinos
          WHERE idSitio = @idSitio AND activo = 1
          ORDER BY orden
        `)

      for (const dest of destinosRes.recordset) {
        const ubicRes = await transaction.request()
          .input('idReporte', sql.Int,          idReporte)
          .input('destino',   sql.NVarChar(100), dest.nombre)
          .input('orden',     sql.Int,          dest.orden)
          .query(`
            INSERT INTO vig_ubicacion_reporte (idReporte, destino, orden)
            OUTPUT INSERTED.idUbicacionRep
            VALUES (@idReporte, @destino, @orden)
          `)
        const idUbicacionRep = ubicRes.recordset[0].idUbicacionRep

        // Prellenar con la asignación vigente (vigenteHasta IS NULL) del destino
        const defaultVehRes = await transaction.request()
          .input('idDestino', sql.Int, dest.idDestino)
          .query(`
            SELECT idVehiculo
            FROM vig_config_destino_vehiculos
            WHERE idDestino = @idDestino AND vigenteHasta IS NULL
          `)

        for (const dv of defaultVehRes.recordset) {
          await transaction.request()
            .input('idUbicacionRep', sql.Int, idUbicacionRep)
            .input('idVehiculo',     sql.Int, dv.idVehiculo)
            .query(`
              INSERT INTO vig_ubicacion_reporte_vehiculos (idUbicacionRep, idVehiculo)
              VALUES (@idUbicacionRep, @idVehiculo)
            `)
        }
      }
    }

    await transaction.commit()

    res.json({ ok: true, data: { idReporte, folioReporte: folio } })
  } catch (err) {
    await transaction.rollback()
    console.error('[vigilancia.service] crearReporte:', err)
    res.status(500).json({ ok: false, error: 'Error al crear el reporte' })
  }
}

/**
 * PATCH /api/vigilancia/reportes/:idReporte/recibio
 * Fija quién recibió el turno — seleccionable en cualquier momento
 * mientras el reporte esté en BORRADOR (no solo al cerrarlo).
 * Body: { recibio }
 */
async function updateRecibio(req, res) {
  try {
    const idReporte = parseInt(req.params.idReporte)
    const { recibio } = req.body

    const db = await getPool()
    await db.request()
      .input('idReporte', sql.Int, idReporte)
      .input('recibio',   sql.NVarChar(200), recibio || null)
      .query(`
        UPDATE vig_reportes SET recibio = @recibio
        WHERE idReporte = @idReporte AND estatus = 1
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updateRecibio:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * PATCH /api/vigilancia/reportes/:idReporte/cabecera
 * Actualiza datos del turno (fecha, hora, responsables).
 * Solo en BORRADOR.
 */
async function updateCabecera(req, res) {
  try {
    const idReporte = parseInt(req.params.idReporte)
    const { fechaInicio, horaInicio, fechaFin, horaFin, observacionesGenerales } = req.body
    // "reporto" NO se edita aquí: es fijo desde la creación (quien está
    // logueado). "recibio"/"enterado1" se fijan solo al cerrar el reporte.

    const db = await getPool()
    await db.request()
      .input('idReporte',             sql.Int,          idReporte)
      .input('fechaInicio',           sql.Date,         fechaInicio)
      .input('horaInicio',            sql.VarChar(5),   horaInicio)
      .input('fechaFin',              sql.Date,         fechaFin)
      .input('horaFin',               sql.VarChar(5),   horaFin)
      .input('observacionesGenerales',sql.NVarChar(sql.MAX), observacionesGenerales ?? null)
      .query(`
        UPDATE vig_reportes SET
          fechaInicio            = COALESCE(@fechaInicio, fechaInicio),
          horaInicio             = COALESCE(@horaInicio, horaInicio),
          fechaFin               = COALESCE(@fechaFin, fechaFin),
          horaFin                = COALESCE(@horaFin, horaFin),
          observacionesGenerales = COALESCE(@observacionesGenerales, observacionesGenerales)
        WHERE idReporte = @idReporte AND estatus = 1
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updateCabecera:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * POST /api/vigilancia/reportes/:idReporte/cerrar
 * Cierra el reporte: cambia estatus a 2 y registra auditoría de km.
 * Body: { recibio }
 */
async function cerrarReporte(req, res) {
  const idReporte = parseInt(req.params.idReporte)
  const login = req.user.login
  const { recibio } = req.body

  const db = await getPool()
  const transaction = new sql.Transaction(db)

  try {
    await transaction.begin()

    // Verificar que existe y está en BORRADOR
    const repRes = await transaction.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT r.idReporte, r.estatus, s.clave AS claveSitio
        FROM vig_reportes r
        INNER JOIN vig_sitios s ON s.idSitio = r.idSitio
        WHERE r.idReporte = @idReporte
      `)

    if (!repRes.recordset.length) {
      await transaction.rollback()
      return res.status(404).json({ ok: false, error: 'Reporte no encontrado' })
    }
    if (repRes.recordset[0].estatus !== 1) {
      await transaction.rollback()
      return res.status(400).json({ ok: false, error: 'El reporte ya está cerrado' })
    }

    // "Enterado — Jefe de Vigilancia": es el mismo jefe para todos los sitios
    const jefeRes = await transaction.request()
      .input('login', sql.VarChar(255), JEFE_VIGILANCIA_SUR_121_LOGIN)
      .query(`SELECT name FROM sec_users WHERE login = @login`)
    const enterado1 = jefeRes.recordset[0]?.name || null

    // "Recibió" es obligatorio en sitios que tienen vigilantes configurados.
    // Se valida contra el valor que quedará guardado (el enviado o el ya
    // registrado), no contra lo que vio el navegador en ese momento.
    const actualRes = await transaction.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`SELECT recibio FROM vig_reportes WHERE idReporte = @idReporte`)
    const recibioFinal = recibio || actualRes.recordset[0]?.recibio || null
    if (SITIO_CLAVE_AREA[repRes.recordset[0].claveSitio] && !recibioFinal) {
      await transaction.rollback()
      return res.status(400).json({ ok: false, error: 'Selecciona quién recibió el turno antes de cerrar' })
    }

    // Cerrar reporte
    await transaction.request()
      .input('idReporte',  sql.Int,          idReporte)
      .input('login',      sql.VarChar(255), login)
      .input('recibio',    sql.NVarChar(200), recibioFinal)
      .input('enterado1',  sql.NVarChar(200), enterado1)
      .query(`
        UPDATE vig_reportes SET
          estatus      = 2,
          loginCierre  = @login,
          fechaCierre  = GETDATE(),
          recibio      = @recibio,
          enterado1    = COALESCE(@enterado1, enterado1)
        WHERE idReporte = @idReporte
      `)

    // Unidades sin km salida capturado (no se movieron en el turno): el
    // reporte firmado muestra su último km válido al momento del cierre.
    // Es una copia para el documento, no una lectura nueva.
    await transaction.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        UPDATE vr SET
          kmSalida          = ult.km,
          kmInicialHeredado = 1
        FROM vig_vehiculos_reporte vr
        INNER JOIN vig_config_vehiculos cv ON cv.idVehiculo = vr.idVehiculo
        CROSS APPLY (
          SELECT MAX(l.km) AS km
          FROM vig_km_lecturas l
          WHERE l.idVehiculoCatalogo = cv.idVehiculoCatalogo
            AND l.anulada = 0
        ) ult
        WHERE vr.idReporte = @idReporte
          AND vr.kmSalida IS NULL
          AND vr.kmEntrada IS NULL
          AND ult.km IS NOT NULL
      `)

    // Registrar auditoría de km para cada vehículo con kmEntrada
    const vehiculos = await transaction.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT idVehiculoRep, idVehiculo, kmSalida, kmEntrada
        FROM vig_vehiculos_reporte
        WHERE idReporte = @idReporte
          AND idVehiculo IS NOT NULL
          AND kmEntrada IS NOT NULL
      `)

    for (const veh of vehiculos.recordset) {
      // km anterior (último cerrado)
      const kmAntRes = await transaction.request()
        .input('idVehiculo', sql.Int, veh.idVehiculo)
        .input('idReporte',  sql.Int, idReporte)
        .query(`
          SELECT TOP 1 kmNuevo
          FROM vig_km_auditoria
          WHERE idVehiculo = @idVehiculo AND idReporte <> @idReporte
          ORDER BY idAuditoria DESC
        `)

      const kmAnterior = kmAntRes.recordset.length ? kmAntRes.recordset[0].kmNuevo : null

      await transaction.request()
        .input('idVehiculo',  sql.Int,          veh.idVehiculo)
        .input('idReporte',   sql.Int,          idReporte)
        .input('kmAnterior',  sql.Int,          kmAnterior)
        .input('kmNuevo',     sql.Int,          veh.kmEntrada)
        .input('login',       sql.VarChar(255), login)
        .query(`
          INSERT INTO vig_km_auditoria (idVehiculo, idReporte, kmAnterior, kmNuevo, motivo, loginUsuario)
          VALUES (@idVehiculo, @idReporte, @kmAnterior, @kmNuevo, 1, @login)
        `)
    }

    await transaction.commit()
    res.json({ ok: true })
  } catch (err) {
    await transaction.rollback()
    console.error('[vigilancia.service] cerrarReporte:', err)
    res.status(500).json({ ok: false, error: 'Error al cerrar el reporte' })
  }
}

// ────────────────────────────────────────────────────────────
// PERSONAL
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/reportes/:idReporte/personal
 * Actualiza la sección de personal (upsert — siempre existe 1 fila).
 */
async function updatePersonal(req, res) {
  try {
    const idReporte = parseInt(req.params.idReporte)
    const {
      deptAdministracion, deptAlmacen, deptReparto,
      retardos, faltas, incapacitados, pasesAutorizados,
      personalExtraNum, personalExtraDepts,
      autorizadoPor, horarioAutorizado
    } = req.body

    const db = await getPool()
    await db.request()
      .input('idReporte',         sql.Int,             idReporte)
      .input('deptAdministracion',sql.NVarChar(sql.MAX), deptAdministracion || 'NINGUNO')
      .input('deptAlmacen',       sql.NVarChar(sql.MAX), deptAlmacen        || 'NINGUNO')
      .input('deptReparto',       sql.NVarChar(sql.MAX), deptReparto         || 'NINGUNO')
      .input('retardos',          sql.NVarChar(sql.MAX), retardos            || 'NINGUNO')
      .input('faltas',            sql.NVarChar(sql.MAX), faltas              || 'NINGUNO')
      .input('incapacitados',     sql.NVarChar(sql.MAX), incapacitados       || 'NINGUNO')
      .input('pasesAutorizados',  sql.NVarChar(sql.MAX), pasesAutorizados    || 'NINGUNO')
      .input('personalExtraNum',  sql.SmallInt,         parseInt(personalExtraNum) || 0)
      .input('personalExtraDepts',sql.NVarChar(sql.MAX), personalExtraDepts  || null)
      .input('autorizadoPor',     sql.NVarChar(200),    autorizadoPor        || null)
      .input('horarioAutorizado', sql.NVarChar(100),    horarioAutorizado    || null)
      .query(`
        UPDATE vig_personal_reporte SET
          deptAdministracion = @deptAdministracion,
          deptAlmacen        = @deptAlmacen,
          deptReparto        = @deptReparto,
          retardos           = @retardos,
          faltas             = @faltas,
          incapacitados      = @incapacitados,
          pasesAutorizados   = @pasesAutorizados,
          personalExtraNum   = @personalExtraNum,
          personalExtraDepts = @personalExtraDepts,
          autorizadoPor      = @autorizadoPor,
          horarioAutorizado  = @horarioAutorizado
        WHERE idReporte = @idReporte
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updatePersonal:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// EJECUTIVOS — MOVIMIENTOS
// ────────────────────────────────────────────────────────────

/**
 * POST /api/vigilancia/ejecutivos/:idEjecutivoRep/movimientos
 * Agrega un movimiento (entrada/salida) a un ejecutivo.
 * Body: { tipo, hora }  tipo: 1=ENTRADA, 2=SALIDA
 */
async function addMovimientoEjecutivo(req, res) {
  try {
    const idEjecutivoRep = parseInt(req.params.idEjecutivoRep)
    const { tipo, hora } = req.body

    if (!tipo || !hora) {
      return res.status(400).json({ ok: false, error: 'tipo y hora son requeridos' })
    }
    if (![1, 2].includes(parseInt(tipo))) {
      return res.status(400).json({ ok: false, error: 'tipo debe ser 1 (ENTRADA) o 2 (SALIDA)' })
    }

    const db = await getPool()

    // Obtener el siguiente orden
    const ordenRes = await db.request()
      .input('idEjecutivoRep', sql.Int, idEjecutivoRep)
      .query(`
        SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente
        FROM vig_ejecutivos_movimientos
        WHERE idEjecutivoRep = @idEjecutivoRep
      `)

    const siguiente = ordenRes.recordset[0].siguiente

    if (siguiente > 6) {
      return res.status(400).json({ ok: false, error: 'Máximo 6 movimientos por ejecutivo' })
    }

    const result = await db.request()
      .input('idEjecutivoRep', sql.Int,       idEjecutivoRep)
      .input('tipo',           sql.TinyInt,   parseInt(tipo))
      .input('hora',           sql.VarChar(5), hora)
      .input('orden',          sql.TinyInt,   siguiente)
      .query(`
        INSERT INTO vig_ejecutivos_movimientos (idEjecutivoRep, tipo, hora, orden)
        OUTPUT INSERTED.idMovEjec
        VALUES (@idEjecutivoRep, @tipo, @hora, @orden)
      `)

    res.json({ ok: true, data: { idMovEjec: result.recordset[0].idMovEjec } })
  } catch (err) {
    console.error('[vigilancia.service] addMovimientoEjecutivo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * PUT /api/vigilancia/ejecutivos/movimientos/:idMovEjec
 * Edita hora/tipo de un movimiento existente.
 */
async function updateMovimientoEjecutivo(req, res) {
  try {
    const idMovEjec = parseInt(req.params.idMovEjec)
    const { tipo, hora } = req.body
    const db = await getPool()

    await db.request()
      .input('idMovEjec', sql.Int,       idMovEjec)
      .input('tipo',      sql.TinyInt,   parseInt(tipo))
      .input('hora',      sql.VarChar(5), hora)
      .query(`
        UPDATE vig_ejecutivos_movimientos SET tipo = @tipo, hora = @hora
        WHERE idMovEjec = @idMovEjec
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updateMovimientoEjecutivo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * DELETE /api/vigilancia/ejecutivos/movimientos/:idMovEjec
 */
async function deleteMovimientoEjecutivo(req, res) {
  try {
    const idMovEjec = parseInt(req.params.idMovEjec)
    const db = await getPool()

    await db.request()
      .input('idMovEjec', sql.Int, idMovEjec)
      .query(`DELETE FROM vig_ejecutivos_movimientos WHERE idMovEjec = @idMovEjec`)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] deleteMovimientoEjecutivo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * PUT /api/vigilancia/ejecutivos/:idEjecutivoRep/observaciones
 * Actualiza la observación de un ejecutivo en el reporte.
 */
async function updateObservacionEjecutivo(req, res) {
  try {
    const idEjecutivoRep = parseInt(req.params.idEjecutivoRep)
    const { observaciones } = req.body
    const db = await getPool()

    await db.request()
      .input('idEjecutivoRep', sql.Int,              idEjecutivoRep)
      .input('observaciones',  sql.NVarChar(sql.MAX), observaciones || null)
      .query(`
        UPDATE vig_ejecutivos_reporte SET observaciones = @observaciones
        WHERE idEjecutivoRep = @idEjecutivoRep
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updateObservacionEjecutivo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// VEHÍCULOS — MOVIMIENTOS Y KILOMETRAJE
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/vehiculos/:idVehiculoRep
 * Actualiza estado, km y observación de una unidad.
 * Body: { kmSalida, kmEntrada, estado, observacion }
 *
 * El km capturado se registra en ese momento en vig_km_lecturas, así los
 * demás sitios lo ven sin esperar el cierre. Solo se valida el km que
 * cambió: guardar una observación no revalida un km ya guardado.
 */
async function updateVehiculo(req, res) {
  const idVehiculoRep = parseInt(req.params.idVehiculoRep)
  const { kmSalida, kmEntrada, estado, observacion } = req.body
  const login = req.user.login

  const aEntero = (v) => (v === null || v === undefined || v === '' ? null : parseInt(v))
  const nSalida = aEntero(kmSalida)
  const nEntrada = aEntero(kmEntrada)

  if ([nSalida, nEntrada].some(n => n !== null && (isNaN(n) || n < 0))) {
    return res.status(400).json({ ok: false, error: 'El kilometraje debe ser un número entero positivo' })
  }

  // Validación: kmEntrada no puede ser menor que kmSalida
  if (nSalida != null && nEntrada != null && nEntrada < nSalida) {
    return res.status(400).json({
      ok: false,
      error: 'El kilometraje de entrada no puede ser menor al de salida',
      advertencia: true
    })
  }

  const db = await getPool()
  const transaction = new sql.Transaction(db)

  try {
    await transaction.begin()

    const rowRes = await transaction.request()
      .input('idVehiculoRep', sql.Int, idVehiculoRep)
      .query(`
        SELECT vr.idReporte, vr.kmSalida, vr.kmEntrada,
               r.estatus, r.idSitio, cv.idVehiculoCatalogo, cat.numero,
               CASE WHEN EXISTS (SELECT 1 FROM vig_vehiculos_movimientos m
                                 WHERE m.idVehiculoRep = vr.idVehiculoRep AND m.tipo = 1)
                    THEN 1 ELSE 0 END AS tieneSalida,
               CASE WHEN EXISTS (SELECT 1 FROM vig_vehiculos_movimientos m
                                 WHERE m.idVehiculoRep = vr.idVehiculoRep AND m.tipo = 2)
                    THEN 1 ELSE 0 END AS tieneEntrada
        FROM vig_vehiculos_reporte vr
        INNER JOIN vig_reportes r          ON r.idReporte  = vr.idReporte
        LEFT JOIN vig_config_vehiculos cv  ON cv.idVehiculo = vr.idVehiculo
        LEFT JOIN vig_vehiculos cat        ON cat.idVehiculoCatalogo = cv.idVehiculoCatalogo
        WHERE vr.idVehiculoRep = @idVehiculoRep
      `)

    const row = rowRes.recordset[0]
    if (!row) {
      await transaction.rollback()
      return res.status(404).json({ ok: false, error: 'Unidad no encontrada en el reporte' })
    }
    if (row.estatus !== 1) {
      await transaction.rollback()
      return res.status(400).json({ ok: false, error: 'El reporte ya está cerrado' })
    }

    const cambiaSalida = nSalida !== row.kmSalida
    const cambiaEntrada = nEntrada !== row.kmEntrada

    // El km solo se captura si la unidad tiene registrada la hora de ese movimiento
    if (cambiaSalida && !row.tieneSalida) {
      await transaction.rollback()
      return res.status(400).json({ ok: false, error: 'Registra primero la hora de salida de la unidad para capturar su km de salida' })
    }
    if (cambiaEntrada && !row.tieneEntrada) {
      await transaction.rollback()
      return res.status(400).json({ ok: false, error: 'Registra primero la hora de entrada de la unidad para capturar su km de entrada' })
    }
    // Renglones libres (sin unidad de catálogo) no llevan km compartido
    const llevaKm = row.idVehiculoCatalogo != null && (cambiaSalida || cambiaEntrada)

    if (llevaKm) {
      await _bloquearUnidadKm(transaction, row.idVehiculoCatalogo)
      const ult = await _ultimaLecturaKm(transaction.request(), row.idVehiculoCatalogo, idVehiculoRep)

      if (ult) {
        const fueraDeRango = [
          cambiaSalida && nSalida != null && nSalida < ult.km ? ['salida', nSalida] : null,
          cambiaEntrada && nEntrada != null && nEntrada < ult.km ? ['entrada', nEntrada] : null,
        ].find(Boolean)

        if (fueraDeRango) {
          await transaction.rollback()
          const [campo, valor] = fueraDeRango
          return res.status(409).json({
            ok: false,
            error: `El km de ${campo} (${_fmtKm(valor)}) es menor al último registrado para la unidad ${row.numero}: ` +
                   `${_fmtKm(ult.km)} km${_detalleUltimaLectura(ult)}. Verifica el odómetro.`,
            kmUltimo: ult.km,
          })
        }
      }
    }

    await transaction.request()
      .input('idVehiculoRep', sql.Int,          idVehiculoRep)
      .input('kmSalida',      sql.Int,          nSalida)
      .input('kmEntrada',     sql.Int,          nEntrada)
      .input('estado',        sql.TinyInt,      parseInt(estado) || 1)
      .input('observacion',   sql.NVarChar(200), observacion || null)
      .query(`
        UPDATE vig_vehiculos_reporte SET
          kmSalida          = @kmSalida,
          kmEntrada         = @kmEntrada,
          kmInicialHeredado = CASE WHEN kmSalida = @kmSalida THEN kmInicialHeredado ELSE 0 END,
          estado            = @estado,
          observacion       = @observacion
        WHERE idVehiculoRep = @idVehiculoRep
      `)

    if (llevaKm) {
      const base = {
        idVehiculoCatalogo: row.idVehiculoCatalogo,
        idVehiculoRep,
        idReporte: row.idReporte,
        idSitio: row.idSitio,
        login,
      }
      if (cambiaSalida)  await _registrarLecturaKm(transaction, { ...base, tipo: KM_TIPO.SALIDA,  km: nSalida })
      if (cambiaEntrada) await _registrarLecturaKm(transaction, { ...base, tipo: KM_TIPO.ENTRADA, km: nEntrada })
    }

    await transaction.commit()
    res.json({ ok: true })
  } catch (err) {
    try { await transaction.rollback() } catch { /* ya revertida */ }
    console.error('[vigilancia.service] updateVehiculo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * Al registrar la hora de SALIDA de una unidad sin km salida capturado,
 * toma su último km válido (de cualquier sitio) como km salida.
 * No interrumpe el registro del movimiento si falla.
 */
async function _autollenarKmSalida(idVehiculoRep, login) {
  const db = await getPool()
  const transaction = new sql.Transaction(db)
  try {
    await transaction.begin()

    const rowRes = await transaction.request()
      .input('idVehiculoRep', sql.Int, idVehiculoRep)
      .query(`
        SELECT vr.idReporte, vr.kmSalida, r.estatus, r.idSitio, cv.idVehiculoCatalogo
        FROM vig_vehiculos_reporte vr
        INNER JOIN vig_reportes r         ON r.idReporte  = vr.idReporte
        LEFT JOIN vig_config_vehiculos cv ON cv.idVehiculo = vr.idVehiculo
        WHERE vr.idVehiculoRep = @idVehiculoRep
      `)
    const row = rowRes.recordset[0]
    if (!row || row.estatus !== 1 || row.kmSalida != null || row.idVehiculoCatalogo == null) {
      await transaction.rollback()
      return
    }

    await _bloquearUnidadKm(transaction, row.idVehiculoCatalogo)
    const ult = await _ultimaLecturaKm(transaction.request(), row.idVehiculoCatalogo, idVehiculoRep)
    if (!ult) {
      // Unidad sin km previo: el vigilante debe capturar el km inicial
      await transaction.rollback()
      return
    }

    await transaction.request()
      .input('idVehiculoRep', sql.Int, idVehiculoRep)
      .input('km',            sql.Int, ult.km)
      .query(`
        UPDATE vig_vehiculos_reporte SET kmSalida = @km, kmInicialHeredado = 1
        WHERE idVehiculoRep = @idVehiculoRep AND kmSalida IS NULL
      `)

    await _registrarLecturaKm(transaction, {
      idVehiculoCatalogo: row.idVehiculoCatalogo,
      idVehiculoRep,
      idReporte: row.idReporte,
      idSitio: row.idSitio,
      tipo: KM_TIPO.SALIDA,
      km: ult.km,
      login,
    })

    await transaction.commit()
  } catch (err) {
    try { await transaction.rollback() } catch { /* ya revertida */ }
    console.error('[vigilancia.service] _autollenarKmSalida:', err)
  }
}

/**
 * POST /api/vigilancia/vehiculos/:idVehiculoRep/movimientos
 * Agrega un movimiento (salida/entrada) a una unidad.
 * Body: { tipo, hora }  tipo: 1=SALIDA, 2=ENTRADA
 */
async function addMovimientoVehiculo(req, res) {
  try {
    const idVehiculoRep = parseInt(req.params.idVehiculoRep)
    const { tipo, hora } = req.body

    if (!tipo || !hora) {
      return res.status(400).json({ ok: false, error: 'tipo y hora son requeridos' })
    }

    const db = await getPool()

    // Máximo 8 movimientos (4 pares S/E)
    const ordenRes = await db.request()
      .input('idVehiculoRep', sql.Int, idVehiculoRep)
      .query(`
        SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente
        FROM vig_vehiculos_movimientos
        WHERE idVehiculoRep = @idVehiculoRep
      `)

    const siguiente = ordenRes.recordset[0].siguiente

    if (siguiente > 8) {
      return res.status(400).json({ ok: false, error: 'Máximo 4 pares de movimientos por unidad' })
    }

    const result = await db.request()
      .input('idVehiculoRep', sql.Int,       idVehiculoRep)
      .input('tipo',          sql.TinyInt,   parseInt(tipo))
      .input('hora',          sql.VarChar(5), hora)
      .input('orden',         sql.TinyInt,   siguiente)
      .query(`
        INSERT INTO vig_vehiculos_movimientos (idVehiculoRep, tipo, hora, orden)
        OUTPUT INSERTED.idMovVehiculo
        VALUES (@idVehiculoRep, @tipo, @hora, @orden)
      `)

    if (parseInt(tipo) === 1) await _autollenarKmSalida(idVehiculoRep, req.user.login)

    res.json({ ok: true, data: { idMovVehiculo: result.recordset[0].idMovVehiculo } })
  } catch (err) {
    console.error('[vigilancia.service] addMovimientoVehiculo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * PUT /api/vigilancia/vehiculos/movimientos/:idMovVehiculo
 */
async function updateMovimientoVehiculo(req, res) {
  try {
    const idMovVehiculo = parseInt(req.params.idMovVehiculo)
    const { tipo, hora } = req.body
    const db = await getPool()

    await db.request()
      .input('idMovVehiculo', sql.Int,       idMovVehiculo)
      .input('tipo',          sql.TinyInt,   parseInt(tipo))
      .input('hora',          sql.VarChar(5), hora)
      .query(`
        UPDATE vig_vehiculos_movimientos SET tipo = @tipo, hora = @hora
        WHERE idMovVehiculo = @idMovVehiculo
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updateMovimientoVehiculo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * DELETE /api/vigilancia/vehiculos/movimientos/:idMovVehiculo
 */
async function deleteMovimientoVehiculo(req, res) {
  try {
    const idMovVehiculo = parseInt(req.params.idMovVehiculo)
    const db = await getPool()

    await db.request()
      .input('idMovVehiculo', sql.Int, idMovVehiculo)
      .query(`DELETE FROM vig_vehiculos_movimientos WHERE idMovVehiculo = @idMovVehiculo`)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] deleteMovimientoVehiculo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// RONDINES
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/rondines/:idRondinRep
 * Actualiza observaciones de un rondín.
 */
async function updateRondin(req, res) {
  try {
    const idRondinRep = parseInt(req.params.idRondinRep)
    const { observaciones, area } = req.body
    const db = await getPool()

    await db.request()
      .input('idRondinRep',  sql.Int,              idRondinRep)
      .input('observaciones',sql.NVarChar(sql.MAX), observaciones || null)
      .input('area',         sql.NVarChar(100),    area || 'General')
      .query(`
        UPDATE vig_rondines_reporte SET observaciones = @observaciones, area = @area
        WHERE idRondinRep = @idRondinRep
      `)

    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilancia.service] updateRondin:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// UBICACIONES (SUR 121)
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/ubicaciones/:idUbicacionRep
 * Actualiza las unidades asignadas (reemplazo completo del set M:N)
 * y la observación de una ubicación/destino.
 * Body: { idVehiculos: [1,2,3], observaciones }
 */
async function updateUbicacion(req, res) {
  const idUbicacionRep = parseInt(req.params.idUbicacionRep)
  const { idVehiculos, observaciones } = req.body
  const db = await getPool()
  const transaction = new sql.Transaction(db)

  try {
    await transaction.begin()

    await transaction.request()
      .input('idUbicacionRep', sql.Int, idUbicacionRep)
      .query(`DELETE FROM vig_ubicacion_reporte_vehiculos WHERE idUbicacionRep = @idUbicacionRep`)

    for (const idVehiculo of Array.isArray(idVehiculos) ? idVehiculos : []) {
      await transaction.request()
        .input('idUbicacionRep', sql.Int, idUbicacionRep)
        .input('idVehiculo',     sql.Int, parseInt(idVehiculo))
        .query(`
          INSERT INTO vig_ubicacion_reporte_vehiculos (idUbicacionRep, idVehiculo)
          VALUES (@idUbicacionRep, @idVehiculo)
        `)
    }

    await transaction.request()
      .input('idUbicacionRep', sql.Int,              idUbicacionRep)
      .input('observaciones',  sql.NVarChar(sql.MAX), observaciones || null)
      .query(`
        UPDATE vig_ubicacion_reporte SET observaciones = @observaciones
        WHERE idUbicacionRep = @idUbicacionRep
      `)

    await transaction.commit()
    res.json({ ok: true })
  } catch (err) {
    await transaction.rollback()
    console.error('[vigilancia.service] updateUbicacion:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * PUT /api/vigilancia/reportes/:idReporte/vehiculos-ubicacion/:idVehiculo
 * Reasigna un vehículo (id de catálogo) a un destino en una sola llamada:
 * lo quita de cualquier otro destino de ESTE reporte donde ya estuviera
 * asignado y lo agrega al nuevo (o lo deja sin asignar si idUbicacionRep
 * viene null). Pensado para la vista rápida de asignación por vehículo,
 * alternativa al flujo de "agregar unidad" destino por destino.
 * Body: { idUbicacionRep: number|null }
 */
async function reassignVehiculoUbicacion(req, res) {
  const idReporte = parseInt(req.params.idReporte)
  const idVehiculo = parseInt(req.params.idVehiculo)
  const { idUbicacionRep } = req.body
  const db = await getPool()
  const transaction = new sql.Transaction(db)

  try {
    await transaction.begin()

    await transaction.request()
      .input('idReporte',  sql.Int, idReporte)
      .input('idVehiculo', sql.Int, idVehiculo)
      .query(`
        DELETE urv FROM vig_ubicacion_reporte_vehiculos urv
        INNER JOIN vig_ubicacion_reporte ur ON ur.idUbicacionRep = urv.idUbicacionRep
        WHERE ur.idReporte = @idReporte AND urv.idVehiculo = @idVehiculo
      `)

    if (idUbicacionRep) {
      await transaction.request()
        .input('idUbicacionRep', sql.Int, parseInt(idUbicacionRep))
        .input('idVehiculo',     sql.Int, idVehiculo)
        .query(`
          INSERT INTO vig_ubicacion_reporte_vehiculos (idUbicacionRep, idVehiculo)
          VALUES (@idUbicacionRep, @idVehiculo)
        `)
    }

    await transaction.commit()
    res.json({ ok: true })
  } catch (err) {
    await transaction.rollback()
    console.error('[vigilancia.service] reassignVehiculoUbicacion:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// BORRADOR ACTIVO DEL USUARIO
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/borrador-activo/:idSitio
 * Devuelve el reporte en BORRADOR activo del sitio (si existe).
 * Útil para reanudar captura.
 */
async function getBorradorActivo(req, res) {
  try {
    const idSitio = parseInt(req.params.idSitio)
    const db = await getPool()
    const result = await db.request()
      .input('idSitio', sql.Int, idSitio)
      .query(`
        SELECT TOP 1
          idReporte, folioReporte, fechaInicio, horaInicio, fechaFin, horaFin,
          reporto, loginRegistro, fechaRegistro
        FROM vig_reportes
        WHERE idSitio = @idSitio AND estatus = 1
        ORDER BY idReporte DESC
      `)

    res.json({ ok: true, data: result.recordset[0] || null })
  } catch (err) {
    console.error('[vigilancia.service] getBorradorActivo:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// FIRMAS PRECARGADAS (reportó / recibió / enterado)
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/firmas?logins=LOGIN1,LOGIN2
 * Devuelve las firmas guardadas para los logins solicitados. Sin ese
 * parámetro (pantalla de administración de firmas), devuelve según el área
 * de quien consulta: el visor general (área 'VIGILANCIA') ve las de todas
 * las áreas de Vigilancia; una restringida ve solo la suya.
 */
async function getFirmas(req, res) {
  try {
    const db = await getPool()
    const logins = req.query.logins
      ? req.query.logins.split(',').map(l => l.trim()).filter(Boolean)
      : null

    let result
    if (logins) {
      if (!logins.length) return res.json({ ok: true, data: [] })
      const fReq = db.request()
      const placeholders = logins.map((login, i) => {
        fReq.input(`login${i}`, sql.VarChar(255), login)
        return `@login${i}`
      }).join(',')
      result = await fReq.query(`
        SELECT u.login, u.name,
               f.rutaArchivo, f.fechaActualizacion
        FROM sec_users u
        LEFT JOIN vig_firmas f ON f.login = u.login
        WHERE u.login IN (${placeholders})
      `)
    } else {
      const acceso = await resolveAccesoVigilancia(req.user)
      const areas = acceso.general
        ? Object.values(SITIO_CLAVE_AREA)
        : acceso.claves.map(c => SITIO_CLAVE_AREA[c]).filter(Boolean)
      if (!areas.length) return res.json({ ok: true, data: [] })
      const fReq = db.request()
      const placeholders = areas.map((area, i) => {
        fReq.input(`area${i}`, sql.NVarChar(100), area)
        return `@area${i} COLLATE Latin1_General_CI_AI`
      }).join(',')
      result = await fReq.query(`
        SELECT u.login, u.name,
               f.rutaArchivo, f.fechaActualizacion
        FROM sec_users u
        LEFT JOIN vig_firmas f ON f.login = u.login
        WHERE LTRIM(RTRIM(u.area)) COLLATE Latin1_General_CI_AI IN (${placeholders})
      `)
    }

    res.json({ ok: true, data: result.recordset })
  } catch (err) {
    console.error('[vigilancia.service] getFirmas:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * PUT /api/vigilancia/firmas/:login
 * Guarda/reemplaza la imagen de firma precargada de una persona.
 * El archivo ya fue procesado por multer antes de llegar aquí.
 */
async function uploadFirma(req, res) {
  try {
    const login = req.params.login
    if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo' })

    const rutaArchivo = `/uploads/firmas/${req.file.filename}`
    const db = await getPool()

    await db.request()
      .input('login',          sql.VarChar(255),  login)
      .input('rutaArchivo',    sql.NVarChar(300), rutaArchivo)
      .input('loginActualizo', sql.VarChar(255),  req.user.login)
      .query(`
        MERGE vig_firmas AS target
        USING (SELECT @login AS login) AS src
          ON target.login = src.login
        WHEN MATCHED THEN
          UPDATE SET rutaArchivo = @rutaArchivo, fechaActualizacion = GETDATE(), loginActualizo = @loginActualizo
        WHEN NOT MATCHED THEN
          INSERT (login, rutaArchivo, loginActualizo) VALUES (@login, @rutaArchivo, @loginActualizo);
      `)

    res.json({ ok: true, data: { login, rutaArchivo } })
  } catch (err) {
    console.error('[vigilancia.service] uploadFirma:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

// ────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────

module.exports = {
  // Interno (reusado por el generador de PDF y por evidencias)
  _fetchReporteCompleto,
  resolveAccesoVigilancia,
  // Config
  getSitios,
  getConfigSitio,
  // Reportes
  getReportes,
  getReporteById,
  crearReporte,
  updateCabecera,
  updateRecibio,
  cerrarReporte,
  getBorradorActivo,
  // Personal
  updatePersonal,
  // Ejecutivos
  addMovimientoEjecutivo,
  updateMovimientoEjecutivo,
  deleteMovimientoEjecutivo,
  updateObservacionEjecutivo,
  // Vehículos
  updateVehiculo,
  addMovimientoVehiculo,
  updateMovimientoVehiculo,
  deleteMovimientoVehiculo,
  // Rondines
  updateRondin,
  // Ubicaciones
  updateUbicacion,
  reassignVehiculoUbicacion,
  // Firmas
  getFirmas,
  uploadFirma
}
