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
   PÚBLICOS
========================= */
router.get("/firma/:token", contratosController.verContratoPorToken);

/* =========================
   FIRMA TOKEN
========================= */
router.post("/firmar-token/:token", contratosController.firmarPorToken);

/* =========================
   FIRMA PDF
========================= */
router.post(
  "/firmar/token/:token",
  upload.single("pdf"),
  contratosController.firmarPorTokenArchivo
);

/* =========================
   FIRMA UNIFICADA (RECOMENDADO)
========================= */
router.post(
  "/firmar/:id/:token?",
  authMiddleware,
  upload.single("pdf"),
  contratosController.firmar
);

/* =========================
   DETALLE
========================= */
router.get("/:id", authMiddleware, contratosController.verContrato);

module.exports = router;