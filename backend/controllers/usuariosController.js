const { getConnection } = require('../models/db');
const bcrypt = require('bcryptjs');


// ==========================
// 🔗 VALIDAR ROL
// ==========================
function validarRol(db, rol) {

    return new Promise((resolve, reject) => {

        db.query(
            `SELECT COUNT(*) AS CNT FROM ROLES WHERE ROLE_ID = ?`,
            [rol],
            (err, result) => {
                if (err) return reject(err);
                resolve(result[0].CNT > 0);
            }
        );
    });
}

function formatDateDMY(date) {
    if (!date) return null;

    const d = new Date(date);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear(); // 👈 4 dígitos SIEMPRE

    return `${day}-${month}-${year}`;
}

// ==========================
// 📌 LISTAR USUARIOS
// ==========================
exports.getAllUsuarios = (req, res) => {

    getConnection((err, db) => {

        if (err) return res.status(500).json({ error: err.message });

        const sql = `
            SELECT 
                U.USUARIO_ID,
                U.EMAIL,
                U.NOMBRE_COMPLETO,
                U.ROL_ID,
                U.ACTIVO,
                U.CREATED_AT,
                U.LAST_LOGIN,
                U.EMPRESA_ID,
                U.TELEFONO,
                E.NOMBRE AS EMPRESA,
                P.ID AS PERFIL_ID,
                P.NOMBRE AS PERFIL_NOMBRE
            FROM USUARIOS U
            LEFT JOIN EMPRESAS E ON E.EMPRESA_ID = U.EMPRESA_ID
            LEFT JOIN USUARIOS_PERFILES UP ON UP.USUARIO_ID = U.USUARIO_ID
            LEFT JOIN PERFILES P ON P.ID = UP.PERFIL_ID
            WHERE (U.DELETED IS NULL OR U.DELETED = 0)
            ORDER BY U.USUARIO_ID
        `;

        db.query(sql, [], (err, result) => {

            if (err) {
                db.detach();
                return res.status(500).json({ error: err.message });
            }

            const map = new Map();

            for (const row of result) {

                if (!map.has(row.USUARIO_ID)) {

                    map.set(row.USUARIO_ID, {
                        id: row.USUARIO_ID,
                        email: row.EMAIL,
                        nombre: row.NOMBRE_COMPLETO,
                        telefono: row.TELEFONO,
                        empresa: row.EMPRESA,
                        empresa_id: row.EMPRESA_ID,
                        rol: row.ROL_ID,
                        activo: !!row.ACTIVO,

                        // 🔥 FECHAS EN FORMATO ISO (FRONTEND FRIENDLY)
                        fecha_reg: formatDateDMY(row.CREATED_AT),
                        last_login: formatDateDMY(row.LAST_LOGIN),

                        perfiles: []
                    });
                }

                if (row.PERFIL_ID) {
                    map.get(row.USUARIO_ID).perfiles.push({
                        ID: row.PERFIL_ID,
                        NOMBRE: row.PERFIL_NOMBRE
                    });
                }
            }

            db.detach();
            res.json([...map.values()]);
        });
    });
};

// ==========================
// 📌 USUARIO POR ID
// ==========================
exports.getUsuarioById = (req, res) => {

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    getConnection((err, db) => {

        if (err) return res.status(500).json({ error: err.message });

        const sql = `
            SELECT 
                U.USUARIO_ID,
                U.EMAIL,
                U.NOMBRE_COMPLETO,
                U.ROL_ID,
                U.ACTIVO,
                U.TELEFONO,
                U.EMPRESA_ID,
                U.CREATED_AT,
                U.LAST_LOGIN,
                E.NOMBRE AS EMPRESA,
                P.ID AS PERFIL_ID,
                P.NOMBRE AS PERFIL_NOMBRE
            FROM USUARIOS U
            LEFT JOIN EMPRESAS E ON E.EMPRESA_ID = U.EMPRESA_ID
            LEFT JOIN USUARIOS_PERFILES UP ON UP.USUARIO_ID = U.USUARIO_ID
            LEFT JOIN PERFILES P ON P.ID = UP.PERFIL_ID
            WHERE U.USUARIO_ID = ?
        `;

        db.query(sql, [id], (err, result) => {

            if (err) {
                db.detach();
                return res.status(500).json({ error: err.message });
            }

            if (!result.length) {
                db.detach();
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            const base = {
                id: result[0].USUARIO_ID,
                email: result[0].EMAIL,
                nombre: result[0].NOMBRE_COMPLETO,
                rol: result[0].ROL_ID,
                activo: !!result[0].ACTIVO,
                telefono: result[0].TELEFONO,
                empresa_id: result[0].EMPRESA_ID,
                empresa: result[0].EMPRESA,

                // 🔥 FIX FECHAS
                fecha_reg: formatDateDMY(result[0].CREATED_AT),
                last_login: formatDateDMY(result[0].LAST_LOGIN),

                perfiles: []
            };

            for (const row of result) {
                if (row.PERFIL_ID) {
                    base.perfiles.push({
                        ID: row.PERFIL_ID,
                        NOMBRE: row.PERFIL_NOMBRE
                    });
                }
            }

            db.detach();
            res.json(base);
        });
    });
};

// ==========================
// 📌 CREAR USUARIO
// ==========================
exports.createUsuario = async (req, res) => {

    const { nombre, email, password, rol, empresa_id, telefono, perfiles } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    try {

        const hash = await bcrypt.hash(password, 10);

        getConnection((err, db) => {

            if (err) return res.status(500).json({ error: err.message });

            let rolAsignado = 2;

            if (rol) {
                validarRol(db, parseInt(rol, 10))
                    .then(ok => {

                        if (ok) rolAsignado = parseInt(rol, 10);

                        const empresaFinal = empresa_id ? parseInt(empresa_id, 10) : null;

                        db.query(`
                            INSERT INTO USUARIOS
                            (NOMBRE_COMPLETO, EMAIL, PASSWORD_HASH, ROL_ID, ACTIVO, EMPRESA_ID, TELEFONO)
                            VALUES (?, ?, ?, ?, 1, ?, ?)
                            RETURNING USUARIO_ID
                        `, [
                            nombre,
                            email,
                            hash,
                            rolAsignado,
                            empresaFinal,
                            telefono || null
                        ], async (err, result) => {

                            if (err) {
                                db.detach();
                                return res.status(500).json({ error: err.message });
                            }

                            const userId = result[0].USUARIO_ID;

                            const cleanProfiles = Array.isArray(perfiles)
                                ? perfiles.map(p => parseInt(p, 10)).filter(Number.isInteger)
                                : [];

                            for (const perfilId of cleanProfiles) {

                                await new Promise((resolve, reject) => {

                                    db.query(`
                                        INSERT INTO USUARIOS_PERFILES (USUARIO_ID, PERFIL_ID)
                                        VALUES (?, ?)
                                    `, [userId, perfilId], (err) => {
                                        if (err) return reject(err);
                                        resolve();
                                    });

                                });
                            }

                            db.detach();
                            res.json({ message: 'Usuario creado correctamente' });
                        });

                    });
            }
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};


// ==========================
// 📌 UPDATE USUARIO
// ==========================
exports.updateUsuario = (req, res) => {

    const id = parseInt(req.params.id, 10);
    const { nombre, email, password, rol, empresa_id, telefono, perfiles } = req.body;

    getConnection(async (err, db) => {

        if (err) return res.status(500).json({ error: err.message });

        try {

            let sql = `
                UPDATE USUARIOS SET
                    NOMBRE_COMPLETO = ?,
                    EMAIL = ?,
                    ROL_ID = ?,
                    EMPRESA_ID = ?,
                    TELEFONO = ?
            `;

            const params = [nombre, email, rol || 2, empresa_id || null, telefono || null];

            if (password && password.trim()) {
                const hash = await bcrypt.hash(password, 10);
                sql += `, PASSWORD_HASH = ?`;
                params.push(hash);
            }

            sql += ` WHERE USUARIO_ID = ?`;
            params.push(id);

            db.query(sql, params, (err) => {

                if (err) {
                    db.detach();
                    return res.status(500).json({ error: err.message });
                }

                db.query(`DELETE FROM USUARIOS_PERFILES WHERE USUARIO_ID = ?`, [id], async (err) => {

                    const cleanProfiles = Array.isArray(perfiles)
                        ? perfiles.map(p => parseInt(p, 10)).filter(Number.isInteger)
                        : [];

                    for (const perfilId of cleanProfiles) {

                        await new Promise((resolve, reject) => {

                            db.query(`
                                INSERT INTO USUARIOS_PERFILES (USUARIO_ID, PERFIL_ID)
                                VALUES (?, ?)
                            `, [id, perfilId], (err) => {
                                if (err) return reject(err);
                                resolve();
                            });

                        });
                    }

                    db.detach();
                    res.json({ message: 'Usuario actualizado correctamente' });
                });

            });

        } catch (e) {
            db.detach();
            res.status(500).json({ error: e.message });
        }

    });
};


// ==========================
// 📌 DELETE
// ==========================
exports.deleteUsuario = (req, res) => {

    const id = parseInt(req.params.id, 10);

    getConnection((err, db) => {
        db.query(`UPDATE USUARIOS SET DELETED = 1 WHERE USUARIO_ID = ?`, [id], () => {
            db.detach();
            res.json({ message: 'Usuario eliminado correctamente' });
        });
    });
};


// ==========================
// 📌 ACTIVO
// ==========================
exports.toggleActivo = (req, res) => {

    const id = parseInt(req.params.id, 10);
    const { activo } = req.body;

    getConnection((err, db) => {

        db.query(
            `UPDATE USUARIOS SET ACTIVO = ? WHERE USUARIO_ID = ?`,
            [activo ? 1 : 0, id],
            () => {
                db.detach();
                res.json({ message: 'OK' });
            }
        );

    });
};


// ==========================
// 🆕 PERFILES USUARIO LOGUEADO
// ==========================
exports.getMisPerfiles = (req, res) => {

    const userId = req.user.id;

    getConnection((err, db) => {

        if (err) return res.status(500).json({ error: err.message });

        db.query(`
            SELECT P.ID, P.NOMBRE
            FROM USUARIOS_PERFILES UP
            INNER JOIN PERFILES P ON P.ID = UP.PERFIL_ID
            WHERE UP.USUARIO_ID = ?
        `, [userId], (err, result) => {

            db.detach();

            if (err) return res.status(500).json({ error: err.message });

            res.json(result);
        });
    });
};


// ==========================
// 🆕 IDS PERFILES USUARIO
// ==========================
exports.getMisPerfilesIds = (req, res) => {

    const userId = req.user.id;

    getConnection((err, db) => {

        if (err) return res.status(500).json({ error: err.message });

        db.query(`
            SELECT PERFIL_ID
            FROM USUARIOS_PERFILES
            WHERE USUARIO_ID = ?
        `, [userId], (err, result) => {

            db.detach();

            if (err) return res.status(500).json({ error: err.message });

            res.json(result.map(r => r.PERFIL_ID));
        });
    });
};