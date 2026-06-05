const express = require("express");
const router = express.Router();

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

// =========================
// CONTRATOS
// =========================

router.get("/", authMiddleware, contratosController.listar);

router.get(
  "/empresa/:empresaId",
  authMiddleware,
  contratosController.listarPorEmpresa
);

router.get(
  "/:id",
  authMiddleware,
  contratosController.verContrato
);

router.post(
  "/crear",
  authMiddleware,
  contratosController.crear
);

/* =========================
   FIRMA NORMAL (AUTH)
========================= */
router.post(
  "/firmar/:id",
  authMiddleware,
  contratosController.firmar
);

/* =========================
   FIRMA POR TOKEN (🔥 SaaS REAL)
   👉 ESTE ES EL IMPORTANTE
========================= */
router.post(
  "/firmar/token/:token",
  contratosController.firmarPorToken
);

module.exports = router;