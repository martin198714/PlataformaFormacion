const fs = require("fs");
const path = require("path");
const { getConnection } = require("../models/db");

const uploadDir = path.join(__dirname, "..", "uploads", "archivos");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ===============================
   DB WRAPPER
=============================== */
function getDb() {
  return new Promise((resolve, reject) => {
    getConnection((err, db) => (err ? reject(err) : resolve(db)));
  });
}

/* ===============================
   FORMATEO FECHA
=============================== */
function formatDateDMY(date) {
  if (!date) return null;

  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${d.getFullYear()}`;
}

/* ===============================
   ORDEN FIJO
=============================== */
const ORDEN_TITULOS = {
  "Planning 4.0": 1,
  "Transporta 4.0": 2,
  "Base 4.0": 3,
  "Gestion Horto 4.0": 4,
  "Contasoft 4.0": 5,
  "SII 4.0": 6,
  "Fiscal 4.0": 7,
  "Verifactu 4.0": 8
};

/* ===============================
   VERSIONADO
=============================== */
async function getVersionData(db, titulo) {
  const rows = await new Promise((resolve, reject) =>
    db.query(
      `SELECT FIRST 1 GRUPO_ID, VERSION
       FROM ARCHIVOS
       WHERE TITULO = ?
       ORDER BY CREATED_AT DESC`,
      [titulo],
      (err, r) => (err ? reject(err) : resolve(r))
    )
  );

  if (rows.length) {
    return {
      grupoId: Number(rows[0].GRUPO_ID),
      version: Number(rows[0].VERSION) + 1
    };
  }

  return {
    grupoId: Date.now(),
    version: 1
  };
}

/* ===============================
   GET ARCHIVOS PUBLICOS
=============================== */
exports.getArchivosPublicos = async (req, res) => {
  let db;

  try {
    db = await getDb();

    const userId = req.user.id;
    const rol = req.user.rol;

    let query = `
      SELECT A.*
      FROM ARCHIVOS A
      WHERE A.PUBLICO = 1
      AND A.ES_ACTUAL = 1
    `;

    let params = [];

    if (rol !== "admin") {
      query += `
        AND EXISTS (
          SELECT 1
          FROM ARCHIVO_PERFILES AP
          JOIN USUARIOS_PERFILES UP 
            ON UP.PERFIL_ID = AP.PERFIL_ID
          WHERE AP.ARCHIVO_ID = A.ARCHIVO_ID
          AND UP.USUARIO_ID = ?
        )
      `;
      params.push(userId);
    }

    query += `
      ORDER BY A.ORDEN ASC, A.GRUPO_ID, A.VERSION DESC
    `;

    const rows = await new Promise((resolve, reject) =>
      db.query(query, params, (err, r) =>
        err ? reject(err) : resolve(r)
      )
    );

    res.json(
      rows.map((r) => ({
        ...r,
        CREATED_AT: formatDateDMY(r.CREATED_AT)
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db?.detach();
  }
};

/* ===============================
   GET ARCHIVOS ADMIN
=============================== */
exports.getArchivosAdmin = async (req, res) => {
  let db;

  try {
    db = await getDb();

    const userId = req.user.id;
    const rol = req.user.rol;

    let query = `SELECT * FROM ARCHIVOS WHERE 1=1`;
    let params = [];

    if (rol !== "admin") {
      query += ` AND CREADO_POR = ?`;
      params.push(userId);
    }

    query += ` ORDER BY ORDEN ASC, GRUPO_ID, VERSION DESC`;

    const rows = await new Promise((resolve, reject) =>
      db.query(query, params, (err, r) =>
        err ? reject(err) : resolve(r)
      )
    );

    res.json(
      rows.map((r) => ({
        ...r,
        CREATED_AT: formatDateDMY(r.CREATED_AT)
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db?.detach();
  }
};

/* ===============================
   SUBIR ARCHIVO
=============================== */
exports.createArchivo = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No hay archivo" });

  let db;

  try {
    const filename = Date.now() + "_" + req.file.originalname;
    const filePath = path.join(uploadDir, filename);

    await fs.promises.writeFile(filePath, req.file.buffer);

    db = await getDb();

    const titulo = req.body.titulo;
    const descripcion = req.body.descripcion;
    const publico = req.body.publico === "true" ? 1 : 0;

    const { grupoId, version } = await getVersionData(db, titulo);

    const orden = ORDEN_TITULOS[titulo] || 999;

    await new Promise((resolve, reject) =>
      db.query(
        `UPDATE ARCHIVOS SET ES_ACTUAL=0 WHERE GRUPO_ID=?`,
        [grupoId],
        (err) => (err ? reject(err) : resolve())
      )
    );

    const result = await new Promise((resolve, reject) =>
      db.query(
        `INSERT INTO ARCHIVOS
        (TITULO, URL, FICHERO_NOMBRE, TAMANIO, PUBLICO, CREADO_POR, DESCRIPCION, CREATED_AT, GRUPO_ID, VERSION, ES_ACTUAL, ORDEN)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 1, ?)`,
        [
          titulo,
          filename,
          req.file.originalname,
          req.file.size,
          publico,
          req.user.id,
          descripcion,
          grupoId,
          version,
          orden
        ],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID || true);
        }
      )
    );

    res.json({
      ok: true,
      archivoId: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db?.detach();
  }
};

/* ===============================
   UPDATE ARCHIVO
=============================== */
exports.updateArchivo = async (req, res) => {
  const id = Number(req.params.id);
  let db;

  try {
    db = await getDb();

    const rows = await new Promise((resolve, reject) =>
      db.query(
        `SELECT * FROM ARCHIVOS WHERE ARCHIVO_ID=?`,
        [id],
        (err, r) => (err ? reject(err) : resolve(r))
      )
    );

    if (!rows.length) {
      return res.status(404).json({ error: "No existe" });
    }

    const archivo = rows[0];

    if (req.user.rol !== "admin" && archivo.CREADO_POR !== req.user.id) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    await new Promise((resolve, reject) =>
      db.query(
        `UPDATE ARCHIVOS SET TITULO=?, DESCRIPCION=?, PUBLICO=? WHERE ARCHIVO_ID=?`,
        [
          req.body.titulo,
          req.body.descripcion,
          req.body.publico ? 1 : 0,
          id
        ],
        (err) => (err ? reject(err) : resolve())
      )
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db?.detach();
  }
};

/* ===============================
   DELETE ARCHIVO
=============================== */
exports.deleteArchivo = async (req, res) => {
  const id = Number(req.params.id);
  let db;

  try {
    db = await getDb();

    const rows = await new Promise((resolve, reject) =>
      db.query(
        `SELECT * FROM ARCHIVOS WHERE ARCHIVO_ID=?`,
        [id],
        (err, r) => (err ? reject(err) : resolve(r))
      )
    );

    if (!rows.length) {
      return res.status(404).json({ error: "No existe" });
    }

    const archivo = rows[0];

    if (req.user.rol !== "admin" && archivo.CREADO_POR !== req.user.id) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    await new Promise((resolve, reject) =>
      db.query(
        `DELETE FROM ARCHIVOS WHERE ARCHIVO_ID=?`,
        [id],
        (err) => (err ? reject(err) : resolve())
      )
    );

    const filePath = path.join(uploadDir, archivo.URL);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db?.detach();
  }
};

/* ===============================
   DESCARGA PUBLICA
=============================== */
exports.downloadArchivoPublico = async (req, res) => {
  const id = Number(req.params.id);
  let db;

  try {
    db = await getDb();

    const rows = await new Promise((resolve, reject) =>
      db.query(
        `SELECT URL, FICHERO_NOMBRE
         FROM ARCHIVOS
         WHERE ARCHIVO_ID=? AND PUBLICO=1 AND ES_ACTUAL=1`,
        [id],
        (err, r) => (err ? reject(err) : resolve(r))
      )
    );

    if (!rows.length) return res.status(404).send("No disponible");

    const filePath = path.join(uploadDir, rows[0].URL);
    res.download(filePath, rows[0].FICHERO_NOMBRE);
  } catch (err) {
    res.status(500).send("Error descarga");
  } finally {
    db?.detach();
  }
};