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

  // evitar duplicados
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

  // ID
  const idRaw = await db.query(
    `SELECT GEN_ID(GEN_CONTRATOS, 1) AS ID FROM RDB$DATABASE`
  );

  const contratoId = toArray(idRaw)[0]?.ID;
  if (!contratoId) throw new Error("No se pudo generar ID");

  const token = generarHash({
    contratoId,
    empresaId: empresa,
    perfiles,
    t: Date.now(),
  });

  const hashContrato = generarHash({
    contratoId,
    empresaId: empresa,
    perfiles,
    token,
  });

  // contrato
  await db.query(
    `INSERT INTO CONTRATOS_MANTENIMIENTO
     (ID, EMPRESA_ID, TOKEN, HASH_CONTRATO, ESTADO, FECHA_ENVIO)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      contratoId,
      empresa,
      token,
      hashContrato,
      ESTADOS_CONTRATO.PENDIENTE,
    ]
  );

  // perfiles
  for (const perfilId of perfiles) {
    await db.query(
      `INSERT INTO CONTRATO_PERFILES (CONTRATO_ID, PERFIL_ID)
       VALUES (?, ?)`,
      [contratoId, perfilId]
    );
  }

  // nombres perfiles
  const perfilesRaw = await db.query(
    `SELECT NOMBRE FROM PERFILES WHERE ID IN (${perfiles.map(() => "?").join(",")})`,
    perfiles
  );

  const nombres = toArray(perfilesRaw).map(p => p.NOMBRE);

  const pdf = await generarPDFContrato({
    contratoId,
    empresaId: empresa,
    perfiles: nombres,
    hash: hashContrato,
  });

  const emailRaw = await db.query(
    `SELECT EMAIL FROM EMPRESAS WHERE EMPRESA_ID = ?`,
    [empresa]
  );

  const email = toArray(emailRaw)[0]?.EMAIL;

  const linkFirma = `http://localhost:3000/firma.html?token=${token}`;

  if (email) {
    await enviarContratoEmail({
      to: email,
      pdfPath: pdf.filePath,
      contratoId,
      linkFirma,
    });
  }

  return {
    contratoId,
    token,
    pdf: pdf.fileName,
    perfiles: nombres,
    linkFirma,
  };
}

module.exports = {
  generarContratoAutomatico,
};