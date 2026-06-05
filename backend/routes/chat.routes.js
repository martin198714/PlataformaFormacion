const express = require('express');
const router = express.Router();

const chatController = require('../controllers/chat.controller');

// 🔥 ESTA ES LA RUTA REAL
router.post('/message', chatController.sendMessage);

router.get('/message', (req, res) => {
  res.json({
    error: "Usa POST, no GET",
    ejemplo: {
      method: "POST",
      body: {
        userId: "1",
        message: "hola"
      }
    }
  });
});

module.exports = router;