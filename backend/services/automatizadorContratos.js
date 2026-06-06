const db = require("../models/db");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { generarHash } = require("../utils/hash");
const { generarPDFContrato } = require("./pdf.service");
const { enviarContratoEmail } = require("./email.service");

/* =========================
   GENERAR CONTRATO AUTOMÁTICO (PRO FULL FLOW)
========================= */
async function generarContratoAutomatico(empresaId, perfilId, creadoPor) {

  // =========================
  // VALIDACIONES
  // =========================
  const empresa = Number(empresaId);
  const perfil = Number(perfilId);
  const user = Number(creadoPor);

  if (!empresa || isNaN(empresa)) throw new Error("empresaId inválido");
  if (!perfil || isNaN(perfil)) throw new Error("perfilId inválido");
  if (!user || isNaN(user)) throw new Error("CREADO_POR es obligatorio");

  // =========================
  // 0. EVITAR DUPLICADOS
  // =========================
  const existe = await db.query(`
    SELECT FIRST 1 ID
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ? AND PERFIL_ID = ?
  `, [empresa, perfil]);

  if (existe?.length > 0) {
    return {
      contratoId: existe[0].ID,
      duplicado: true
    };
  }

  // =========================
  // 1. GENERAR ID FIREBIRD
  // =========================
  const idRes = await db.query(`
    SELECT GEN_ID(GEN_CONTRATOS, 1) AS ID
    FROM RDB$DATABASE
  `);

  const contratoId = idRes?.[0]?.ID;

  if (!contratoId) {
    throw new Error("No se pudo generar ID del contrato");
  }

  // =========================
  // 2. GENERAR HASH (INTEGRIDAD)
  // =========================
  const hash = generarHash({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    timestamp: Date.now()
  });

  // =========================
  // 3. GENERAR PDF REAL
  // =========================
  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    hash
  });

  if (!pdf?.fileName) {
    throw new Error("Error generando PDF del contrato");
  }

  // =========================
  // 4. TOKEN DE FIRMA (🔥 FIX CRÍTICO)
  // =========================
  const token = generarHash({
    contratoId,
    empresaId: empresa,
    perfilId: perfil,
    time: Date.now()
  });

  if (!token) {
    throw new Error("No se pudo generar token");
  }

  // =========================
  // 5. LINK DE FIRMA (COHERENTE CON FRONTEND)
  // =========================
  const linkFirma = `http://localhost:3000/firma.html?token=${token}`;

  // =========================
  // 6. INSERT CONTRATO (🔥 AHORA CON TOKEN)
  // =========================
  await db.query(`
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (ID, EMPRESA_ID, PERFIL_ID, HASH, TOKEN, ARCHIVO_ENVIADO_ID, ESTADO)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE')
  `, [
    contratoId,
    empresa,
    perfil,
    hash,
    token,
    pdf.fileName
  ]);

  // =========================
  // 7. OBTENER EMAIL EMPRESA (FIX EMPRESA_ID)
  // =========================
  const emailRes = await db.query(`
    SELECT EMAIL FROM EMPRESAS WHERE EMPRESA_ID = ?
  `, [empresa]);

  const email = emailRes?.[0]?.EMAIL;

  // =========================
  // 8. ENVIAR EMAIL AUTOMÁTICO
  // =========================
  if (email) {
    try {
      await enviarContratoEmail({
        to: email,
        pdfPath: pdf.filePath,
        contratoId,
        linkFirma
      });
    } catch (e) {
      console.error("EMAIL ERROR:", e.message);
    }
  }

  // =========================
  // 9. RESPUESTA FINAL
  // =========================
  return {
    contratoId,
    hash,
    token,
    pdf: pdf.fileName,
    linkFirma
  };
}

module.exports = {
  generarContratoAutomatico
};