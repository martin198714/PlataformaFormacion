const express = require("express");
const router = express.Router();
const path = require("path");

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   CONTRATOS
========================= */

router.get("/", authMiddleware, contratosController.listar);

router.get("/empresa/:empresaId", authMiddleware, contratosController.listarPorEmpresa);

router.get("/:id", authMiddleware, contratosController.verContrato);

router.post("/crear", authMiddleware, contratosController.crear);

/* =========================
   FIRMA AUTH (PDF SUBIDO)
========================= */
router.post(
  "/firmar/:id",
  authMiddleware,
  contratosController.firmar
);

/* =========================
   FIRMA POR TOKEN (PÚBLICO)
========================= */
router.get("/firma/:token", contratosController.verContratoPorToken);

/* =========================
   FIRMA REAL POR TOKEN (POST)
========================= */
router.post("/firmar/token/:token", contratosController.firmarPorToken);

module.exports = router;