const express = require('express');
const router = express.Router();
const inscripcionesController = require('../controllers/inscripcionesController');

router.post('/', inscripcionesController.inscribirse);

module.exports = router;