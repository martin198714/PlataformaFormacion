const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");
const nodemailer = require("nodemailer");

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

    // =========================
    // 1. EMPRESA
    // =========================
    const empresaResult = await db.query(
      "SELECT * FROM EMPRESAS WHERE EMPRESA_ID = ?",
      [empresaId]
    );

    const empresa = empresaResult?.[0]?.[0] || empresaResult?.[0];

    if (!empresa) {
      throw new Error("Empresa no encontrada");
    }

    if (!empresa.EMAIL) {
      throw new Error("La empresa no tiene email");
    }

    // =========================
    // 2. PERFIL
    // =========================
    const perfilResult = await db.query(
      "SELECT * FROM PERFILES WHERE ID = ?",
      [perfilId]
    );

    const perfil = perfilResult?.[0]?.[0] || perfilResult?.[0];

    if (!perfil) {
      throw new Error("Perfil no encontrado");
    }

    // =========================
    // 3. TOKENS
    // =========================
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

    // =========================
    // 4. INSERT CONTRATO
    // =========================
    const insertResult = await db.query(
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

    console.log("📦 INSERT RESULT:", insertResult);

    // =========================
    // 5. OBTENER ID (ROBUSTO)
    // =========================
    let contratoId = null;

    if (insertResult?.insertId) {
      contratoId = insertResult.insertId;
    }
    else if (insertResult?.[0]?.insertId) {
      contratoId = insertResult[0].insertId;
    }
    else if (insertResult?.[0]?.[0]?.insertId) {
      contratoId = insertResult[0][0].insertId;
    }
    else {
      const [rows] = await db.query("SELECT LAST_INSERT_ID() as id");
      contratoId = rows?.[0]?.id;
    }

    if (!contratoId) {
      throw new Error("No se pudo obtener el ID del contrato");
    }

    // =========================
    // 6. GENERAR PDF
    // =========================
    const pdf = await generarPDFContrato({
      contratoId,
      empresaId,
      perfilId,
      hash: hashContrato,
    });

    if (!pdf?.fileName) {
      throw new Error("Error generando PDF");
    }

    // =========================
    // 7. UPDATE CONTRATO
    // =========================
    await db.query(
      `
      UPDATE CONTRATOS_MANTENIMIENTO
      SET ARCHIVO_ENVIADO_ID = ?
      WHERE CONTRATO_ID = ?
      `,
      [pdf.fileName, contratoId]
    );

    // =========================
    // 8. EMAIL (NO BLOQUEANTE)
    // =========================
    try {

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const linkFirma = `http://127.0.0.1:5500/firmar.html?token=${token}`;

      await transporter.sendMail({
        from: '"Plataforma Formación" <no-reply@plataforma.com>',
        to: empresa.EMAIL,
        subject: "📄 Contrato listo para firma",
        html: `
          <h2>Hola ${empresa.NOMBRE}</h2>

          <p>Tienes un contrato pendiente de firma.</p>

          <p><b>Perfil:</b> ${perfil.NOMBRE}</p>

          <p>
            <a href="${linkFirma}">
              👉 Firmar contrato
            </a>
          </p>

          <p><b>ID contrato:</b> ${contratoId}</p>
        `
      });

    } catch (emailErr) {
      console.error("⚠️ Error enviando email:", emailErr.message);
    }

    // =========================
    // 9. RETURN
    // =========================
    return {
      ok: true,
      contratoId,
      token
    };

  } catch (err) {
    console.error("💥 ERROR crearContrato:", err);
    throw err;
  }
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