const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato, verificarPDFFirmado } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");
const { v4: uuidv4 } = require("uuid");

/* =========================
   UTIL
========================= */
function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  return [];
}

/* =========================
   LISTAR USUARIO
========================= */
async function listarPorUsuario(usuarioId) {
  const r = await db.query(
    `SELECT
        c.ID,
        c.EMPRESA_ID,
        e.NOMBRE AS EMPRESA_NOMBRE,
        c.ESTADO,
        c.FECHA_ENVIO,
        c.TOKEN,
        a.FICHERO_NOMBRE
     FROM CONTRATOS_MANTENIMIENTO c
     LEFT JOIN EMPRESAS e ON e.EMPRESA_ID = c.EMPRESA_ID
     LEFT JOIN ARCHIVOS a ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
     WHERE c.EMPRESA_ID = (
        SELECT EMPRESA_ID FROM USUARIOS WHERE USUARIO_ID = ?
     )
     ORDER BY c.ID DESC`,
    [usuarioId]
  );

  return toArray(r);
}

/* =========================
   LISTAR EMPRESA
========================= */
async function listarPorEmpresa(empresaId) {
  const r = await db.query(
    `SELECT *
     FROM CONTRATOS_MANTENIMIENTO
     WHERE EMPRESA_ID = ?
     ORDER BY ID DESC`,
    [empresaId]
  );

  return toArray(r);
}

/* =========================
   VER CONTRATO
========================= */
async function verContrato(id) {
  const r = await db.query(
    `SELECT c.*, a.FICHERO_NOMBRE
     FROM CONTRATOS_MANTENIMIENTO c
     LEFT JOIN ARCHIVOS a ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
     WHERE c.ID = ?`,
    [id]
  );

  return toArray(r)[0] || null;
}

/* =========================
   CREAR CONTRATO (MULTI PERFIL + EMAIL)
   🔥 ARREGLADO: acepta perfiles desde frontend
========================= */
async function crearContrato(empresaId, perfiles, usuarioId) {
  const empresa = Number(empresaId);

  const perfilesArray = Array.isArray(perfiles)
    ? perfiles
    : [perfiles];

  const perfilesNumeros = perfilesArray
    .map(Number)
    .filter(n => !isNaN(n));

  if (!empresa) {
    throw new Error("Empresa inválida");
  }

  if (!Array.isArray(perfilesNumeros) || perfilesNumeros.length === 0) {
    throw new Error("Debe seleccionar al menos un perfil válido");
  }

  const token = uuidv4();

  const hash = generarHash({
    empresa,
    perfiles: perfilesNumeros,
    token,
    t: Date.now(),
  });

  const insert = await db.query(
    `INSERT INTO CONTRATOS_MANTENIMIENTO
     (EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [empresa, token, hash, ESTADOS_CONTRATO.PENDIENTE]
  );

  const contratoId =
    insert?.insertId || toArray(insert)[0]?.ID;

  if (!contratoId) throw new Error("No se creó contrato");

  for (const perfilId of perfilesNumeros) {
    await db.query(
      `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM CONTRATO_PERFILES
         WHERE CONTRATO_ID = ? AND PERFIL_ID = ?
       )`,
      [contratoId, perfilId, contratoId, perfilId]
    );
  }

  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfiles: perfilesNumeros,
    hash,
  });

  if (!pdf?.filePath) throw new Error("PDF no generado");

  const placeholders = perfilesNumeros.map(() => "?").join(",");

  const emailRaw = await db.query(
    `
    SELECT DISTINCT u.EMAIL
    FROM USUARIOS u
    INNER JOIN USUARIOS_PERFILES up
      ON up.USUARIO_ID = u.USUARIO_ID
    WHERE u.EMPRESA_ID = ?
      AND up.PERFIL_ID IN (${placeholders})
      AND u.ACTIVO = 1
      AND u.DELETED = 0
    `,
    [empresa, ...perfilesNumeros]
  );

  const emails = toArray(emailRaw).map(u => u.EMAIL);

  for (const email of emails) {
    await enviarContratoEmail({
      to: email,
      pdfPath: pdf.filePath,
      contratoId,
      linkFirma: `http://localhost:3000/firma.html?token=${token}`,
    });
  }

  return {
    ok: true,
    contratoId,
    token,
    pdf: pdf.fileName,
    perfiles: perfilesNumeros,
    emailsEnviados: emails.length,
  };
}

/* =========================
   OBTENER POR TOKEN
========================= */
async function obtenerPorToken(token) {
  const r = await db.query(
    `SELECT c.*, a.FICHERO_NOMBRE
     FROM CONTRATOS_MANTENIMIENTO c
     LEFT JOIN ARCHIVOS a ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
     WHERE c.TOKEN = ?`,
    [token]
  );

  return toArray(r)[0] || null;
}

/* =========================
   FIRMAR TOKEN SIMPLE
========================= */
async function firmarContratoToken({ token, ip, userAgent }) {
  const contrato = await obtenerPorToken(token);
  if (!contrato) throw new Error("Contrato no existe");

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?,
         FECHA_FIRMA = CURRENT_TIMESTAMP,
         IP_FIRMA = ?,
         USER_AGENT = ?,
         HASH_FIRMADO = ?
     WHERE TOKEN = ?`,
    [
      ESTADOS_CONTRATO.FIRMADO,
      ip,
      userAgent,
      generarHash({ token, ip, userAgent, t: Date.now() }),
      token,
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   FIRMAR PDF TOKEN
========================= */
async function firmarContratoTokenArchivo(data) {
  const contrato = await obtenerPorToken(data.token);
  if (!contrato) throw new Error("Contrato no encontrado");

  if (data.rutaFirmado) {
    const valid = await verificarPDFFirmado(data.rutaFirmado);
    if (!valid?.valido) throw new Error("PDF inválido");
  }

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?,
         ARCHIVO_FIRMADO = ?,
         RUTA_FIRMADO = ?,
         IP_FIRMA = ?,
         USER_AGENT = ?,
         HASH_FIRMADO = ?,
         FECHA_FIRMA = CURRENT_TIMESTAMP
     WHERE TOKEN = ?`,
    [
      ESTADOS_CONTRATO.FIRMADO,
      data.archivoFirmado,
      data.rutaFirmado,
      data.ip,
      data.userAgent,
      generarHash(data),
      data.token,
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   FIRMAR GENERAL
========================= */
async function firmarContrato(data) {
  let contrato = null;

  if (data.id) {
    const r = await db.query(
      `SELECT * FROM CONTRATOS_MANTENIMIENTO WHERE ID = ?`,
      [data.id]
    );
    contrato = toArray(r)[0];
  } else {
    contrato = await obtenerPorToken(data.token);
  }

  if (!contrato) throw new Error("Contrato no encontrado");

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?,
         FECHA_FIRMA = CURRENT_TIMESTAMP,
         IP_FIRMA = ?,
         USER_AGENT = ?,
         USUARIO_FIRMA_ID = ?,
         ARCHIVO_FIRMADO = COALESCE(?, ARCHIVO_FIRMADO),
         RUTA_FIRMADO = COALESCE(?, RUTA_FIRMADO),
         HASH_FIRMADO = ?
     WHERE ID = ?`,
    [
      ESTADOS_CONTRATO.FIRMADO,
      data.ip,
      data.userAgent,
      data.usuarioId,
      data.archivoFirmado,
      data.rutaFirmado,
      generarHash(data),
      contrato.ID,
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   AUTOFIRMA
========================= */
async function prepararFirmaAutoFirma(token) {
  const contrato = await obtenerPorToken(token);
  if (!contrato) throw new Error("Contrato no encontrado");

  return {
    ok: true,
    redirectUrl: `autofirma://sign?token=${token}`,
    request: {
      token,
      contratoId: contrato.ID,
      empresaId: contrato.EMPRESA_ID,
      urlReturn: "http://localhost:3000/api/contratos/autofirma/return",
      timestamp: Date.now(),
    },
  };
}

async function recibirFirmaAutoFirma(data) {
  const contrato = await obtenerPorToken(data.token);
  if (!contrato) throw new Error("Contrato no encontrado");

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?,
         ARCHIVO_FIRMADO = ?,
         RUTA_FIRMADO = ?,
         IP_FIRMA = ?,
         USER_AGENT = ?,
         USUARIO_FIRMA_ID = ?,
         HASH_FIRMADO = ?,
         FECHA_FIRMA = CURRENT_TIMESTAMP
     WHERE TOKEN = ?`,
    [
      ESTADOS_CONTRATO.FIRMADO,
      data.archivoFirmado,
      data.rutaFirmado,
      data.ip,
      data.userAgent,
      data.usuarioId,
      generarHash(data),
      data.token,
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   EXPORT (COMPLETO)
========================= */
module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  verContrato,
  crearContrato,
  obtenerPorToken,
  firmarContratoToken,
  firmarContratoTokenArchivo,
  firmarContrato,
  prepararFirmaAutoFirma,
  recibirFirmaAutoFirma
};