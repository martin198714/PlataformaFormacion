const express = require("express");
const router = express.Router();
const multer = require("multer");

const archivosController = require("../controllers/archivosController");
const { authMiddleware } = require("../middlewares/auth");

// ===============================
// 📦 MULTER
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }
});

// ===============================
// 🌍 PUBLICOS (SIN LOGIN)
// ===============================
router.get(
  "/publicos",
  authMiddleware,
  archivosController.getArchivosPublicos
);

// ===============================
// 🔐 ADMIN
// ===============================
router.get(
  "/admin",
  authMiddleware,
  archivosController.getArchivosAdmin
);

// ===============================
// ⬆️ SUBIR
// ===============================
router.post(
  "/subir",
  authMiddleware,
  upload.single("archivo"),
  archivosController.createArchivo
);

// ===============================
router.post(
  "/subir-multiples",
  authMiddleware,
  upload.array("archivos", 50),
  archivosController.createArchivo
);

// ===============================
// ✏️ EDITAR
// ===============================
router.put(
  "/:id",
  authMiddleware,
  archivosController.updateArchivo
);

// ===============================
// 🗑️ DELETE
// ===============================
router.delete(
  "/:id",
  authMiddleware,
  archivosController.deleteArchivo
);

// ===============================
// 🔽 DESCARGA
// ===============================
router.get(
  "/descargar/:id",
  archivosController.downloadArchivoPublico
);

module.exports = router;