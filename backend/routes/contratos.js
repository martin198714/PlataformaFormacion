const express = require("express");
const router = express.Router();

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   CONTRATOS PROTEGIDOS
========================= */

router.get("/", authMiddleware, contratosController.listar);

router.get(
  "/empresa/:empresaId",
  authMiddleware,
  contratosController.listarPorEmpresa
);

router.post("/crear", authMiddleware, contratosController.crear);

/* =========================
   TOKEN (PÚBLICO)
========================= */

// VER CONTRATO
router.get(
  "/token/:token",
  contratosController.verContratoPorToken
);

// FIRMAR CONTRATO
router.post(
  "/token/:token/firmar",
  contratosController.firmarPorToken
);

/* =========================
   FIRMA PDF SUBIDO (ADMIN)
========================= */

router.post(
  "/firmar/:id",
  authMiddleware,
  contratosController.firmar
);

/* =========================
   DETALLE CONTRATO
========================= */

router.get(
  "/:id",
  authMiddleware,
  contratosController.verContrato
);

module.exports = router;