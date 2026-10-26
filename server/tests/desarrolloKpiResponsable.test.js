const fs=require('fs'),test=require('node:test'),assert=require('node:assert/strict');
test('Development KPI query scopes all totals to an optional parameterized engineer',async()=>{
const source=fs.readFileSync(require.resolve('../services/solicitudesDesarrollo.service'),'utf8');
const fn=source.slice(source.indexOf('async function getKpis('),source.indexOf('\n}',source.indexOf('async function getKpis('))+2);
let inputs={},query;const request={input(k,t,v){inputs[k]=v;return this},async query(q){query=q;return {recordset:[{pendientes:2}]}}};
const getKpis=new Function('getPool','sql','ID_SERVICIO',fn+';return getKpis')(async()=>({request:()=>request}),{Int:0,VarChar:()=>0},2);
await getKpis('admin',"engineer'1");assert.equal(inputs.responsable,"engineer'1");assert.match(query,/@responsable IS NULL OR s.tecnicoAsignado=@responsable/);assert.ok(!query.includes("engineer'1"));await getKpis('admin');assert.equal(inputs.responsable,null);
});
