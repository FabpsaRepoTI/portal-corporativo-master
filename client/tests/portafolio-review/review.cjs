const {
  chromium
} = require('@playwright/test');
const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('node:assert/strict');
const {
  buildPortfolio
} = require('../../../server/services/portafolio.model');
(async () => {
  const artifacts = path.resolve('../_docs/gestion-desarrollo-revision');
  fs.mkdirSync(artifacts, {
    recursive: true
  });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/bundle.js' ? fs.readFileSync('.portfolio-review/bundle.js') : '<!doctype html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/bundle.js"></script></html>');
  }).listen(4318, '127.0.0.1');
  let browser;
  try {
    browser = await chromium.launch({
      headless: true
    });
    const page = await browser.newPage({
      viewport: {
        width: 1536,
        height: 1024
      }
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => {
      errors.push(e.message);
      console.error(e.message);
    });
    const requests = [];
    const date = n => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const people = ['Ana Torres', 'Luis Ramírez', 'Mariana López', 'Jorge Sánchez'];
    const rows = ['Portal Corporativo', 'Migración de Mantenimiento', 'Scan Secure CEDIS', 'Repositorio documental', 'Facturación móvil'].map((titulo, i) => ({
      idSolicitud: i + 1,
      folioDesarrollo: 'DEV-00' + (i + 1),
      titulo,
      area: ['TI / Corporativo', 'Operaciones', 'Logística', 'Administración', 'Ventas'][i],
      loginResponsable: 'dev' + i % 4,
      nombreResponsable: people[i % 4],
      porcentajeAvance: [72, 58, 35, 60, 25][i],
      idEstatus: [3, 5, 4, 3, 2][i],
      estatusNombre: ['En desarrollo', 'En pruebas', 'En revisión', 'En desarrollo', 'En evaluación'][i],
      fechaInicio: date(-20),
      fechaCompromiso: date(4 + i * 3),
      diasRestantes: 4 + i * 3,
      fechaCreacion: date(-30),
      segundosAbiertos: 100 * 3600,
      fechaActualizacion: date(0),
      tiempoEstado: 'en_tiempo',
      bloqueosActivos: i === 2 ? 1 : 0,
      horasEstimadas: [20, 40, 68, 48, 36][i],
      idPrioridad: 1,
      prioridadNombre: 'Alta',
      proximoEntregable: ['Módulo de noticias', 'Pruebas de integración', 'Prototipo funcional', 'Carga masiva piloto', 'Documento de requisitos'][i]
    }));
    rows.push({
      idSolicitud: 90,
      titulo: 'Solicitud pendiente',
      idEstatus: 1,
      loginResponsable: '',
      fechaCreacion: date(-5),
      segundosAbiertos: 120 * 3600
    }, {
      idSolicitud: 91,
      titulo: 'Revisión sin responsable',
      idEstatus: 1,
      loginResponsable: '',
      fechaCreacion: date(-4),
      segundosAbiertos: 96 * 3600
    }, {
      idSolicitud: 92,
      titulo: 'Concluido',
      idEstatus: 7,
      loginResponsable: 'alberto',
      nombreResponsable: 'Alberto Manzo',
      porcentajeAvance: 100
    });
    const capacities = people.map((_, i) => ({
      loginUsuario: 'dev' + i,
      horasDisponibles: 80
    }));
    let published = null;
    await page.route('**/api/**', async route => {
      const req = route.request(),
        u = new URL(req.url());
      requests.push(u.pathname);
      let r = {
        ok: true,
        data: []
      };
      if (u.pathname === '/api/gestion-desarrollo/portafolio') r = {
        ok: true,
        ...buildPortfolio(rows, capacities)
      };else if (/\/api\/solicitudes-desarrollo\/\d+$/.test(u.pathname)) {
        const row = rows.find(p => p.idSolicitud === Number(u.pathname.split('/').pop()));
        r = {
          ...row,
          tecnicoAsignado: row.loginResponsable,
          nombreTecnico: row.nombreResponsable
        };
      } else if (/\/api\/gestion-desarrollo\/proyectos\/\d+\/avances$/.test(u.pathname)) {
        published = JSON.parse(req.postData());
        if (published.estado === 'PUBLICADO') rows.find(p => p.idSolicitud === Number(u.pathname.split('/')[4])).porcentajeAvance = published.avanceNuevo;
        r = {
          ok: true,
          data: {
            idAvance: 1
          }
        };
      } else if (u.pathname.startsWith('/api/gestion-desarrollo/proyectos/')) r = {
        ok: true,
        data: {
          avances: []
        }
      };else if (u.pathname.includes('notificaciones')) r = {
        notificaciones: [],
        data: [],
        grupos: [],
        unread: 0
      };
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(r)
      });
    });
    await page.goto('http://127.0.0.1:4318');
    await page.locator('.portfolio-table tbody tr').first().waitFor();
    assert.equal(await page.locator('.portfolio-table tbody tr').count(), 5);
    assert.equal(await page.locator('.portfolio-team-table tbody').getByText('Alberto Manzo').count(), 0);
    assert.equal(await page.locator('.portfolio-attention-item').count(), 3);
    const checkScroll = async () => {
      const dims = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        w: innerWidth,
        h: innerHeight
      }));
      assert(dims.width <= dims.w + 1, JSON.stringify(dims));
      assert(dims.height <= dims.h + 1, JSON.stringify(dims));
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.portfolio-card>.portfolio-pager')].filter(e => e.getBoundingClientRect().bottom > e.parentElement.getBoundingClientRect().bottom + 1).length);
      assert.equal(clipped, 0, 'Panel pagination must not be clipped');
    };
    await checkScroll();
    await page.screenshot({
      path: path.join(artifacts, 'portafolio-1536.png'),
      fullPage: true
    });
    await page.setViewportSize({
      width: 1366,
      height: 768
    });
    await checkScroll();
    await page.screenshot({
      path: path.join(artifacts, 'portafolio-1366.png'),
      fullPage: true
    });
    await page.getByLabel('Buscar proyecto o responsable').fill('Luis');
    assert.equal(await page.locator('.portfolio-table tbody tr').count(), 1);
    await page.getByLabel('Buscar proyecto o responsable').fill('');
    rows[0].porcentajeAvance = 83;
    rows[0].idEstatus = 4;
    rows[0].estatusNombre = 'En revisión';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.locator('.portfolio-table tbody tr').first().getByText('83%', {
      exact: true
    }).waitFor();
    await page.locator('.portfolio-table tbody tr').first().getByText('Revisión', {
      exact: true
    }).waitFor();
    await page.getByRole('button', {
      name: 'Registrar avance',
      exact: true
    }).click();
    await page.getByLabel('Proyecto del avance').selectOption('1');
    await page.getByLabel('Etapa del avance',{exact:true}).selectOption('2');
    await page.getByLabel('Inicio de la etapa',{exact:true}).fill('2026-09-11');
    await page.getByLabel('Término de la etapa',{exact:true}).fill('2026-09-25');
    await page.locator('textarea').nth(0).fill('Trabajo terminado');
    await page.locator('textarea').nth(1).fill('Trabajo actual');
    await page.locator('textarea').nth(2).fill('Trabajo siguiente');
    await page.locator('input[type=number]').first().fill('2');
    await page.locator('input[type=range]').fill('85');
    await page.getByRole('button', {
      name: 'Publicar avance',
      exact: true
    }).click();
    await page.locator('.portfolio-table tbody tr').first().getByText('85%', {
      exact: true
    }).waitFor();
    assert.equal(published.avanceNuevo, 85);
    assert.equal(published.minutosInvertidos, 120);
    assert.equal(Number(published.numeroEtapa),2);
    assert.equal(published.fechaInicioEtapa,"2026-09-11");
    assert.equal(published.fechaFinEtapa,"2026-09-25");
    rows[1].loginResponsable = '';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.locator('.portfolio-table tbody tr').nth(1).getByText('Sin responsable', {
      exact: true
    }).waitFor();
    assert.equal(await page.locator('.portfolio-table tbody tr').nth(1).getByText('En tiempo', {
      exact: true
    }).count(), 0);
    for (let i = 100; i < 113; i++) rows.push({
      ...rows[0],
      idSolicitud: i,
      titulo: 'Desarrollo ' + i
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByLabel('Proyectos siguiente', {
      exact: true
    }).waitFor();
    await page.getByLabel('Proyectos siguiente', {
      exact: true
    }).click();
    assert.equal(await page.locator('.portfolio-table tbody tr').count(), 5);
    await checkScroll();
    await page.setViewportSize({
      width: 390,
      height: 844
    });
    await page.screenshot({
      path: path.join(artifacts, 'portafolio-movil.png'),
      fullPage: true
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(!requests.some(p => p.startsWith('/api/dev/')), 'Portfolio must never read or mutate independent dev records');
    assert.deepEqual(errors, []);
    console.log('PASS: shared Mesa source, live status/progress refresh, 84h alerts, assigned team, publishing to original id, paging, no desktop scroll, mobile width.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
