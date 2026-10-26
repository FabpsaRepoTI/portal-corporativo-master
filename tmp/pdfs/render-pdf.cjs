const { chromium } = require('../../client/node_modules/@playwright/test')

const files = [
  ['referencia', 'file:///C:/Users/Admin/Downloads/reporte%20vigilancia.pdf'],
  ['generado', 'file:///C:/Users/Admin/OneDrive%20-%20Industrias%20Alimenticias%20FABP,%20S.A.%20de%20C.V/Escritorio/reporteGenerado.pdf'],
  ['plantilla', 'file:///C:/proyectos/portal-corporativo-master/tmp/pdfs/vigilancia-plantilla.pdf'],
]

for (const [name, url] of files) {
  const filename = decodeURIComponent(url.replace('file:///', ''))
  const source = require('fs').readFileSync(filename, 'latin1')
  const pages = source.match(/\/Type\s*\/Page(?!s)/g) || []
  const mediaBoxes = source.match(/\/MediaBox\s*\[[^\]]+\]/g) || []
  const fonts = [...new Set(source.match(/\/BaseFont\s*\/[^\s/]+/g) || [])]
  console.log(`${name}: pages=${pages.length}; mediaBoxes=${mediaBoxes.join(', ') || 'inherited'}; fonts=${fonts.join(', ') || 'embedded/inherited'}`)

  if (name === 'referencia') {
    const zlib = require('zlib')
    const streamRe = /<<[\s\S]{0,1000}?\/FlateDecode[\s\S]{0,1000}?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g
    let match
    let index = 0
    while ((match = streamRe.exec(source))) {
      try {
        const text = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
        if (/REPORTE|ROND|VEH|BT\s|Tf/.test(text)) {
          console.log(`reference stream ${index}:\n${text.slice(0, 5000)}`)
        }
      } catch {}
      index += 1
    }
  }
}

;(async () => {
  const browser = await chromium.launch()
  try {
    for (const [name, url] of files) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
      page.goto(url, { waitUntil: 'commit', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(3000)
      await page.screenshot({ path: `tmp/pdfs/${name}.png`, fullPage: true })
      console.log(`Rendered ${name}: ${await page.title()}`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
