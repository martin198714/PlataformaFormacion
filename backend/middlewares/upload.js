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
   DIRECTORIOS
========================= */
const base = path.join(__dirname, "..", "uploads");
const archivosDir = path.join(base, "archivos");
const videosDir = path.join(base, "videos");
const capitulosDir = path.join(base, "capitulos");
const tempDir = path.join(base, "temp");

[archivosDir, videosDir, capitulosDir, tempDir].forEach((d) => {
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
   MULTER STORAGE
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
   MEMORY UPLOAD (CHUNKS)
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

/* CHUNKS (PROGRESS BAR) */
router.post(
  "/capitulos/simple",
  ensureUser,
  uploadMemory.array("capitulos", 1),
  async (req, res) => {
    await uploadChapterSimple(req, res);
  }
);

/* UPLOAD MASIVO TRADICIONAL */
router.post(
  "/videos/:videoId/capitulos",
  ensureUser,
  uploadCapitulo.array("capitulos", 50),
  async (req, res) => {
    try {
      for (const file of req.files) {
        await createChapter({
          ...req,
          file,
          params: req.params,
          body: {
            ...req.body,
            titulo: file.originalname
          }
        }, res);
      }

      if (!res.headersSent) {
        res.json({ ok: true, message: "Subida completada" });
      }
    } catch (err) {
      res.status(500).json({ error: "Error subiendo capítulos" });
    }
  }
);

/* =========================
   CAPÍTULO INDIVIDUAL
========================= */
router.put(
  "/capitulo/:chapterId",
  ensureUser,
  uploadCapitulo.single("capitulo"),
  async (req, res) => {
    await updateChapter(req, res);
  }
);

router.delete("/capitulo/:chapterId", deleteChapter);

router.post("/capitulo/:chapterId/play", playChapter);

/* =========================
   LIMPIEZA
========================= */
router.delete("/capitulos/cleanup-file", cleanupFile);
router.delete("/capitulos/cleanup-temp", cleanupTemp);

module.exports = router;