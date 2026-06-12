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

    if (!empresa) throw new Error("Empresa no encontrada");

    // =========================
    // 2. PERFIL
    // =========================
    const perfilResult = await db.query(
      "SELECT * FROM PERFILES WHERE ID = ?",
      [perfilId]
    );

    const perfil = perfilResult?.[0]?.[0] || perfilResult?.[0];

    if (!perfil) throw new Error("Perfil no encontrado");

    // =========================
    // 3. USUARIOS DEL PERFIL
    // =========================
    const usersResult = await db.query(
      `
      SELECT USUARIO_ID, EMAIL, NOMBRE
      FROM USUARIOS
      WHERE PERFIL_ID = ?
      `,
      [perfilId]
    );

    const usuarios = usersResult?.[0] || [];

    if (!usuarios.length) {
      throw new Error("No hay usuarios con ese perfil");
    }

    // =========================
    // 4. TOKENS
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
    // 5. INSERT CONTRATO (FIREBIRD SAFE)
    // =========================
    const insertResult = await db.query(
      `
      INSERT INTO CONTRATOS_MANTENIMIENTO
      (EMPRESA_ID, PERFIL_ID, ESTADO, TOKEN, HASH_CONTRATO, FECHA_ENVIO)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING ID
      `,
      [
        empresaId,
        perfilId,
        "PENDIENTE",
        token,
        hashContrato
      ]
    );

    const contratoId =
      insertResult?.[0]?.ID ||
      insertResult?.[0]?.[0]?.ID;

    if (!contratoId) {
      throw new Error("No se pudo obtener ID del contrato");
    }

    console.log("📦 CONTRATO CREADO:", contratoId);

    // =========================
    // 6. PDF
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

    await db.query(
      `
      UPDATE CONTRATOS_MANTENIMIENTO
      SET ARCHIVO_ENVIADO_ID = ?
      WHERE ID = ?
      `,
      [pdf.fileName, contratoId]
    );

    // =========================
    // 7. EMAIL SETUP
    // =========================
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const linkFirma =
      `http://127.0.0.1:5500/frontend/firmar.html?token=${token}`;

    // =========================
    // 8. ENVÍO A TODOS LOS USUARIOS DEL PERFIL
    // =========================
    for (const u of usuarios) {
      try {
        await transporter.sendMail({
          from: '"Plataforma Formación" <no-reply@plataforma.com>',
          to: u.EMAIL,
          subject: "📄 Contrato listo para firma",
          html: `
            <h2>Hola ${u.NOMBRE}</h2>

            <p>Se te ha asignado un contrato para el perfil:</p>
            <b>${perfil.NOMBRE}</b>

            <p>
              <a href="${linkFirma}">
                👉 Firmar contrato
              </a>
            </p>

            <p><b>ID contrato:</b> ${contratoId}</p>
          `,
          attachments: [
            {
              filename: pdf.fileName,
              path: pdf.filePath
            }
          ]
        });

        console.log("📩 Email enviado a:", u.EMAIL);

      } catch (emailErr) {
        console.error("❌ ERROR EMAIL:", u.EMAIL, emailErr.message);

        // marcar fallo pero NO romper flujo
        await db.query(
          `UPDATE CONTRATOS_MANTENIMIENTO SET ESTADO = 'ERROR' WHERE ID = ?`,
          [contratoId]
        );
      }
    }

    // =========================
    // 9. MARCAR ENVIADO
    // =========================
    await db.query(
      `
      UPDATE CONTRATOS_MANTENIMIENTO
      SET ESTADO = 'ENVIADO'
      WHERE ID = ?
      `,
      [contratoId]
    );

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

async function enviarContratoPorPerfil({ contratoId, perfilId, token, pdf, empresa, perfil }) {

  // =========================
  // USUARIOS DEL PERFIL
  // =========================
  const usersResult = await db.query(
    `
    SELECT EMAIL, NOMBRE
    FROM USUARIOS
    WHERE PERFIL_ID = ?
    `,
    [perfilId]
  );

  const usuarios = usersResult?.[0] || [];

  if (!usuarios.length) {
    throw new Error("No hay usuarios para ese perfil");
  }

  // =========================
  // TRANSPORTER
  // =========================
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // =========================
  // LINK FIRMA
  // =========================
  const linkFirma = `http://127.0.0.1:5500/frontend/firmar.html?token=${token}`;

  // =========================
  // ENVÍO A TODOS
  // =========================
  for (const u of usuarios) {

    try {

      await transporter.sendMail({
        from: '"Plataforma Formación" <no-reply@plataforma.com>',
        to: u.EMAIL,
        subject: "📄 Contrato listo para firma",
        html: `
          <h2>Hola ${u.NOMBRE}</h2>

          <p>Tienes un contrato asignado al perfil <b>${perfil.NOMBRE}</b></p>

          <p>
            <a href="${linkFirma}">
              👉 Firmar contrato
            </a>
          </p>

          <p><b>ID contrato:</b> ${contratoId}</p>
        `,
        attachments: [
          {
            filename: pdf.fileName,
            path: pdf.filePath
          }
        ]
      });

      console.log("📩 Enviado a:", u.EMAIL);

    } catch (err) {
      console.error("❌ Error email:", u.EMAIL, err.message);

      await db.query(
        `
        UPDATE CONTRATOS_MANTENIMIENTO
        SET ESTADO = 'ERROR'
        WHERE CONTRATO_ID = ?
        `,
        [contratoId]
      );
    }
  }

  // =========================
  // MARCAR ENVIADO
  // =========================
  await db.query(
    `
    UPDATE CONTRATOS_MANTENIMIENTO
    SET ESTADO = 'ENVIADO'
    WHERE CONTRATO_ID = ?
    `,
    [contratoId]
  );

  return true;
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
  enviarContratoPorPerfil,
  firmarContratoToken,
  marcarFirmado,
  verContrato,
  obtenerPorToken,
  marcarFirmadoArchivo,
};