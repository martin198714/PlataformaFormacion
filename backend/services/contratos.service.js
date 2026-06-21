const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato, verificarPDFFirmado } = require("./pdf.service");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  return [];
}

/* =========================
   LISTAR USUARIO (JOIN COMPLETO)
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
    `SELECT * FROM CONTRATOS_MANTENIMIENTO WHERE EMPRESA_ID = ?`,
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

  return toArray(r)[0];
}

/* =========================
   CREAR CONTRATO
========================= */
async function crearContrato(empresaId, perfilId, usuarioId) {
  const token = uuidv4();

  const hash = generarHash({
    empresaId,
    perfilId,
    token,
  });

  await db.query(
    `INSERT INTO CONTRATOS_MANTENIMIENTO
     (EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [empresaId, token, hash, ESTADOS_CONTRATO.PENDIENTE]
  );

  const contratoId = toArray(
    await db.query(`SELECT MAX(ID) AS ID FROM CONTRATOS_MANTENIMIENTO`)
  )[0].ID;

  await db.query(
    `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
     VALUES (?, ?)`,
    [contratoId, perfilId]
  );

  const pdf = await generarPDFContrato({
    contratoId,
    empresaId,
    perfilId,
    hash,
  });

  await db.query(
    `INSERT INTO ARCHIVOS
     (TITULO, URL, FICHERO_NOMBRE, CREADO_POR, DESCRIPCION)
     VALUES (?, ?, ?, ?, ?)`,
    [
      `Contrato ${contratoId}`,
      pdf.filePath,
      pdf.fileName,
      usuarioId,
      "Contrato",
    ]
  );

  return { contratoId, token };
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

  return toArray(r)[0];
}

/* =========================
   FIRMAR TOKEN
========================= */
async function firmarContratoToken({ token, ip, userAgent }) {
  const contrato = await obtenerPorToken(token);
  if (!contrato) throw new Error("No existe");

  const hashFirma = generarHash({ token, ip, userAgent });

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?, FECHA_FIRMA = CURRENT_TIMESTAMP,
         IP_FIRMA = ?, USER_AGENT = ?, HASH_FIRMADO = ?
     WHERE TOKEN = ?`,
    [ESTADOS_CONTRATO.FIRMADO, ip, userAgent, hashFirma, token]
  );

  return { ok: true };
}

/* =========================
   FIRMAR PDF
========================= */
async function firmarContratoTokenArchivo(data) {
  const contrato = await obtenerPorToken(data.token);
  if (!contrato) throw new Error("No encontrado");

  const valid = await verificarPDFFirmado(data.rutaFirmado);
  if (!valid.valido) throw new Error("PDF inválido");

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?, ARCHIVO_FIRMADO = ?, RUTA_FIRMADO = ?
     WHERE TOKEN = ?`,
    [
      ESTADOS_CONTRATO.FIRMADO,
      data.archivoFirmado,
      data.rutaFirmado,
      data.token,
    ]
  );

  return { ok: true };
}

module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  verContrato,
  obtenerPorToken,
  firmarContratoToken,
  firmarContratoTokenArchivo,
};