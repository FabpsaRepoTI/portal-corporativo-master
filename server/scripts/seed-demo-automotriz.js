// server/scripts/seed-demo-automotriz.js
// Datos de demostración del SGC para la industria automotriz (idEmpresa = 99).
// Uso (desde /server):  node scripts/seed-demo-automotriz.js
//
// - Empresa FICTICIA: no usa el nombre de ninguna empresa real (los registros son
//   inventados: NCs, riesgos, indicadores). Se puede cambiar en EMPRESA_DEMO.
// - Idempotente: borra y vuelve a crear SOLO lo que tiene idEmpresa = 99 (y sus
//   registros hijos). Nunca toca los datos de FABPSA (idEmpresa = 1).
// - Folios con sufijo D (NC-2026-D001): los índices de folio son globales y el
//   consecutivo se calcula con TRY_CAST sobre el número, así que estos folios ni
//   chocan con los de FABPSA ni alteran su numeración.
// - Usuarios demo en sec_users con active = 'N': sus nombres aparecen en las
//   pantallas, pero nadie puede iniciar sesión con ellos.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const { getPool, sql } = require("../db");

const DEMO_EMPRESA_ID = 99;
const EMPRESA_DEMO = "Transmisiones del Bajío";

const U = {
  laura: { login: "DEMO.LVEGA", name: "Laura Vega", role: "Coordinadora SGC", area: "SGI" },
  miguel: { login: "DEMO.MTORRES", name: "Miguel Ángel Torres", role: "Auditor interno", area: "Calidad" },
  daniela: { login: "DEMO.DFUENTES", name: "Daniela Fuentes", role: "Responsable de Producción", area: "Producción" },
  roberto: { login: "DEMO.RSANCHEZ", name: "Roberto Sánchez", role: "Dirección", area: "Dirección" },
};

const PROCESOS = [
  { k: "direccion", nombre: "Planeación estratégica", tipo: 1, resp: "roberto", iso: "IATF 5.1", x: 80, y: 40 },
  { k: "calidad", nombre: "Gestión de calidad (IATF 16949)", tipo: 1, resp: "laura", iso: "IATF 4.4", x: 380, y: 40 },
  { k: "apqp", nombre: "APQP y PPAP", tipo: 2, resp: "miguel", iso: "IATF 8.3", x: 40, y: 220 },
  { k: "estampado", nombre: "Estampado", tipo: 2, resp: "daniela", iso: "IATF 8.5.1", x: 300, y: 220 },
  { k: "soldadura", nombre: "Soldadura MIG", tipo: 2, resp: "daniela", iso: "IATF 8.5.1", x: 560, y: 220 },
  { k: "termico", nombre: "Tratamiento térmico", tipo: 2, resp: "daniela", iso: "IATF 8.5.1", x: 820, y: 220 },
  { k: "ensamble", nombre: "Ensamble de transmisiones", tipo: 2, resp: "daniela", iso: "IATF 8.5.1", x: 300, y: 400 },
  { k: "inspeccion", nombre: "Inspección final", tipo: 2, resp: "miguel", iso: "IATF 8.6", x: 560, y: 400 },
  { k: "compras", nombre: "Compras y desarrollo de proveedores", tipo: 3, resp: "laura", iso: "IATF 8.4", x: 40, y: 580 },
  { k: "mantenimiento", nombre: "Mantenimiento y metrología", tipo: 3, resp: "daniela", iso: "IATF 7.1.5", x: 300, y: 580 },
  { k: "rh", nombre: "Competencia y capacitación", tipo: 3, resp: "laura", iso: "IATF 7.2", x: 560, y: 580 },
];
const RELACIONES = [
  ["apqp", "estampado", 1, "Plan de control y PFMEA"],
  ["estampado", "soldadura", 1, "Componentes estampados"],
  ["soldadura", "termico", 1, "Subensambles soldados"],
  ["termico", "ensamble", 1, "Engranes tratados"],
  ["ensamble", "inspeccion", 1, "Transmisión ensamblada"],
  ["compras", "estampado", 3, "Acero laminado certificado"],
  ["mantenimiento", "ensamble", 3, "Equipos calibrados"],
  ["rh", "soldadura", 3, "Operadores certificados"],
  ["calidad", "inspeccion", 2, "Criterios de aceptación"],
];

async function main() {
  const db = await getPool();
  const tx = new sql.Transaction(db);
  await tx.begin();
  const q = (texto, params = {}) => {
    const r = new sql.Request(tx);
    for (const [k, [tipo, v]] of Object.entries(params)) r.input(k, tipo, v);
    return r.query(texto);
  };
  const E = { e: [sql.Int, DEMO_EMPRESA_ID] };
  const conteo = {};
  const suma = (tabla, n = 1) => (conteo[tabla] = (conteo[tabla] || 0) + n);

  try {
    // ── 0. Limpieza de una corrida anterior (solo empresa 99) ──
    await q(`
      DELETE m FROM sgc_fabi_mensajes m JOIN sgc_fabi_conversaciones c ON c.idConversacion = m.idConversacion WHERE c.idEmpresa = @e;
      DELETE FROM sgc_fabi_conversaciones WHERE idEmpresa = @e;
      DELETE FROM sgc_ia_diagnosticos WHERE idEmpresa = @e;
      DELETE h FROM sgc_historial_nc h JOIN sgc_no_conformidades n ON n.idNC = h.idNC WHERE n.idEmpresa = @e;
      DELETE h FROM sgc_historial_ac h JOIN sgc_acciones_correctivas a ON a.idAC = h.idAC WHERE a.idEmpresa = @e;
      DELETE p FROM sgc_acciones_plan p JOIN sgc_acciones_correctivas a ON a.idAC = p.idAC WHERE a.idEmpresa = @e;
      DELETE h FROM sgc_hallazgos h JOIN sgc_auditorias a ON a.idAuditoria = h.idAuditoria WHERE a.idEmpresa = @e;
      DELETE x FROM sgc_auditoria_auditores x JOIN sgc_auditorias a ON a.idAuditoria = x.idAuditoria WHERE a.idEmpresa = @e;
      DELETE x FROM sgc_auditoria_areas x JOIN sgc_auditorias a ON a.idAuditoria = x.idAuditoria WHERE a.idEmpresa = @e;
      DELETE FROM sgc_acciones_correctivas WHERE idEmpresa = @e;
      DELETE FROM sgc_no_conformidades WHERE idEmpresa = @e;
      DELETE FROM sgc_auditorias WHERE idEmpresa = @e;
      DELETE h FROM sgc_historial_riesgos h JOIN sgc_riesgos r ON r.idRiesgo = h.idRiesgo WHERE r.idEmpresa = @e;
      DELETE FROM sgc_riesgos WHERE idEmpresa = @e;
      DELETE v FROM sgc_indicadores_valores v JOIN sgc_indicadores i ON i.idIndicador = v.idIndicador WHERE i.idEmpresa = @e;
      DELETE FROM sgc_indicadores WHERE idEmpresa = @e;
      DELETE x FROM sgc_procesos_relaciones x JOIN sgc_procesos p ON p.idProceso = x.idProcesoOrigen WHERE p.idEmpresa = @e;
      DELETE FROM sgc_procesos WHERE idEmpresa = @e;
    `, E);

    // ── 1. Usuarios demo (inactivos: no pueden iniciar sesión) ──
    for (const u of Object.values(U)) {
      await q(`
        IF EXISTS (SELECT 1 FROM sec_users WHERE login = @login)
          UPDATE sec_users SET name = @name, role = @role, area = @area, active = 'N' WHERE login = @login;
        ELSE
          INSERT INTO sec_users (login, pswd, name, email, active, role, area, sitio)
          VALUES (@login, '!demo-sin-acceso', @name, NULL, 'N', @role, @area, 'DEMO');
      `, { login: [sql.VarChar(255), u.login], name: [sql.VarChar(64), u.name], role: [sql.VarChar(128), u.role], area: [sql.VarChar(50), u.area] });
      suma("sec_users (demo)");
    }

    // ── 2. Mapa de procesos ──
    const proc = {};
    for (const p of PROCESOS) {
      const r = await q(`INSERT INTO sgc_procesos (idEmpresa, nombre, tipo, loginResponsable, loginDueno, clausulaISO, activo, posX, posY)
                         OUTPUT INSERTED.idProceso VALUES (@e, @n, @t, @r, @r, @iso, 1, @x, @y)`,
        { ...E, n: [sql.NVarChar(120), p.nombre], t: [sql.TinyInt, p.tipo], r: [sql.VarChar(255), U[p.resp].login], iso: [sql.NVarChar(20), p.iso], x: [sql.Int, p.x], y: [sql.Int, p.y] });
      proc[p.k] = r.recordset[0].idProceso;
      suma("sgc_procesos");
    }
    for (const [o, d, t, desc] of RELACIONES) {
      await q(`INSERT INTO sgc_procesos_relaciones (idProcesoOrigen, idProcesoDestino, tipo, descripcion) VALUES (@o, @d, @t, @desc)`,
        { o: [sql.Int, proc[o]], d: [sql.Int, proc[d]], t: [sql.TinyInt, t], desc: [sql.NVarChar(200), desc] });
      suma("sgc_procesos_relaciones");
    }

    // ── 3. Auditorías (antes que las NCs: dos NCs nacen de hallazgos) ──
    const aud = {};
    const AUDS = [
      { k: 1, folio: "AUD-2026-D001", titulo: "Auditoría interna IATF 16949 — Producción", tipo: 1, estatus: 3, plan: "2026-10-15", fin: "2026-10-16", ejec: "2026-10-15", auditor: "miguel",
        norma: "IATF 16949:2016", alcance: "Procesos de estampado, ensamble y metrología. Cláusulas 7.1.5, 8.5.1 y 8.7.",
        conclusiones: "El sistema está implementado, con dos no conformidades en control de producto no conforme y calibración de equipos de medición." },
      { k: 2, folio: "AUD-2026-D002", titulo: "Auditoría interna del sistema ambiental ISO 14001", tipo: 1, estatus: 1, plan: "2026-11-20", fin: "2026-11-21", auditor: "miguel",
        norma: "ISO 14001:2015", alcance: "Aspectos ambientales de pintura y tratamiento térmico; manejo de residuos peligrosos." },
      { k: 3, folio: "AUD-2026-D003", titulo: "Auditoría de segunda parte — cliente OEM (Stellantis)", tipo: 2, estatus: 1, plan: "2026-12-05", fin: "2026-12-05", auditor: null,
        norma: "IATF 16949:2016 + requisitos específicos del cliente", alcance: "Proceso de manufactura de transmisiones, PPAP y plan de control. Auditor externo del cliente." },
    ];
    for (const a of AUDS) {
      const r = await q(`INSERT INTO sgc_auditorias (idEmpresa, folio, titulo, tipo, alcance, normaAplicable, conclusiones, loginAuditor, idEstatus, fechaPlan, fechaFin, fechaEjecucion)
                         OUTPUT INSERTED.idAuditoria VALUES (@e, @f, @t, @tipo, @al, @no, @co, @au, @es, @pl, @fi, @ej)`,
        { ...E, f: [sql.VarChar(20), a.folio], t: [sql.NVarChar(200), a.titulo], tipo: [sql.TinyInt, a.tipo], al: [sql.NVarChar(500), a.alcance], no: [sql.NVarChar(200), a.norma],
          co: [sql.NVarChar(sql.MAX), a.conclusiones || null], au: [sql.VarChar(255), a.auditor ? U[a.auditor].login : null], es: [sql.TinyInt, a.estatus],
          pl: [sql.Date, a.plan], fi: [sql.Date, a.fin], ej: [sql.Date, a.ejec || null] });
      aud[a.k] = r.recordset[0].idAuditoria;
      suma("sgc_auditorias");
      if (a.auditor) {
        await q(`INSERT INTO sgc_auditoria_auditores (idAuditoria, login) VALUES (@id, @l)`, { id: [sql.Int, aud[a.k]], l: [sql.VarChar(255), U[a.auditor].login] });
        suma("sgc_auditoria_auditores");
      }
    }

    // ── 4. No conformidades (con su historial) ──
    const NCS = [
      { k: 1, folio: "NC-2026-D001", origen: 1, clas: 1, afec: 2, proc: "estampado", resp: "daniela", estatus: 3, det: "2026-10-15", comp: "2026-10-25",
        desc: "Desviación dimensional en engrane de 5ta velocidad (línea de estampado)",
        detalle: "IATF 16949 cl. 8.7. En auditoría interna se midieron 18 engranes del lote E-5512: 6 fuera de tolerancia en diámetro primitivo (+0.04 mm vs ±0.02 mm del plano). Lote segregado en almacén de cuarentena.",
        corr: "Contención: segregación del lote E-5512 y 100% de inspección dimensional en los lotes en tránsito.", hist: [[null, 1, "laura", "Registro inicial desde hallazgo de auditoría AUD-2026-D001", "2026-10-15"], [1, 2, "daniela", "Análisis de causa raíz con 5 porqués", "2026-10-17"], [2, 3, "daniela", "Inicia ejecución del plan AC-2026-D001", "2026-10-22"]] },
      { k: 2, folio: "NC-2026-D002", origen: 4, clas: 2, afec: 2, proc: "ensamble", resp: "daniela", estatus: 3, det: "2026-10-20", comp: "2026-11-20",
        desc: "Pintura con burbujas en carcasa de transmisión (lote #T2248)",
        detalle: "IATF 16949 cl. 8.7. Inspección visual detectó porosidad en la capa de pintura en 42 de 300 carcasas del lote T2248. Posible humedad en el aire comprimido de la cabina.",
        corr: "Retrabajo de las 42 carcasas y purga del sistema de aire comprimido.", hist: [[null, 1, "miguel", "Registro inicial", "2026-10-20"], [1, 2, "daniela", "Análisis en curso", "2026-10-21"], [2, 3, "daniela", "Corrección y verificación de secadores", "2026-10-27"]] },
      { k: 3, folio: "NC-2026-D003", origen: 6, clas: 1, afec: 3, proc: "compras", resp: "miguel", estatus: 5, det: "2026-09-12", comp: "2026-10-12", cierre: "2026-10-09",
        desc: "Proveedor de acero entregó material sin certificado de calidad",
        detalle: "IATF 16949 cl. 8.4.3. Recepción del embarque R-8812 de acero laminado sin certificado de molino. Material retenido hasta recibir el certificado.",
        corr: "Rechazo del embarque hasta recibir el certificado; aviso al proveedor.", obsCierre: "El proveedor implementó la verificación de certificados antes del embarque. Tres embarques posteriores llegaron completos.",
        hist: [[null, 1, "laura", "Registro inicial", "2026-09-12"], [1, 2, "miguel", "Análisis con el proveedor", "2026-09-15"], [2, 3, "miguel", "Proveedor actualiza su procedimiento de embarque", "2026-09-22"], [3, 4, "miguel", "Verificación con tres embarques", "2026-10-06"], [4, 5, "laura", "Cierre eficaz", "2026-10-09"]] },
      { k: 4, folio: "NC-2026-D004", origen: 1, clas: 2, afec: 2, proc: "mantenimiento", resp: "daniela", estatus: 3, det: "2026-10-15", comp: "2026-11-14",
        desc: "Medidor de torque TQ-04 sin calibración vigente",
        detalle: "IATF 16949 cl. 7.1.5. El medidor de torque TQ-04 de la línea de ensamble tenía la calibración vencida desde el 30 sep 2026 y seguía en uso.",
        corr: "Retiro del equipo y uso del medidor de respaldo TQ-07 calibrado; evaluación del producto liberado con TQ-04.", hist: [[null, 1, "miguel", "Registro inicial desde hallazgo de auditoría AUD-2026-D001", "2026-10-15"], [1, 2, "daniela", "Análisis", "2026-10-16"], [2, 3, "daniela", "Calibración externa programada", "2026-10-20"]] },
      { k: 5, folio: "NC-2026-D005", origen: 4, clas: 1, afec: 4, proc: "soldadura", resp: "laura", estatus: 1, det: "2026-10-28", comp: "2026-11-28",
        desc: "Operador sin certificación para el proceso de soldadura MIG",
        detalle: "IATF 16949 cl. 7.2. Un operador del turno 2 operaba la celda de soldadura MIG sin la certificación vigente requerida por la matriz de habilidades.",
        corr: "Reasignación inmediata del operador; supervisión directa en la celda.", hist: [[null, 1, "laura", "Registro inicial", "2026-10-28"]] },
    ];
    const nc = {};
    for (const n of NCS) {
      const r = await q(`INSERT INTO sgc_no_conformidades (idEmpresa, folioNC, idEstatus, idOrigen, idClasificacion, idAfectacion, idProceso, descripcion, descripcionDetallada,
                           correccionInmediata, loginDetecta, loginResponsable, loginAsigna, loginCierra, observacionCierre, fechaDeteccion, fechaCompromiso, fechaCierre, fechaCreacion)
                         OUTPUT INSERTED.idNC
                         VALUES (@e, @f, @es, @o, @c, @a, @p, @d, @dd, @cor, @det, @resp, @asig, @cie, @obs, @fd, @fc, @fz, @fd)`,
        { ...E, f: [sql.VarChar(20), n.folio], es: [sql.TinyInt, n.estatus], o: [sql.TinyInt, n.origen], c: [sql.TinyInt, n.clas], a: [sql.TinyInt, n.afec], p: [sql.Int, proc[n.proc]],
          d: [sql.NVarChar(300), n.desc], dd: [sql.NVarChar(sql.MAX), n.detalle], cor: [sql.NVarChar(sql.MAX), n.corr], det: [sql.VarChar(255), U[n.hist[0][2]].login],
          resp: [sql.VarChar(255), U[n.resp].login], asig: [sql.VarChar(255), U.laura.login], cie: [sql.VarChar(255), n.estatus === 5 ? U.laura.login : null],
          obs: [sql.NVarChar(sql.MAX), n.obsCierre || null], fd: [sql.Date, n.det], fc: [sql.Date, n.comp], fz: [sql.Date, n.cierre || null] });
      nc[n.k] = r.recordset[0].idNC;
      suma("sgc_no_conformidades");
      for (const [ant, nue, quien, motivo, fecha] of n.hist) {
        await q(`INSERT INTO sgc_historial_nc (idNC, estatusAnterior, estatusNuevo, login, motivo, accion, fechaRegistro) VALUES (@id, @an, @nu, @l, @m, @ac, @f)`,
          { id: [sql.Int, nc[n.k]], an: [sql.TinyInt, ant], nu: [sql.TinyInt, nue], l: [sql.VarChar(255), U[quien].login], m: [sql.NVarChar(500), motivo], ac: [sql.VarChar(20), ant == null ? "CREÓ" : null], f: [sql.DateTime, `${fecha}T15:00:00`] });
        suma("sgc_historial_nc");
      }
    }

    // Hallazgos de AUD-2026-D001: dos NCs y una observación
    const HALLAZGOS = [
      [1, "Engranes de 5ta velocidad fuera de tolerancia dimensional sin segregación oportuna.", "8.7", nc[1], "daniela"],
      [1, "Medidor de torque TQ-04 en uso con calibración vencida.", "7.1.5", nc[4], "daniela"],
      [2, "El plan de control de la línea 3 no refleja el último cambio de herramental.", "8.5.1.1", null, "miguel"],
    ];
    for (const [tipo, desc, cl, idNC, resp] of HALLAZGOS) {
      await q(`INSERT INTO sgc_hallazgos (idAuditoria, tipo, descripcion, clausulaISO, idNC, loginResponsable, fechaCompromiso, fechaCreacion)
               VALUES (@a, @t, @d, @c, @n, @r, @fc, '2026-10-15T17:00:00')`,
        { a: [sql.Int, aud[1]], t: [sql.TinyInt, tipo], d: [sql.NVarChar(sql.MAX), desc], c: [sql.NVarChar(20), cl], n: [sql.Int, idNC], r: [sql.VarChar(255), U[resp].login], fc: [sql.Date, "2026-11-15"] });
      suma("sgc_hallazgos");
    }

    // ── 5. Acciones correctivas con su plan ──
    const ACS = [
      { folio: "AC-2026-D001", nc: 1, resp: "daniela", estatus: 2, comp: "2026-11-15", alta: "2026-10-18",
        titulo: "Plan de ajuste de herramental de la línea 3",
        causa: "Desgaste del dado progresivo D-31 fuera del intervalo de mantenimiento; el PFMEA no contemplaba el desgaste como modo de falla.",
        plan: [["Revisión dimensional de engranes en proceso con CMM", "miguel", "2026-10-24", 3, 100], ["Ajuste y rectificado de dados del herramental D-31", "daniela", "2026-11-08", 1, 0], ["Validación PPAP (corrida de 300 piezas y estudio de capacidad Cpk ≥ 1.67)", "miguel", "2026-11-15", 1, 0]] },
      { folio: "AC-2026-D002", nc: 5, resp: "laura", estatus: 2, comp: "2026-11-30", alta: "2026-10-29",
        titulo: "Certificación en soldadura MIG para 4 operadores",
        causa: "La matriz de habilidades no bloqueaba la asignación de operadores sin certificación vigente en celdas críticas.",
        plan: [["Programa de certificación en soldadura MIG (AWS D1.1) para 4 operadores", "laura", "2026-11-20", 2, 40], ["Evaluación práctica y actualización de la matriz de habilidades", "miguel", "2026-11-30", 1, 0]] },
    ];
    for (const a of ACS) {
      const completadas = a.plan.filter((l) => l[3] === 3).length;
      const r = await q(`INSERT INTO sgc_acciones_correctivas (idEmpresa, folioAC, idNC, idEstatus, idHerramienta, loginResponsable, titulo, descripcion, causaRaiz, pctAvance, fechaCompromiso, fechaCreacion)
                         OUTPUT INSERTED.idAC VALUES (@e, @f, @nc, @es, 1, @r, @t, @t, @c, @pct, @fc, @fa)`,
        { ...E, f: [sql.VarChar(20), a.folio], nc: [sql.Int, nc[a.nc]], es: [sql.TinyInt, a.estatus], r: [sql.VarChar(255), U[a.resp].login], t: [sql.NVarChar(300), a.titulo],
          c: [sql.NVarChar(sql.MAX), a.causa], pct: [sql.TinyInt, Math.round((100 * completadas) / a.plan.length)], fc: [sql.Date, a.comp], fa: [sql.DateTime, `${a.alta}T16:00:00`] });
      const idAC = r.recordset[0].idAC;
      a.id = idAC;
      suma("sgc_acciones_correctivas");
      for (const [desc, resp, fecha, estatus, pct] of a.plan) {
        await q(`INSERT INTO sgc_acciones_plan (idAC, descripcion, loginResponsable, fechaCompromiso, idEstatus, pctAvance) VALUES (@a, @d, @r, @f, @es, @p)`,
          { a: [sql.Int, idAC], d: [sql.NVarChar(500), desc], r: [sql.VarChar(255), U[resp].login], f: [sql.Date, fecha], es: [sql.TinyInt, estatus], p: [sql.TinyInt, pct] });
        suma("sgc_acciones_plan");
      }
      for (const [ant, nue, motivo] of [[null, 1, `Plan de acción generado desde ${NCS[a.nc - 1].folio}`], [1, 2, "Inicio de ejecución del plan"]]) {
        await q(`INSERT INTO sgc_historial_ac (idAC, estatusAnterior, estatusNuevo, login, motivo, accion, fechaRegistro) VALUES (@a, @an, @nu, @l, @m, @ac, @f)`,
          { a: [sql.Int, idAC], an: [sql.TinyInt, ant], nu: [sql.TinyInt, nue], l: [sql.VarChar(255), U[a.resp].login], m: [sql.NVarChar(500), motivo], ac: [sql.VarChar(20), ant == null ? "CREÓ" : null], f: [sql.DateTime, `${a.alta}T16:00:00`] });
        suma("sgc_historial_ac");
      }
    }

    // ── 6. Riesgos (categorías del catálogo: 1 Operativo, 2 Calidad) ──
    const RIESGOS = [
      { nombre: "Desabasto de acero laminado por paro en el proveedor principal", cat: 1, p: 4, i: 5, resp: "laura", eco: 2400000, rev: "2026-11-15", iso: "IATF 6.1.2.3",
        desc: "Un paro laboral en el proveedor principal de acero laminado detendría estampado en 5 días (inventario de seguridad actual).", control: "Inventario de seguridad de 5 días.",
        plan: "Homologar un segundo proveedor de acero (PPAP nivel 3) y aumentar el inventario de seguridad a 10 días." },
      { nombre: "Pérdida de la certificación IATF 16949", cat: 2, p: 3, i: 5, resp: "laura", eco: 8000000, rev: "2026-12-01", iso: "IATF 4.4",
        desc: "No conformidades mayores abiertas antes de la auditoría de vigilancia podrían suspender la certificación y el estatus de proveedor Tier 1.", control: "Programa de auditorías internas y seguimiento mensual de NCs.",
        plan: "Cerrar las NCs mayores abiertas antes de la auditoría de vigilancia y simulacro de auditoría con auditor externo." },
      { nombre: "Accidente en la línea de soldadura por falta de guardas", cat: 1, p: 2, i: 5, resp: "roberto", eco: 500000, rev: "2026-11-30", iso: "ISO 45001 6.1.2",
        desc: "Dos celdas de soldadura MIG no tienen guardas fijas completas; riesgo de quemaduras y lesiones por proyección.", control: "EPP obligatorio y señalización.",
        plan: "Instalar guardas fijas e interlocks en las celdas 3 y 4." },
      { nombre: "Rechazo masivo en planta del cliente OEM por defecto dimensional", cat: 2, p: 4, i: 4, resp: "daniela", eco: 1200000, rev: "2026-11-10", iso: "IATF 8.7.1",
        desc: "Si la desviación dimensional del engrane de 5ta escapa al cliente, se activaría contención controlada nivel 1 (CS1) y cargos por línea detenida.", control: "Inspección 100% de lotes en tránsito.",
        plan: "Contención CS1 interna, validación del herramental y reforzar el plan de control con verificación SPC por turno." },
    ];
    for (const g of RIESGOS) {
      const r = await q(`INSERT INTO sgc_riesgos (idEmpresa, tipo, nombre, descripcion, probabilidad, impacto, categoria, impactoEconomico, controlExistente, planTratamiento, clausulaISO, loginResponsable, idEstatus, activo, fechaRevision, fechaCreacion)
                         OUTPUT INSERTED.idRiesgo VALUES (@e, 1, @n, @d, @p, @i, @c, @eco, @ctl, @plan, @iso, @r, 1, 1, @rev, '2026-09-01T16:00:00')`,
        { ...E, n: [sql.NVarChar(200), g.nombre], d: [sql.NVarChar(sql.MAX), g.desc], p: [sql.TinyInt, g.p], i: [sql.TinyInt, g.i], c: [sql.TinyInt, g.cat], eco: [sql.Decimal(18, 2), g.eco],
          ctl: [sql.NVarChar(sql.MAX), g.control], plan: [sql.NVarChar(sql.MAX), g.plan], iso: [sql.NVarChar(20), g.iso], r: [sql.VarChar(255), U[g.resp].login], rev: [sql.Date, g.rev] });
      // nivelRiesgo es columna calculada (probabilidad × impacto)
      await q(`INSERT INTO sgc_historial_riesgos (idRiesgo, probabilidad, impacto, login, notas, fechaRegistro) VALUES (@id, @p, @i, @l, 'Evaluación inicial', '2026-09-01T16:00:00')`,
        { id: [sql.Int, r.recordset[0].idRiesgo], p: [sql.TinyInt, g.p], i: [sql.TinyInt, g.i], l: [sql.VarChar(255), U[g.resp].login] });
      suma("sgc_riesgos");
      suma("sgc_historial_riesgos");
    }

    // ── 7. Indicadores (mensuales, 6 mediciones: may–oct 2026) ──
    const IND = [
      { clave: "DEMO-PPM", nombre: "PPM (partes por millón defectuosas)", unidad: "PPM", meta: 150, sentido: 2, resp: "miguel", iso: "IATF 9.1.1.1", serie: [138, 142, 171, 205, 268, 312] },
      { clave: "DEMO-OEE", nombre: "OEE línea de transmisiones", unidad: "%", meta: 85, sentido: 1, resp: "daniela", iso: "IATF 9.1.1.1", serie: [84.1, 83.6, 82.9, 80.2, 79.5, 78.4] },
      { clave: "DEMO-OTIF", nombre: "Entregas a tiempo y completas (OTIF)", unidad: "%", meta: 98, sentido: 1, resp: "laura", iso: "IATF 9.1.2", serie: [98.4, 98.1, 97.6, 97.2, 96.8, 96.1] },
      { clave: "DEMO-CSAT", nombre: "Satisfacción del cliente OEM (scorecard Stellantis)", unidad: "pts /5", meta: 4.5, sentido: 1, resp: "laura", iso: "IATF 9.1.2.1", serie: [4.6, 4.5, 4.5, 4.4, 4.3, 4.2] },
      { clave: "DEMO-SST", nombre: "Incidentes de seguridad y salud (SST)", unidad: "incidentes", meta: 0, sentido: 2, resp: "roberto", iso: "ISO 45001 9.1", serie: [0, 0, 1, 0, 0, 1] },
    ];
    const meses = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
    for (const ind of IND) {
      const r = await q(`INSERT INTO sgc_indicadores (idEmpresa, clave, nombre, unidad, meta, frecuencia, sentido, clausulaISO, loginResponsable, activo)
                         OUTPUT INSERTED.idIndicador VALUES (@e, @c, @n, @u, @m, 1, @s, @iso, @r, 1)`,
        { ...E, c: [sql.VarChar(30), ind.clave], n: [sql.NVarChar(120), ind.nombre], u: [sql.NVarChar(20), ind.unidad], m: [sql.Decimal(18, 2), ind.meta], s: [sql.TinyInt, ind.sentido], iso: [sql.NVarChar(20), ind.iso], r: [sql.VarChar(255), U[ind.resp].login] });
      suma("sgc_indicadores");
      for (let i = 0; i < meses.length; i++) {
        await q(`INSERT INTO sgc_indicadores_valores (idIndicador, periodo, valor, login, fechaRegistro) VALUES (@id, @p, @v, @l, DATEADD(DAY, 5, @p))`,
          { id: [sql.Int, r.recordset[0].idIndicador], p: [sql.Date, meses[i]], v: [sql.Decimal(18, 2), ind.serie[i]], l: [sql.VarChar(255), U[ind.resp].login] });
        suma("sgc_indicadores_valores");
      }
    }

    // ── 8. Conversación de ejemplo de Fab-i (mismo formato que guarda el chat) ──
    const conv = await q(`INSERT INTO sgc_fabi_conversaciones (login, idEmpresa, titulo, fechaCreacion) OUTPUT INSERTED.idConversacion VALUES (@l, @e, @t, '2026-10-30T17:10:00')`,
      { ...E, l: [sql.VarChar(255), U.laura.login], t: [sql.NVarChar(200), "¿Cómo va la NC-2026-D001?"] });
    const idConv = conv.recordset[0].idConversacion;
    suma("sgc_fabi_conversaciones");
    const ac1 = ACS[0];
    const mensajes = [
      ["user", "¿Cómo va la NC-2026-D001?"],
      ["assistant", JSON.stringify({
        tipo: "consulta_folio",
        contenido: "NC-2026-D001 está **en ejecución**, y ya venció su fecha compromiso.",
        folio: "NC-2026-D001",
        modulo: "nc",
        datos: {
          tipo: "No conformidad", estado: "En ejecución", semaforo: "rojo",
          descripcion: NCS[0].desc,
          campos: [["Responsable", U.daniela.name], ["Fecha compromiso", "25 oct 2026"], ["Clasificación", "Mayor"], ["Proceso", "Estampado"], ["Días para compromiso", -6]],
          vinculos: [{ folio: ac1.folio, url: `/sgc/acciones-correctivas/${ac1.id}` }],
        },
        url_detalle: `/sgc/no-conformidades/${nc[1]}`,
      })],
      ["user", "Necesito registrar una NC: el operador de torque no registró los valores del turno nocturno, es la tercera vez esta semana"],
      ["assistant", JSON.stringify({
        tipo: "nc",
        contenido: "Al ser la tercera vez en la semana lo dejé como **Mayor**: es un incumplimiento sistemático del registro de una característica especial. Adjunta las hojas de registro de torque de los tres turnos y la lista de transmisiones ensambladas sin registro. Requisito: IATF 16949 cl. 7.1.5 y el plan de control de ensamble.",
        borrador_nc: {
          descripcion: "Operador de torque no registró los valores del turno nocturno; tercera omisión en la semana.",
          descripcion_detallada: "En la estación de apriete de la línea de ensamble no se registraron los valores de torque del turno nocturno en tres ocasiones durante la semana, incumpliendo el plan de control (característica especial). Evidencia: hojas de registro incompletas.",
          clasificacion: "Mayor",
          afectacion: "Calidad del producto",
          proceso_sugerido: "Ensamble de transmisiones",
          area_sugerida: "Producción",
        },
      })],
    ];
    let minuto = 10;
    for (const [rol, contenido] of mensajes) {
      await q(`INSERT INTO sgc_fabi_mensajes (idConversacion, rol, contenido, fechaRegistro) VALUES (@c, @r, @t, @f)`,
        { c: [sql.Int, idConv], r: [sql.VarChar(20), rol], t: [sql.NVarChar(sql.MAX), contenido], f: [sql.DateTime, `2026-10-30T17:${String(minuto++).padStart(2, "0")}:00`] });
      suma("sgc_fabi_mensajes");
    }

    await tx.commit();
    console.log(`Demo "${EMPRESA_DEMO}" (idEmpresa ${DEMO_EMPRESA_ID}) creada:`);
    for (const [t, n] of Object.entries(conteo)) console.log(`  ${t.padEnd(28)} ${n}`);
    process.exit(0);
  } catch (err) {
    try { await tx.rollback(); } catch { /* ya cerrada */ }
    console.error("ERROR (no se guardó nada):", err.message);
    process.exit(1);
  }
}

main();
