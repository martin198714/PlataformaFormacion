const db = require("../models/db");
const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");

function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  return [];
}

async function generarContratoAutomatico(empresaId, perfiles, creadoPor) {
  const empresa = Number(empresaId);

  if (isNaN(empresa) || empresa <= 0)
    throw new Error("empresaId inválido");

  if (!Array.isArray(perfiles) || perfiles.length === 0)
    throw new Error("Debes enviar al menos un perfil");

  const perfilesNumeros = perfiles.map(Number).filter(n => !isNaN(n));

  if (perfilesNumeros.length === 0)
    throw new Error("Perfiles inválidos");

  /* =========================
     EVITAR DUPLICADOS
  ========================= */
  const existeRaw = await db.query(
    `SELECT FIRST 1 ID, TOKEN
     FROM CONTRATOS_MANTENIMIENTO
     WHERE EMPRESA_ID = ?
     ORDER BY ID DESC`,
    [empresa]
  );

  const existe = toArray(existeRaw);

  if (existe.length > 0) {
    return {
      contratoId: existe[0].ID,
      token: existe[0].TOKEN,
      duplicado: true,
    };
  }

  /* =========================
     TOKEN + HASH
  ========================= */
  const token = generarHash({
    empresa,
    perfiles: perfilesNumeros,
    t: Date.now(),
  });

  const hashContrato = generarHash({
    empresa,
    perfiles: perfilesNumeros,
    token,
  });

  /* =========================
     INSERT CONTRATO
  ========================= */
  const insertRaw = await db.query(
    `INSERT INTO CONTRATOS_MANTENIMIENTO
     (EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     RETURNING ID`,
    [
      empresa,
      token,
      hashContrato,
      ESTADOS_CONTRATO.PENDIENTE,
    ]
  );

  const contratoId = toArray(insertRaw)[0]?.ID;

  if (!contratoId)
    throw new Error("No se pudo crear contrato");

  /* =========================
     RELACIÓN CONTRATO - PERFILES
  ========================= */
  for (const perfilId of perfilesNumeros) {
    await db.query(
      `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
       VALUES (?, ?)`,
      [contratoId, perfilId]
    );
  }

  /* =========================
     OBTENER NOMBRES PERFILES
  ========================= */
  const placeholders = perfilesNumeros.map(() => "?").join(",");

  const perfilesRaw = await db.query(
    `SELECT NOMBRE
     FROM PERFILES
     WHERE ID IN (${placeholders})`,
    perfilesNumeros
  );

  const nombresPerfiles = toArray(perfilesRaw).map(p => p.NOMBRE);

  /* =========================
     PDF
  ========================= */
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfiles: nombresPerfiles,
    hash: hashContrato,
  });

  if (!pdf?.filePath)
    throw new Error("Error generando PDF");

  /* =========================
     🔥 USUARIOS DESTINO (CORRECTO)
  ========================= */
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

  const emails = [...new Set(
    toArray(emailRaw)
      .map(u => u.EMAIL)
      .filter(Boolean)
  )];

  console.log("📩 EMAILS DESTINO:", emails);

  /* =========================
     ENVIAR EMAILS
  ========================= */
  for (const email of emails) {
    try {
      await enviarContratoEmail({
        to: email,
        pdfPath: pdf.filePath,
        contratoId,
        linkFirma: `http://localhost:3000/firma.html?token=${token}`,
      });
    } catch (err) {
      console.error(`❌ Error enviando a ${email}:`, err.message);
    }
  }

  return {
    ok: true,
    contratoId,
    token,
    pdf: pdf.fileName,
    perfiles: nombresPerfiles,
    emailsEnviados: emails.length,
    linkFirma: `http://localhost:3000/firma.html?token=${token}`,
  };
}

module.exports = {
  generarContratoAutomatico,
};