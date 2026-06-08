const db = require("../models/db");
const path = require("path");

const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");

const { generarPDFContrato } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");


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
   LISTAR POR USUARIO
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
      c.FECHA_FIRMA,
      c.TOKEN,
      c.ARCHIVO_ENVIADO_ID,
      c.ARCHIVO_FIRMADO_ID
    FROM CONTRATOS_MANTENIMIENTO c
    INNER JOIN USUARIOS_PERFILES up ON up.PERFIL_ID = c.PERFIL_ID
    LEFT JOIN EMPRESAS e ON e.EMPRESA_ID = c.EMPRESA_ID
    LEFT JOIN PERFILES p ON p.ID = c.PERFIL_ID
    WHERE up.USUARIO_ID = ?
    ORDER BY c.ID DESC
  `, [usuarioId]);

  return toArray(r).map(c => ({
    ...c,
    TOKEN: c.TOKEN || null
  }));
}


/* =========================
   LISTAR POR EMPRESA
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
   CREAR CONTRATO (PDF + TOKEN + HASH)
========================= */
async function crearContrato(empresaId, perfilId, usuarioId = null) {

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

  const hashContrato = generarHash({
    empresaId,
    perfilId,
    token
  });

  // 🔥 PDF inicial
  const pdf = await generarPDFContrato({
    contratoId: 0,
    empresaId,
    perfilId,
    hash: hashContrato
  });

  await db.query(`
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (
      EMPRESA_ID,
      PERFIL_ID,
      ESTADO,
      TOKEN,
      HASH_CONTRATO,
      ARCHIVO_ENVIADO_ID,
      FECHA_ENVIO
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    empresaId,
    perfilId,
    ESTADOS_CONTRATO.PENDIENTE,
    token,
    hashContrato,
    pdf.fileName
  ]);

  const contrato = await db.query(`
    SELECT FIRST 1 *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
  `, [token]);

  const c = contrato?.[0];

  if (!c) throw new Error("Error creando contrato");

  // Email
  if (empresa?.[0]?.EMAIL) {
    try {
      await enviarContratoEmail({
        to: empresa[0].EMAIL,
        contratoId: c.ID,
        linkFirma: `http://localhost:3000/firma/${token}`,
        pdfPath: pdf.filePath
      });
    } catch (e) {
      console.error("EMAIL ERROR:", e.message);
    }
  }

  return {
    ok: true,
    contratoId: c.ID,
    token,
    hash: hashContrato
  };
}


/* =========================
   FIRMA POR TOKEN (SaaS FLOW REAL)
========================= */
async function firmarContratoToken({
  token,
  usuarioId,
  ip,
  userAgent
}) {

  if (!token) throw new Error("Token inválido");

  const r = await db.query(`
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
  `, [token]);

  const c = toArray(r)[0];

  if (!c) throw new Error("Contrato no existe");

  if (c.ESTADO === ESTADOS_CONTRATO.BLOQUEADO) {
    throw new Error("Contrato ya firmado");
  }

  // 🔥 HASH FIRMA
  const hashFirma = generarHash({
    contratoId: c.ID,
    usuarioId,
    ip,
    userAgent,
    time: Date.now()
  });

  // 🔥 AQUÍ podrías generar PDF firmado real después (hook listo)
  const archivoFirmadoId = null;

  await db.query(`
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      USUARIO_FIRMA_ID = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      FECHA_RECEPCION = CURRENT_TIMESTAMP,

      IP_FIRMA = ?,
      USER_AGENT = ?,

      HASH_FIRMADO = ?,
      HASH_CONTRATO = ?,

      ARCHIVO_FIRMADO_ID = ?,

      ESTADO = ?
    WHERE ID = ?
  `, [
    usuarioId,
    ip,
    userAgent,

    hashFirma,
    hashFirma,

    archivoFirmadoId,

    ESTADOS_CONTRATO.BLOQUEADO,

    c.ID
  ]);

  return {
    ok: true,
    contratoId: c.ID,
    estado: ESTADOS_CONTRATO.BLOQUEADO,
    hash: hashFirma
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