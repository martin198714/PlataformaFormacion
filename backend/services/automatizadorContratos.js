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

/* =========================
   GENERAR CONTRATO AUTOMÁTICO
========================= */
async function generarContratoAutomatico(
  empresaId,
  perfilId,
  creadoPor
) {
  /* =========================
     VALIDACIONES
  ========================= */
  const empresa = Number(empresaId);
  const perfil = Number(perfilId);
  const usuario = Number(creadoPor);

  if (isNaN(empresa) || empresa <= 0) {
    throw new Error("empresaId inválido");
  }

  if (isNaN(perfil) || perfil <= 0) {
    throw new Error("perfilId inválido");
  }

  if (isNaN(usuario) || usuario <= 0) {
    throw new Error("creadoPor es obligatorio");
  }

  /* =========================
     EVITAR DUPLICADOS
  ========================= */
  const existeRaw = await db.query(
    `
    SELECT FIRST 1
      ID,
      TOKEN
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ?
      AND PERFIL_ID = ?
    `,
    [empresa, perfil]
  );

  const existe = toArray(existeRaw);

  if (existe.length > 0) {
    return {
      contratoId: existe[0].ID,
      token: existe[0].TOKEN,
      duplicado: true
    };
  }

  /* =========================
     GENERAR ID CONTRATO
  ========================= */
  const idRaw = await db.query(
    `
    SELECT GEN_ID(GEN_CONTRATOS, 1) AS ID
    FROM RDB$DATABASE
    `
  );

  const idRows = toArray(idRaw);

  const contratoId = idRows[0]?.ID;

  if (!contratoId) {
    throw new Error(
      "No se pudo generar el ID del contrato"
    );
  }

  /* =========================
     HASH CONTRATO
  ========================= */
  const hashContrato = generarHash({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    timestamp: Date.now()
  });

  /* =========================
     PDF CONTRATO
  ========================= */
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    hash: hashContrato
  });

  if (!pdf?.fileName) {
    throw new Error(
      "Error generando PDF del contrato"
    );
  }

  /* =========================
     TOKEN FIRMA
  ========================= */
  const token = generarHash({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    timestamp: Date.now()
  });

  if (!token) {
    throw new Error(
      "No se pudo generar el token de firma"
    );
  }

  /* =========================
     LINK FIRMA
  ========================= */
  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "http://localhost:3000";

  const linkFirma =
    `${FRONTEND_URL}/firma.html?token=${token}`;

  /* =========================
     GUARDAR CONTRATO
  ========================= */
  await db.query(
    `
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (
      ID,
      EMPRESA_ID,
      PERFIL_ID,
      HASH_CONTRATO,
      TOKEN,
      ARCHIVO_ENVIADO_ID,
      ESTADO,
      FECHA_ENVIO
    )
    VALUES
    (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      contratoId,
      empresa,
      perfil,
      hashContrato,
      token,
      pdf.fileName,
      ESTADOS_CONTRATO.PENDIENTE
    ]
  );

  /* =========================
     OBTENER EMAIL EMPRESA
  ========================= */
  const emailRaw = await db.query(
    `
    SELECT EMAIL
    FROM EMPRESAS
    WHERE EMPRESA_ID = ?
    `,
    [empresa]
  );

  const emailRows = toArray(emailRaw);

  const email = emailRows[0]?.EMAIL || null;

  /* =========================
     ENVIAR EMAIL
  ========================= */
  if (email) {
    try {
      await enviarContratoEmail({
        to: email,
        pdfPath: pdf.filePath,
        contratoId,
        linkFirma
      });

      console.log(
        `Contrato ${contratoId} enviado a ${email}`
      );

    } catch (err) {

      console.error(
        "ERROR ENVIANDO EMAIL:",
        err.message
      );

      // NO BLOQUEAMOS EL PROCESO
      // El contrato ya está creado
    }
  } else {

    console.warn(
      `La empresa ${empresa} no tiene email configurado`
    );
  }

  /* =========================
     RESPUESTA
  ========================= */
  return {
    ok: true,
    contratoId,
    hash: hashContrato,
    token,
    pdf: pdf.fileName,
    emailEnviado: Boolean(email),
    linkFirma
  };
}

module.exports = {
  generarContratoAutomatico
};