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
   SAFE HANDLER WRAPPER
   (evita crash "handler must be a function")
========================= */
const safe = (fn, name) => {
  return (req, res, next) => {
    if (typeof fn !== "function") {
      return res.status(500).json({
        error: `Controller method missing: ${name}`
      });
    }
    return fn(req, res, next);
  };
};

/* =========================
   PROTEGIDOS
========================= */
router.get("/", authMiddleware, safe(contratosController.listar, "listar"));
router.get("/empresa/:empresaId", authMiddleware, safe(contratosController.listarPorEmpresa, "listarPorEmpresa"));
router.post("/crear", authMiddleware, safe(contratosController.crear, "crear"));

/* =========================
   DETALLE (IMPORTANTE: antes de /:id genérico conflictivo)
========================= */
router.get("/:id", authMiddleware, safe(contratosController.verContrato, "verContrato"));

/* =========================
   PÚBLICOS (FIRMA)
========================= */
router.get("/firma/:token", safe(contratosController.verContratoPorToken, "verContratoPorToken"));

/* =========================
   FIRMA SIMPLE POR TOKEN
========================= */
router.post("/firmar-token/:token", safe(contratosController.firmarPorToken, "firmarPorToken"));

/* =========================
   FIRMA PDF POR TOKEN
========================= */
router.post(
  "/firmar/token/:token",
  upload.single("pdf"),
  safe(contratosController.firmarPorTokenArchivo, "firmarPorTokenArchivo")
);

/* =========================
   FIRMA AUTENTICADA (LOGIN)
========================= */
router.post(
  "/firmar/:id",
  authMiddleware,
  upload.single("pdf"),
  safe(contratosController.firmar, "firmar")
);

router.post(
  "/firmar/:id/:token",
  authMiddleware,
  upload.single("pdf"),
  safe(contratosController.firmar, "firmar")
);

/* =========================
   🔐 AUTOFIRMA (FIXED + CONSISTENTE)
========================= */

/**
 * PASO 1: iniciar autofirma
 */
router.get(
  "/autofirma/:token",
  safe(
    contratosController.iniciarAutoFirma || contratosController.iniciarAutofirma,
    "iniciarAutoFirma"
  )
);

/**
 * PASO 2: callback autofirma
 */
router.post(
  "/autofirma/return",
  upload.single("pdf"),
  safe(
    contratosController.recibirAutoFirma || contratosController.recibirAutofirma || contratosController.finalizarAutofirma,
    "recibirAutoFirma"
  )
);

module.exports = router;