const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   UPLOAD CONFIG
========================= */
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

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  }
});

/* =========================
   PROTEGIDOS
========================= */
router.get("/", authMiddleware, contratosController.listar);
router.get("/empresa/:empresaId", authMiddleware, contratosController.listarPorEmpresa);
router.post("/crear", authMiddleware, contratosController.crear);

/* =========================
   DETALLE
========================= */
router.get("/:id", authMiddleware, contratosController.verContrato);

/* =========================
   PÚBLICOS (FIRMA)
========================= */
router.get("/firma/:token", contratosController.verContratoPorToken);

/* =========================
   FIRMA SIMPLE POR TOKEN
========================= */
router.post("/firmar-token/:token", contratosController.firmarPorToken);

/* =========================
   FIRMA PDF POR TOKEN
========================= */
router.post(
  "/firmar/token/:token",
  upload.single("pdf"),
  contratosController.firmarPorTokenArchivo
);

/* =========================
   FIRMA AUTENTICADA (LOGIN)
========================= */
router.post(
  "/firmar/:id",
  authMiddleware,
  upload.single("pdf"),
  contratosController.firmar
);

router.post(
  "/firmar/:id/:token",
  authMiddleware,
  upload.single("pdf"),
  contratosController.firmar
);

/* =========================
   🔐 AUTOFIRMA (NUEVO FLUJO)
========================= */

/**
 * Paso 1:
 * Inicia proceso Autofirma (redirección / generación de firma)
 */
router.get(
  "/autofirma/:token",
  contratosController.iniciarAutofirma
);

/**
 * Paso 2:
 * Callback de Autofirma (recibe resultado firmado)
 */
router.post(
  "/autofirma/return",
  upload.single("pdf"),
  contratosController.finalizarAutofirma
);

module.exports = router;