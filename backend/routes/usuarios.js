const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roles');

const {
    getAllUsuarios,
    getUsuarioById,
    createUsuario,
    updateUsuario,
    deleteUsuario,
    toggleActivo,
    getMisPerfiles,
    getMisPerfilesIds
} = require('../controllers/usuariosController');


// ==========================
// 👤 USUARIOS CRUD
// ==========================
router.get('/', authMiddleware, roleMiddleware(['admin']), getAllUsuarios);

router.get('/:id', authMiddleware, roleMiddleware(['admin']), getUsuarioById);

router.post('/', authMiddleware, roleMiddleware(['admin']), createUsuario);

router.put('/:id', authMiddleware, roleMiddleware(['admin']), updateUsuario);

router.delete('/:id', authMiddleware, roleMiddleware(['admin']), deleteUsuario);

router.patch('/:id/activo', authMiddleware, roleMiddleware(['admin']), toggleActivo);


// ==========================
// 🧠 PERFILES USUARIO LOGUEADO
// ==========================
router.get('/me/perfiles',
    authMiddleware,
    getMisPerfiles
);

router.get('/me/perfiles-ids',
    authMiddleware,
    getMisPerfilesIds
);

module.exports = router;