const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato, verificarPDFFirmado } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");
const { v4: uuidv4 } = require("uuid");

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
   CREAR CONTRATO (MULTI PERFIL + EMAIL OK)
========================= */
async function crearContrato(empresaId, perfiles, usuarioId) {
  const empresa = Number(empresaId);

  if (!Array.isArray(perfiles)) {
    perfiles = [perfiles];
  }

  const perfilesNumeros = perfiles.map(Number).filter(n => !isNaN(n));

  if (!empresa || perfilesNumeros.length === 0) {
    throw new Error("Datos inválidos");
  }

  const token = uuidv4();

  const hash = generarHash({
    empresa,
    perfiles: perfilesNumeros,
    token,
    t: Date.now(),
  });

  // 1. crear contrato
  const insert = await db.query(
    `INSERT INTO CONTRATOS_MANTENIMIENTO
     (EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     RETURNING ID`,
    [empresa, token, hash, ESTADOS_CONTRATO.PENDIENTE]
  );

  const contratoId = toArray(insert)[0]?.ID;

  if (!contratoId) throw new Error("No se creó contrato");

  // 2. insertar múltiples perfiles (IMPORTANTE)
  for (const perfilId of perfilesNumeros) {
    await db.query(
      `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
       VALUES (?, ?)`,
      [contratoId, perfilId]
    );
  }

  // 3. PDF
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfiles: perfilesNumeros,
    hash,
  });

  if (!pdf?.filePath) throw new Error("PDF no generado");

  // 4. emails por perfiles
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

  const emails = [...new Set(toArray(emailRaw).map(u => u.EMAIL))];

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
   FIRMAR POR TOKEN (SIN PDF)
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
    [
      ESTADOS_CONTRATO.FIRMADO,
      ip,
      userAgent,
      hashFirma,
      token,
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

/* =========================
   FIRMAR CON PDF SUBIDO
========================= */
async function firmarContratoTokenArchivo(data) {
  const contrato = await obtenerPorToken(data.token);
  if (!contrato) throw new Error("Contrato no encontrado");

  const valid = await verificarPDFFirmado(data.rutaFirmado);
  if (!valid?.valido) throw new Error("PDF inválido");

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
  } else if (data.token) {
    contrato = await obtenerPorToken(data.token);
  }

  if (!contrato) throw new Error("Contrato no encontrado");

  if (data.rutaFirmado) {
    const valid = await verificarPDFFirmado(data.rutaFirmado);
    if (!valid?.valido) throw new Error("PDF inválido");
  }

  const hashFirma = generarHash({
    id: contrato.ID,
    token: contrato.TOKEN,
    archivoFirmado: data.archivoFirmado,
    ip: data.ip,
    userAgent: data.userAgent,
    t: Date.now(),
  });

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
      hashFirma,
      contrato.ID
    ]
  );

  return { ok: true, contratoId: contrato.ID };
}

function buildAutoFirmaUrl(token) {
  const callbackUrl = encodeURIComponent(
    `http://localhost:3000/api/contratos/autofirma/return`
  );

  return `afirma://sign?token=${token}&callback=${callbackUrl}`;
}

async function prepararFirmaAutoFirma(token) {
  const contrato = await obtenerPorToken(token);

  if (!contrato) {
    throw new Error("Contrato no encontrado");
  }

  // Aquí puedes adaptar a @firma / AutoFirma real
  // Este payload es el típico flujo redirect
  const firmaRequest = {
    token: contrato.TOKEN,
    contratoId: contrato.ID,
    empresaId: contrato.EMPRESA_ID,
    urlReturn: "http://localhost:3000/api/contratos/autofirma/return",
    timestamp: Date.now(),
  };

  return {
    ok: true,
    redirectUrl: `autofirma://sign?token=${token}`, // esquema típico AutoFirma
    request: firmaRequest,
  };
}


async function recibirFirmaAutoFirma(data) {
  const {
    token,
    archivoFirmado,
    rutaFirmado,
    ip = "",
    userAgent = "",
    usuarioId = null,
  } = data;

  if (!token) {
    throw new Error("Token inválido");
  }

  const contrato = await obtenerPorToken(token);

  if (!contrato) {
    throw new Error("Contrato no encontrado");
  }

  // Validación opcional PDF firmado
  if (rutaFirmado) {
    const valid = await verificarPDFFirmado(rutaFirmado);
    if (!valid?.valido) {
      throw new Error("PDF firmado inválido");
    }
  }

  const hashFirma = generarHash({
    token,
    archivoFirmado,
    ip,
    userAgent,
    t: Date.now(),
  });

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
      archivoFirmado,
      rutaFirmado,
      ip,
      userAgent,
      usuarioId,
      hashFirma,
      token,
    ]
  );

  return {
    ok: true,
    contratoId: contrato.ID,
    estado: ESTADOS_CONTRATO.FIRMADO,
  };
}

/* =========================
   EXPORT
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
  buildAutoFirmaUrl,
  prepararFirmaAutoFirma,
  recibirFirmaAutoFirma
};