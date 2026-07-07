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

            db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, transaction) => {
                if (err) {
                    db.detach();
                    return reject(err);
                }

                transaction.query(sql, params, (err, result) => {
                    if (err) {
                        return transaction.rollback(() => {
                            db.detach();
                            reject(err);
                        });
                    }

                    transaction.commit(err => {
                        db.detach();

                        if (err) return reject(err);

                        resolve(result || []);
                    });
                });
            });
        });
    });
}

// exportamos TODO lo necesario
module.exports = {
    getConnection,
    query
};