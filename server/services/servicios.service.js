const { getPool } = require("../db");

// Todos los servicios activos (para el menú principal)
async function getServicios() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      s.idServicio,
      s.slug,
      s.nombre,
      s.tipo,
      s.idServicioPadre,
      s.colorPrimario,
      s.colorSecundario,
      s.icono,
      s.badge,
      s.orden,
      (
        SELECT
          h.idServicio,
          h.slug,
          h.nombre,
          h.icono,
          h.orden
        FROM cat_servicioTI h
        WHERE h.idServicioPadre = s.idServicio
          AND h.activo = 1
        ORDER BY h.orden
        FOR JSON PATH
      ) AS hijos
    FROM cat_servicioTI s
    WHERE s.activo = 1
      AND s.idServicioPadre IS NULL
    ORDER BY s.orden
  `);

  return result.recordset.map((row) => ({
    ...row,
    hijos: row.hijos ? JSON.parse(row.hijos) : [],
  }));
}

// Configuración completa de un servicio por slug (para el formulario)
async function getServicioBySlug(slug) {
  const pool = await getPool();

  const servicioResult = await pool.request().input("slug", slug).query(`
    SELECT
      s.idServicio,
      s.slug,
      s.nombre,
      s.tipo,
      s.idServicioPadre,
      s.colorPrimario,
      s.colorSecundario,
      s.icono,
      s.formTitulo,
      s.formSubtitulo,
      s.formDescripcion,
      s.placeholderTitulo,
      s.placeholderDesc,
      s.ayudaContextual,
      s.tituloAutofill,
      s.requiereEvidencia,
      s.mostrarPrioridad,
      -- SLAs propios del servicio (en minutos)
      s.slaRespuestaMin,
      s.slaResolucionMin,
      -- Prioridad asignada al servicio
      p.idPrioridad,
      p.prioridad   AS prioridadNombre,
      p.colorHex    AS prioridadColor
    FROM cat_servicioTI s
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    WHERE s.slug = @slug
      AND s.activo = 1
  `);

  if (servicioResult.recordset.length === 0) return null;

  const row = servicioResult.recordset[0];

  // Campos dinámicos
  const camposResult = await pool.request().input("idServicio", row.idServicio)
    .query(`
      SELECT
        c.idCampo,
        c.nombreCampo,
        c.etiqueta,
        c.tipoCampo,
        c.placeholder,
        c.requerido,
        c.orden,
        (
          SELECT o.valor, o.etiqueta, o.orden
          FROM cat_campoDinamicoOpcion o
          WHERE o.idCampo = c.idCampo
          ORDER BY o.orden
          FOR JSON PATH
        ) AS opciones
      FROM cat_campoDinamico c
      WHERE c.idServicio = @idServicio
        AND c.activo = 1
      ORDER BY c.orden
    `);

  const campos = camposResult.recordset.map((c) => ({
    ...c,
    opciones: c.opciones ? JSON.parse(c.opciones) : [],
  }));

  return {
    idServicio: row.idServicio,
    slug: row.slug,
    nombre: row.nombre,
    tipo: row.tipo,
    esSubservicio: row.idServicioPadre !== null,
    colorPrimario: row.colorPrimario,
    colorSecundario: row.colorSecundario,
    icono: row.icono,
    form: {
      titulo: row.formTitulo,
      subtitulo: row.formSubtitulo,
      descripcion: row.formDescripcion,
      placeholderTitulo: row.placeholderTitulo,
      placeholderDesc: row.placeholderDesc,
      ayudaContextual: row.ayudaContextual,
    },
    comportamiento: {
      tituloAutofill: row.tituloAutofill,
      requiereEvidencia: row.requiereEvidencia,
      mostrarPrioridad: row.mostrarPrioridad,
    },
    prioridadDefault: row.idPrioridad
      ? {
          idPrioridad: row.idPrioridad,
          nombre: row.prioridadNombre,
          color: row.prioridadColor,
          slaRespuestaMin: row.slaRespuestaMin,
          slaResolucionMin: row.slaResolucionMin,
        }
      : null,
    camposDinamicos: campos,
  };
}

module.exports = { getServicios, getServicioBySlug };
