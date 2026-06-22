const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

const base = path.join(__dirname, "..", "uploads");
const firmadosDir = path.join(base, "firmados");

if (!fs.existsSync(firmadosDir)) {
  fs.mkdirSync(firmadosDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: firmadosDir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const uploadContrato = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo PDF"));
  }
});

/* =========================
   PROTEGIDOS
========================= */

router.get("/", authMiddleware, contratosController.listar);

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
   PÚBLICOS
========================= */

router.get(
  "/firma/:token",
  contratosController.verContratoPorToken
);

/* FIRMA CON PDF */
router.post(
  "/firmar/token/:token",
  uploadContrato.single("pdf"),
  contratosController.firmarPorTokenArchivo
);

/* FIRMA SIN PDF */
router.post(
  "/firmar-token/:token",
  contratosController.firmarPorToken
);

/* =========================
   FIRMA POR ID (IMPORTANTE)
   ⚠️ ARREGLADO: antes apuntaba a "firmar" (NO EXISTE)
========================= */

router.post(
  "/firmar/:id",
  authMiddleware,
  contratosController.firmarPorTokenArchivo
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