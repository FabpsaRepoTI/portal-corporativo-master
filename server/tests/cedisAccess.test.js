const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
function setup(modulos, failure = false) {
  const mod = { exports: {} }, calls = [];
  new Function('require', 'module', 'console', fs.readFileSync(require.resolve('../middleware/cedisAccess'), 'utf8'))(() => ({ getModulosUsuario: async login => {
    calls.push(login); if (failure) throw new Error('offline'); return { modulos };
  } }), mod, { error() {} });
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  return { ...mod.exports, calls, res };
}
test('accounting can read but cannot scan, even with an old unrestricted JWT', async () => {
  const e = setup(['escaner', 'escaner_contabilidad']);
  const req = { user: { login: 'CONTADOR', modulos: ['escaner'] }, body: { soloConsulta: false } };
  let next = 0;
  await e.cedisAccess(req, e.res, () => next++);
  assert.equal(next, 1); assert.equal(req.cedisAccess.soloConsulta, true);
  e.requireScanner(req, e.res, () => next++);
  assert.equal(next, 1); assert.equal(e.res.code, 403); assert.deepEqual(e.calls, ['CONTADOR']);
});
test('operator with current scanner access can read and scan', async () => {
  const e = setup(['escaner']), req = { user: { login: 'OPERADOR' } }; let next = 0;
  await e.cedisAccess(req, e.res, () => next++); e.requireScanner(req, e.res, () => next++);
  assert.equal(next, 2); assert.equal(req.cedisAccess.soloConsulta, false);
});
test('revoked module access is denied despite old token grants', async () => {
  for (const grants of [[], ['escaner_contabilidad']]) {
    const e = setup(grants);
    await e.cedisAccess({ user: { login: 'USER', modulos: ['escaner'] } }, e.res, () => assert.fail('must deny'));
    assert.equal(e.res.code, 403);
  }
});
test('missing identity and unavailable permission database fail closed', async () => {
  const e = setup([], true);
  await e.cedisAccess({}, e.res, () => assert.fail()); assert.equal(e.res.code, 401); assert.equal(e.calls.length, 0);
  await e.cedisAccess({ user: { login: 'USER' } }, e.res, () => assert.fail()); assert.equal(e.res.code, 503);
  e.requireScanner({}, e.res, () => assert.fail()); assert.equal(e.res.code, 403);
});
test('accounting cannot remove its own restriction or grant scanner access through permissions API', async () => {
  for (const grants of [['escaner'], []]) {
    const e = setup(['escaner', 'escaner_contabilidad']);
    await e.authorizeCedisGrantChange({ user: { area: 'CONTABILIDAD' }, params: { login: 'SELF' }, body: { modulos: grants } }, e.res, () => assert.fail());
    assert.equal(e.res.code, 403);
  }
  const e = setup([]);
  await e.authorizeCedisGrantChange({ user: { area: 'VENTAS' }, params: { login: 'SELF' }, body: { modulos: ['escaner'] } }, e.res, () => assert.fail());
  assert.equal(e.res.code, 403);
});
test('existing Sistemas administrator can configure accounting mode', async () => {
  const e = setup([]); let allowed = false;
  await e.authorizeCedisGrantChange({ user: { area: 'SISTEMAS' }, body: { modulos: ['escaner', 'escaner_contabilidad'] } }, e.res, () => allowed = true);
  assert.equal(allowed, true);
});
test('saving access preserves accounting restriction only with parent scanner module', async () => {
  const source = fs.readFileSync(require.resolve('../services/permisos.service'), 'utf8');
  for (const [grants, expected] of [[['escaner', 'escaner_contabilidad'], ['escaner', 'escaner_contabilidad']], [['portal', 'escaner_contabilidad'], ['portal']]]) {
    const inserted = [], mod = { exports: {} };
    const tx = { begin: async () => {}, commit: async () => {}, rollback: async () => {}, request() {
      let key; return { input(k, t, v) { if (k === 'clave') key = v; return this; }, async query(q) { if (q.includes('INSERT INTO portal_usuario_modulos')) inserted.push(key); return {recordset:q.includes('SELECT login FROM SEC_USERS')?[{login:'USER'}]:q.includes('SELECT clave FROM portal_modulos')?['portal','escaner','escaner_contabilidad'].map(clave=>({clave})):[]}; } };
    } };
    new Function('require', 'module', source)(name => name.includes('accesosSnapshot')?require('../helpers/accesosSnapshot'):({ sql: {NVarChar:()=>{}}, getPool: async () => ({ transaction: () => tx }) }), mod);
    await mod.exports.setModulosUsuario('USER', grants, false, {puedeGestionarCreacion:true,actor:{login:'OWNER'}}); assert.deepEqual(inserted, expected);
  }
});
