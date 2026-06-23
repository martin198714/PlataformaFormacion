const Firebird = require('node-firebird');

const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\FirebirdDB\\CONTROL.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    charset: 'UTF8',
    wireCrypt: false
};

function query(sql, params = []) {
    return new Promise((resolve, reject) => {

        Firebird.attach(options, (err, db) => {
            if (err) return reject(err);

            db.query(sql, params, (err, result) => {

                db.detach();

                if (err) return reject(err);

                try {
                    resolve(JSON.parse(JSON.stringify(result || [])));
                } catch {
                    resolve([]);
                }
            });
        });
    });
}

function getConnection(callback) {
    Firebird.attach(options, callback);
}

module.exports = {
    query,
    getConnection
};
