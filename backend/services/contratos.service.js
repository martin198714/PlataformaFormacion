const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");
const nodemailer = require("nodemailer");

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
  const r = await db.query(
    `
    SELECT *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ?
    ORDER BY ID DESC
  `,
    [empresaId]
  );

  return toArray(r);
}

/* =========================
   CREAR CONTRATO
========================= */
async function crearContrato(empresaId, perfilId, usuarioId) {
  try {

    const empresa = toArray(
      await db.query("SELECT * FROM EMPRESAS WHERE EMPRESA_ID = ?", [empresaId])
    )[0];
    if (!empresa) throw new Error("Empresa no encontrada");

    const perfil = toArray(
      await db.query("SELECT * FROM PERFILES WHERE ID = ?", [perfilId])
    )[0];
    if (!perfil) throw new Error("Perfil no encontrado");

    const usuarios = toArray(
      await db.query(
        `
        SELECT u.USUARIO_ID, u.EMAIL, u.NOMBRE_COMPLETO
        FROM USUARIOS u
        INNER JOIN USUARIOS_PERFILES up ON up.USUARIO_ID = u.USUARIO_ID
        WHERE up.PERFIL_ID = ?
        `,
        [perfilId]
      )
    );

    if (!usuarios.length) {
      throw new Error("No hay usuarios asignados a ese perfil");
    }

    const token = generarHash({ empresaId, perfilId, time: Date.now() });
    const hashContrato = generarHash({ empresaId, perfilId, token });

    /* INSERT */
    await db.query(
      `
      INSERT INTO CONTRATOS_MANTENIMIENTO
      (EMPRESA_ID, PERFIL_ID, ESTADO, TOKEN, HASH_CONTRATO, FECHA_ENVIO)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [empresaId, perfilId, "PENDIENTE", token, hashContrato]
    );

    /* obtener ID */
    const contratoId = toArray(
      await db.query(
        `SELECT FIRST 1 ID FROM CONTRATOS_MANTENIMIENTO WHERE TOKEN = ?`,
        [token]
      )
    )[0]?.ID;

    if (!contratoId) throw new Error("No se pudo obtener contratoId");

    /* PDF */
    const pdf = await generarPDFContrato({
      contratoId,
      empresaId,
      perfilId,
      hash: hashContrato,
    });

    if (!pdf?.fileName) throw new Error("Error generando PDF");

    /* guardar archivo */
    await db.query(
      `
      INSERT INTO ARCHIVOS
      (TITULO, URL, FICHERO_NOMBRE, CREADO_POR, DESCRIPCION)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        `Contrato ${contratoId}`,
        pdf.filePath,
        pdf.fileName,
        usuarioId,
        "Contrato generado",
      ]
    );

    const archivoId = toArray(
      await db.query(
        `
        SELECT FIRST 1 ARCHIVO_ID
        FROM ARCHIVOS
        WHERE FICHERO_NOMBRE = ?
        `,
        [pdf.fileName]
      )
    )[0]?.ARCHIVO_ID;

    await db.query(
      `
      UPDATE CONTRATOS_MANTENIMIENTO
      SET ARCHIVO_ENVIADO_ID = ?
      WHERE ID = ?
      `,
      [archivoId, contratoId]
    );

    return {
      ok: true,
      contratoId,
      token,
      fileName: pdf.fileName,
    };

  } catch (err) {
    console.error("ERROR crearContrato:", err);
    throw err;
  }
}

/* =========================
   VER CONTRATO
========================= */
async function verContrato(id) {
  return toArray(
    await db.query(`SELECT * FROM CONTRATOS_MANTENIMIENTO WHERE ID = ?`, [id])
  )[0] || null;
}

/* =========================
   🔥 TOKEN (FIX IMPORTANTE)
========================= */
async function obtenerPorToken(token) {
  const r = await db.query(
    `
    SELECT 
      c.*,
      a.FICHERO_NOMBRE
    FROM CONTRATOS_MANTENIMIENTO c
    LEFT JOIN ARCHIVOS a 
      ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
    WHERE c.TOKEN = ?
  `,
    [token]
  );

  return toArray(r)[0] || null;
}

/* =========================
   FIRMA TOKEN
========================= */
async function firmarContratoToken({ token, usuarioId, ip, userAgent }) {
  const contrato = toArray(
    await db.query(
      `SELECT FIRST 1 * FROM CONTRATOS_MANTENIMIENTO WHERE TOKEN = ?`,
      [token]
    )
  )[0];

  if (!contrato) throw new Error("Contrato no existe");

  if (
    contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO ||
    contrato.ESTADO === ESTADOS_CONTRATO.BLOQUEADO
  ) {
    throw new Error("Contrato ya firmado");
  }

  const hashFirma = generarHash({
    contratoId: contrato.ID,
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
    [usuarioId, ip, userAgent, ESTADOS_CONTRATO.FIRMADO, hashFirma, contrato.ID]
  );

  return {
    ok: true,
    contratoId: contrato.ID,
    hashFirma,
  };
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  firmarContratoToken,
  verContrato,
  obtenerPorToken,
};