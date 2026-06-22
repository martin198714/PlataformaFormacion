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
   CREAR CONTRATO + EMAILS POR PERFIL (FIX FINAL)
========================= */
async function crearContrato(empresaId, perfilId, usuarioId) {
  const empresa = Number(empresaId);
  const perfil = Number(perfilId);

  if (isNaN(empresa) || isNaN(perfil)) {
    throw new Error("IDs inválidos");
  }

  const token = uuidv4();

  const hash = generarHash({
    empresa,
    perfil,
    token,
    t: Date.now(),
  });

  // 1. Crear contrato
  await db.query(
    `INSERT INTO CONTRATOS_MANTENIMIENTO
     (EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [empresa, token, hash, ESTADOS_CONTRATO.PENDIENTE]
  );

  // 2. Obtener ID contrato
  const contratoRaw = await db.query(
    `SELECT FIRST 1 ID FROM CONTRATOS_MANTENIMIENTO WHERE TOKEN = ?`,
    [token]
  );

  const contratoId = toArray(contratoRaw)[0]?.ID;

  if (!contratoId) throw new Error("No se creó contrato");

  // 3. Relación contrato-perfil
  await db.query(
    `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
     VALUES (?, ?)`,
    [contratoId, perfil]
  );

  // 4. PDF
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    hash,
  });

  if (!pdf?.filePath) throw new Error("PDF no generado");

  // 5. 🔥 USUARIOS DESTINO (CORRECTO)
  const emailRaw = await db.query(
    `
    SELECT DISTINCT u.EMAIL
    FROM USUARIOS u
    INNER JOIN USUARIOS_PERFILES up
      ON up.USUARIO_ID = u.USUARIO_ID
    WHERE u.EMPRESA_ID = ?
      AND up.PERFIL_ID = ?
      AND u.ACTIVO = 1
      AND u.DELETED = 0
    `,
    [empresa, perfil]
  );

  const emails = toArray(emailRaw).map(u => u.EMAIL);

  // 6. Enviar emails
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
    emailsEnviados: emails.length,
  };
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
   FIRMAR POR TOKEN (SIN ARCHIVO)
========================= */
async function firmarContratoToken({ token, ip, userAgent }) {
  const contrato = await obtenerPorToken(token);

  if (!contrato) {
    throw new Error("Contrato no existe");
  }

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

  return {
    ok: true,
    contratoId: contrato.ID,
  };
}

async function obtenerPorId(id) {
  const r = await db.query(
    `SELECT c.*, a.FICHERO_NOMBRE
     FROM CONTRATOS_MANTENIMIENTO c
     LEFT JOIN ARCHIVOS a ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
     WHERE c.ID = ?`,
    [id]
  );

  return toArray(r)[0] || null;
}

async function marcarFirmadoArchivo({
  contratoId,
  usuarioId,
  archivoFirmado,
  rutaFirmado
}) {
  const contrato = await obtenerPorId(contratoId);

  if (!contrato) throw new Error("Contrato no existe");

  const hashFirma = generarHash({
    contratoId,
    usuarioId,
    archivoFirmado,
    t: Date.now()
  });

  await db.query(
    `UPDATE CONTRATOS_MANTENIMIENTO
     SET ESTADO = ?,
         ARCHIVO_FIRMADO = ?,
         RUTA_FIRMADO = ?,
         USUARIO_FIRMA_ID = ?,
         FECHA_FIRMA = CURRENT_TIMESTAMP,
         HASH_FIRMADO = ?
     WHERE ID = ?`,
    [
      ESTADOS_CONTRATO.FIRMADO,
      archivoFirmado,
      rutaFirmado,
      usuarioId,
      hashFirma,
      contratoId
    ]
  );

  return { ok: true };
}

async function firmarContrato({
  id = null,
  token = null,
  archivoFirmado = null,
  rutaFirmado = null,
  ip = "",
  userAgent = "",
  usuarioId = null
}) {
  let contrato = null;

  // 1. Resolver contrato
  if (id) {
    const r = await db.query(
      `SELECT * FROM CONTRATOS_MANTENIMIENTO WHERE ID = ?`,
      [id]
    );
    contrato = toArray(r)[0];
  } else if (token) {
    const r = await db.query(
      `SELECT * FROM CONTRATOS_MANTENIMIENTO WHERE TOKEN = ?`,
      [token]
    );
    contrato = toArray(r)[0];
  }

  if (!contrato) throw new Error("Contrato no encontrado");

  // 2. Validación PDF si existe
  if (rutaFirmado) {
    const valid = await verificarPDFFirmado(rutaFirmado);
    if (!valid?.valido) {
      throw new Error("PDF firmado inválido");
    }
  }

  // 3. Hash de auditoría
  const hashFirma = generarHash({
    id: contrato.ID,
    token: contrato.TOKEN,
    archivoFirmado,
    ip,
    userAgent,
    t: Date.now()
  });

  // 4. Update estado centralizado
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
      ip,
      userAgent,
      usuarioId,
      archivoFirmado,
      rutaFirmado,
      hashFirma,
      contrato.ID
    ]
  );

  // 5. AUDITORÍA (opcional tabla logs)
  await db.query(
    `INSERT INTO CONTRATOS_AUDITORIA
     (CONTRATO_ID, ACCION, IP, USER_AGENT, FECHA)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      contrato.ID,
      "FIRMA_CONTRATO",
      ip,
      userAgent
    ]
  );

  // 6. USUARIOS DESTINO SIN DUPLICADOS
  const emailRaw = await db.query(
    `
    SELECT DISTINCT u.EMAIL
    FROM USUARIOS u
    INNER JOIN USUARIOS_PERFILES up
      ON up.USUARIO_ID = u.USUARIO_ID
    WHERE u.EMPRESA_ID = ?
      AND u.ACTIVO = 1
      AND u.DELETED = 0
    `,
    [contrato.EMPRESA_ID]
  );

  const emails = [...new Set(toArray(emailRaw).map(u => u.EMAIL))];

  // 7. ENVÍO EMAIL CON RETRY SIMPLE
  for (const email of emails) {
    let tries = 0;

    while (tries < 3) {
      try {
        await enviarContratoEmail({
          to: email,
          pdfPath: rutaFirmado || null,
          contratoId: contrato.ID,
          linkFirma: `http://localhost:3000/firma.html?token=${contrato.TOKEN}`
        });

        break; // éxito
      } catch (err) {
        tries++;
        if (tries >= 3) {
          console.error(`❌ Email fallido a ${email}`);
        }
      }
    }
  }

  return {
    ok: true,
    contratoId: contrato.ID,
    estado: ESTADOS_CONTRATO.FIRMADO
  };
}

module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  crearContrato,
  verContrato,
  obtenerPorToken,
  obtenerPorId,
  firmarContratoToken,
  firmarContratoTokenArchivo,
  marcarFirmadoArchivo,
  firmarContrato
};