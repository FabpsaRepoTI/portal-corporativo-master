const test=require('node:test'),assert=require('node:assert/strict');
const {resumir}=require('../services/mntEjecutivo.service');
test('maintenance distinguishes closed, rejected, material and awaiting acceptance without double counting staff',()=>{
 const rows=[{idSolicitud:1,idEstatus:2,tipoMantenimiento:1,fechaCompromiso:'2020-01-01'},{idSolicitud:2,idEstatus:3,evaluacionVB:1,tipoMantenimiento:1},{idSolicitud:3,idEstatus:4,tipoMantenimiento:2},{idSolicitud:4,idEstatus:3,evaluacionVB:null},{idSolicitud:5,idEstatus:0}];
 const data=resumir(rows,[{idSolicitud:1,clave:'a',nombre:'A'},{idSolicitud:1,clave:'a',nombre:'A'},{idSolicitud:2,clave:'a',nombre:'A'},{idSolicitud:3,clave:'a',nombre:'A'}]);
 assert.equal(data.resumen.activos,3);assert.equal(data.resumen.preventivos,2);assert.equal(data.resumen.preventivosActivos,1);assert.equal(data.resumen.detenidos,1);assert.equal(data.resumen.pendientesVB,1);assert.equal(data.resumen.cerrados,1);assert.equal(data.resumen.vencidos,1);assert.equal(data.equipo[0].activos,1);assert.equal(data.equipo[0].detenidos,1);
});
test('empty maintenance produces actual zero totals',()=>{const d=resumir([]);assert.equal(d.resumen.total,0);assert.deepEqual(d.equipo,[]);});
