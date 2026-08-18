const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const { getPerfil, updateFoto } = require("../services/perfil.service");

// GET /api/perfil
router.get("/", verifyToken, async (req, res) => {
  try {
    const perfil = await getPerfil(req.user.login);
    if (!perfil)
      return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(perfil);
  } catch (err) {
    console.error("GET /perfil:", err);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// PUT /api/perfil/foto
router.put("/foto", verifyToken, async (req, res) => {
  try {
    const { picture } = req.body;
    if (!picture)
      return res.status(400).json({ error: "Falta el campo picture" });
    await updateFoto(req.user.login, picture);
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /perfil/foto:", err);
    res.status(500).json({ error: "Error al guardar foto" });
  }
});

module.exports = router;
