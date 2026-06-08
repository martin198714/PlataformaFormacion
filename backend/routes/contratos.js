const express = require("express");
const router = express.Router();
const path = require("path");

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   CONTRATOS BASE
========================= */

// LISTAR MIS CONTRATOS
router.get("/", authMiddleware, contratosController.listar);

// LISTAR POR EMPRESA
router.get("/empresa/:empresaId", authMiddleware, contratosController.listarPorEmpresa);

// CREAR CONTRATO
router.post("/crear", authMiddleware, contratosController.crear);

/* =========================
   VER CONTRATO (DETALLE)
========================= */
router.get("/:id", authMiddleware, contratosController.verContrato);

/* =========================
   FIRMA AUTH (UPLOAD PDF)
========================= */
router.post("/firmar/:id", authMiddleware, contratosController.firmar);

/* =========================
   FIRMA REAL POR TOKEN (POST)
========================= */
router.post("/firmar/token/:token", contratosController.firmarPorToken);

/* =========================
   🔥 FIRMA FRONTEND (HTML)
   ESTE ES EL QUE TE FALTABA BIEN
========================= */
router.get("/firma/:token", (req, res) => {
  const token = req.params.token;

  if (!token) {
    return res.status(400).send("Token inválido");
  }

  return res.sendFile(
    path.join(__dirname, "../public/firma.html")
  );
});

module.exports = router;