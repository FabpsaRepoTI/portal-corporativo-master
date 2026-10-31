const { getModulosUsuario } = require('../services/permisos.service');

// Read current grants so an access change also applies to existing sessions.
async function cedisAccess(req, res, next) {
  if (!req.user?.login) return res.status(401).json({ ok: false, message: 'Sesión requerida.' });
  try {
    const { modulos } = await getModulosUsuario(req.user.login);
    if (!modulos.includes('escaner')) return res.status(403).json({ ok: false, message: 'No tienes acceso al visor de facturas.' });
    req.cedisAccess = { soloConsulta: modulos.includes('escaner_contabilidad') };
    next();
  } catch (e) {
    console.error('[cedis] No se pudieron verificar los permisos:', e.message);
    res.status(503).json({ ok: false, message: 'No se pudieron verificar tus permisos. Intenta de nuevo.' });
  }
}

function requireScanner(req, res, next) {
  if (!req.cedisAccess || req.cedisAccess.soloConsulta) return res.status(403).json({ ok: false, message: 'Tu acceso es de solo consulta. No puedes registrar surtidos.' });
  next();
}

async function authorizeCedisGrantChange(req, res, next) {
  if (!Array.isArray(req.body?.modulos)) return res.status(400).json({ error: 'Lista de módulos inválida.' });
  // Same administrator area already required by the user administration screen.
  if (String(req.user?.area || '').trim().toUpperCase() === 'SISTEMAS') return next();
  try {
    const { modulos } = await getModulosUsuario(req.params.login);
    const changed = ['escaner', 'escaner_contabilidad'].some(key => modulos.includes(key) !== req.body.modulos.includes(key));
    if (changed) return res.status(403).json({ error: 'Solo Sistemas puede modificar los accesos de facturas.' });
    next();
  } catch (e) {
    res.status(503).json({ error: 'No se pudieron verificar los accesos actuales.' });
  }
}

module.exports = { cedisAccess, requireScanner, authorizeCedisGrantChange };
