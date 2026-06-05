const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/empresaPerfilesController');
const { authMiddleware } = require('../middlewares/auth'); // 🔥 IMPORTANTE

// 🔐 PROTEGIDO CON LOGIN
router.post(
  '/asignar',
  authMiddleware,
  ctrl.asignarPerfil
);

module.exports = router;