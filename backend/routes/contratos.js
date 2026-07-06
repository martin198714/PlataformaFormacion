const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");
const { firmarContratoAuto } = require("../services/contratos.service");

/* =========================
   UPLOAD CONFIG
========================= */

const base = path.join(__dirname, "..", "uploads");
const firmadosDir = path.join(base, "firmados");

if (!fs.existsSync(firmadosDir)) {
  fs.mkdirSync(firmadosDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, firmadosDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Solo se permiten PDFs"), false);
    }
    cb(null, true);
  }
});

/* =========================
   SAFE WRAPPER
========================= */

const safe = (fn, name) => (req, res, next) => {
  if (typeof fn !== "function") {
    return res.status(500).json({
      error: `Controller method missing: ${name}`
    });
  }
  return fn(req, res, next);
};

/* =========================
   CONTRATOS (PROTEGIDOS)
========================= */

router.get("/", authMiddleware, safe(contratosController.listar, "listar"));

router.get(
  "/empresa/:empresaId",
  authMiddleware,
  safe(contratosController.listarPorEmpresa, "listarPorEmpresa")
);

router.post(
  "/crear",
  authMiddleware,
  safe(contratosController.crear, "crear")
);

/* =========================
   PÚBLICO
========================= */

router.get(
  "/firma/:token",
  safe(contratosController.verContratoPorToken, "verContratoPorToken")
);

router.get(
  "/descargar/:token",
  safe(contratosController.descargarContrato, "descargarContrato")
);

/* =========================
   DETALLE / BORRAR
========================= */

router.get(
  "/:id",
  authMiddleware,
  safe(contratosController.verContrato, "verContrato")
);

router.delete(
  "/:id",
  authMiddleware,
  safe(contratosController.borrarContrato, "borrarContrato")
);

/* =========================
   FIRMA TOKEN
========================= */

router.post(
  "/firmar-token/:token",
  safe(contratosController.firmarPorToken, "firmarPorToken")
);

/* =========================
   FIRMA TOKEN CON PDF
========================= */

router.post(
  "/firmar/token/:token",
  upload.single("pdfFirmado"),
  safe(contratosController.firmarPorTokenArchivo, "firmarPorTokenArchivo")
);

/* =========================
   FIRMA AUTENTICADA
========================= */

router.post(
  "/firmar/:id",
  authMiddleware,
  upload.single("pdfFirmado"),
  safe(contratosController.firmar, "firmar")
);

router.post(
  "/firmar/:id/:token",
  authMiddleware,
  upload.single("pdfFirmado"),
  safe(contratosController.firmar, "firmar")
);

/* =========================
   🔐 AUTOFIRMA FLOW (FIXED)
========================= */

/**
 * INICIAR AUTOFIRMA
 */
router.get(
  "/autofirma/:token",
  safe(contratosController.prepararFirmaAutoFirma, "prepararFirmaAutoFirma")
);

/**
 * CALLBACK AUTOFIRMA
 */
router.post(
  "/autofirma/return",
  upload.single("pdfFirmado"),
  safe(contratosController.recibirFirmaAutoFirma, "recibirFirmaAutoFirma")
);

/* =========================
   AUTO-UPLOAD (FIX IMPORTADO + SEGURIDAD)
========================= */

router.post(
  "/auto-upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) throw new Error("Token requerido");
      if (!req.file) throw new Error("Archivo requerido");

      const result = await firmarContratoAuto({
        token,
        rutaFirmado: req.file.path,
        ip: req.ip,
        userAgent: req.headers["user-agent"]
      });

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;