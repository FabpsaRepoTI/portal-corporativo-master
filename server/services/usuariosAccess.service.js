const { getModulosUsuario } = require('./permisos.service');

function puedeGestionarCreacion(user) {
  const owners = String(process.env.USER_CREATION_MANAGERS || '').split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
  return String(user?.area || '').trim().toUpperCase() === 'SISTEMAS' && owners.includes(String(user?.login || '').trim().toUpperCase());
}

// Historial de cambios de accesos: exclusivo de los logins en
// ACCESOS_HISTORIAL_LOGINS (por defecto JMRAMIREZ), aunque otros
// usuarios tengan usuarios_admin y puedan asignar permisos.
function puedeVerHistorialAccesos(user) {
  const logins = String(process.env.ACCESOS_HISTORIAL_LOGINS || 'JMRAMIREZ').split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
  return logins.includes(String(user?.login || '').trim().toUpperCase());
}

async function capacidadesUsuarios(user) {
  if (!user?.login) return { puedeVerUsuarios:false, puedeCrear: false, puedeGestionarCreacion: false, puedeAsignarPermisos: false, puedeVerHistorialAccesos: false };
  const manager = puedeGestionarCreacion(user);
  const { modulos } = await getModulosUsuario(user.login);
  const puedeVerUsuarios = manager || modulos.includes('usuarios_admin');
  // Cualquiera con el módulo usuarios_admin puede asignar módulos a otros usuarios,
  // no solo crearlos. Delegación total: incluye poder otorgar usuarios_admin/usuarios_crear.
  const puedeAsignarPermisos = manager || modulos.includes('usuarios_admin');
  return { puedeVerUsuarios, puedeCrear: manager || (puedeVerUsuarios && modulos.includes('usuarios_crear')), puedeGestionarCreacion: manager, puedeAsignarPermisos, puedeVerHistorialAccesos: puedeAsignarPermisos && puedeVerHistorialAccesos(user) };
}

async function requireCrearUsuario(req, res, next) {
  try {
    if (!(await capacidadesUsuarios(req.user)).puedeCrear) return res.status(403).json({ error: 'No tienes permiso para crear usuarios. Solicita autorización al responsable de accesos.' });
    next();
  } catch {
    res.status(503).json({ error: 'No se pudo verificar el permiso para crear usuarios.' });
  }
}

async function protegerCuentaAutorizada(req, res, next) {
  if (puedeGestionarCreacion(req.user) || String(req.user?.login).toUpperCase() === String(req.params.login).toUpperCase()) return next();
  try {
    const { modulos } = await getModulosUsuario(req.params.login);
    const responsable = puedeGestionarCreacion({login:req.params.login,area:'SISTEMAS'});
    if (responsable || modulos.includes('usuarios_crear') || modulos.includes('usuarios_admin')) return res.status(403).json({ error: 'Solo el responsable de accesos puede editar la cuenta de otro usuario autorizado para crear usuarios.' });
    next();
  } catch { res.status(503).json({ error: 'No se pudo verificar la protección de esta cuenta.' }); }
}

async function requireAdministracionUsuarios(req,res,next) {
  try {
    if (!(await capacidadesUsuarios(req.user)).puedeVerUsuarios) return res.status(403).json({error:'No tienes acceso a Administración de usuarios.'});
    next();
  } catch {res.status(503).json({error:'No se pudo verificar el acceso a Administración de usuarios.'});}
}
async function requireGestionAccesos(req,res,next) {
  try {
    if (!(await capacidadesUsuarios(req.user)).puedeAsignarPermisos) return res.status(403).json({error:'No tienes acceso a Módulos y accesos.'});
    next();
  } catch { res.status(503).json({error:'No se pudo verificar el acceso a Módulos y accesos.'}); }
}
module.exports = { requireAdministracionUsuarios, requireGestionAccesos, capacidadesUsuarios, puedeGestionarCreacion, requireCrearUsuario, protegerCuentaAutorizada };
