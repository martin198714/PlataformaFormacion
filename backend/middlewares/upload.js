const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  createVideo,
  updateVideo,
  deleteVideo,
  getVideos,
  createChapter,
  updateChapter,
  deleteChapter,
  getChapters,
  playChapter,
  createArchivo,
  uploadChapterSimple,
  cleanupFile,
  cleanupTemp
} = require("../controllers/videosController");

/* =========================
   CONTRATOS CONTROLLER
========================= */
const contratosController = require("../controllers/contratosController");

/* ⚠️ IMPORTANTE: si lo usas en otros endpoints, deja authMiddleware */
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   DIRECTORIOS
========================= */
const base = path.join(__dirname, "..", "uploads");

const archivosDir = path.join(base, "archivos");
const videosDir = path.join(base, "videos");
const capitulosDir = path.join(base, "capitulos");
const tempDir = path.join(base, "temp");

/* 🔥 CONTRATOS */
const contratosDir = path.join(base, "contratos");
const firmadosDir = path.join(base, "firmados");

/* CREAR CARPETAS SI NO EXISTEN */
[archivosDir, videosDir, capitulosDir, tempDir, contratosDir, firmadosDir]
.forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* =========================
   TIPOS PERMITIDOS
========================= */
const allowedFiles = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "application/zip",
  "application/x-rar-compressed",
  "text/plain"
];

const allowedVideos = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/x-matroska",
  "video/quicktime"
];

/* =========================
   STORAGE GENERAL
========================= */
const storage = (folder) =>
  multer.diskStorage({
    destination: folder,
    filename: (req, file, cb) => {
      const safe = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      cb(null, `${Date.now()}-${safe}`);
    }
  });

/* =========================
   MEMORY UPLOAD
========================= */
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({ storage: memoryStorage });

/* =========================
   ARCHIVOS UPLOAD
========================= */
const uploadArchivo = multer({
  storage: storage(archivosDir),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedFiles.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de archivo no permitido"));
  }
});

/* =========================
   CAPÍTULOS UPLOAD
========================= */
const uploadCapitulo = multer({
  storage: storage(capitulosDir),
  limits: { fileSize: 20 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedVideos.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de video no permitido"));
  }
});

/* =========================
   🔥 PDF FIRMADOS (IMPORTANTE)
========================= */
const uploadContrato = multer({
  storage: storage(firmadosDir),   // 👈 GUARDA AQUÍ
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo se permiten PDFs"));
  }
});

/* =========================
   MIDDLEWARE USER FIX
========================= */
function ensureUser(req, res, next) {
  if (!req.user) req.user = { id: 1, rol: "admin" };
  next();
}

/* =========================
   ARCHIVOS
========================= */
router.post(
  "/subir/archivo",
  ensureUser,
  uploadArchivo.array("archivos"),
  async (req, res) => {
    try {
      await createArchivo(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al subir archivo" });
    }
  }
);

/* =========================
   VIDEOS
========================= */
router.get("/videos", getVideos);

router.post("/videos", ensureUser, async (req, res) => {
  await createVideo(req, res);
});

router.put("/videos/:videoId", ensureUser, async (req, res) => {
  await updateVideo(req, res);
});

router.delete("/videos/:videoId", deleteVideo);

/* =========================
   CAPÍTULOS
========================= */
router.get("/capitulos", getChapters);

/* CHUNKS */
router.post(
  "/capitulos/simple",
  ensureUser,
  uploadMemory.array("capitulos", 1),
  async (req, res) => {
    await uploadChapterSimple(req, res);
  }
);

/* =========================
   CONTRATOS (🔥 FIRMA CORRECTA)
========================= */

/*
   ✔ ESTE ES EL ENDPOINT REAL QUE DEBE USAR TU FRONT
   ✔ GUARDA EN: uploads/firmados
*/
router.post(
  "/contratos/firmar/:id",
  ensureUser,
  uploadContrato.single("pdf"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se recibió PDF" });
      }

      console.log("📄 Archivo recibido:", req.file.filename);
      console.log("📁 Guardado en:", req.file.path);

      const result = await contratosController.firmar(req, res);

      return result;

    } catch (err) {
      console.error("❌ ERROR FIRMA:", err);
      res.status(500).json({
        error: "Error al firmar contrato",
        detalle: err.message
      });
    }
  }
);

module.exports = router;