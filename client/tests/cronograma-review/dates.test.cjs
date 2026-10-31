const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');
const source=fs.readFileSync(require('path').resolve(__dirname,'../../src/pages/gestionDesarrollo/cronograma/cronogramaDates.js'),'utf8').replaceAll('export function','function');
const {calendarDate,datedStages,stageGeometry,scheduleEvents,milestoneLayout,upcomingDeliveries}=new Function(source+';return {calendarDate,datedStages,stageGeometry,scheduleEvents,milestoneLayout,upcomingDeliveries}')();
test('ISO days retain their local calendar date and invalid dates are rejected',()=>{assert.equal(calendarDate('2026-09-11T00:00:00.000Z').getDate(),11);assert.equal(calendarDate('2026-02-30'),null);assert.equal(calendarDate('invalid'),null)});
test('open stages with real start dates remain visible without fabricating an end',()=>{const stages=datedStages({etapas:[{numeroEtapa:2,fechaInicio:'2026-09-11',fechaCierre:null,fechaCompromiso:null}]});assert.equal(stages.length,1);assert.equal(stages[0].finish,null);assert.equal(stageGeometry(stages[0],calendarDate('2026-09-07')).partial,true)});
test('commitment-only, closed and empty stages are distinguished',()=>{assert.equal(datedStages({etapas:[{fechaCompromiso:'2026-09-12'},{fechaInicio:'bad'},{fechaCierre:'2026-09-13'}]}).length,2)});
test('same-day and inclusive final-day durations render, outside periods do not',()=>{const start=calendarDate('2026-09-07');const stage=datedStages({etapas:[{fechaInicio:'2026-09-07',fechaCompromiso:'2026-09-07'}]})[0];assert.ok(stageGeometry(stage,start).width>0);assert.equal(stageGeometry(stage,calendarDate('2026-10-01')),null);assert.equal(stageGeometry({...stage,finish:calendarDate('2026-09-06')},start).invalid,true)});

test('reported response: seven projects, no stages, four real commitments and three upcoming deliveries',()=>{
 const rows=[null,null,null,'2026-09-10','2026-09-14','2026-09-14','2026-09-23'].map((date,i)=>({idProyecto:i+6,idEstatus:2,fechaInicio:null,fechaCompromiso:date?date+'T00:00:00.000Z':null,etapas:[],hitos:[]}));
 assert.equal(rows.flatMap(datedStages).length,0);assert.equal(rows.flatMap(scheduleEvents).length,4);
 assert.equal(upcomingDeliveries(rows,new Date(2026,8,11)),3);assert.equal(scheduleEvents(rows[0]).length,0);
 assert.equal(scheduleEvents(rows[6])[0].fechaCompromiso,'2026-09-23T00:00:00.000Z');assert.equal(rows[6].hitos.length,0);
});

test('nearby and coincident dates use separate lanes and retain the original day',()=>{const dates=['2026-09-14','2026-09-15','2026-09-15','2026-09-29'];const result=milestoneLayout(dates.map((fechaCompromiso,i)=>({idHito:i,fechaCompromiso})),calendarDate('2026-09-14'));assert.equal(result.length,4);assert.deepEqual(result.slice(0,3).map(e=>e.lane),[0,1,2]);assert.equal(result[1].x,result[2].x);assert.equal(result[3].lane,0);});
test('stage deliverables reach the displayed milestone',()=>{const events=scheduleEvents({idProyecto:1,etapas:[{numeroEtapa:1,fechaCompromiso:'2026-09-20',entregable:'Documento de análisis aprobado'}]});assert.equal(events[0].entregable,'Documento de análisis aprobado');});
