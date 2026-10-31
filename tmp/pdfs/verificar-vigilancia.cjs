const fs = require('fs')
const assert = require('node:assert/strict')
const { chromium } = require('../../client/node_modules/@playwright/test')
const { _buildHtml } = require('../../server/services/vigilanciaPdf.service')

const data = {
  reporte: {
    fechaInicio: '2026-10-01T00:00:00Z', fechaFin: '2026-10-02T00:00:00Z',
    horaInicio: '06:00', horaFin: '06:00', horarioOpInicio: '18:00', horarioOpFin: '06:00',
    nombreSitio: 'PLANTA', encabezadoPDF: 'PLANTA', folioReporte: 'VIG-TEST-001',
    dirigidoA: 'DIRECTOR GENERAL Y/O GERENTE GENERAL', reporto: 'Vigilante de prueba', recibio: 'Vigilante de relevo',
  },
  personal: {
    deptAdministracion: 'NINGUNO', deptAlmacen: 'NINGUNO', deptReparto: 'NINGUNO', retardos: 'NINGUNO',
    faltas: 'NINGUNO', incapacitados: 'NINGUNO', pasesAutorizados: 'NINGUNO', personalExtraNum: 0,
    personalExtraDepts: 'NINGUNO', autorizadoPor: 'NINGUNO', horarioAutorizado: 'NINGUNO',
  },
  ejecutivos: Array.from({ length: 5 }, (_, i) => ({ nombre: `EJECUTIVO ${i + 1}`, puesto: 'GERENCIA', movimientos: [], observaciones: 'SIN NOVEDAD' })),
  rondines: Array.from({ length: 5 }, (_, i) => ({ horaReferencia: `0${i + 1}:00`, etiqueta: `RONDÍN ${i + 1}`, area: 'GENERAL', observaciones: 'SIN NOVEDAD' })),
  vehiculos: Array.from({ length: 4 }, (_, i) => ({ numero: 68 + i, movimientos: [], kmSalida: '', kmEntrada: '', observacion: 'NO SALIO' })),
  ubicaciones: Array.from({ length: 4 }, (_, i) => ({ destino: `UBICACIÓN ${i + 1}`, vehiculos: [] })),
  vigilantesRecibio: [],
}

;(async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(_buildHtml(data), { waitUntil: 'load' })
    const output = 'tmp/pdfs/vigilancia-plantilla.pdf'
    await page.pdf({ path: output, width: '215mm', height: '279mm', preferCSSPageSize: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    const source = fs.readFileSync(output, 'latin1')
    const pages = (source.match(/\/Type\s*\/Page(?!s)/g) || []).length
    assert.equal(pages, 2, `se esperaban 2 páginas y se generaron ${pages}`)
    console.log(`PASS: plantilla fija de vigilancia genera ${pages} páginas`)
  } finally {
    await browser.close()
  }
})().catch((error) => { console.error(error); process.exitCode = 1 })
