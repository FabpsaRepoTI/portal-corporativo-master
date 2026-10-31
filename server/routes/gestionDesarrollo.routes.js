"use strict";
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const svc = require("../services/gestionDesarrollo.service");
const JWT_SECRET = process.env.JWT_SECRET || "fabpsa_secret_2026_intranet";

function auth(req, res, next) {
  const value = req.headers.authorization;
  if (!value?.startsWith("Bearer ")) return res.status(401).json({ ok: false, message: "Sin token" });
  try { req.user = jwt.verify(value.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ ok: false, message: "Token inválido" }); }
}
function sistemas(req, res, next) {
  if (String(req.user?.area || "").toUpperCase() !== "SISTEMAS") return res.status(403).json({ ok: false, message: "Acceso restringido al equipo de Sistemas" });
  next();
}
router.use(auth, sistemas);
// Restringe acciones de escritura a logins específicos, sin ocultar el
// módulo ni la lectura — solo la acción falla con un mensaje normal.
const LOGINS_SOLO_LECTURA = [];
router.use((req, res, next) => {
  if (
    req.method !== "GET" &&
    LOGINS_SOLO_LECTURA.includes(String(req.user?.login || "").toUpperCase())
  ) {
    return res.status(403).json({ ok: false, message: "No se pudo completar la acción. Intenta de nuevo más tarde." });
  }
  next();
});
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const reportRequests=new Set();
router.post('/analisis-ia',async(req,res)=>{
 const key='executive:'+req.user.login;
 if(reportRequests.has(key))return res.status(409).json({ok:false,error:'Ya se está generando el análisis de desarrollo.'});
 reportRequests.add(key);
 try{
  const data=await require('../controllers/ejecutivo.controller').getAnalisisIA({desarrollo:true});
  res.json({ok:true,data});
 }catch{res.status(500).json({ok:false,error:'No se pudieron consultar los datos de desarrollo para generar el análisis.'});}
 finally{reportRequests.delete(key);}
});

router.post('/proyectos/:id/reporte',async(req,res)=>{
 const key=req.user.login+':'+req.params.id;
 if(reportRequests.has(key)) return res.status(409).json({ok:false,message:'Ya se está generando este reporte.'});
 reportRequests.add(key);
 try{res.json({ok:true,data:await require('../services/desarrolloReporte.service').generarReporte(Number(req.params.id),req.user)});}
 catch(e){res.status(400).json({ok:false,message:e.message});}
 finally{reportRequests.delete(key);}
});
router.get("/portafolio", async (req, res) => {
  try { res.json({ ok: true, ...(await svc.getPortafolio(req.query)) }); }
  catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});
router.get('/finalizados',async(req,res)=>{
  try {res.json({ok:true,data:await svc.getFinalizados()});}
  catch(e){res.status(500).json({ok:false,message:e.message});}
});
router.get('/proyectos/:id/trazabilidad',async(req,res)=>{
  try {res.json({ok:true,data:await svc.getTrazabilidad(Number(req.params.id),req.user.login)});}
  catch(e){res.status(400).json({ok:false,message:e.message});}
});
router.get("/proyectos/:id", async (req, res) => {
  try {
    const data = await svc.getProyecto(Number(req.params.id), req.user.login);
    if (!data) return res.status(404).json({ ok: false, message: "Trabajo no encontrado" });
    res.json({ ok: true, data });
  } catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});
router.post("/proyectos/:id/avances", async (req, res) => {
  try { res.status(201).json({ ok: true, data: await svc.guardarAvance(Number(req.params.id), req.body, req.user) }); }
  catch (e) { res.status(e.status || 400).json({ ok: false, message: e.message }); }
});
const etapas = require('../services/desarrolloEtapas.service');
router.get('/etapas/:origen/:id',async(req,res)=>{
 try {res.json({ok:true,data:await etapas.list(req.params.origen,Number(req.params.id))});}
 catch(e){res.status(400).json({ok:false,message:e.message});}
});
router.put('/etapas/:origen/:id',async(req,res)=>{
 try {res.json({ok:true,data:await etapas.save(req.params.origen,Number(req.params.id),req.body,req.user)});}
 catch(e){res.status(400).json({ok:false,message:e.message});}
});
router.delete('/etapas/:origen/:id',async(req,res)=>{
 try {res.json({ok:true,data:await etapas.clear(req.params.origen,Number(req.params.id),req.user)});}
 catch(e){res.status(400).json({ok:false,message:e.message});}
});
module.exports = router;
