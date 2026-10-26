const test=require('node:test'),assert=require('node:assert/strict');
const {esDesarrolladorPermitido,normalizarLogin}=require('../services/dev/desarrolladores.policy');
test('excludes exactly the three configured people regardless of accents, case and spacing',()=>{for(const name of ['Sofía Rodríguez',' SOFIA  RODRIGUEZ ','Lizbet Hernández','Jorge González'])assert.equal(esDesarrolladorPermitido(name),false);for(const name of ['Juan Ramírez','Abraham Moreno','Damián Rodríguez','Jorge Pérez'])assert.equal(esDesarrolladorPermitido(name),true);});
test('matches allowed accounts without case or surrounding whitespace differences',()=>{assert.equal(normalizarLogin(' JMRAMIREZ '),'jmramirez');assert.equal(normalizarLogin(null),'');});
