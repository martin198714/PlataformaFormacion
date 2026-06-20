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
perfiles,
creadoPor
) {
/* =========================
VALIDACIONES
========================= */

const empresa = Number(empresaId);
const usuario = Number(creadoPor);

if (isNaN(empresa) || empresa <= 0) {
throw new Error("empresaId inválido");
}

if (isNaN(usuario) || usuario <= 0) {
throw new Error("creadoPor inválido");
}

if (!Array.isArray(perfiles) || perfiles.length === 0) {
throw new Error("Debes enviar al menos un perfil");
}

/* =========================
EVITAR DUPLICADOS
========================= */

const existeRaw = await db.query(
`     SELECT FIRST 1 ID, TOKEN
    FROM CONTRATOS_MANTENIMIENTO
    WHERE EMPRESA_ID = ?
    ORDER BY ID DESC
    `,
[empresa]
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
`     SELECT GEN_ID(GEN_CONTRATOS, 1) AS ID
    FROM RDB$DATABASE
    `
);

const contratoId = toArray(idRaw)[0]?.ID;

if (!contratoId) {
throw new Error("No se pudo generar el ID del contrato");
}

/* =========================
HASH CONTRATO
========================= */

const hashContrato = generarHash({
contratoId,
empresaId: empresa,
perfiles,
timestamp: Date.now()
});

/* =========================
TOKEN FIRMA
========================= */

const token = generarHash({
contratoId,
empresaId: empresa,
perfiles,
timestamp: Date.now()
});

/* =========================
GUARDAR CONTRATO
========================= */

await db.query(
`     INSERT INTO CONTRATOS_MANTENIMIENTO
    (
      ID,
      EMPRESA_ID,
      HASH_CONTRATO,
      TOKEN,
      ESTADO,
      FECHA_ENVIO
    )
    VALUES
    (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
[
contratoId,
empresa,
hashContrato,
token,
ESTADOS_CONTRATO.PENDIENTE
]
);

/* =========================
GUARDAR RELACIÓN PERFILES
========================= */

for (const perfilId of perfiles) {
await db.query(
`       INSERT INTO CONTRATO_PERFILES
      (
        CONTRATO_ID,
        PERFIL_ID
      )
      VALUES (?, ?)
      `,
[contratoId, perfilId]
);
}

/* =========================
OBTENER NOMBRES PERFILES
========================= */

const perfilesRaw = await db.query(
`     SELECT NOMBRE
    FROM PERFILES
    WHERE ID IN (${perfiles.map(() => "?").join(",")})
    `,
perfiles
);

const nombresPerfiles =
toArray(perfilesRaw).map(p => p.NOMBRE);

/* =========================
PDF
========================= */

const pdf = await generarPDFContrato({
contratoId,
empresaId: empresa,
perfiles: nombresPerfiles,
hash: hashContrato
});

if (!pdf?.fileName) {
throw new Error("Error generando PDF");
}

/* =========================
EMAIL EMPRESA
========================= */

const emailRaw = await db.query(
`     SELECT EMAIL
    FROM EMPRESAS
    WHERE EMPRESA_ID = ?
    `,
[empresa]
);

const email =
toArray(emailRaw)[0]?.EMAIL || null;

const FRONTEND_URL =
process.env.FRONTEND_URL ||
"http://localhost:3000";

const linkFirma =
`${FRONTEND_URL}/firma.html?token=${token}`;

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
} catch (err) {
console.error("ERROR EMAIL:", err.message);
}
}

/* =========================
RESPUESTA
========================= */

return {
ok: true,
contratoId,
token,
hash: hashContrato,
pdf: pdf.fileName,
aplicaciones: nombresPerfiles,
emailEnviado: Boolean(email),
linkFirma
};
}

module.exports = {
generarContratoAutomatico
};
