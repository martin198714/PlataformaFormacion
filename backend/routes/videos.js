const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const videosController = require('../controllers/videosController');
const { authMiddleware } = require("../middlewares/auth");

/* =========================
   TEMP DIR
========================= */

const tempDir = path.join(__dirname, '..', 'uploads', 'temp');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/* =========================
   MULTER
========================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    next();
  });
};

/* =========================
   🔐 PROTECCIÓN GLOBAL
   (TODO LO DE ABAJO REQUIERE LOGIN)
========================= */

router.use(authMiddleware);

/* =========================
   VIDEOS
========================= */

router.get('/', videosController.getVideos);
router.post('/', videosController.createVideo);
router.put('/:videoId', videosController.updateVideo);
router.delete('/:videoId', videosController.deleteVideo);

/* =========================
   CAPITULOS
========================= */

// ADMIN (TODOS)
router.get('/capitulos', videosController.getChapters);

// 🔐 PERFILES APLICADOS AQUÍ
router.get('/capitulos/publicos', videosController.getPublicChapters);

// UPDATE CAPITULO
router.put('/capitulos/:chapterId', videosController.updateChapter);

// DELETE CAPITULO
router.delete('/capitulos/:chapterId', videosController.deleteChapter);

/* =========================
   DESCARGA SEGURA (CON PERFILES)
========================= */

router.get(
  '/capitulos/:chapterId/descargar',
  videosController.descargarCapitulo
);

/* =========================
   UPLOAD CHUNKS
========================= */

router.post(
  '/capitulos/upload',
  handleUpload,
  videosController.uploadChapterPro
);

/* =========================
   STATUS CHUNKS
========================= */

router.get(
  '/capitulos/status/:fileGuid',
  videosController.getUploadStatus
);

module.exports = router;