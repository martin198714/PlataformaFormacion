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
  destination: firmadosDir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

/* 🔥 FIX IMPORTANTE:
   aceptamos pdf y pdfFirmado */
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "application/pdf";
    cb(null, ok);
  }
});

/* =========================
   SAFE WRAPPER
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

router.get(
  "/",
  authMiddleware,
  safe(contratosController.listar, "listar")
);

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
   FIRMA PÚBLICA (IMPORTANTE ANTES DE /:id)
========================= */

router.get(
  "/firma/:token",
  safe(contratosController.verContratoPorToken, "verContratoPorToken")
);

/* =========================
   DESCARGAR CONTRATO POR TOKEN
========================= */

router.get(
  "/descargar/:token",
  safe(
    contratosController.descargarContrato,
    "descargarContrato"
  )
);

/* =========================
   DETALLE CONTRATO
========================= */

router.get(
  "/:id",
  authMiddleware,
  safe(contratosController.verContrato, "verContrato")
);

/* =========================
   BORRAR CONTRATO
========================= */

router.delete(
  "/:id",
  authMiddleware,
  safe(contratosController.borrarContrato, "borrarContrato")
);

/* =========================
   FIRMA SIMPLE TOKEN
========================= */

router.post(
  "/firmar-token/:token",
  safe(contratosController.firmarPorToken, "firmarPorToken")
);

/* =========================
   FIRMA PDF POR TOKEN (FIX MULTER ERROR)
========================= */

router.post(
  "/firmar/token/:token",
  upload.single("pdfFirmado"),
  safe(contratosController.firmarPorTokenArchivo, "firmarPorTokenArchivo")
);

/* =========================
   FIRMA AUTENTICADA (LOGIN)
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
   🔐 AUTOFIRMA FLOW
========================= */

/**
 * INICIAR AUTOFIRMA
 */
router.get(
  "/autofirma/:token",
  safe(
    contratosController.iniciarAutoFirma ||
      contratosController.iniciarAutofirma ||
      contratosController.prepararFirmaAutoFirma,
    "iniciarAutoFirma"
  )
);

/**
 * CALLBACK AUTOFIRMA (SUBIDA PDF FIRMADO)
 */
router.post(
  "/autofirma/return",
  upload.single("pdfFirmado"),
  safe(
    contratosController.recibirAutoFirma ||
      contratosController.recibirAutofirma ||
      contratosController.recibirFirmaAutoFirma,
    "recibirAutoFirma"
  )
);

router.post("/auto-upload", upload.single("file"), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) throw new Error("Token requerido");
    if (!req.file) throw new Error("Archivo requerido");

    const { firmarContratoAuto } = require("../services/contrato.service");

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
});

module.exports = router;