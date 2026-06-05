const express = require('express');
const router = express.Router();

const {
    getIncidencias,
    createIncidencia,
    deleteIncidencia,
    getEmpresaUsuario
} = require('../controllers/soporteController');

const { authMiddleware } = require('../middlewares/auth');

/* LISTA */
router.get('/list', authMiddleware, getIncidencias);

/* CREAR */
router.post('/', authMiddleware, createIncidencia);

/* BORRAR */
router.delete('/:orden', authMiddleware, deleteIncidencia);

/* 🔥 NUEVO: empresa del usuario (SELECT DINÁMICO) */
router.get('/empresa-usuario', authMiddleware, getEmpresaUsuario);

module.exports = router;