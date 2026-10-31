const {createHash} = require('node:crypto');
function snapshot(rows) {
  const modulos=[...new Set(rows.map(r=>r.clave))].sort();
  return {
    modulos,
    esMto:modulos.includes('mantenimiento') && rows.some(r=>r.clave==='mantenimiento' && Boolean(r.esMto)),
    esAdminVigilancia:modulos.includes('vigilancia') && rows.some(r=>r.clave==='vigilancia' && Boolean(r.esAdmin)),
  };
}
function revision(value) {return createHash('sha256').update(JSON.stringify({modulos:[...value.modulos].sort(),esMto:Boolean(value.esMto),esAdminVigilancia:Boolean(value.esAdminVigilancia)})).digest('hex');}
module.exports={snapshot,revision};
