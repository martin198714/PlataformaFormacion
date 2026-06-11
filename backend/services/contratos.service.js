const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");

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
    `
    SELECT DISTINCT
      c.ID,
      c.EMPRESA_ID,
      e.NOMBRE AS EMPRESA_NOMBRE,
      c.PERFIL_ID,
      p.NOMBRE AS PERFIL_NOMBRE,
      c.ESTADO,
      c.FECHA_ENVIO,
      c.TOKEN,
      c.ARCHIVO_ENVIADO_ID,
      c.HASH_CONTRATO
    FROM CONTRATOS_MANTENIMIENTO c
    INNER JOIN USUARIOS_PERFILES up ON up.PERFIL_ID = c.PERFIL_ID
    LEFT JOIN EMPRESAS e ON e.EMPRESA_ID = c.EMPRESA_ID
    LEFT JOIN PERFILES p ON p.ID = c.PERFIL_ID
    WHERE up.USUARIO_ID = ?
    ORDER BY c.ID DESC
  `,
    [usuarioId]
  );

  return toArray(r);
}

/* =========================
   LISTAR EMPRESA
========================= */
async function listarPorEmpresa(empresaId) {
  const id = Number(empresaId);
  if (isNaN(id)) throw new Error("empresaId inválido");

  const r = await db.query(
    `
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ?
    ORDER BY ID DESC
  `,
    [id]
  );

  return toArray(r);
}

/* =========================
   CREAR CONTRATO
========================= */
async function crearContrato(empresaId, perfilId, usuarioId) {

  const token = generarHash({ empresaId, perfilId, time: Date.now() });
  const hashContrato = generarHash({ empresaId, perfilId, token });

  // 1. INSERTAR PRIMERO
  const result = await db.query(
    `
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (EMPRESA_ID, PERFIL_ID, ESTADO, TOKEN, HASH_CONTRATO, FECHA_ENVIO)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      empresaId,
      perfilId,
      ESTADOS_CONTRATO.PENDIENTE,
      token,
      hashContrato
    ]
  );

  const contratoId = result.insertId || result.lastInsertId;

  if (!contratoId) {
    throw new Error("No se pudo obtener el ID del contrato");
  }

  // 2. GENERAR PDF CON ID REAL
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId,
    perfilId,
    hash: hashContrato,
  });

  if (!pdf || !pdf.fileName) {
    throw new Error("Datos insuficientes para generar PDF");
  }

  // 3. ACTUALIZAR CONTRATO CON PDF
  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET ARCHIVO_ENVIADO_ID = ?
    WHERE CONTRATO_ID = ?
    `,
    [pdf.fileName, contratoId]
  );

  return {
    ok: true,
    contratoId,
    token
  };
}

/* =========================
   FIRMA POR TOKEN
========================= */
async function firmarContratoToken({ token, usuarioId, ip, userAgent }) {
  const r = await db.query(
    `
    SELECT FIRST 1 *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
  `,
    [token]
  );

  const c = toArray(r)[0];
  if (!c) throw new Error("Contrato no existe");

  if (
    c.ESTADO === ESTADOS_CONTRATO.FIRMADO ||
    c.ESTADO === ESTADOS_CONTRATO.BLOQUEADO
  ) {
    throw new Error("Contrato ya firmado");
  }

  const hashFirma = generarHash({
    contratoId: c.ID,
    usuarioId,
    ip,
    userAgent,
    timestamp: Date.now(),
  });

  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      USUARIO_FIRMA_ID = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      IP_FIRMA = ?,
      USER_AGENT = ?,
      ESTADO = ?,
      HASH_FIRMADO = ?
    WHERE ID = ?
  `,
    [usuarioId, ip, userAgent, ESTADOS_CONTRATO.FIRMADO, hashFirma, c.ID]
  );

  return {
    ok: true,
    contratoId: c.ID,
    hashFirma,
  };
}

/* =========================
   FIRMA POR PDF SUBIDO
========================= */
async function marcarFirmado(contratoId, archivoFirmado, usuarioId) {
  const r = await db.query(
    `
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE ID = ?
  `,
    [contratoId]
  );

  const c = toArray(r)[0];
  if (!c) throw new Error("Contrato no encontrado");

  if (c.ESTADO === ESTADOS_CONTRATO.BLOQUEADO) {
    throw new Error("Contrato ya firmado");
  }

  const archivo =
    archivoFirmado?.filename ||
    archivoFirmado?.fileName ||
    null;

  if (!archivo) throw new Error("Archivo firmado inválido");

  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      ARCHIVO_FIRMADO_ID = ?,
      USUARIO_FIRMA_ID = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      ESTADO = ?
    WHERE ID = ?
  `,
    [archivo, usuarioId, ESTADOS_CONTRATO.BLOQUEADO, contratoId]
  );

  return {
    ok: true,
    contratoId,
  };
}

/* =========================
   VER CONTRATO
========================= */
async function verContrato(id) {
  const r = await db.query(
    `
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE ID = ?
  `,
    [id]
  );

  return toArray(r)[0] || null;
}

/* =========================
   OBTENER POR TOKEN
========================= */
async function obtenerPorToken(token) {
  if (!token) throw new Error("Token inválido");

  const r = await db.query(
    `
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
  `,
    [token]
  );

  return toArray(r)[0] || null;
}

async function marcarFirmadoArchivo({
  contratoId,
  usuarioId,
  archivoFirmado
}) {
  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      ARCHIVO_FIRMADO_ID = ?,
      USUARIO_FIRMA_ID = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      ESTADO = ?
    WHERE ID = ?
    `,
    [
      archivoFirmado,
      usuarioId,
      ESTADOS_CONTRATO.FIRMADO,
      contratoId
    ]
  );

  return { ok: true };
}

module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  firmarContratoToken,
  marcarFirmado,
  verContrato,
  obtenerPorToken,
  marcarFirmadoArchivo,
};