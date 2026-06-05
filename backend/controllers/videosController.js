const path = require("path");
const fs = require("fs");
const { getConnection } = require("../models/db");

/* =========================
   PATHS
========================= */

const uploadsBase = path.join(__dirname, "..", "uploads");
const tempDir = path.join(uploadsBase, "temp");
const capitulosDir = path.join(uploadsBase, "capitulos");

// =========================
// 📦 UPLOAD STATE MEMORY
// =========================
const uploadState = new Map();

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(capitulosDir))
  fs.mkdirSync(capitulosDir, { recursive: true });

// ===============================
// 📊 ORDEN FIJO CAPITULOS
// ===============================
const ORDEN_TITULOS = {
  "Planning 4.0": 1,
  "Transporta 4.0": 2,
  "Base 4.0": 3,
  "Gestion Horto 4.0": 4,
  "Contasoft 4.0": 5,
  "SII 4.0": 6,
  "Fiscal 4.0": 7,
  "Verifactu 4.0": 8,
};

/* =========================
   DB HELPERS
========================= */

const getDb = () =>
  new Promise((resolve, reject) =>
    getConnection((err, db) => (err ? reject(err) : resolve(db))),
  );

const queryAsync = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, res) => (err ? reject(err) : resolve(res))),
  );

function formatDateDMY(date) {
  if (!date) return null;

  const d = new Date(date);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
}

/* =========================
   VIDEOS
========================= */

async function getVideos(req, res) {
  let db;

  try {
    db = await getDb();

    const rows = await queryAsync(
      db,
      `SELECT * FROM VIDEOS ORDER BY VIDEO_ID DESC`,
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

async function createVideo(req, res) {
  let db;

  try {
    const { titulo, descripcion } = req.body;

    if (!titulo) {
      return res.status(400).json({ error: "Título requerido" });
    }

    db = await getDb();

    await queryAsync(
      db,
      `INSERT INTO VIDEOS (TITULO, DESCRIPCION) VALUES (?, ?)`,
      [titulo, descripcion || ""],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

async function updateVideo(req, res) {
  let db;

  try {
    const { titulo, descripcion } = req.body;

    db = await getDb();

    await queryAsync(
      db,
      `UPDATE VIDEOS SET TITULO=?, DESCRIPCION=? WHERE VIDEO_ID=?`,
      [titulo, descripcion, req.params.videoId],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

async function deleteVideo(req, res) {
  let db;

  try {
    db = await getDb();

    await queryAsync(db, `DELETE FROM VIDEOS WHERE VIDEO_ID=?`, [
      req.params.videoId,
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   VERSIONADO CAPITULOS
========================= */

async function getVersionData(db, titulo) {
  const rows = await queryAsync(
    db,
    `SELECT FIRST 1 GRUPO_ID, VERSION
     FROM CAPITULOS
     WHERE TITULO = ?
     ORDER BY FECHA_CREACION DESC`,
    [titulo],
  );

  if (rows.length) {
    return {
      grupoId: Number(rows[0].GRUPO_ID) || 0,
      version: Number(rows[0].VERSION || 0) + 1,
    };
  }

  return {
    grupoId: Math.floor(Date.now() / 1000),
    version: 1,
  };
}

/* =========================
   CAPITULOS - LISTAR
========================= */

async function getChapters(req, res) {
  let db;

  try {
    db = await getDb();

    const rows = await queryAsync(
      db,
      `SELECT 
          CAPITULO_ID,
          TITULO,
          DESCRIPCION,
          TAMANIO,
          FECHA_CREACION,
          PUBLICO,
          GRUPO_ID,
          VERSION,
          ES_ACTUAL,
          ORDEN
       FROM CAPITULOS`,
    );

    // 📊 ORDEN FINAL
    const ordered = rows.sort((a, b) => {
      const oa = ORDEN_TITULOS[a.TITULO] ?? 999;
      const ob = ORDEN_TITULOS[b.TITULO] ?? 999;

      if (oa !== ob) return oa - ob;

      // 📅 orden real dentro del módulo (más reciente primero)
      const da = new Date(a.FECHA_CREACION || 0);
      const dbd = new Date(b.FECHA_CREACION || 0);

      return dbd - da;
    });

    // 📅 FORMATO FECHA
    const formatted = ordered.map((r) => {
      const d = r.FECHA_CREACION ? new Date(r.FECHA_CREACION) : null;

      return {
        ...r,
        FECHA_CREACION: d
          ? `${String(d.getDate()).padStart(2, "0")}-${String(
              d.getMonth() + 1,
            ).padStart(2, "0")}-${d.getFullYear()}`
          : null,
      };
    });

    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   CAPITULOS PUBLICOS
========================= */

async function getPublicChapters(req, res) {
  let db;

  try {
    db = await getDb();

    const userId = req.user.id;
    const rol = req.user.rol;

    let query = `
      SELECT
          CAPITULO_ID,
          TITULO,
          DESCRIPCION,
          URL,
          FECHA_CREACION,
          VERSION,
          ES_ACTUAL,
          ORDEN,
          FICHERO_NOMBRE,
          PUBLICO
      FROM CAPITULOS
      WHERE PUBLICO = 1
      AND ES_ACTUAL = 1
    `;

    let params = [];

    // 🔒 SI NO ES ADMIN → FILTRAR POR PERFILES DEL USUARIO
    if (rol !== "admin") {
      query += `
        AND EXISTS (
          SELECT 1
          FROM CAPITULO_PERFILES CP
          JOIN USUARIOS_PERFILES UP
            ON UP.PERFIL_ID = CP.PERFIL_ID
          WHERE CP.CAPITULO_ID = CAPITULOS.CAPITULO_ID
          AND UP.USUARIO_ID = ?
        )
      `;

      params.push(userId);
    }

    query += `
      ORDER BY ORDEN ASC, FECHA_CREACION DESC
    `;

    const rows = await new Promise((resolve, reject) =>
      db.query(query, params, (err, r) => (err ? reject(err) : resolve(r))),
    );

    // 📅 FORMATO FECHA
    const formatted = rows.map((r) => {
      const d = r.FECHA_CREACION ? new Date(r.FECHA_CREACION) : null;

      return {
        ...r,
        FECHA_CREACION: d
          ? `${String(d.getDate()).padStart(2, "0")}-${String(
              d.getMonth() + 1,
            ).padStart(2, "0")}-${d.getFullYear()}`
          : null,
      };
    });

    res.json(formatted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   CAPITULOS - UPDATE
========================= */

async function updateChapter(req, res) {
  let db;

  try {
    const { titulo, descripcion, publico } = req.body;

    db = await getDb();

    await queryAsync(
      db,
      `UPDATE CAPITULOS
       SET TITULO=?, DESCRIPCION=?, PUBLICO=?
       WHERE CAPITULO_ID=?`,
      [titulo, descripcion, publico ? 1 : 0, req.params.chapterId],
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   CAPITULOS - DELETE
========================= */

async function deleteChapter(req, res) {
  let db;

  try {
    db = await getDb();

    await queryAsync(db, `DELETE FROM CAPITULOS WHERE CAPITULO_ID=?`, [
      req.params.chapterId,
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   UPLOAD CHUNKS
========================= */

async function uploadChapterPro(req, res) {
  let db;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Archivo no recibido" });
    }

    db = await getDb();

    const {
      chunkIndex,
      totalChunks,
      fileGuid,
      originalName,
      titulo,
      descripcion,
    } = req.body;

    const safeGuid = fileGuid.replace(/[^a-z0-9]/gi, "");
    const chunkDir = path.join(tempDir, safeGuid);

    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
    fs.renameSync(req.file.path, chunkPath);

    // 📦 estado
    let state = uploadState.get(fileGuid) || {
      received: new Set(),
      total: Number(totalChunks),
    };

    state.received.add(Number(chunkIndex));
    uploadState.set(fileGuid, state);

    if (state.received.size < state.total) {
      return res.json({
        ok: true,
        received: state.received.size,
      });
    }

    // 🧠 unir
    const versionData = await getVersionData(db, originalName);

    const finalName =
      Date.now() +
      "_" +
      originalName.replace(/[^a-z0-9.]/gi, "_").toLowerCase();

    const finalPath = path.join(capitulosDir, finalName);

    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = path.join(chunkDir, `chunk_${i}`);

      if (!fs.existsSync(chunkFile)) continue;

      writeStream.write(fs.readFileSync(chunkFile));
    }

    writeStream.end();
    await new Promise((resolve) => writeStream.on("finish", resolve));

    uploadState.delete(fileGuid);
    fs.rmSync(chunkDir, { recursive: true, force: true });

    const fileSize = fs.statSync(finalPath).size;

    const finalTitulo = titulo?.trim() || originalName;
    const finalDescripcion = descripcion?.trim() || "";

    await queryAsync(
      db,
      `INSERT INTO CAPITULOS
      (TITULO, URL, FICHERO_NOMBRE, TAMANIO, PUBLICO,
       CREADO_POR, DESCRIPCION, GRUPO_ID, VERSION, ES_ACTUAL, ORDEN)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, 1, 999)`,

      [
        finalTitulo,
        `/uploads/capitulos/${finalName}`,
        finalName,
        fileSize,
        finalDescripcion,
        versionData.grupoId,
        versionData.version,
      ],
    );

    return res.json({
      ok: true,
      file: finalName,
      size: fileSize,
      done: true,
    });
  } catch (e) {
    console.error("UPLOAD ERROR:", e);
    return res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   STATUS UPLOAD
========================= */

function getUploadStatus(req, res) {
  const { fileGuid } = req.params;

  const state = uploadState.get(fileGuid);

  if (!state) {
    return res.json({ uploadedChunks: [] });
  }

  return res.json({
    uploadedChunks: Array.from(state.received),
  });
}

async function descargarCapitulo(req, res) {
  let db;

  try {
    db = await getDb();

    const userId = req.user.id;
    const rol = req.user.rol;
    const chapterId = req.params.chapterId;

    let query = `
      SELECT C.*
      FROM CAPITULOS C
      WHERE C.CAPITULO_ID = ?
      AND C.PUBLICO = 1
      AND C.ES_ACTUAL = 1
    `;

    let params = [chapterId];

    // 🔒 CONTROL DE PERMISOS REAL
    if (rol !== "admin") {
      query += `
        AND EXISTS (
          SELECT 1
          FROM CAPITULO_PERFILES CP
          JOIN USUARIOS_PERFILES UP
            ON UP.PERFIL_ID = CP.PERFIL_ID
          WHERE CP.CAPITULO_ID = C.CAPITULO_ID
          AND UP.USUARIO_ID = ?
        )
      `;
      params.push(userId);
    }

    const rows = await queryAsync(db, query, params);

    if (!rows.length) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const file = rows[0];
    const filePath = path.join(capitulosDir, file.FICHERO_NOMBRE);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }

    // 🎥 STREAM (NO descarga directa controlada por el navegador)
    const stat = fs.statSync(filePath);

    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": stat.size,
      "Content-Disposition": "inline",
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    db?.detach?.();
    db?.end?.();
  }
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  getVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  getChapters,
  getPublicChapters,
  updateChapter,
  deleteChapter,
  uploadChapterPro,
  getUploadStatus,
  descargarCapitulo,
};
