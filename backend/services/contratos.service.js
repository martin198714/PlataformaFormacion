const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato, verificarPDFFirmado } = require("./pdf.service");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

/* =========================
   NORMALIZADOR DB
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
        a.FICHERO_NOMBRE,
        p.NOMBRE AS PERFIL_NOMBRE
     FROM CONTRATOS_MANTENIMIENTO c
     LEFT JOIN EMPRESAS e ON e.EMPRESA_ID = c.EMPRESA_ID
     LEFT JOIN ARCHIVOS a ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
     LEFT JOIN CONTRATO_PERFILES cp ON cp.CONTRATO_ID = c.ID
     LEFT JOIN PERFILES p ON p.ID = cp.PERFIL_ID
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
   CREAR CONTRATO (FIX REAL)
========================= */
async function crearContrato(empresaId, perfilId, usuarioId) {
  try {
    if (!empresaId || !perfilId || !usuarioId) {
      throw new Error("Faltan datos obligatorios");
    }

    const token = uuidv4();

    const hash = generarHash({
      empresaId,
      perfilId,
      token,
      t: Date.now(),
    });

    /* =========================
       INSERT CONTRATO
    ========================= */
    await db.query(
      `INSERT INTO CONTRATOS_MANTENIMIENTO
       (EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        empresaId,
        token,
        hash,
        ESTADOS_CONTRATO.PENDIENTE || "PENDIENTE"
      ]
    );

    /* =========================
       OBTENER ID REAL (SEGURO FIREBIRD)
    ========================= */
    const contratoRow = await db.query(
      `SELECT FIRST 1 ID
       FROM CONTRATOS_MANTENIMIENTO
       WHERE TOKEN = ?
       ORDER BY ID DESC`,
      [token]
    );

    const contratoId = toArray(contratoRow)[0]?.ID;

    if (!contratoId) {
      throw new Error("No se pudo obtener ID del contrato");
    }

    /* =========================
       VALIDAR PERFIL
    ========================= */
    const perfilNum = Number(perfilId);

    if (isNaN(perfilNum)) {
      throw new Error("perfilId inválido");
    }

    await db.query(
      `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
       VALUES (?, ?)`,
      [contratoId, perfilNum]
    );

    return {
      ok: true,
      contratoId,
      token,
    };

  } catch (err) {
    console.error("ERROR CREAR CONTRATO:", err);
    throw err;
  }
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
   FIRMAR TOKEN (IP + USER)
========================= */
async function firmarContratoToken({ token, ip, userAgent }) {
  const contrato = await obtenerPorToken(token);
  if (!contrato) throw new Error("Contrato no existe");

  const hashFirma = generarHash({
    token,
    ip,
    userAgent,
    t: Date.now(),
  });

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?,
         FECHA_FIRMA = CURRENT_TIMESTAMP,
         IP_FIRMA = ?,
         USER_AGENT = ?,
         HASH_FIRMADO = ?
     WHERE TOKEN = ?`,
    [ESTADOS_CONTRATO.FIRMADO, ip, userAgent, hashFirma, token]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   FIRMAR PDF SUBIDO
========================= */
async function firmarContratoTokenArchivo(data) {
  const contrato = await obtenerPorToken(data.token);
  if (!contrato) throw new Error("Contrato no encontrado");

  const valid = await verificarPDFFirmado(data.rutaFirmado);
  if (!valid?.valido) {
    throw new Error("PDF firmado inválido");
  }

  const hashFirma = generarHash({
    token: data.token,
    archivo: data.archivoFirmado,
    ip: data.ip,
    userAgent: data.userAgent,
    t: Date.now(),
  });

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
      hashFirma,
      data.token,
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  verContrato,
  obtenerPorToken,
  firmarContratoToken,
  firmarContratoTokenArchivo,
};