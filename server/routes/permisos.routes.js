// D:\IntranetAPI\src\routes\permisos.routes.js
const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const svc = require("../services/permisos.service");
const { capacidadesUsuarios, requireGestionAccesos } = require('../services/usuariosAccess.service');
router.use(verifyToken, requireGestionAccesos);

router.get("/modulos", verifyToken, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const modulos = await svc.getModulosCatalogo();
    res.json(modulos);
  } catch (err) {
    console.error("[permisos] Error al registrar o consultar el catálogo:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/usuarios/:login/modulos", verifyToken, async (req, res) => {
  try {
    const permisos = await svc.getModulosUsuario(req.params.login);
    res.json(permisos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/usuarios/:login/modulos", verifyToken, async (req, res) => {
  try {
    const { modulos, esMto = false, esAdminVigilancia = false } = req.body;
    const { puedeAsignarPermisos } = await capacidadesUsuarios(req.user);
    const guardado = await svc.setModulosUsuario(req.params.login, modulos, esMto, { puedeGestionarCreacion: puedeAsignarPermisos, actor:req.user, revision:req.body.revision }, esAdminVigilancia);
    res.json({ ok: true, ...guardado });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/usuarios/:login/historial', async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
    const { puedeVerHistorialAccesos } = await capacidadesUsuarios(req.user);
    if(!puedeVerHistorialAccesos) return res.status(403).json({error:'No tienes acceso al historial de cambios.'});
    res.json(await svc.getHistorialAccesos(req.params.login,req.query.cursor));}
  catch(err){res.status(err.status||500).json({error:err.message});}
});
module.exports = router;
