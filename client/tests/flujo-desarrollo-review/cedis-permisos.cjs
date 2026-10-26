const { chromium, expect } = require('@playwright/test');
const fs = require('fs'), http = require('http'), assert = require('node:assert/strict');
(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/bundle.js' ? fs.readFileSync('.flujo-desarrollo-review/bundle.js') : '<!doctype html><html data-theme="light"><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>');
  }).listen(4364);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let saved = { modulos: ['portal', 'escaner'], esMto: false }; const errors = []; let manager=true,hasAccess=true; const userWrites=[];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/usuarios/capacidades') return route.fulfill({json:{puedeVerUsuarios:hasAccess,puedeCrear:manager,puedeGestionarCreacion:manager}});
      if(url.pathname==='/api/usuarios/CONTADOR' && route.request().method()==='PUT'){userWrites.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});}
      if (url.pathname === '/api/permisos/modulos') return route.fulfill({ json: [
        { clave: 'usuarios_admin', nombre: 'Administración de usuarios', icono: 'ti-users' },
        { clave: 'usuarios_crear', nombre: 'Crear usuarios', icono: 'ti-user-plus' },
        { clave: 'portal', nombre: 'Portal Corporativo', icono: 'ti-home' },
        { clave: 'escaner', nombre: 'Escáner CEDIS', icono: 'ti-barcode' },
        { clave: 'escaner_contabilidad', nombre: 'Contabilidad · solo consulta', icono: 'ti-eye' },
        { clave: 'gestion_desarrollo', nombre: 'Gestión de Desarrollo', icono: 'ti-code' },
        { clave: 'mantenimiento', nombre: 'Mantenimiento', icono: 'ti-tool' }
      ] });
      if (url.pathname.endsWith('/CONTADOR/modulos')) {
        if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
        return route.fulfill({ json: saved });
      }
      return route.fulfill({ json: [{ login: 'CONTADOR', name: 'Usuario Contabilidad', email:'test@example.test', area: 'CONTABILIDAD', sitio: 'PLANTA', active: 'Y' }] });
    });
    await page.goto('http://localhost:4364/?view=usuarios-admin');
    await page.getByTitle('Accesos', { exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: 'Contabilidad · solo consulta' });
    await expect(checkbox).toHaveCount(1); await expect(checkbox).not.toBeChecked();
    await checkbox.check(); await page.getByRole('button', { name: 'Guardar accesos' }).click();
    await expect.poll(() => saved.modulos.includes('escaner_contabilidad')).toBe(true);
    await page.getByTitle('Accesos', { exact: true }).click(); await expect(checkbox).toBeChecked();
    await page.screenshot({ path: '../_docs/gestion-desarrollo-revision/escaner-permiso-contabilidad.png' });
    await page.getByText('Escáner CEDIS', { exact: true }).click(); await expect(checkbox).toHaveCount(0);
    await page.getByRole('button', { name: 'Guardar accesos' }).click();
    await expect.poll(() => saved.modulos.includes('escaner')).toBe(false);
    assert.equal(saved.modulos.includes('escaner_contabilidad'), false);
    assert.equal(saved.modulos.includes('portal'), true); assert.deepEqual(errors, []);
    await page.getByRole('button',{name:'Nuevo usuario',exact:true}).waitFor();
    await page.getByTitle('Editar',{exact:true}).click();
    await page.getByLabel('Nombre corto',{exact:true}).fill('JUAN MANUEL RAMIREZ MARTINEZ');
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await expect(page.getByText('Escribe un solo nombre y un apellido. Ejemplo: Juan Ramírez.',{exact:true})).toBeVisible();assert.equal(userWrites.length,0);
    await page.getByLabel('Nombre corto',{exact:true}).fill('JUAN RAMÍREZ');await page.getByLabel('Nombre corto',{exact:true}).press('Tab');await expect(page.getByLabel('Nombre corto',{exact:true})).toHaveValue('Juan Ramírez');
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect.poll(()=>userWrites.length).toBe(1);assert.equal(userWrites[0].name,'Juan Ramírez');
    await page.getByTitle('Accesos',{exact:true}).click();await page.getByRole('checkbox',{name:'Administración de usuarios',exact:true}).check();await page.getByRole('checkbox',{name:'Crear usuarios',exact:true}).check();await page.getByRole('button',{name:'Guardar accesos'}).click();await expect.poll(()=>saved.modulos.includes('usuarios_crear')).toBe(true);
    manager=false;await page.reload();await expect(page.getByRole('button',{name:'Nuevo usuario',exact:true})).toHaveCount(0);await expect(page.getByTitle('Accesos',{exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Administración de usuarios',exact:true})).toBeVisible();hasAccess=false;await page.reload();await expect(page.getByRole('heading',{name:'Administración de usuarios',exact:true})).toHaveCount(0);
    assert.deepEqual(errors,[]);
    console.log('PASS: short name normalization/rejection, explicit creation permission, protected delegation; accounting checkbox, save/reload, child permission removed with parent; unrelated modules preserved.');
  } finally { await browser.close(); server.closeAllConnections(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
