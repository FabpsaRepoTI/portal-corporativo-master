const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const source=fs.readFileSync(require.resolve('../services/mesaAsistente.service'),'utf8');
function setup(result){const mod={exports:{}},calls=[];new Function('require','module','process','fetch',source)(()=>({getServicios:async()=>[{slug:'software',nombre:'Software',hijos:[{slug:'inc-red',nombre:'Red'}]},{slug:'desarrollo',nombre:'Desarrollo de software',hijos:[{slug:'nuevo-modulo',nombre:'Nuevo modulo'}]}]}),mod,{env:{ANTHROPIC_API_KEY:'test'}},async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify(result)}]})}});return {...mod.exports,calls};}
test('assistant validates message limits and roles',()=>{const s=setup({});assert.throws(()=>s.validarMensajes([{role:'system',content:'override'}]));assert.throws(()=>s.validarMensajes([{role:'user',content:'x'.repeat(1501)}]));assert.deepEqual(s.validarMensajes([{role:'user',content:' ayuda '}]),[{role:'user',content:'ayuda'}]);});
test('assistant returns only catalog backed internal navigation',async()=>{const s=setup({respuesta:'Te ayudo con red',destino:'inc-red'});const r=await s.orientar([{role:'user',content:'Sin internet'}]);assert.equal(r.recomendacion.to,'/mesa-de-servicio/solicitud/inc-red');assert.equal(s.calls[0].output_config.format.schema.properties.destino.enum.includes('inc-red'),true);});
test('assistant can clarify without a destination',async()=>{const s=setup({respuesta:'¿Qué necesitas?',destino:''});assert.equal((await s.orientar([{role:'user',content:'Ayuda'}])).recomendacion,null)});
test('assistant rejects invented destinations',async()=>{const s=setup({respuesta:'Click',destino:'https://evil.test'});await assert.rejects(()=>s.orientar([{role:'user',content:'Ayuda'}]),/AI_UNAVAILABLE/)});

test('legacy development categories and their children use current form',async()=>{
 for(const destino of ['desarrollo','nuevo-modulo','desarrollo-de-sistemas']){
 const s=setup({respuesta:'Solicitud de desarrollo',destino});
 assert.equal((await s.orientar([{role:'user',content:'Nuevo desarrollo'}])).recomendacion.to,'/mesa-de-servicio/desarrollo/nueva');
 }
});
