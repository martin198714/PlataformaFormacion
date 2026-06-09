const express = require("express");
const router = express.Router();

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   CONTRATOS (PROTEGIDO)
========================= */

router.get("/", authMiddleware, contratosController.listar);

router.get("/empresa/:empresaId", authMiddleware, contratosController.listarPorEmpresa);

router.post("/crear", authMiddleware, contratosController.crear);

/* =========================
   FIRMA PDF SUBIDO
========================= */

router.post("/firmar/:id", authMiddleware, contratosController.firmar);

/* =========================
   VER CONTRATO (PROTEGIDO)
========================= */

router.get("/:id", authMiddleware, contratosController.verContrato);

/* =========================
   FIRMA POR TOKEN (PÚBLICO - LINK EMAIL)
========================= */

router.get("/firma/:token", contratosController.verContratoPorToken);

/* =========================
   FIRMA FINAL POR TOKEN
========================= */

router.post("/firmar/token/:token", contratosController.firmarPorToken);

module.exports = router;