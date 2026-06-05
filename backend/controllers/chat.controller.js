const chatService = require('../services/chat.service');

exports.sendMessage = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Mensaje vacío'
      });
    }

    const result = await chatService.handleMessage(
      userId || 'default',
      message
    );

    res.json(result);

  } catch (error) {
    console.error('CHAT ERROR:', error);

    res.status(500).json({
      error: 'Error en chat',
      detalle: error.message
    });
  }
};