const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");

const {
  generarPDFContrato,
  verificarPDFFirmado
} = require("./pdf.service");

const {
  enviarContratoEmail
} = require("./email.service");

const { v4: uuidv4 } = require("uuid");

/* =========================
UTIL
========================= */

function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  return [];
}

function safe(v) {
  return v ?? "";
}

/* =========================
NORMALIZADOR
========================= */

function normalizarPerfiles(perfiles) {
  if (!perfiles) return [];

  if (Array.isArray(perfiles)) {
    return perfiles
      .map(Number)
      .filter(v => Number.isInteger(v) && v > 0);
  }

  const n = Number(perfiles);
  return Number.isInteger(n) ? [n] : [];
}

function normalizeContrato(c) {
  if (!c) return null;

  return {
    ...c,
    EMPRESA_ID: safe(c.EMPRESA_ID),
    EMPRESA_NOMBRE: safe(c.EMPRESA_NOMBRE),
    PERFIL_ID: safe(c.PERFIL_ID),
    PERFIL_NOMBRE: safe(c.PERFIL_NOMBRE),   // <-- AÑADIR
    ESTADO: safe(c.ESTADO),
    TOKEN: safe(c.TOKEN || c.TOKEN_FIRMA),
    ARCHIVO_ENVIADO_ID: safe(c.ARCHIVO_ENVIADO_ID),
    ARCHIVO_FIRMADO_ID: safe(c.ARCHIVO_FIRMADO_ID),
    FECHA_ENVIO: safe(c.FECHA_ENVIO),
    FECHA_FIRMA: safe(c.FECHA_FIRMA),
    USUARIO_FIRMA_ID: safe(c.USUARIO_FIRMA_ID),
  };
}

/* =========================
LISTAR USUARIO
========================= */

async function listarPorUsuario(usuarioId) {

  const r = await db.query(`
    SELECT
      c.ID,
      c.EMPRESA_ID,
      e.NOMBRE AS EMPRESA_NOMBRE,
      p.NOMBRE AS PERFIL_NOMBRE,
      c.ESTADO,
      c.FECHA_ENVIO,
      c.TOKEN
    FROM CONTRATOS_MANTENIMIENTO c
    INNER JOIN EMPRESAS e
      ON e.EMPRESA_ID = c.EMPRESA_ID
    INNER JOIN CONTRATO_PERFILES cp
      ON cp.CONTRATO_ID = c.ID
    INNER JOIN PERFILES p
      ON p.ID = cp.PERFIL_ID
    WHERE c.EMPRESA_ID = (
      SELECT EMPRESA_ID
      FROM USUARIOS
      WHERE USUARIO_ID = ?
    )
    ORDER BY c.ID DESC, p.NOMBRE
  `, [usuarioId]);

  const datos = toArray(r);

  console.log("===== LISTAR USUARIO =====");
  console.log(JSON.stringify(datos, null, 2));

  return datos.map(normalizeContrato);
}
/* =========================
LISTAR EMPRESA
========================= */

async function listarPorEmpresa(empresaId) {

  const r = await db.query(`
    SELECT
      c.ID,
      c.EMPRESA_ID,
      e.NOMBRE AS EMPRESA_NOMBRE,
      p.NOMBRE AS PERFIL_NOMBRE,
      c.ESTADO,
      c.FECHA_ENVIO,
      c.FECHA_FIRMA,
      c.TOKEN
    FROM CONTRATOS_MANTENIMIENTO c
    INNER JOIN EMPRESAS e
      ON e.EMPRESA_ID = c.EMPRESA_ID
    INNER JOIN CONTRATO_PERFILES cp
      ON cp.CONTRATO_ID = c.ID
    INNER JOIN PERFILES p
      ON p.ID = cp.PERFIL_ID
    WHERE c.EMPRESA_ID = ?
    ORDER BY c.ID DESC, p.NOMBRE
  `, [empresaId]);

  const datos = toArray(r);

  console.log("===== LISTAR EMPRESA =====");
  console.log(JSON.stringify(datos, null, 2));

  return datos.map(normalizeContrato);
}

/* =========================
VER CONTRATO
========================= */

async function verContrato(id) {
  const r = await db.query(`
    SELECT
        c.*,
        a.FICHERO_NOMBRE,
        LIST(p.NOMBRE, ', ') AS PERFIL_NOMBRE
    FROM CONTRATOS_MANTENIMIENTO c
    LEFT JOIN ARCHIVOS a
        ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
    LEFT JOIN CONTRATO_PERFILES cp
        ON cp.CONTRATO_ID = c.ID
    LEFT JOIN PERFILES p
        ON p.ID = cp.PERFIL_ID
    WHERE c.ID = ?
    GROUP BY
        c.ID,
        a.FICHERO_NOMBRE
`, [id]);

  return normalizeContrato(toArray(r)[0] || {});
}

/* =========================
OBTENER POR TOKEN
========================= */

async function obtenerPorToken(token) {

  const r = await db.query(`
      SELECT
          c.*,
          a.FICHERO_NOMBRE
      FROM CONTRATOS_MANTENIMIENTO c
      LEFT JOIN ARCHIVOS a
          ON a.ARCHIVO_ID = c.ARCHIVO_ENVIADO_ID
      WHERE c.TOKEN = ?
  `, [token]);

  return normalizeContrato(toArray(r)[0] || {});
}

/* =========================
CREAR CONTRATO
========================= */

async function crearContrato(empresaId, perfiles) {
  const empresa = Number(empresaId);
  const perfilesNumeros = normalizarPerfiles(perfiles);

  console.log("================================");
  console.log("CREAR CONTRATO");
  console.log("Empresa:", empresa);
  console.log("Perfiles recibidos:", perfiles);
  console.log("Perfiles normalizados:", perfilesNumeros);
  console.log("================================");

  if (!empresa) {
    throw new Error("Empresa inválida");
  }

  if (!perfilesNumeros.length) {
    throw new Error("Debe seleccionar al menos un perfil");
  }

  const token = uuidv4();

  const hash = generarHash({
    empresa,
    perfiles: perfilesNumeros,
    fecha: Date.now()
  });

  /* =========================
     INSERTAR CONTRATO
  ========================= */

  const insert = await db.query(`
    INSERT INTO CONTRATOS_MANTENIMIENTO
    (
      EMPRESA_ID,
      TOKEN,
      HASH_CONTRATO,
      ESTADO,
      FECHA_ENVIO
    )
    VALUES
    (
      ?, ?, ?, ?, CURRENT_TIMESTAMP
    )
    RETURNING ID
  `, [
    empresa,
    token,
    hash,
    ESTADOS_CONTRATO.PENDIENTE
  ]);

  const contratoId =
    insert?.[0]?.ID ||
    insert?.ID ||
    toArray(insert)?.[0]?.ID;

  if (!contratoId) {
    throw new Error("No se pudo crear el contrato");
  }

  /* =========================
     GUARDAR PERFILES
  ========================= */

  for (const perfilId of perfilesNumeros) {
    console.log("Insertando perfil:", perfilId);

    await db.query(`
      INSERT INTO CONTRATO_PERFILES
      (
        CONTRATO_ID,
        PERFIL_ID
      )
      VALUES
      (
        ?, ?
      )
    `, [
      contratoId,
      perfilId
    ]);
  }

  /* =========================
     OBTENER NOMBRE EMPRESA
  ========================= */

  const empresaRaw = await db.query(`
    SELECT NOMBRE
    FROM EMPRESAS
    WHERE EMPRESA_ID = ?
  `, [empresa]);

  const empresaNombre =
    toArray(empresaRaw)[0]?.NOMBRE || "Empresa";

  /* =========================
     OBTENER NOMBRES PERFILES
  ========================= */

  const placeholders = perfilesNumeros
    .map(() => "?")
    .join(",");

  const perfilesRaw = await db.query(`
    SELECT NOMBRE
    FROM PERFILES
    WHERE ID IN (${placeholders})
  `, perfilesNumeros);

  const nombresPerfiles = toArray(perfilesRaw)
    .map(p => p.NOMBRE);

  /* =========================
     GENERAR PDF
  ========================= */

  const pdf = await generarPDFContrato({
    contratoId,
    empresaNombre,
    perfiles: nombresPerfiles,
    hash
  });

  const nombrePdf = path.basename(pdf.filePath);

  const insertArchivo = await db.query(`
    INSERT INTO ARCHIVOS
    (
        FICHERO_NOMBRE,
        RUTA
    )
    VALUES
    (?, ?)
    RETURNING ARCHIVO_ID
`, [
    nombrePdf,
    pdf.filePath
  ]);

  const archivoId =
    insertArchivo?.[0]?.ARCHIVO_ID ||
    toArray(insertArchivo)?.[0]?.ARCHIVO_ID;

  await db.query(`
    UPDATE CONTRATOS_MANTENIMIENTO
    SET ARCHIVO_ENVIADO_ID=?
    WHERE ID=?
`, [
    archivoId,
    contratoId
  ]);

  if (!pdf?.filePath) {
    throw new Error("Error generando el PDF");
  }

  /* =========================
     OBTENER EMAILS
  ========================= */

  const emailsRaw = await db.query(`
    SELECT DISTINCT EMAIL
    FROM USUARIOS
    WHERE EMPRESA_ID = ?
  `, [empresa]);

  const emails = toArray(emailsRaw)
    .map(x => x.EMAIL)
    .filter(Boolean);

  /* =========================
     ENVIAR EMAILS
  ========================= */

  for (const email of emails) {

    try {

      await enviarContratoEmail({
        to: email,
        pdfPath: pdf.filePath,
        contratoId,
        linkFirma: `http://127.0.0.1:5500/frontend/firmar.html?token=${token}`
      });

    } catch (err) {

      console.error(
        `Error enviando email a ${email}:`,
        err.message
      );

    }
  }

  return {
    ok: true,
    contratoId,
    token
  };
}

/* =========================
AUTOFIRMA PREPARACIÓN
========================= */

async function prepararFirmaAutoFirma(token) {
  const contrato = await obtenerPorToken(token);

  if (!contrato?.ID) throw new Error("Contrato no encontrado");

  return {
    ok: true,
    token,
    redirectUrl: `autofirma://sign?token=${token}`
  };
}

/* =========================
RECIBIR FIRMA AUTOFIRMA (REAL CALLBACK)
========================= */

async function recibirFirmaAutoFirma(data) {
  return firmarContratoTokenArchivo(data);
}

/* =========================
FIRMA TOKEN PRINCIPAL (FIXED FLOW)
========================= */

async function firmarContratoTokenArchivo(data) {
  const contrato = await obtenerPorToken(data.token);

  if (!contrato?.ID) throw new Error("Contrato no encontrado");

  if (contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO) {
    return {
      ok: true,
      contratoId: contrato.ID,
      mensaje: "Ya firmado"
    };
  }

  /* VALIDACIÓN PDF FIRMADO */
  if (data.rutaFirmado) {
    const valid = await verificarPDFFirmado(data.rutaFirmado);
    if (!valid?.valido) throw new Error("PDF inválido");

    await db.query(`
      UPDATE CONTRATOS_MANTENIMIENTO
      SET ARCHIVO_FIRMADO=?
      WHERE ID=?
    `, [data.rutaFirmado, contrato.ID]);
  }

  const hashFirmado = generarHash({
    contrato: contrato.ID,
    token: contrato.TOKEN,
    fecha: Date.now(),
    ip: data.ip
  });

  await db.query(`
UPDATE CONTRATOS_MANTENIMIENTO
SET
    ARCHIVO_FIRMADO=?,
    ESTADO=?,
    FECHA_FIRMA=CURRENT_TIMESTAMP,
    IP_FIRMA=?,
    USER_AGENT=?,
    HASH_FIRMADO=?
WHERE ID=?
`, [
    data.rutaFirmado,
    ESTADOS_CONTRATO.FIRMADO,
    data.ip,
    data.userAgent,
    hashFirmado,
    contrato.ID
  ]);

  /* ADMIN UPDATE (NO FALLA SI NO EXISTE) */
  await db.query(`
    UPDATE ADMIN_CONTRATOS
    SET ESTADO=?, FECHA_FIRMA=CURRENT_TIMESTAMP
    WHERE CONTRATO_ID=?
  `, [
    ESTADOS_CONTRATO.FIRMADO,
    contrato.ID
  ]);

  return {
    ok: true,
    contratoId: contrato.ID,
    estado: ESTADOS_CONTRATO.FIRMADO
  };
}

/* =========================
FIRMA SIMPLE TOKEN
========================= */

async function firmarContratoToken(data) {
  return firmarContratoTokenArchivo(data);
}

/* =========================
FIRMA MANUAL
========================= */

async function firmarContrato(data) {
  const contrato = data.id
    ? await verContrato(data.id)
    : await obtenerPorToken(data.token);

  if (!contrato?.ID) throw new Error("Contrato no encontrado");

  if (contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO) {
    return { ok: true, contratoId: contrato.ID };
  }

  await db.query(`
    UPDATE CONTRATOS_MANTENIMIENTO
    SET
      ESTADO=?,
      FECHA_FIRMA=CURRENT_TIMESTAMP,
      IP_FIRMA=?,
      USER_AGENT=?,
      HASH_FIRMADO=?
    WHERE ID=?
  `, [
    ESTADOS_CONTRATO.FIRMADO,
    data.ip || null,
    data.userAgent || null,
    generarHash({
      contrato: contrato.ID,
      token: contrato.TOKEN,
      fecha: Date.now(),
      ip: data.ip
    }),
    contrato.ID
  ]);

  return { ok: true, contratoId: contrato.ID };
}

/* =========================================================
AUTO-FIRMA UPLOAD (NUEVO SISTEMA SIN INTERVENCIÓN)
========================================================= */

/**
 * Marca contrato firmado desde watcher local
 */
async function firmarContratoAuto(data) {
  return firmarContratoTokenArchivo({
    token: data.token,
    rutaFirmado: data.rutaFirmado,
    ip: data.ip,
    userAgent: data.userAgent
  });
}

/* =========================
EXPORT
========================= */

module.exports = {
  listarPorUsuario,
  listarPorEmpresa,
  verContrato,
  crearContrato,
  obtenerPorToken,
  firmarContratoToken,
  firmarContratoTokenArchivo,
  firmarContrato,
  prepararFirmaAutoFirma,
  recibirFirmaAutoFirma,
  firmarContratoAuto
};