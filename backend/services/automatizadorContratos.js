const db = require("../models/db");

const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");

function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  return [];
}

/* =========================
   GENERAR CONTRATO AUTOMÁTICO
========================= */
async function generarContratoAutomatico(empresaId, perfilId, creadoPor) {

  // =========================
  // VALIDACIONES
  // =========================
  const empresa = Number(empresaId);
  const perfil = Number(perfilId);
  const user = Number(creadoPor);

  if (isNaN(empresa)) throw new Error("empresaId inválido");
  if (isNaN(perfil)) throw new Error("perfilId inválido");
  if (isNaN(user)) throw new Error("creadoPor es obligatorio");

  // =========================
  // 0. EVITAR DUPLICADOS
  // =========================
  const existeRaw = await db.query(
    `
    SELECT FIRST 1 ID
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ? AND PERFIL_ID = ?
  `,
    [empresa, perfil]
  );

  const existe = toArray(existeRaw);

  if (existe.length > 0) {
    return {
      contratoId: existe[0].ID,
      duplicado: true
    };
  }

  // =========================
  // 1. GENERAR ID
  // =========================
  const idRes = await db.query(
    `
    SELECT GEN_ID(GEN_CONTRATOS, 1) AS ID
    FROM RDB$DATABASE
  `
  );

  const contratoId = idRes?.[0]?.ID;
  if (!contratoId) throw new Error("No se pudo generar ID del contrato");

  // =========================
  // 2. HASH CONTRATO
  // =========================
  const hashContrato = generarHash({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    timestamp: Date.now()
  });

  // =========================
  // 3. PDF
  // =========================
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    hash: hashContrato
  });

  if (!pdf?.fileName) {
    throw new Error("Error generando PDF del contrato");
  }

  // =========================
  // 4. TOKEN FIRMA
  // =========================
  const token = generarHash({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    time: Date.now()
  });

  if (!token) throw new Error("No se pudo generar token");

  // =========================
  // 5. LINK FIRMA (CONFIGURABLE)
  // =========================
  const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const linkFirma = `${BASE_URL}/firma.html?token=${token}`;

  // =========================
  // 6. INSERT
  // =========================
  await db.query(
    `
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (ID, EMPRESA_ID, PERFIL_ID, HASH_CONTRATO, TOKEN, ARCHIVO_ENVIADO_ID, ESTADO)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      contratoId,
      empresa,
      perfil,
      hashContrato,
      token,
      pdf.fileName,
      "PENDIENTE"
    ]
  );

  // =========================
  // 7. EMAIL EMPRESA
  // =========================
  const emailRes = await db.query(
    `
    SELECT EMAIL FROM EMPRESAS WHERE EMPRESA_ID = ?
  `,
    [empresa]
  );

  const email = emailRes?.[0]?.EMAIL;

  // =========================
  // 8. ENVIAR EMAIL
  // =========================
  if (email) {
    try {
      await enviarContratoEmail({
        to: email,
        pdfPath: pdf.filePath,
        contratoId,
        linkFirma
      });
    } catch (err) {
      console.error("EMAIL ERROR:", err.message);
    }
  }

  // =========================
  // 9. RESPUESTA FINAL
  // =========================
  return {
    contratoId,
    hash: hashContrato,
    token,
    pdf: pdf.fileName,
    linkFirma
  };
}

module.exports = {
  generarContratoAutomatico
};