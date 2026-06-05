const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roles');
const { getOtrosRecursos, createOtroRecurso } = require('../controllers/otrosRecursosController');

router.get('/', authMiddleware, getOtrosRecursos);
router.post('/', authMiddleware, roleMiddleware(['admin','editor']), createOtroRecurso);

module.exports = router;
