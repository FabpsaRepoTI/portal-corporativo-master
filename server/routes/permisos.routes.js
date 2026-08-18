const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const svc = require("../services/permisos.service");

router.get("/modulos", verifyToken, async (req, res) => {
  try {
    const modulos = await svc.getModulosCatalogo();
    res.json(modulos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/usuarios/:login/modulos", verifyToken, async (req, res) => {
  try {
    const modulos = await svc.getModulosUsuario(req.params.login);
    res.json(modulos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/usuarios/:login/modulos", verifyToken, async (req, res) => {
  try {
    const { modulos } = req.body;
    await svc.setModulosUsuario(req.params.login, modulos);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
