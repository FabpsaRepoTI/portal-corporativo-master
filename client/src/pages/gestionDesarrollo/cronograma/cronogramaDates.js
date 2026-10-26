// Calendar dates are interpreted as calendar days, without UTC offset shifts.
export function calendarDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
export function datedStages(project) {
  return (project.etapas || []).map(stage => ({
    ...stage,
    start: calendarDate(stage.fechaInicio),
    finish: calendarDate(stage.fechaCompromiso) || calendarDate(stage.fechaCierre)
  })).filter(stage => stage.start || stage.finish);
}
export function stageGeometry(stage, start, days = 42) {
  const day = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const origin = day(start);
  const from = day(stage.start || stage.finish) - origin;
  const to = day(stage.finish || stage.start) - origin;
  if (to < from) return { invalid: true };
  if (to < 0 || from >= days) return null;
  return { left: Math.max(0, from) / days * 100,
    width: (Math.min(days, to + 1) - Math.max(0, from)) / days * 100,
    partial: !stage.start || !stage.finish };
}

// Project commitments are not stage dates and are never persisted as milestones.
export function scheduleEvents(project) {
  const events = (project.hitos || []).filter(h => calendarDate(h.fechaCompromiso)).map(h=>({...h,entregable:h.entregable || project.etapas?.find(e=>Number(e.numeroEtapa)===Number(h.etapa))?.entregable}));
  for (const stage of project.etapas || []) {
    const date = stage.fechaCompromiso || stage.fechaCierre;
    if (!calendarDate(date) || events.some(h=>Number(h.etapa)===Number(stage.numeroEtapa) && +calendarDate(h.fechaCompromiso)===+calendarDate(date))) continue;
    events.push({idHito:'stage-'+project.idProyecto+'-'+stage.numeroEtapa,nombre:stage.nombreEtapa || ({1:'Análisis',2:'Desarrollo',3:'Revisión',4:'Pruebas',5:'Liberación'})[stage.numeroEtapa],fechaCompromiso:date,idEstatus:stage.fechaCierre?3:1,etapa:stage.numeroEtapa,entregable:stage.entregable,esEtapa:true,notas:stage.fechaCierre?'Etapa cerrada.':'Término previsto de la etapa.'});
  }
  const commitment = calendarDate(project.fechaCompromiso);
  if (!commitment) return events;
  return [...events, {
    idHito: 'project-commitment-' + project.idProyecto,
    nombre: 'Compromiso del proyecto',
    fechaCompromiso: project.fechaCompromiso,
    idEstatus: Number(project.idEstatus) === 7 ? 3 : 1,
    esCompromisoProyecto: true,
    entregable:project.etapas?.find(e=>+calendarDate(e.fechaCompromiso)===+commitment)?.entregable,
    notas: 'Fecha de compromiso registrada para el proyecto. No hay una duración de etapa asociada a esta fecha.'
  }];
}
// Labels use separate lanes when they would collide at the track's minimum width.
export function milestoneLayout(events, start, days=42) {
  const lanes=[];
  return events.map(h=>({h,x:(calendarDate(h.fechaCompromiso)-start)/(days*86400000)*100}))
    .filter(e=>e.x>=0&&e.x<=100).sort((a,b)=>a.x-b.x)
    .map(e=>{
      const reverse=e.x>86, left=reverse?e.x-14:e.x, right=reverse?e.x:e.x+14;
      let lane=lanes.findIndex(end=>end+1<=left);if(lane<0)lane=lanes.length;
      lanes[lane]=right;return {...e,lane,reverse};
    });
}
export function upcomingDeliveries(projects, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start); end.setDate(end.getDate() + 14);
  return projects.reduce((total, project) => {
    const days = new Set(scheduleEvents(project).filter(h => Number(h.idEstatus) !== 3)
      .map(h => calendarDate(h.fechaCompromiso)).filter(d => d >= start && d <= end).map(d => +d));
    return total + days.size;
  }, 0);
}
