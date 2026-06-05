const { getConnection } = require('../models/db');

exports.getOtrosRecursos = (req, res) => {
    getConnection((err, db) => {
        if (err) return res.status(500).json({ error: 'Error de conexión a la DB', details: err.message });

        db.query('SELECT * FROM OTROS_RECURSOS', [], (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Error en consulta', details: err.message });
            res.json(result);
        });
    });
};

exports.createOtroRecurso = (req, res) => {
    const { titulo, descripcion, url, fichero_nombre, tamanio, publico } = req.body;
    const creado_por = req.user?.id || 1;

    if (!titulo || !descripcion || !url || !fichero_nombre) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const pub = publico ? 1 : 0; // compatible Firebird 3

    getConnection((err, db) => {
        if (err) return res.status(500).json({ error: 'Error de conexión a la DB', details: err.message });

        const sql = `
            INSERT INTO OTROS_RECURSOS 
            (TITULO, DESCRIPCION, URL, FICHERO_NOMBRE, TAMANIO, PUBLICO, CREADO_POR)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(sql, [titulo, descripcion, url, fichero_nombre, tamanio || 0, pub, creado_por], (err) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Error insertando recurso', details: err.message });
            res.json({ message: 'Recurso creado correctamente' });
        });
    });
};
