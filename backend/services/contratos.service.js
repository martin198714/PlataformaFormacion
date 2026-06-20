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
   1. LISTAR POR USUARIO
========================= */
async function listarPorUsuario(usuarioId) {
  const r = await db.query(
    `
    SELECT
      c.ID,
      c.EMPRESA_ID,
      e.NOMBRE AS EMPRESA_NOMBRE,
      c.ESTADO,
      c.FECHA_ENVIO,
      c.FECHA_FIRMA,
      c.TOKEN,
      c.ARCHIVO_ENVIADO_ID,
      c.ARCHIVO_FIRMADO,
      c.RUTA_FIRMADO,
      c.HASH_CONTRATO
    FROM CONTRATOS_MANTENIMIENTO c
    LEFT JOIN EMPRESAS e ON e.EMPRESA_ID = c.EMPRESA_ID
    WHERE c.EMPRESA_ID = (
      SELECT EMPRESA_ID FROM USUARIOS WHERE USUARIO_ID = ?
    )
    ORDER BY c.ID DESC
    `,
    [usuarioId]
  );

  return toArray(r);
}

/* =========================
   2. LISTAR POR EMPRESA
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
   3. CREAR CONTRATO (CORREGIDO CON CONTRATO_PERFILES)
========================= */
async function crearContrato(empresaId, perfilId, usuarioId) {
  const empresa = toArray(
    await db.query("SELECT * FROM EMPRESAS WHERE EMPRESA_ID = ?", [empresaId])
  )[0];

  if (!empresa) throw new Error("Empresa no encontrada");

  const usuario = toArray(
    await db.query("SELECT * FROM USUARIOS WHERE USUARIO_ID = ?", [usuarioId])
  )[0];

  if (!usuario) throw new Error("Usuario no encontrado");

  const token = uuidv4();

  const hashContrato = generarHash({
    empresaId,
    perfilId,
    token,
    timestamp: Date.now()
  });

  /* =========================
     INSERT CONTRATO (SIN PERFIL_ID)
  ========================= */
  await db.query(
    `
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (EMPRESA_ID, ESTADO, TOKEN, HASH_CONTRATO, FECHA_ENVIO)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      empresaId,
      ESTADOS_CONTRATO.PENDIENTE,
      token,
      hashContrato
    ]
  );

  const contratoId = toArray(
    await db.query(
      `
      SELECT FIRST 1 ID
      FROM CONTRATOS_MANTENIMIENTO
      WHERE TOKEN = ?
      ORDER BY ID DESC
      `,
      [token]
    )
  )[0]?.ID;

  if (!contratoId) throw new Error("No se pudo obtener ID contrato");

  /* =========================
     🔥 AQUÍ ESTÁ EL CAMBIO CLAVE
     PERFIL YA NO VA EN CONTRATO
     VA EN CONTRATO_PERFILES
  ========================= */
  await db.query(
    `
    INSERT INTO CONTRATO_PERFILES
    (CONTRATO_ID, PERFIL_ID)
    VALUES (?, ?)
    `,
    [contratoId, perfilId]
  );

  const pdf = await generarPDFContrato({
    contratoId,
    empresaId,
    perfilId,
    hash: hashContrato
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
      "Contrato generado automáticamente"
    ]
  );

  const archivoId = toArray(
    await db.query(
      `
      SELECT FIRST 1 ARCHIVO_ID
      FROM ARCHIVOS
      WHERE CREADO_POR = ?
      ORDER BY ARCHIVO_ID DESC
      `,
      [usuarioId]
    )
  )[0]?.ARCHIVO_ID;

  if (!archivoId) throw new Error("No se pudo obtener archivo");

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
      pass: process.env.EMAIL_PASS
    }
  });

  const linkFirma =
    `${process.env.FRONTEND_URL || "http://localhost:3000"}/firmar.html?token=${token}`;

  await transporter.sendMail({
    from: '"Plataforma" <no-reply@plataforma.com>',
    to: usuario.EMAIL,
    subject: "Contrato pendiente de firma",
    html: `
      <h2>Hola ${usuario.NOMBRE_COMPLETO}</h2>
      <p>Tienes un contrato pendiente</p>
      <a href="${linkFirma}">Firmar contrato</a>
    `,
    attachments: [
      {
        filename: pdf.fileName,
        path: pdf.filePath
      }
    ]
  });

  return { ok: true, contratoId, token };
}

/* =========================
   RESTO SIN CAMBIOS
========================= */

async function marcarFirmadoArchivo(data) {
  return db.query(
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
      data.usuarioId,
      data.archivoFirmado,
      data.rutaFirmado,
      data.contratoId
    ]
  );
}

async function obtenerPorToken(token) {
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

async function firmarContratoToken({ token, ip, userAgent }) {
  const contrato = toArray(
    await db.query(
      `
      SELECT FIRST 1 *
      FROM CONTRATOS_MANTENIMIENTO
      WHERE TOKEN = ?
      `,
      [token]
    )
  )[0];

  if (!contrato) throw new Error("Contrato no existe");

  if (contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO) {
    throw new Error("Contrato ya firmado");
  }

  const hashFirma = generarHash({
    contratoId: contrato.ID,
    ip,
    userAgent,
    timestamp: Date.now()
  });

  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET ESTADO = ?, FECHA_FIRMA = CURRENT_TIMESTAMP,
        IP_FIRMA = ?, USER_AGENT = ?, HASH_FIRMADO = ?
    WHERE ID = ?
    `,
    [
      ESTADOS_CONTRATO.FIRMADO,
      ip,
      userAgent,
      hashFirma,
      contrato.ID
    ]
  );

  return { ok: true, contratoId: contrato.ID, hashFirma };
}

async function firmarContratoTokenArchivo(data) {
  const contrato = toArray(
    await db.query(
      `
      SELECT FIRST 1 *
      FROM CONTRATOS_MANTENIMIENTO
      WHERE TOKEN = ?
      `,
      [data.token]
    )
  )[0];

  if (!contrato) throw new Error("Contrato no encontrado");

  if (contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO) {
    throw new Error("Contrato ya firmado");
  }

  const resultadoFirma = await verificarPDFFirmado(data.rutaFirmado);

  if (!resultadoFirma.valido) {
    throw new Error("Firma PDF inválida");
  }

  const hashFirma = generarHash({
    contratoId: contrato.ID,
    ip: data.ip,
    userAgent: data.userAgent,
    archivoFirmado: data.archivoFirmado,
    timestamp: Date.now()
  });

  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET ESTADO = ?, FECHA_FIRMA = CURRENT_TIMESTAMP,
        USUARIO_FIRMA_ID = ?, ARCHIVO_FIRMADO = ?,
        RUTA_FIRMADO = ?, HASH_FIRMADO = ?,
        IP_FIRMA = ?, USER_AGENT = ?
    WHERE ID = ?
    `,
    [
      ESTADOS_CONTRATO.FIRMADO,
      data.usuarioId || null,
      data.archivoFirmado,
      data.rutaFirmado,
      hashFirma,
      data.ip,
      data.userAgent,
      contrato.ID
    ]
  );

  return { ok: true, contratoId: contrato.ID, hashFirma };
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
  firmarContratoTokenArchivo
};