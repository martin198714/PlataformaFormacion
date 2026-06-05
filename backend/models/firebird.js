const Firebird = require('node-firebird');

const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\FirebirdDB\\CONTROL.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    charset: 'UTF8'
};

function getConnection(callback) {
    Firebird.attach(options, (err, db) => {
        if (err) {
            console.error("Error conectando a Firebird:", err);
            return callback(err);
        }
        callback(null, db);
    });
}

module.exports = { getConnection };
