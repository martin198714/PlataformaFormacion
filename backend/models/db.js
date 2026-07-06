const Firebird = require('node-firebird');

const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\FirebirdDB\\EJIDOSOFT.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    charset: 'UTF8',
    wireCrypt: false
};

// 🔥 puedes dejar el pool (no estorba)
const pool = Firebird.pool(5, options);

// ✔ conexión base (la que ya tienes)
function getConnection(callback) {
    Firebird.attach(options, callback);
}

// ⭐ NUEVO: función que NECESITAS para el bot
function query(sql, params = []) {
    return new Promise((resolve, reject) => {

        Firebird.attach(options, (err, db) => {

            if (err) return reject(err);

            db.query(sql, params, (err, result) => {

                db.detach();

                if (err) return reject(err);

                // 🔥 NORMALIZACIÓN SEGURA (FIX REAL)
                try {

                    // 👇 en vez de stringify, normalizamos manualmente
                    const clean = Array.isArray(result)
                        ? result.map(row => {
                            const obj = {};

                            for (const key in row) {

                                const value = row[key];

                                // 🔥 Firebird BLOB fix (LIST() y textos grandes)
                                if (value && typeof value === 'object' && value.type === 'Buffer') {
                                    obj[key] = value.toString('utf8');
                                } else {
                                    obj[key] = value;
                                }
                            }

                            return obj;
                        })
                        : result || [];

                    return resolve(clean);

                } catch (e) {
                    return resolve(result || []);
                }
            });
        });
    });
}

// exportamos TODO lo necesario
module.exports = {
    getConnection,
    query
};