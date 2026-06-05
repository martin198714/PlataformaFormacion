const db = require("../models/db");
const path = require("path");

const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");

const { generarPDFContrato } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");


/* =========================
   NORMALIZADOR
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
  if (!usuarioId) throw new Error("usuarioId requerido");

  const r = await db.query(`
    SELECT DISTINCT
      c.ID,
      c.EMPRESA_ID,
      e.NOMBRE AS EMPRESA_NOMBRE,
      c.PERFIL_ID,
      p.NOMBRE AS PERFIL_NOMBRE,
      c.ESTADO,
      c.FECHA_ENVIO,
      c.TOKEN
    FROM CONTRATOS_MANTENIMIENTO c
    INNER JOIN USUARIOS_PERFILES up ON up.PERFIL_ID = c.PERFIL_ID
    LEFT JOIN EMPRESAS e ON e.EMPRESA_ID = c.EMPRESA_ID
    LEFT JOIN PERFILES p ON p.ID = c.PERFIL_ID
    WHERE up.USUARIO_ID = ?
    ORDER BY c.ID DESC
  `, [usuarioId]);

  const data = toArray(r);

  // 🔥 FIX: asegurar token nunca null
  return data.map(c => ({
    ...c,
    TOKEN: c.TOKEN || null
  }));
}


/* =========================
   LISTAR EMPRESA
========================= */
async function listarPorEmpresa(empresaId) {
  const id = Number(empresaId);
  if (!id || isNaN(id)) throw new Error("empresaId inválido");

  const r = await db.query(`
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ?
    ORDER BY ID DESC
  `, [id]);

  return toArray(r);
}


/* =========================
   CREAR CONTRATO (🔥 FIX TOKEN)
========================= */
async function crearContrato(empresaId, perfilId) {

  const empresa = await db.query(
    `SELECT * FROM EMPRESAS WHERE EMPRESA_ID = ?`,
    [empresaId]
  );

  const perfil = await db.query(
    `SELECT * FROM PERFILES WHERE ID = ?`,
    [perfilId]
  );

  if (!empresa?.[0] || !perfil?.[0]) {
    throw new Error("Empresa o perfil no existe");
  }

  const token = generarHash({
    empresaId,
    perfilId,
    time: Date.now()
  });

  if (!token) throw new Error("Error generando token");

  await db.query(`
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (EMPRESA_ID, PERFIL_ID, ESTADO, TOKEN, FECHA_ENVIO)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    empresaId,
    perfilId,
    ESTADOS_CONTRATO.PENDIENTE,
    token
  ]);

  const contrato = await db.query(`
    SELECT FIRST 1 *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
  `, [token]);

  const c = contrato?.[0];
  if (!c) throw new Error("Error creando contrato");

  return {
    ok: true,
    contratoId: c.ID,
    token: c.TOKEN
  };
}


/* =========================
   FIRMA POR TOKEN (🔥 PROTEGIDO)
========================= */
async function firmarContratoToken({
  token,
  usuarioId,
  ip,
  userAgent
}) {

  if (!token || token === "null" || token === "undefined") {
    throw new Error("Token inválido");
  }

  const r = await db.query(`
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
  `, [token]);

  const c = toArray(r)[0];

  if (!c) throw new Error("Contrato no existe");

  // 🔥 AUTO FIX si hay contratos viejos sin token
  if (!c.TOKEN) {
    throw new Error("Contrato sin token (regenera contratos)");
  }

  if (c.ESTADO === ESTADOS_CONTRATO.BLOQUEADO) {
    throw new Error("Contrato ya firmado o bloqueado");
  }

  const hash = generarHash({
    contratoId: c.ID,
    empresaId: c.EMPRESA_ID,
    perfilId: c.PERFIL_ID,
    usuarioId,
    ip,
    userAgent,
    timestamp: Date.now()
  });

  await db.query(`
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      USUARIO_FIRMA_ID = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      IP_FIRMA = ?,
      USER_AGENT = ?,
      HASH_CONTRATO = ?,
      ESTADO = ?
    WHERE ID = ?
  `, [
    usuarioId,
    ip,
    userAgent,
    hash,
    ESTADOS_CONTRATO.FIRMADO,
    c.ID
  ]);

  await db.query(`
    UPDATE CONTRATOS_MANTENIMIENTO
    SET ESTADO = ?
    WHERE ID = ?
  `, [
    ESTADOS_CONTRATO.BLOQUEADO,
    c.ID
  ]);

  return {
    ok: true,
    contratoId: c.ID,
    estado: ESTADOS_CONTRATO.BLOQUEADO,
    hash
  };
}


/* =========================
   VER CONTRATO
========================= */
async function verContrato(id) {
  const contratoId = Number(id);
  if (!contratoId || isNaN(contratoId)) throw new Error("ID inválido");

  const r = await db.query(`
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE ID = ?
  `, [contratoId]);

  return toArray(r)[0] || null;
}


/* =========================
   EXPORT
========================= */
module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  firmarContratoToken,
  verContrato
};