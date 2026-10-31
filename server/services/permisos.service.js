// D:\IntranetAPI\src\services\permisos.service.js
const { getPool, sql } = require("../db");
const {snapshot,revision} = require("../helpers/accesosSnapshot");

const getModulosUsuario = async (login) => {
  const pool = await getPool();
  const res = await pool.request().input("login", sql.VarChar, login).query(`
    SELECT m.clave, um.esMto, um.esAdmin
    FROM portal_modulos m
    JOIN portal_usuario_modulos um ON m.idModulo = um.idModulo
    WHERE um.login = @login AND m.activo = 1
  `);

  const modulos = res.recordset.map((r) => r.clave);
  const esMto = res.recordset.some(
    (r) => r.clave === "mantenimiento" && r.esMto === true,
  );
  // esAdmin en Vigilancia: ve y crea reportes de TODOS los sitios sin
  // importar su área (ej. soporte/pruebas desde Sistemas).
  const esAdminVigilancia = res.recordset.some(
    (r) => r.clave === "vigilancia" && r.esAdmin === true,
  );

  return { modulos, esMto, esAdminVigilancia, revision:revision({modulos,esMto,esAdminVigilancia}) };
};

const getModulosCatalogo = async () => {
  const pool = await getPool();
  // Catalog entry only: no automatic user grants or changes to other modules.
  await pool.request().query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    IF NOT EXISTS (SELECT 1 FROM portal_modulos WITH (UPDLOCK, HOLDLOCK) WHERE clave = 'gestion_desarrollo')
      INSERT INTO portal_modulos (clave, nombre, icono, activo, orden)
      SELECT 'gestion_desarrollo', N'Gestión de Desarrollo', 'ti-chart-dots-3', 1, COALESCE(MAX(orden), 0) + 1
      FROM portal_modulos;
    IF NOT EXISTS (SELECT 1 FROM portal_modulos WITH (UPDLOCK, HOLDLOCK) WHERE clave = 'escaner_contabilidad')
      INSERT INTO portal_modulos (clave, nombre, icono, activo, orden)
      SELECT 'escaner_contabilidad', N'Contabilidad · solo consulta', 'ti-eye', 1, COALESCE(MAX(orden), 0) + 1
      FROM portal_modulos;
    IF NOT EXISTS (SELECT 1 FROM portal_modulos WITH (UPDLOCK, HOLDLOCK) WHERE clave = 'usuarios_crear')
      INSERT INTO portal_modulos (clave, nombre, icono, activo, orden)
      SELECT 'usuarios_crear', N'Crear usuarios', 'ti-user-plus', 1, COALESCE(MAX(orden), 0) + 1
      FROM portal_modulos;
    IF NOT EXISTS (SELECT 1 FROM portal_modulos WITH (UPDLOCK, HOLDLOCK) WHERE clave = 'usuarios_admin')
      INSERT INTO portal_modulos (clave, nombre, icono, activo, orden)
      SELECT 'usuarios_admin', N'Administración de usuarios', 'ti-users', 1, COALESCE(MAX(orden), 0) + 1
      FROM portal_modulos;
    IF NOT EXISTS (SELECT 1 FROM portal_modulos WITH (UPDLOCK, HOLDLOCK) WHERE clave = 'sit')
      INSERT INTO portal_modulos (clave, nombre, icono, activo, orden)
      SELECT 'sit', N'Información Técnica (SIT)', 'ti-flask', 1, COALESCE(MAX(orden), 0) + 1
      FROM portal_modulos;
    COMMIT TRANSACTION;
  `);
  const res = await pool
    .request()
    .query(`SELECT * FROM portal_modulos WHERE activo = 1 ORDER BY orden`);
  return res.recordset;
};

// claves: string[]        — lista de claves de módulos asignados
// esMto:  boolean         — si el usuario es técnico de Mantenimiento
// esAdminVigilancia: bool — si ve/crea reportes de TODOS los sitios en
//                           Vigilancia sin importar su área
const setModulosUsuario = async (login, claves, esMto = false, opciones = {}, esAdminVigilancia = false) => {
  if (!opciones.puedeGestionarCreacion) throw Object.assign(new Error('Solo el responsable autorizado puede modificar Módulos y accesos.'),{status:403});
  if (!Array.isArray(claves) || claves.some(c=>typeof c!=='string') || typeof esMto!=='boolean' || typeof esAdminVigilancia!=='boolean') throw Object.assign(new Error('Lista de permisos inválida.'),{status:400});
  if (!opciones.actor?.login) throw Object.assign(new Error('Falta identificar al responsable del cambio.'),{status:400});
  claves=[...new Set(claves)].filter(c=>(c!=='escaner_contabilidad'||claves.includes('escaner'))&&(c!=='usuarios_crear'||claves.includes('usuarios_admin'))).sort();
  const despues={modulos:claves,esMto:claves.includes('mantenimiento')&&esMto,esAdminVigilancia:claves.includes('vigilancia')&&esAdminVigilancia};
  const pool=await getPool(),tx=pool.transaction();await tx.begin();
  try {
    const target=await tx.request().input('login',sql.VarChar,login).query('SELECT login FROM SEC_USERS WITH (UPDLOCK,HOLDLOCK) WHERE login=@login');
    if(!target.recordset.length)throw Object.assign(new Error('Usuario no encontrado.'),{status:404});
    const rows=await tx.request().input('login',sql.VarChar,login).query('SELECT m.clave,um.esMto,um.esAdmin FROM portal_usuario_modulos um WITH (UPDLOCK,HOLDLOCK) JOIN portal_modulos m ON m.idModulo=um.idModulo WHERE um.login=@login AND m.activo=1');
    const antes=snapshot(rows.recordset);
    if(opciones.revision && opciones.revision!==revision(antes))throw Object.assign(new Error('Los accesos cambiaron desde que abriste esta página. Recarga los permisos antes de guardar.'),{status:409});
    const catalog=await tx.request().query('SELECT clave FROM portal_modulos WHERE activo=1');
    if(claves.some(c=>!catalog.recordset.some(r=>r.clave===c)))throw Object.assign(new Error('El catálogo cambió. Recarga los permisos disponibles.'),{status:400});
    if(revision(antes)===revision(despues)){await tx.commit();return {...despues,revision:revision(despues),sinCambios:true};}
    await tx.request().input('login',sql.VarChar,login).query('DELETE FROM portal_usuario_modulos WHERE login=@login');
    for(const clave of claves)await tx.request().input('login',sql.VarChar,login).input('clave',sql.VarChar,clave).input('esMto',sql.Bit,clave==='mantenimiento'&&despues.esMto?1:0).input('esAdmin',sql.Bit,clave==='vigilancia'&&despues.esAdminVigilancia?1:0).query('INSERT INTO portal_usuario_modulos (login,idModulo,esMto,esAdmin) SELECT @login,idModulo,@esMto,@esAdmin FROM portal_modulos WHERE clave=@clave AND activo=1');
    await tx.request().input('login',sql.NVarChar(128),login).input('actor',sql.NVarChar(128),opciones.actor.login).input('nombre',sql.NVarChar(200),opciones.actor.name||opciones.actor.login).input('antes',sql.NVarChar(sql.MAX),JSON.stringify(antes)).input('despues',sql.NVarChar(sql.MAX),JSON.stringify(despues)).query('INSERT INTO dbo.portal_accesos_historial (login,responsable,nombreResponsable,antes,despues) VALUES (@login,@actor,@nombre,@antes,@despues)');
    await tx.commit();return {...despues,revision:revision(despues)};
  } catch(err){await tx.rollback();if(err.number===208)throw Object.assign(new Error('Falta aplicar la migración del historial de accesos. No se guardó ningún cambio.'),{status:503});throw err;}
};
async function getHistorialAccesos(login,cursor) {
  if(cursor && !/^\d+$/.test(String(cursor)))throw Object.assign(new Error('Página de historial inválida.'),{status:400});
  const pool=await getPool();
  try {
    const result=await pool.request().input('login',sql.NVarChar(128),login).input('cursor',sql.BigInt,cursor||null).query('SELECT TOP (21) id,responsable,nombreResponsable,fecha,antes,despues FROM dbo.portal_accesos_historial WHERE login=@login AND (@cursor IS NULL OR id<@cursor) ORDER BY id DESC');
    const items=result.recordset.slice(0,20).map(r=>({...r,fecha:new Date(r.fecha).toISOString(),antes:JSON.parse(r.antes),despues:JSON.parse(r.despues)}));
    return {items,nextCursor:result.recordset.length>20?String(items[items.length-1].id):null};
  }catch(err){if(err.number===208)throw Object.assign(new Error('El historial estará disponible al aplicar la migración de accesos.'),{status:503});throw err;}
}
module.exports={getModulosUsuario,getModulosCatalogo,setModulosUsuario,getHistorialAccesos};
