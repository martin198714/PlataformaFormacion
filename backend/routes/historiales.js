const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const { getHistorialDescargas, getHistorialReproducciones, getHistorialIA } = require('../controllers/historialesController');

router.get('/descargas', authMiddleware, getHistorialDescargas);
router.get('/reproducciones', authMiddleware, getHistorialReproducciones);
router.get('/ia', authMiddleware, getHistorialIA);

module.exports = router;


