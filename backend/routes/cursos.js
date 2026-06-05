const express = require('express');
const router = express.Router();

const c = require('../controllers/cursosController');
const inscripcionesController =
require('../controllers/inscripcionesController');

// ============================
// CURSOS
// ============================

router.get('/', c.getCursos);

router.get('/estado', c.getCursosEstado);

// 🔥 CURSOS SEGÚN PERFIL USUARIO
router.get(
  '/usuario/:email',
  inscripcionesController.getCursosUsuario
);

// 🔥 IMPORTANTE: antes de /:id
router.get('/:id/alumnos', c.getAlumnosCurso);

router.post('/', c.createCurso);

router.put('/:id', c.updateCurso);

router.delete('/:id', c.deleteCurso);

module.exports = router;