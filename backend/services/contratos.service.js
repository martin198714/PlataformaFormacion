const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");
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
  try {
    const empresaRes = await db.query(
      "SELECT * FROM EMPRESAS WHERE EMPRESA_ID = ?",
      [empresaId]
    );

    const empresa = toArray(empresaRes)[0];
    if (!empresa) throw new Error("Empresa no encontrada");

    const perfilRes = await db.query(
      "SELECT * FROM PERFILES WHERE ID = ?",
      [perfilId]
    );

    const perfil = toArray(perfilRes)[0];
    if (!perfil) throw new Error("Perfil no encontrado");

    const usuariosRes = await db.query(
      `
      SELECT u.USUARIO_ID, u.EMAIL, u.NOMBRE_COMPLETO
      FROM USUARIOS u
      INNER JOIN USUARIOS_PERFILES up ON up.USUARIO_ID = u.USUARIO_ID
      WHERE up.PERFIL_ID = ?
      `,
      [perfilId]
    );

    const usuarios = toArray(usuariosRes);

    if (!usuarios.length) {
      throw new Error("No hay usuarios asignados a ese perfil");
    }

    /* =========================
       TOKEN SEGURO
    ========================= */
    const token = uuidv4();

    const hashContrato = generarHash({
      empresaId,
      perfilId,
      token,
    });

    await db.query(
      `
      INSERT INTO CONTRATOS_MANTENIMIENTO
      (EMPRESA_ID, PERFIL_ID, ESTADO, TOKEN, HASH_CONTRATO, FECHA_ENVIO)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [empresaId, perfilId, "PENDIENTE", token, hashContrato]
    );

    const idRes = await db.query(
      `
      SELECT FIRST 1 ID
      FROM CONTRATOS_MANTENIMIENTO
      WHERE TOKEN = ?
      ORDER BY ID DESC
      `,
      [token]
    );

    const contratoId = toArray(idRes)[0]?.ID;
    if (!contratoId) throw new Error("No se pudo obtener ID");

    const pdf = await generarPDFContrato({
      contratoId,
      empresaId,
      perfilId,
      hash: hashContrato,
    });

    if (!pdf?.fileName) throw new Error("Error generando PDF");

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
        "Contrato generado automáticamente",
      ]
    );

    const archivoRes = await db.query(
      `
      SELECT FIRST 1 ARCHIVO_ID
      FROM ARCHIVOS
      WHERE CREADO_POR = ?
      ORDER BY ARCHIVO_ID DESC
      `,
      [usuarioId]
    );

    const archivoId = toArray(archivoRes)[0]?.ARCHIVO_ID;
    if (!archivoId) throw new Error("No se pudo guardar archivo");

    await db.query(
      `
      UPDATE CONTRATOS_MANTENIMIENTO
      SET ARCHIVO_ENVIADO_ID = ?
      WHERE ID = ?
      `,
      [archivoId, contratoId]
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const linkFirma = `http://127.0.0.1:5500/frontend/firmar.html?token=${token}`;

    for (const u of usuarios) {
      await transporter.sendMail({
        from: '"Plataforma" <no-reply@plataforma.com>',
        to: u.EMAIL,
        subject: "Contrato pendiente de firma",
        html: `
          <h2>Hola ${u.NOMBRE_COMPLETO}</h2>
          <p>Tienes un contrato pendiente</p>
          <a href="${linkFirma}">Firmar contrato</a>
        `,
        attachments: [
          {
            filename: pdf.fileName,
            path: pdf.filePath,
          },
        ],
      });
    }

    return { ok: true, contratoId, token };
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function marcarFirmadoArchivo({ contratoId, usuarioId, archivoFirmado, rutaFirmado }) {
  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET 
      ESTADO = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      USUARIO_FIRMA_ID = ?,
      ARCHIVO_FIRMADO = ?,
      RUTA_FIRMADO = ?
    WHERE ID = ?
    `,
    [
      ESTADOS_CONTRATO.FIRMADO,
      usuarioId,
      archivoFirmado,
      rutaFirmado,
      contratoId
    ]
  );

  return true;
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

  const contrato = toArray(r)[0];
  if (!contrato) throw new Error("Contrato no encontrado");

  return contrato;
}

/* =========================
   FIRMA CONTRATO
========================= */
async function firmarContratoToken({ token, ip, userAgent }) {
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

  if (c.ESTADO === ESTADOS_CONTRATO.FIRMADO) {
    throw new Error("Contrato ya firmado");
  }

  const hashFirma = generarHash({
    contratoId: c.ID,
    ip,
    userAgent,
    timestamp: Date.now(),
  });

  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      IP_FIRMA = ?,
      USER_AGENT = ?,
      ESTADO = ?,
      HASH_FIRMADO = ?
    WHERE ID = ?
  `,
    [ip, userAgent, ESTADOS_CONTRATO.FIRMADO, hashFirma, c.ID]
  );

  return {
    ok: true,
    contratoId: c.ID,
    hashFirma,
  };
}

async function firmarContratoTokenArchivo({
  token,
  usuarioId,
  archivoFirmado,
  rutaFirmado,
  ip,
  userAgent
}) {

  const r = await db.query(
    `
    SELECT FIRST 1 *
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
    `,
    [token]
  );

  const contrato = toArray(r)[0];

  if (!contrato) {
    throw new Error("Contrato no encontrado");
  }

  const hashFirma = generarHash({
    contratoId: contrato.ID,
    ip,
    userAgent,
    archivoFirmado,
    timestamp: Date.now()
  });

  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      ESTADO = ?,
      FECHA_FIRMA = CURRENT_TIMESTAMP,
      USUARIO_FIRMA_ID = ?,
      ARCHIVO_FIRMADO = ?,
      RUTA_FIRMADO = ?,
      HASH_FIRMADO = ?,
      IP_FIRMA = ?,
      USER_AGENT = ?
    WHERE ID = ?
    `,
    [
      ESTADOS_CONTRATO.FIRMADO,
      usuarioId || null,
      archivoFirmado,
      rutaFirmado,
      hashFirma,
      ip,
      userAgent,
      contrato.ID
    ]
  );

  return {
    ok: true,
    contratoId: contrato.ID,
    archivoFirmado
  };
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  marcarFirmadoArchivo,
  obtenerPorToken,
  firmarContratoToken,
  firmarContratoTokenArchivo,
};