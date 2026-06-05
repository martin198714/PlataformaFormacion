const { getConnection } = require('../models/db');

exports.getHistorialDescargas = (req, res) => {
    getConnection((err, db) => {
        if (err) return res.status(500).json({ error: 'Error de conexión a la DB', details: err.message });

        db.query('SELECT * FROM HISTORIAL_DESCARGAS_ARCHIVOS', [], (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Error en consulta', details: err.message });
            res.json(result);
        });
    });
};

exports.getHistorialReproducciones = (req, res) => {
    getConnection((err, db) => {
        if (err) return res.status(500).json({ error: 'Error de conexión a la DB', details: err.message });

        db.query('SELECT * FROM HISTORIAL_REPRODUCCIONES_VIDEOS', [], (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Error en consulta', details: err.message });
            res.json(result);
        });
    });
};

exports.getHistorialIA = (req, res) => {
    getConnection((err, db) => {
        if (err) return res.status(500).json({ error: 'Error de conexión a la DB', details: err.message });

        db.query('SELECT * FROM HISTORIAL_CONSULTAS_IA', [], (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Error en consulta', details: err.message });
            res.json(result);
        });
    });
};
