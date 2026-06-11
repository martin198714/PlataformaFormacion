const express = require("express");
const router = express.Router();

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");
const upload = require("../middlewares/upload");

/* =========================
   CONTRATOS (PROTEGIDO)
========================= */

router.get(
  "/",
  authMiddleware,
  contratosController.listar
);

router.get(
  "/empresa/:empresaId",
  authMiddleware,
  contratosController.listarPorEmpresa
);

router.post(
  "/crear",
  authMiddleware,
  contratosController.crear
);

/* =========================
   FIRMA POR TOKEN (PÚBLICO)
   IMPORTANTE:
   Debe ir antes de "/:id"
========================= */

router.get(
  "/firma/:token",
  contratosController.verContratoPorToken
);

router.post(
  "/firmar/token/:token",
  contratosController.firmarPorToken
);

/* =========================
   FIRMA PDF SUBIDO
========================= */

router.post(
  "/firmar/:id",
  authMiddleware,
  upload.single("pdf"),
  contratosController.firmar
);

/* =========================
   VER CONTRATO (PROTEGIDO)
========================= */

router.get(
  "/:id",
  authMiddleware,
  contratosController.verContrato
);

module.exports = router;