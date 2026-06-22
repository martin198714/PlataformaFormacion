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
  const usuario = Number(creadoPor);

  if (isNaN(empresa) || empresa <= 0) throw new Error("empresaId inválido");
  if (isNaN(usuario) || usuario <= 0) throw new Error("creadoPor inválido");
  if (!Array.isArray(perfiles) || perfiles.length === 0)
    throw new Error("Debes enviar al menos un perfil");

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
    perfiles,
    t: Date.now(),
  });

  const hashContrato = generarHash({
    empresa,
    perfiles,
    token,
  });

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

  if (!contratoId) throw new Error("No se pudo crear contrato");

  /* =========================
     INSERT PERFILES
  ========================= */
  for (const perfilId of perfiles) {
    const pid = Number(perfilId);
    if (isNaN(pid)) continue;

    await db.query(
      `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
       VALUES (?, ?)`,
      [contratoId, pid]
    );
  }

  /* =========================
     NOMBRES PERFILES
  ========================= */
  const placeholders = perfiles.map(() => "?").join(",");

  const perfilesRaw = await db.query(
    `SELECT NOMBRE
     FROM PERFILES
     WHERE ID IN (${placeholders})`,
    perfiles
  );

  const nombres = toArray(perfilesRaw).map(p => p.NOMBRE);

  /* =========================
     PDF
  ========================= */
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfiles: nombres,
    hash: hashContrato,
  });

  if (!pdf?.filePath) {
    throw new Error("Error generando PDF");
  }

  /* =========================
     🔥 EMAIL CORRECTO (USUARIOS CON PERFILES)
  ========================= */
  try {
    const emailRaw = await db.query(
      `
      SELECT DISTINCT u.EMAIL
      FROM USUARIOS u
      INNER JOIN USUARIO_PERFILES up ON up.USUARIO_ID = u.USUARIO_ID
      WHERE u.EMPRESA_ID = ?
        AND up.PERFIL_ID IN (${placeholders})
      `,
      [empresa, ...perfiles]
    );

    const emails = toArray(emailRaw)
      .map(u => u.EMAIL)
      .filter(Boolean);

    console.log("📩 EMAILS DESTINO:", emails);

    if (emails.length > 0) {
      for (const email of emails) {
        await enviarContratoEmail({
          to: email,
          pdfPath: pdf.filePath,
          contratoId,
          linkFirma: `http://localhost:3000/firma.html?token=${token}`,
        });
      }
    } else {
      console.log("⚠️ No hay usuarios con esos perfiles");
    }

  } catch (err) {
    console.error("EMAIL ERROR:", err.message);
  }

  return {
    ok: true,
    contratoId,
    token,
    pdf: pdf.fileName,
    perfiles: nombres,
    linkFirma: `http://localhost:3000/firma.html?token=${token}`,
  };
}

module.exports = {
  generarContratoAutomatico,
};