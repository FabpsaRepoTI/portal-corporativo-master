// ============================================================
// vigilanciaPdf.service.js
// Genera el PDF del "Reporte de Novedades" como réplica visual del
// original de ScriptCase/TCPDF. Las coordenadas, anchos de columna,
// alturas de fila y tamaños de fuente de este archivo fueron medidos
// directamente del PDF original (reporteVigilanciaOriginal.pdf) con
// pdfjs-dist (texto con posición X/Y + bounding boxes de las celdas
// dibujadas) — no son estimaciones visuales.
//
// Unidad: pt (1pt = 1/72in), igual que el espacio de coordenadas del
// PDF original, así no hay conversión/redondeo de por medio.
// Página: 609.448819 x 790.866142 pt (medido del /MediaBox real).
// ============================================================

const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')
const { _fetchReporteCompleto } = require('./vigilancia.service')

const PAGE_W = 609.448819
const PAGE_H = 790.866142

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
]

function esc(v) {
  if (v === null || v === undefined) return ''
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function partesFecha(fecha) {
  if (!fecha) return { dia: '', mes: '', anio: '' }
  const d = new Date(fecha)
  return { dia: d.getUTCDate(), mes: MESES[d.getUTCMonth()], anio: d.getUTCFullYear() }
}

// Día calendario siguiente — setUTCDate hace el acarreo de mes/año solo.
function diaSiguiente(fecha) {
  const d = new Date(fecha)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

const LOGO_DATA_URI = (() => {
  try {
    const buf = fs.readFileSync(path.join(__dirname, '../../client/src/logo-fabpsa.png'))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
})()

function imagenComoDataUri(rutaPublica) {
  if (!rutaPublica) return null
  try {
    const rel = rutaPublica.replace(/^\/uploads\//, '')
    const candidatos = [
      path.join(__dirname, '../../uploads', rel),
      path.join(__dirname, '../uploads', rel),
    ]
    const archivo = candidatos.find(p => fs.existsSync(p))
    if (!archivo) return null
    const ext = path.extname(archivo).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    const buf = fs.readFileSync(archivo)
    return `data:image/${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function listaUnidades(vehiculos) {
  if (!vehiculos || vehiculos.length === 0) return 'NINGUNO'
  const numeros = vehiculos.map(v => v.numero)
  const etiqueta = numeros.length === 1 ? 'UNIDAD' : 'UNIDADES'
  if (numeros.length === 1) return `${etiqueta}: ${numeros[0]}`
  const todosMenosUltimo = numeros.slice(0, -1).join(', ')
  const ultimo = numeros[numeros.length - 1]
  return `${etiqueta}: ${todosMenosUltimo} Y ${ultimo}`
}

const TIPO_MOV_EJEC_LABEL = { 1: 'ENTRADA', 2: 'SALIDA' }
const EJEC_SLOTS = 6
const VEH_SLOTS = 8

function slotsMov(movimientos, n) {
  const slots = Array.from({ length: n }, () => '')
  ;(movimientos || []).forEach((m, i) => { if (i < n) slots[i] = m.hora })
  return slots
}

function formatHoraRondin(hora) {
  if (!hora) return ''
  const h = parseInt(hora.split(':')[0], 10)
  return `${hora} ${h < 12 ? 'AM' : 'Hrs'}`
}

// ── Grillas medidas del original (pt, relativas a cada página) ──
// Columnas de hora (Entrada/Salida) angostadas respecto a la medición
// original (31.2pt cada una) — el ancho liberado se suma a OBSERVACIONES;
// el ancho total de la tabla (28.4→566.9) no cambia. 28pt es el mínimo que
// no recorta el encabezado "Entrada"/"Salida" a 7pt.
const EJEC_COLS = [28.4, 212.6, 311.8, 339.8, 367.8, 395.8, 423.8, 451.8, 479.8, 566.9]
const EJEC_ROW_H = 19.8
const EJEC_TOP = 521.6
const EJEC_ROW_H_MIN = 11 // piso legible (1 línea, 7pt) para rosters grandes

// Rondines vive SIEMPRE en la página 1, en la posición medida del original
// (justo debajo de Ejecutivos) — nunca se mueve de ahí. Con rosters grandes
// de ejecutivos o de rondines (ej. Planta Alérgenos: 8 ejecutivos, 6
// rondines) ambas tablas se angostan lo justo para seguir cabiendo juntas
// en esta misma página, en vez de desbordarse o pasar a otra página. Con el
// roster normal de SUR 121 (≤5 ejecutivos, ≤4 rondines) no se angosta nada:
// ambas funciones devuelven exactamente los valores medidos de siempre.
const RONDIN_COLS = [28.4, 212.6, 262.6, 566.9]
const RONDIN_COLS_B = [17.0, 187.1, 266.5, 583.9]
const RONDIN_HEADER_TOP = 654.8
const RONDIN_HEADER_H = 28.3
const RONDIN_TOP = 683.1 // inicio de la primera fila de datos (justo debajo del header)
const RONDIN_ROW_H = [25.7, 22.7, 22.7, 22.7] // 1er rondín suele llevar 2 líneas de nota
const RONDIN_ROW_H_MIN = 11 // piso legible para sitios con muchos rondines
const EJEC_RONDIN_GAP = 14.4 // gap medido entre el fin de Ejecutivos y el inicio de Rondines

function ejecRowHeight(n) {
  if (n <= 5) return EJEC_ROW_H
  const slotH = RONDIN_HEADER_TOP - EJEC_TOP - EJEC_RONDIN_GAP // espacio total para header+filas de Ejecutivos
  return Math.max(EJEC_ROW_H_MIN, +(slotH / (1 + n)).toFixed(2))
}

function rondinRowHeights(n) {
  if (n <= RONDIN_ROW_H.length) return RONDIN_ROW_H.slice(0, n)
  const available = PAGE_H - RONDIN_TOP - 10 // 10pt de margen inferior
  const firstH = Math.min(RONDIN_ROW_H[0], +(available * 0.22).toFixed(2))
  const restH = Math.max(RONDIN_ROW_H_MIN, +((available - firstH) / (n - 1)).toFixed(2))
  return [firstH, ...Array(n - 1).fill(restH)]
}

const VEH_COLS = [17.0, 187.1, 226.8, 266.5, 306.1, 345.8, 385.5, 425.2, 464.9, 504.6, 544.3, 583.9]
const VEH_HEADER_TOP = 36.9
const VEH_HEADER_H = 19.8
const VEH_ROW_H = 17.0

const UBIC_COLS = [17.0, 187.1, 583.9]
const UBIC_HEADER_H = 17.0
const UBIC_ROW_H = 11.5
// Gaps medidos (vehBottom→título, vehBottom→header) con el PDF de
// referencia (26 vehículos): título a +17.7pt, header de ubicación a +22.9pt.
const UBIC_TITLE_GAP = 17.7
const UBIC_HEADER_GAP = 22.9

const FIRMA_COLS = [17.0, 158.7, 300.5, 442.2, 583.9]
// Gaps medidos entre el final real de la tabla de ubicación y el bloque
// de firmas (con la referencia de 12 destinos): el bloque de firmas se
// posiciona relativo al final de esa tabla, no con un top fijo, para que
// no se desalinee si cambia el número de destinos/vehículos del sitio.
const FIRMA_LABEL_GAP = 17.2     // de "fin de tabla ubicación" a "REPORTÓ"/"RECIBIÓ"/"ENTERADO"
const FIRMA_BOX_TOP_GAP = 5.5    // de la etiqueta al borde superior del recuadro
const FIRMA_BOX_H = 56.7         // alto del recuadro de firma
const FIRMA_ROLE_GAP = 8.0       // del borde inferior del recuadro al texto de rol

function colWidths(cols) {
  const w = []
  for (let i = 1; i < cols.length; i++) w.push(+(cols[i] - cols[i - 1]).toFixed(2))
  return w
}

const EJEC_ROW_H_B = 26
const RONDIN_GAP_B = 14
const OBS_GAP = 15
const OBS_TOTAL_LINES = 15

// Sitios distintos de SUR 121: Unidades → Ubicación → Observaciones → Rondines → Firmas
// en la página trasera. Si no cabe, las filas se angostan proporcionalmente hasta un piso legible.
function layoutTraseraB({ nVeh, nUbic, nRond, nObs }) {
  const fijo = VEH_HEADER_H + UBIC_HEADER_GAP + UBIC_HEADER_H + RONDIN_GAP_B + RONDIN_HEADER_H
    + FIRMA_LABEL_GAP + FIRMA_BOX_TOP_GAP + FIRMA_BOX_H + FIRMA_ROLE_GAP + 20
    + (nObs ? OBS_GAP : 0)
  const disponible = PAGE_H - VEH_HEADER_TOP - 10 - fijo
  const nominal = { veh: VEH_ROW_H, ubic: UBIC_ROW_H, obs: 12, rond: 22.7 }
  const piso = { veh: 9, ubic: 8, obs: 8, rond: 11 }
  const alto = (key, k) => +Math.max(piso[key], nominal[key] * k).toFixed(2)
  const total = (k) => nVeh * alto('veh', k) + nUbic * alto('ubic', k) + nObs * alto('obs', k) + nRond * alto('rond', k)
  let k = 1
  if (total(1) > disponible) {
    let lo = 0, hi = 1
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (total(mid) <= disponible) lo = mid
      else hi = mid
    }
    k = lo
  }
  return { vehH: alto('veh', k), ubicH: alto('ubic', k), obsH: alto('obs', k), rondH: alto('rond', k) }
}

function buildHtml(data) {
  const { reporte, personal, ejecutivos, vehiculos, rondines, ubicaciones, vigilantesRecibio } = data

  const inicio = partesFecha(reporte.fechaInicio)
  // El periodo del turno siempre es 08:00 del día del reporte → 08:00 del
  // día calendario siguiente, independientemente de lo capturado en
  // fechaFin/horaInicio/horaFin.
  const fin = partesFecha(reporte.fechaInicio ? diaSiguiente(reporte.fechaInicio) : null)
  const HORA_INICIO_TURNO = '08:00'
  const HORA_FIN_TURNO = '08:00'

  const firmaDe = (nombre) => {
    const v = (vigilantesRecibio || []).find(x => x.name === nombre)
    return v ? imagenComoDataUri(v.rutaArchivo) : null
  }
  const jefe = (vigilantesRecibio || []).find(v => v.esJefeVigilancia)
  const nombreEnterado1 = reporte.enterado1 || jefe?.name || ''
  const firmaReporto = firmaDe(reporte.reporto)
  const firmaRecibio = firmaDe(reporte.recibio)
  const firmaEnterado1 = firmaDe(nombreEnterado1)

  // ── Filas de "Personal" — top/alto fijos, medidos del original ──
  const personalRows = [
    { label: 'Administración:', val: personal?.deptAdministracion, top: 194.5, h: 34 },
    { label: 'Almacen:', val: personal?.deptAlmacen, top: 228.5, h: 34 },
    { label: 'Reparto:', val: personal?.deptReparto, top: 262.6, h: 34 },
    { label: 'Personal que se regresó por retardos:', val: personal?.retardos, top: 296.6, h: 34 },
    { label: 'Personas que faltaron a sus labores:', val: personal?.faltas, top: 330.6, h: 34 },
    { label: 'Personal incapacitado:', val: personal?.incapacitados, top: 364.6, h: 34 },
    { label: 'Personas que salieron con pases autorizados:', val: personal?.pasesAutorizados, top: 398.6, h: 34 },
  ]

  const ejecColW = colWidths(EJEC_COLS)
  const rondinCols = reporte.claveSitio !== 'SUR_121' ? RONDIN_COLS_B : RONDIN_COLS
  const rondinColW = colWidths(rondinCols)
  const vehColW = colWidths(VEH_COLS)
  const ubicColW = colWidths(UBIC_COLS)
  const firmaColW = colWidths(FIRMA_COLS)
  const LAYOUT_B = reporte.claveSitio !== 'SUR_121'
  const tieneObsGen = !!reporte.tieneObservacionesGen
  const trasera = LAYOUT_B
    ? layoutTraseraB({ nVeh: vehiculos.length, nUbic: ubicaciones.length, nRond: rondines.length, nObs: tieneObsGen ? OBS_TOTAL_LINES : 0 })
    : null
  const vehRowH = LAYOUT_B ? trasera.vehH : VEH_ROW_H
  const ubicRowH = LAYOUT_B ? trasera.ubicH : UBIC_ROW_H
  const rondinRowH = LAYOUT_B ? Array(rondines.length).fill(trasera.rondH) : rondinRowHeights(rondines.length)
  const vehBottomY = VEH_HEADER_TOP + VEH_HEADER_H + vehRowH * vehiculos.length
  const ubicBottomY = vehBottomY + UBIC_HEADER_GAP + UBIC_HEADER_H + ubicRowH * ubicaciones.length
  const obsBottomY = LAYOUT_B && tieneObsGen ? ubicBottomY + OBS_GAP + trasera.obsH * OBS_TOTAL_LINES : ubicBottomY
  const rondHeaderTop = LAYOUT_B ? obsBottomY + RONDIN_GAP_B : RONDIN_HEADER_TOP
  const rondTop = LAYOUT_B ? rondHeaderTop + RONDIN_HEADER_H : RONDIN_TOP
  const rondBottomY = rondTop + rondinRowH.reduce((a, b) => a + b, 0)

  const ejecRowH = LAYOUT_B ? EJEC_ROW_H_B : ejecRowHeight(ejecutivos.length)
  const filaEjec = (e, i) => {
    const slots = slotsMov(e.movimientos, EJEC_SLOTS)
    const top = EJEC_TOP + ejecRowH * (i + 1)
    const sinHoras = slots.every(s => !s)

    if (sinHoras) {
      // Sin entradas/salidas capturadas: Observaciones se corre como una
      // sola celda ancha (desde la primera columna de hora hasta el final),
      // en vez de dejar 6 celdas de hora vacías + una celda angosta de
      // observaciones donde el texto se recorta.
      const wideLeft = EJEC_COLS[2]
      const wideW = EJEC_COLS[EJEC_COLS.length - 1] - EJEC_COLS[2]
      return rowHtml(
        [esc(e.nombre), esc(e.puesto || '')],
        EJEC_COLS, ejecColW, top, ejecRowH, ['t-left', 't-left'], 'cell-thin'
      ) + `<div class="cell cell-thin t-left" style="top:${top}pt;left:${wideLeft}pt;width:${wideW}pt;height:${ejecRowH}pt;">${esc(e.observaciones || '')}</div>`
    }

    const cells = [esc(e.nombre), esc(e.puesto || ''), ...slots.map(esc), esc(e.observaciones || '')]
    return rowHtml(cells, EJEC_COLS, ejecColW, top, ejecRowH, ['t-left', 't-left', 't-center', 't-center', 't-center', 't-center', 't-center', 't-center', 't-left'], 'cell-thin')
  }

  const filaRondin = (r, i) => {
    const top = rondTop + rondinRowH.slice(0, i).reduce((a, b) => a + b, 0)
    const h = rondinRowH[i] || rondinRowH[rondinRowH.length - 1]
    const cells = [
      `${esc(formatHoraRondin(r.horaReferencia))} - ${esc(r.etiqueta)}`,
      esc(r.area || 'General'),
      esc(r.observaciones || 'SIN NOVEDAD'),
    ]
    return rowHtml(cells, rondinCols, rondinColW, top, h, ['t-left', 't-center', 't-left fit'], 'cell-thin')
  }

  const filaVeh = (v, i) => {
    const slots = slotsMov(v.movimientos, VEH_SLOTS)
    const top = VEH_HEADER_TOP + VEH_HEADER_H + vehRowH * i
    const unidadTxt = (v.numero ? `Unidad No. ${esc(v.numero)}` : '') + (v.observacion ? ` ${esc(v.observacion)}` : '')
    if (!v.movimientos || v.movimientos.length === 0) {
      const w0 = vehColW[0]
      const wMid = VEH_COLS[9] - VEH_COLS[1]
      const sinSalida = v.esFijo ? 'NO SALIO' : ''
      return `
        <div class="cell cell-thin t-left" style="top:${top}pt;left:${VEH_COLS[0]}pt;width:${w0}pt;height:${vehRowH}pt;">${unidadTxt}</div>
        <div class="cell cell-thin t-center" style="top:${top}pt;left:${VEH_COLS[1]}pt;width:${wMid}pt;height:${vehRowH}pt;">${esc(v.observacion || sinSalida)}</div>
        <div class="cell cell-thin t-center" style="top:${top}pt;left:${VEH_COLS[9]}pt;width:${vehColW[9]}pt;height:${vehRowH}pt;">${v.kmSalida ?? ''}</div>
        <div class="cell cell-thin t-center" style="top:${top}pt;left:${VEH_COLS[10]}pt;width:${vehColW[10]}pt;height:${vehRowH}pt;">${v.kmEntrada ?? ''}</div>`
    }
    const cells = [unidadTxt, ...slots.map(esc), v.kmSalida ?? '', v.kmEntrada ?? '']
    return rowHtml(cells, VEH_COLS, vehColW, top, vehRowH, ['t-left', 't-center', 't-center', 't-center', 't-center', 't-center', 't-center', 't-center', 't-center', 't-center', 't-center'], 'cell-thin')
  }

  function rowHtml(cells, cols, widths, top, h, aligns, extraClass = '') {
    return cells.map((c, i) => `<div class="cell ${aligns[i]} ${extraClass}" style="top:${top}pt;left:${cols[i]}pt;width:${widths[i]}pt;height:${h}pt;">${c}</div>`).join('')
  }

  const firmaCol = (i, label, nombre, firma, firmaLabelTop) => {
    const left = FIRMA_COLS[i]
    const w = firmaColW[i]
    const headerTop = firmaLabelTop - 11
    const boxTop = firmaLabelTop + FIRMA_BOX_TOP_GAP
    const headerH = boxTop - headerTop
    const roleRowTop = boxTop + FIRMA_BOX_H
    const roleRowH = FIRMA_ROLE_GAP + 20
    return `
      <div class="cell cell-thin t-center firma-rol" style="top:${headerTop}pt;left:${left}pt;width:${w}pt;height:${headerH}pt;">${label[0]}</div>
      <div class="firma-box" style="top:${boxTop}pt;left:${left}pt;width:${w}pt;height:${FIRMA_BOX_H}pt;">
        ${firma ? `<img src="${firma}" class="firma-img" />` : ''}
        ${nombre ? `<div class="firma-nombre">${esc(nombre)}</div>` : ''}
      </div>
      <div class="cell cell-thin t-center firma-rol" style="top:${roleRowTop}pt;left:${left}pt;width:${w}pt;height:${roleRowH}pt;">${label.slice(1).map(esc).join('<br/>')}</div>`
  }

  const rondinesBloque = `
    <!-- Tabla rondines -->
    ${(() => {
      const rondinDataH = rondines.reduce((sum, _, i) => sum + (rondinRowH[i] || rondinRowH[rondinRowH.length - 1]), 0)
      const rondinBottom = rondTop + rondinDataH
      return `
        <div class="table-edge-top" style="top:${rondHeaderTop}pt;left:${rondinCols[0]}pt;width:${rondinCols[rondinCols.length - 1] - rondinCols[0]}pt;"></div>
        <div class="table-edge-left" style="top:${rondHeaderTop}pt;left:${rondinCols[0]}pt;height:${rondinBottom - rondHeaderTop}pt;"></div>`
    })()}
    ${['No. de Rondín', 'Área', 'Observaciones'].map((h, i) =>
      `<div class="cell cell-thin t-center" style="top:${rondHeaderTop}pt;left:${rondinCols[i]}pt;width:${rondinColW[i]}pt;height:${RONDIN_HEADER_H}pt;font-weight:bold;font-size:8pt;">${h}</div>`
    ).join('')}
    ${rondines.map(filaRondin).join('')}
`

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${PAGE_W}pt ${PAGE_H}pt; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: ${PAGE_W}pt; margin: 0; padding: 0; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; }
  .page {
    position: relative;
    width: ${PAGE_W}pt;
    height: ${PAGE_H}pt;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .abs { position: absolute; }
  .cell {
    position: absolute;
    border: 0.6pt solid #000;
    overflow: hidden;
    padding: 1.5pt 3pt;
    font-size: 8pt;
    line-height: 1.15;
    display: flex;
    align-items: center;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cell > * { overflow: hidden; text-overflow: ellipsis; }
  ${/* .fit: texto libre que debe verse completo — envuelve en varias líneas
       y, si aun así no cabe en la celda, generarReportePdf le baja la
       fuente hasta que quepa (ver ajustarTextoLargo). */''}
  .cell.fit { white-space: normal; text-overflow: clip; line-height: 1.05; word-break: break-word; }
  .cell.fit > * { overflow: visible; }
  .desc-mini { font-size: 6.5pt; font-style: italic; }
  .t-left { text-align: left; justify-content: flex-start; }
  .t-center { text-align: center; justify-content: center; }
  th.cell { font-weight: bold; font-size: 7pt; }

  .firma-box { position: absolute; border: none; border-right: 0.5pt solid #000; border-bottom: 0.5pt solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  .firma-box img { max-width: 90%; max-height: 30pt; object-fit: contain; }
  .firma-nombre { font-weight: bold; font-size: 8pt; margin-top: 2pt; }
  .firma-rol { border: none; font-size: 7pt; text-transform: uppercase; line-height: 1.25; }

  .date-row { display: flex; align-items: baseline; gap: 3pt; font-size: 9pt; white-space: nowrap; }
  .date-line {
    display: inline-block;
    text-align: center;
    border-bottom: 0.6pt solid #000;
    padding-bottom: 1pt;
  }
  .personal-line { position: absolute; border-bottom: 0.6pt solid #000; }
  ${/* El texto real (párrafo normal, intacto) ya no lleva la línea — se
       dibuja aparte con esta fila "fantasma": mismo label pero invisible
       (visibility:hidden, conserva su ancho real) seguido de la línea, así
       la línea arranca exactamente donde termina la palabra + ":" sin
       tocar en nada cómo se ve el texto de arriba. */''}
  .personal-ghost-row { display: flex; align-items: flex-end; white-space: nowrap; }
  .personal-ghost-row > span:first-child { visibility: hidden; flex: 0 0 auto; }
  .personal-ghost-row .personal-line-inline { flex: 1 1 auto; }
  .personal-row { display: flex; align-items: flex-end; white-space: nowrap; }
  .personal-line-inline {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: 4pt;
    border-bottom: 0.6pt solid #000;
    padding-bottom: 1pt;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ap-row { display: flex; align-items: baseline; gap: 4pt; font-size: 9pt; white-space: nowrap; width: 541pt; }
  .ap-line { flex: 1 1 auto; min-width: 0; border-bottom: 0.6pt solid #000; padding-bottom: 1pt; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  ${/* cell-thin NO usa border completo en cada celda: eso duplica la línea
       en cada frontera interna (borde derecho de una celda + borde
       izquierdo de la siguiente = 2 líneas casi superpuestas = se ve más
       gruesa). Cada celda dibuja solo su borde derecho e inferior; el
       perímetro externo (borde superior e izquierdo de la tabla) se dibuja
       aparte, una sola vez, con .table-edge-top / .table-edge-left. */''}
  .cell-thin { border: none; border-right: 0.5pt solid #000; border-bottom: 0.5pt solid #000; }
  .table-edge-top { position: absolute; border-top: 0.5pt solid #000; }
  .table-edge-left { position: absolute; border-left: 0.5pt solid #000; }
</style>
</head>
<body>

  <!-- ══════════════ PÁGINA 1 ══════════════ -->
  <section class="page">

    ${/* El bounding box medido del logo original es 99.2x99.2pt, pero ese
         archivo tiene bastante margen transparente alrededor del círculo;
         el logo-fabpsa.png de este proyecto lo tiene más ajustado, así que
         a tamaño completo invade la línea "PARA:" — se reduce para que el
         círculo visible quede del mismo tamaño aproximado que el original. */''}
    ${LOGO_DATA_URI ? `<img class="abs" src="${LOGO_DATA_URI}" style="top:11.4pt;left:14.2pt;width:80pt;height:80pt;" />` : ''}

    ${/* Las líneas 2 y 3 se centran respecto al ancho REAL renderizado de
         la línea 1 (que no cambia, pero depende de fuentes/renderizador) —
         ese centrado se calcula después, en generarReportePdf, midiendo
         el ancho real en el navegador (ids abajo) y ajustando el left de
         estas dos; aquí quedan en 120.2 como posición de respaldo si por
         algún motivo no se ejecuta ese ajuste (ej. llamadas a _buildHtml
         fuera de generarReportePdf). */''}
    <div id="tituloEmpresa" class="abs" style="top:25.6pt;left:120.2pt;font-size:16pt;font-weight:bold;white-space:nowrap;">INDUSTRIAS ALIMENTICIAS FABP, S.A. DE C.V.</div>
    <div id="tituloReporte" class="abs" style="top:46.3pt;left:120.2pt;font-size:14pt;font-style:italic;white-space:nowrap;">REPORTE DE NOVEDADES</div>
    <div id="tituloSitio" class="abs" style="top:60.6pt;left:120.2pt;font-size:14pt;font-weight:bold;font-style:italic;white-space:nowrap;">${esc(reporte.encabezadoPDF || reporte.nombreSitio)}</div>

    <div class="abs" style="top:34pt;left:493.2pt;width:85.1pt;height:28.4pt;border:1pt solid #000;display:flex;align-items:center;justify-content:center;font-size:12pt;font-weight:bold;">${esc(reporte.folioReporte)}</div>

    <div class="abs date-row" style="top:78.3pt;right:${(PAGE_W - 578.3).toFixed(2)}pt;">
      <span>DIA</span><span class="date-line" style="width:26pt;">${inicio.dia}</span>
      <span>MES</span><span class="date-line" style="width:110pt;">${esc(inicio.mes)}</span>
      <span>DE</span><span class="date-line" style="width:40pt;">${inicio.anio}</span>
    </div>

    <div class="abs" style="top:98.6pt;left:25.5pt;font-size:9pt;">
      ${(() => {
        const dirigido = reporte.dirigidoA || 'DIRECTOR GENERAL Y/O GERENTE GENERAL'
        const partes = dirigido.split(/\s+Y\/O\s+/i)
        return partes.length === 2
          ? `PARA: ${esc(partes[0])}<br/>Y/O ${esc(partes[1])}`
          : `PARA: ${esc(dirigido)}`
      })()}
    </div>

    <div class="abs" style="top:142.2pt;left:25.5pt;width:541pt;font-size:9pt;">
      A continuación me permito presentar a usted las novedades que se presentaron en el turno de vigilancia el día
      <span class="date-line" style="width:18pt;">${inicio.dia}</span> de las <span class="date-line" style="width:32pt;">${HORA_INICIO_TURNO}</span> hrs. a las <span class="date-line" style="width:32pt;">${HORA_FIN_TURNO}</span>
      del día <span class="date-line" style="width:18pt;">${fin.dia}</span> de <span class="date-line" style="width:75pt;">${esc(fin.mes)}</span> del <span class="date-line" style="width:32pt;">${fin.anio}</span>.
    </div>

    <div class="abs" style="top:170.6pt;left:25.5pt;width:541pt;font-size:9pt;">
      Personas que permanecieron dentro de las instalaciones después de concluidas sus labores de las
      ${esc(reporte.horarioOpInicio || '')} hrs. a las ${esc(reporte.horarioOpFin || '')} hrs.
    </div>

    ${/* Texto de flujo normal (sin flex): la línea 1 empieza justo después
         de los ":" como parte natural del párrafo, y si envuelve, la
         segunda línea de TEXTO vuelve al margen izquierdo (no se queda con
         sangría debajo del valor). Las 2 líneas de captura son divs fijos,
         independientes del contenido — el mismo ancho completo siempre. */''}
    ${personalRows.map(r => `
      <div class="abs" style="top:${r.top - 8}pt;left:25.5pt;width:541pt;font-size:9pt;line-height:1.5;">
        ${esc(r.label)} ${esc(r.val || 'NINGUNO')}
      </div>
      <div class="abs personal-ghost-row" style="top:${r.top - 8}pt;left:25.5pt;width:541pt;font-size:9pt;line-height:1.5;">
        <span>${esc(r.label)}</span><span class="personal-line-inline"></span>
      </div>
      <div class="personal-line" style="top:${r.top + 20}pt;left:25.5pt;width:541pt;"></div>`).join('')}

    ${/* Excepción A: la línea empieza justo después de "No. de personas:"
         y se alinea con el margen derecho de las líneas de arriba. */''}
    <div class="abs personal-row" style="top:424.6pt;left:25.5pt;width:541pt;height:11pt;font-size:9pt;">
      <span>Personal que se encuentra laborando después de su hora de salida con pase autorizado. No. de personas:</span>
      <span class="personal-line-inline">${personal?.personalExtraNum ?? 0}</span>
    </div>

    ${/* Excepción B: la línea empieza justo después de "Departamentos:"
         y se alinea con el margen derecho de las líneas de arriba. */''}
    <div class="abs personal-row" style="top:444.5pt;left:25.5pt;width:541pt;height:11pt;font-size:9pt;">
      <span>Departamentos:</span>
      <span class="personal-line-inline">${esc(personal?.personalExtraDepts || 'NINGUNO')}</span>
    </div>

    ${/* Excepción C: Autorizado por / Horario autorizado comparten una
         misma línea horizontal, con áreas de captura del mismo ancho. */''}
    <div class="abs ap-row" style="top:464.3pt;left:25.5pt;">
      <span>Autorizado por:</span>
      <span class="ap-line">${esc(personal?.autorizadoPor || '')}</span>
      <span>Horario autorizado:</span>
      <span class="ap-line">${esc(personal?.horarioAutorizado || '')}</span>
    </div>

    <div class="abs" style="top:496.7pt;left:0pt;width:${PAGE_W}pt;text-align:center;font-size:10pt;font-weight:bold;">REGISTRO DE ENTRADAS Y SALIDAS DE EJECUTIVOS</div>

    <!-- Tabla ejecutivos -->
    ${(() => {
      const ejecBottom = EJEC_TOP + ejecRowH * (1 + ejecutivos.length)
      return `
        <div class="table-edge-top" style="top:${EJEC_TOP}pt;left:${EJEC_COLS[0]}pt;width:${EJEC_COLS[EJEC_COLS.length - 1] - EJEC_COLS[0]}pt;"></div>
        <div class="table-edge-left" style="top:${EJEC_TOP}pt;left:${EJEC_COLS[0]}pt;height:${ejecBottom - EJEC_TOP}pt;"></div>`
    })()}
    ${['NOMBRE', 'PUESTO', 'Entrada', 'Salida', 'Entrada', 'Salida', 'Entrada', 'Salida', 'OBSERVACIONES'].map((h, i) =>
      `<div class="cell cell-thin t-center" style="top:${EJEC_TOP}pt;left:${EJEC_COLS[i]}pt;width:${ejecColW[i]}pt;height:${ejecRowH}pt;font-weight:bold;font-size:7pt;${i>=2&&i<=7?'padding-left:1pt;padding-right:1pt;':''}">${h}</div>`
    ).join('')}
    ${ejecutivos.map(filaEjec).join('')}

    ${LAYOUT_B ? '' : rondinesBloque}

  </section>

  <!-- ══════════════ PÁGINA 2 ══════════════ -->
  <section class="page">

    <!-- Tabla vehículos -->
    ${(() => {
      const vehBottomEdge = VEH_HEADER_TOP + VEH_HEADER_H + vehRowH * vehiculos.length
      return `
        <div class="table-edge-top" style="top:${VEH_HEADER_TOP}pt;left:${VEH_COLS[0]}pt;width:${VEH_COLS[VEH_COLS.length - 1] - VEH_COLS[0]}pt;"></div>
        <div class="table-edge-left" style="top:${VEH_HEADER_TOP}pt;left:${VEH_COLS[0]}pt;height:${vehBottomEdge - VEH_HEADER_TOP}pt;"></div>`
    })()}
    ${['UNIDAD', 'SALIDA', 'ENTRADA', 'SALIDA', 'ENTRADA', 'SALIDA', 'ENTRADA', 'SALIDA', 'ENTRADA', 'KM S', 'KM E'].map((h, i) =>
      `<div class="cell cell-thin t-center" style="top:${VEH_HEADER_TOP}pt;left:${VEH_COLS[i]}pt;width:${vehColW[i]}pt;height:${VEH_HEADER_H}pt;font-weight:bold;font-size:7pt;">${h}</div>`
    ).join('')}
    ${vehiculos.map(filaVeh).join('')}

    ${(() => {
      const vehBottom = VEH_HEADER_TOP + VEH_HEADER_H + vehRowH * vehiculos.length
      const ubicTop = vehBottom + UBIC_HEADER_GAP
      const ubicBottom = ubicTop + UBIC_HEADER_H + ubicRowH * ubicaciones.length

      // Observaciones generales (sitios con tieneObservacionesGen=1, ej. No
      // Alérgenos): un campo de texto libre debajo de Ubicación, con una
      // línea pegada tras los ":" y 14 renglones más en blanco debajo
      // (15 líneas en total — el campo suele llevar bastante texto) —
      // mismo patrón ya usado en la sección de Personal. El espaciado entre
      // líneas se angosta automáticamente solo si no alcanza el espacio
      // antes de Firmas (sitios con muchos vehículos/destinos), nunca por
      // debajo de un piso legible.
      const OBS_LINE_GAP_BASE = 12
      const OBS_LINE_GAP_MIN = 11
      const obsTop = ubicBottom + OBS_GAP
      let obsLineGap = OBS_LINE_GAP_BASE
      if (LAYOUT_B) obsLineGap = trasera.obsH
      else if (tieneObsGen) {
        const firmaBlockFixedH = FIRMA_LABEL_GAP + FIRMA_BOX_TOP_GAP + FIRMA_BOX_H + FIRMA_ROLE_GAP + 20
        const disponible = (PAGE_H - 10) - obsTop - firmaBlockFixedH
        obsLineGap = Math.max(OBS_LINE_GAP_MIN, Math.min(OBS_LINE_GAP_BASE, disponible / OBS_TOTAL_LINES))
      }
      const obsBottom = tieneObsGen ? obsTop + obsLineGap * OBS_TOTAL_LINES : ubicBottom

      // Cada renglón escrito en el campo = un ítem de lista (en su propia
      // línea, con viñeta). Se respetan los saltos de línea que captura el
      // usuario; no se corre todo de corrido.
      // Un renglón largo ya no se corta con "...": se parte por palabras en
      // los renglones siguientes (con sangría bajo la viñeta). Si el texto
      // total excede los 15 renglones, el sobrante se junta en el último,
      // que envuelve y se encoge para que se vea completo.
      const obsItems = String(reporte.observacionesGenerales || '')
        .split(/\r?\n/)
        .map(l => l.trim().replace(/^[-•*]\s*/, ''))
        .filter(Boolean)
      const OBS_CHARS_PRIMERA = 95   // tras "Observaciones:" (9pt Helvetica)
      const OBS_CHARS = 112
      const obsLineas = []
      for (const item of obsItems) {
        let actual = '• '
        for (const palabra of item.split(/\s+/)) {
          const max = obsLineas.length === 0 ? OBS_CHARS_PRIMERA : OBS_CHARS
          if (actual.trim() && (actual + palabra).length > max) {
            obsLineas.push(actual.trimEnd())
            actual = '   '
          }
          actual += palabra + ' '
        }
        obsLineas.push(actual.trimEnd())
      }
      if (obsLineas.length > OBS_TOTAL_LINES) {
        const resto = obsLineas.splice(OBS_TOTAL_LINES - 1).map(l => l.trim()).join(' ')
        obsLineas.push(resto)
      }
      const obsDesbordado = obsLineas.length === OBS_TOTAL_LINES &&
        obsLineas[OBS_TOTAL_LINES - 1].length > OBS_CHARS
      const obsRow = (i) => {
        const Y = obsTop + obsLineGap * i
        const texto = obsLineas[i] ? esc(obsLineas[i]).replace(/^ +/, m => '&nbsp;'.repeat(m.length)) : ''
        if (i === OBS_TOTAL_LINES - 1 && obsDesbordado) {
          return `
            <div class="abs fit-libre" style="top:${Y - 8}pt;left:25.5pt;width:541pt;height:${obsLineGap + 1}pt;font-size:9pt;line-height:1.05;overflow:hidden;">${texto}</div>
            <div class="personal-line" style="top:${Y + 3.7}pt;left:25.5pt;width:541pt;"></div>`
        }
        if (i === 0) {
          return `
            <div class="abs personal-row" style="top:${Y - 8}pt;left:25.5pt;width:541pt;height:11pt;font-size:9pt;">
              <span>Observaciones:</span>
              <span class="personal-line-inline">${texto}</span>
            </div>`
        }
        return `
          <div class="abs" style="top:${Y - 8}pt;left:25.5pt;width:541pt;height:11pt;font-size:9pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${texto}</div>
          <div class="personal-line" style="top:${Y + 3.7}pt;left:25.5pt;width:541pt;"></div>`
      }
      const obsHtml = tieneObsGen
        ? Array.from({ length: OBS_TOTAL_LINES }, (_, i) => obsRow(i)).join('')
        : ''

      const firmaLabelTop = (LAYOUT_B ? rondBottomY : obsBottom) + FIRMA_LABEL_GAP

      const ubicacionHtml = `
        <div class="abs" style="top:${vehBottom + UBIC_TITLE_GAP - 8}pt;left:0pt;width:${PAGE_W}pt;text-align:center;font-size:9pt;font-weight:bold;">UBICACIÓN E INCIDENCIA DE VEHÍCULOS</div>
        <div style="position:relative;">
          <div class="table-edge-top" style="top:${ubicTop}pt;left:${UBIC_COLS[0]}pt;width:${UBIC_COLS[UBIC_COLS.length - 1] - UBIC_COLS[0]}pt;"></div>
          <div class="table-edge-left" style="top:${ubicTop}pt;left:${UBIC_COLS[0]}pt;height:${ubicBottom - ubicTop}pt;"></div>
          ${['VEHÍCULO', 'OBSERVACIONES'].map((h, i) =>
            `<div class="cell cell-thin t-center" style="top:${ubicTop}pt;left:${UBIC_COLS[i]}pt;width:${ubicColW[i]}pt;height:${UBIC_HEADER_H}pt;font-weight:bold;font-size:8pt;">${h}</div>`
          ).join('')}
          ${ubicaciones.map((u, i) => {
            const top = ubicTop + UBIC_HEADER_H + ubicRowH * i
            const desc = String(u.observaciones || '').trim()
            const cells = [
              esc(u.destino),
              `<span>${esc(listaUnidades(u.vehiculos))}${desc ? ` <span class="desc-mini">— ${esc(desc)}</span>` : ''}</span>`,
            ]
            return rowHtml(cells, UBIC_COLS, ubicColW, top, ubicRowH, ['t-left', 't-left fit'], 'cell-thin')
          }).join('')}
        </div>`

      const firmaHeaderTop = firmaLabelTop - 11
      const firmaRoleRowH = FIRMA_ROLE_GAP + 20
      const firmaBottom = firmaHeaderTop + (firmaLabelTop + FIRMA_BOX_TOP_GAP - firmaHeaderTop) + FIRMA_BOX_H + firmaRoleRowH
      const firmaEdges = `
        <div class="table-edge-top" style="top:${firmaHeaderTop}pt;left:${FIRMA_COLS[0]}pt;width:${FIRMA_COLS[FIRMA_COLS.length - 1] - FIRMA_COLS[0]}pt;"></div>
        <div class="table-edge-left" style="top:${firmaHeaderTop}pt;left:${FIRMA_COLS[0]}pt;height:${firmaBottom - firmaHeaderTop}pt;"></div>`

      const firmasHtml = firmaEdges + [
        firmaCol(0, ['REPORTÓ', 'VIGILANTE EN TURNO'], reporte.reporto, firmaReporto, firmaLabelTop),
        firmaCol(1, ['RECIBIÓ', 'VIGILANTE QUE RECIBE'], reporte.recibio, firmaRecibio, firmaLabelTop),
        firmaCol(2, ['ENTERADO', 'JEFE DE VIGILANCIA'], nombreEnterado1, firmaEnterado1, firmaLabelTop),
        firmaCol(3, ['ENTERADO', 'DIRECCION GENERAL Y/O', 'GERENCIA GENERAL'], '', null, firmaLabelTop),
      ].join('')

      return ubicacionHtml + obsHtml + (LAYOUT_B ? rondinesBloque : '') + firmasHtml
    })()}

  </section>

</body>
</html>`
}

/**
 * GET /api/vigilancia/reportes/:idReporte/pdf
 * Genera y descarga el PDF del reporte (solo reportes CERRADOS).
 */
async function generarReportePdf(req, res) {
  let browser
  try {
    const idReporte = parseInt(req.params.idReporte)
    const data = await _fetchReporteCompleto(idReporte)
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Reporte no encontrado' })
    }
    if (data.reporte.estatus !== 2) {
      return res.status(400).json({ ok: false, error: 'Solo se puede imprimir un reporte cerrado' })
    }

    const html = buildHtml(data)

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Centra "REPORTE DE NOVEDADES" y el nombre del sitio respecto al ancho
    // REAL renderizado de la línea de la empresa (fijo en el HTML, pero su
    // ancho depende de cómo el motor de render mida esa fuente) — se mide
    // en el propio navegador en vez de asumir un ancho fijo a mano.
    await page.evaluate(() => {
      const empresa = document.getElementById('tituloEmpresa')
      const reporte = document.getElementById('tituloReporte')
      const sitio = document.getElementById('tituloSitio')
      if (!empresa || !reporte || !sitio) return
      const base = empresa.getBoundingClientRect()
      const centro = base.left + base.width / 2
      for (const el of [reporte, sitio]) {
        const w = el.getBoundingClientRect().width
        el.style.left = `${centro - w / 2}px`
      }
    })

    // ajustarTextoLargo: las celdas .fit (observaciones de rondines,
    // descripción de ubicación) y el último renglón desbordado de
    // Observaciones bajan su fuente hasta que el texto cabe completo.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.cell.fit, .fit-libre')) {
        let size = parseFloat(getComputedStyle(el).fontSize)
        const minimo = 4.5 * (96 / 72) // 4.5pt en px
        const nodos = [el, ...el.querySelectorAll('.desc-mini')]
        const base = nodos.map(n => parseFloat(getComputedStyle(n).fontSize))
        let factor = 1
        while (el.scrollHeight > el.clientHeight + 1 && size * factor > minimo) {
          factor -= 0.05
          nodos.forEach((n, i) => { n.style.fontSize = `${base[i] * factor}px` })
        }
      }
    })

    const pdfBuffer = await page.pdf({
      width: `${PAGE_W / 72}in`,
      height: `${PAGE_H / 72}in`,
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${data.reporte.folioReporte}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    })
    res.send(Buffer.from(pdfBuffer))
  } catch (err) {
    console.error('[vigilanciaPdf.service] generarReportePdf:', err)
    res.status(500).json({ ok: false, error: 'Error al generar el PDF' })
  } finally {
    if (browser) await browser.close()
  }
}

module.exports = { generarReportePdf, _buildHtml: buildHtml }
