const fs = require("fs");
const path = require("path");
const db = require("../models/db");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const { generarHash } = require("../utils/hash");

const {
  generarPDFContrato,
  verificarPDFFirmado,
  aplicarFirmaPDF
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

  if (Array.isArray(r))
    return r;

  if (Array.isArray(r.rows))
    return r.rows;

  if (Array.isArray(r.data))
    return r.data;

  return [];
}

function safe(v) {
  return v ?? "";
}

/* =========================
NORMALIZADOR
========================= */

function normalizarPerfiles(perfiles) {

  if (!perfiles)
    return [];

  if (Array.isArray(perfiles)) {

    return perfiles
      .map(Number)
      .filter(x => Number.isInteger(x) && x > 0);

  }

  const n = Number(perfiles);

  return Number.isInteger(n)
    ? [n]
    : [];
}

function normalizeContrato(c) {

  if (!c)
    return null;

  return {

    ...c,

    EMPRESA_ID: safe(c.EMPRESA_ID),
    EMPRESA_NOMBRE: safe(c.EMPRESA_NOMBRE),

    PERFIL_ID: safe(c.PERFIL_ID),
    PERFIL_NOMBRE: safe(c.PERFIL_NOMBRE),

    ESTADO: safe(c.ESTADO),

    TOKEN: safe(c.TOKEN || c.TOKEN_FIRMA),

    ARCHIVO_ENVIADO_ID: safe(c.ARCHIVO_ENVIADO_ID),
    ARCHIVO_FIRMADO_ID: safe(c.ARCHIVO_FIRMADO_ID),

    FICHERO_NOMBRE: safe(c.FICHERO_NOMBRE),

    FECHA_ENVIO: safe(c.FECHA_ENVIO),
    FECHA_FIRMA: safe(c.FECHA_FIRMA),

    USUARIO_FIRMA_ID: safe(c.USUARIO_FIRMA_ID)

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
            e.NOMBRE EMPRESA_NOMBRE,
            LIST(p.NOMBRE, ', ') PERFIL_NOMBRE,
            c.ESTADO,
            c.FECHA_ENVIO,
            c.FECHA_FIRMA,
            c.TOKEN,
            a.FICHERO_NOMBRE
        FROM CONTRATOS_MANTENIMIENTO c
        LEFT JOIN EMPRESAS e
            ON e.EMPRESA_ID=c.EMPRESA_ID
        LEFT JOIN CONTRATO_PERFILES cp
            ON cp.CONTRATO_ID=c.ID
        LEFT JOIN PERFILES p
            ON p.ID=cp.PERFIL_ID
        LEFT JOIN ARCHIVOS a
            ON a.ARCHIVO_ID=c.ARCHIVO_ENVIADO_ID
        WHERE c.EMPRESA_ID=(
            SELECT EMPRESA_ID
            FROM USUARIOS
            WHERE USUARIO_ID=?
        )
        GROUP BY
            c.ID,
            c.EMPRESA_ID,
            e.NOMBRE,
            c.ESTADO,
            c.FECHA_ENVIO,
            c.FECHA_FIRMA,
            c.TOKEN,
            a.FICHERO_NOMBRE
        ORDER BY c.ID DESC
    `, [usuarioId]);

  return toArray(r).map(normalizeContrato);
}

/* =========================
LISTAR EMPRESA
========================= */

async function listarPorEmpresa(empresaId) {

  const r = await db.query(`
        SELECT
            c.ID,
            c.EMPRESA_ID,
            e.NOMBRE EMPRESA_NOMBRE,
            LIST(p.NOMBRE, ', ') PERFIL_NOMBRE,
            c.ESTADO,
            c.FECHA_ENVIO,
            c.FECHA_FIRMA,
            c.TOKEN,
            a.FICHERO_NOMBRE
        FROM CONTRATOS_MANTENIMIENTO c
        LEFT JOIN EMPRESAS e
            ON e.EMPRESA_ID=c.EMPRESA_ID
        LEFT JOIN CONTRATO_PERFILES cp
            ON cp.CONTRATO_ID=c.ID
        LEFT JOIN PERFILES p
            ON p.ID=cp.PERFIL_ID
        LEFT JOIN ARCHIVOS a
            ON a.ARCHIVO_ID=c.ARCHIVO_ENVIADO_ID
        WHERE c.EMPRESA_ID=?
        GROUP BY
            c.ID,
            c.EMPRESA_ID,
            e.NOMBRE,
            c.ESTADO,
            c.FECHA_ENVIO,
            c.FECHA_FIRMA,
            c.TOKEN,
            a.FICHERO_NOMBRE
        ORDER BY c.ID DESC
    `, [empresaId]);

  return toArray(r).map(normalizeContrato);
}

/* =========================
VER CONTRATO
========================= */

async function verContrato(id) {

  const r = await db.query(`
        SELECT
            c.*,
            a.FICHERO_NOMBRE,
            LIST(p.NOMBRE, ', ') PERFIL_NOMBRE
        FROM CONTRATOS_MANTENIMIENTO c
        LEFT JOIN ARCHIVOS a
            ON a.ARCHIVO_ID=c.ARCHIVO_ENVIADO_ID
        LEFT JOIN CONTRATO_PERFILES cp
            ON cp.CONTRATO_ID=c.ID
        LEFT JOIN PERFILES p
            ON p.ID=cp.PERFIL_ID
        WHERE c.ID=?
        GROUP BY
            c.ID,
            a.FICHERO_NOMBRE
    `, [id]);

  return normalizeContrato(toArray(r)[0]);
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
            ON a.ARCHIVO_ID=c.ARCHIVO_ENVIADO_ID
        WHERE c.TOKEN=?
    `, [token]);

  return normalizeContrato(toArray(r)[0]);
}
/* =========================
CREAR CONTRATO
========================= */

async function crearContrato(empresaId, perfiles, usuarioId) {

  const empresa = Number(empresaId);
  const perfilesNumeros = normalizarPerfiles(perfiles);

  console.log("================================");
  console.log("CREAR CONTRATO");
  console.log("Empresa:", empresa);
  console.log("Perfiles:", perfilesNumeros);
  console.log("Usuario:", usuarioId);
  console.log("================================");

  if (!empresa)
    throw new Error("Empresa inválida");

  if (!perfilesNumeros.length)
    throw new Error("Debe seleccionar al menos un perfil");

  const token = uuidv4();

  const hash = generarHash({
    empresa,
    perfiles: perfilesNumeros,
    fecha: Date.now()
  });

  /* =========================
     CREAR CONTRATO
  ========================= */

  await db.query(`
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
`, [
    empresa,
    token,
    hash,
    ESTADOS_CONTRATO.PENDIENTE
  ]);

  /* =========================
     OBTENER EL ID DEL CONTRATO
  ========================= */

  const contratoRow = await db.query(`
    SELECT ID
    FROM CONTRATOS_MANTENIMIENTO
    WHERE TOKEN = ?
`, [token]);

  console.log("CONTRATO CREADO:");
  console.log(JSON.stringify(contratoRow, null, 2));

  const contratoId = toArray(contratoRow)[0]?.ID;

  if (!contratoId) {
    throw new Error("No se pudo obtener el ID del contrato recién creado");
  }

  console.log("ID CONTRATO:", contratoId);

  /* =========================
     GUARDAR PERFILES
  ========================= */

  for (const perfilId of perfilesNumeros) {

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
     EMPRESA
  ========================= */

  const empresaRaw = await db.query(`
        SELECT NOMBRE
        FROM EMPRESAS
        WHERE EMPRESA_ID=?
    `, [empresa]);

  const empresaNombre =
    toArray(empresaRaw)[0]?.NOMBRE || "Empresa";

  /* =========================
     NOMBRES PERFILES
  ========================= */

  const placeholders =
    perfilesNumeros.map(() => "?").join(",");

  const perfilesRaw = await db.query(`
        SELECT NOMBRE
        FROM PERFILES
        WHERE ID IN (${placeholders})
    `, perfilesNumeros);

  const nombresPerfiles =
    toArray(perfilesRaw).map(x => x.NOMBRE);

  /* =========================
     GENERAR PDF
  ========================= */

  const pdf = await generarPDFContrato({

    contratoId,
    empresaNombre,
    perfiles: nombresPerfiles,
    hash

  });

  if (!pdf?.filePath)
    throw new Error("Error generando PDF");

  /* =========================
     GUARDAR PDF EN ARCHIVOS
  ========================= */

  const nombrePdf = path.basename(pdf.filePath);

  const stat = fs.statSync(pdf.filePath);

  const archivo = await db.query(`
        INSERT INTO ARCHIVOS
        (
            TITULO,
            URL,
            FICHERO_NOMBRE,
            TAMANIO,
            PUBLICO,
            CREADO_POR,
            DESCRIPCION
        )
        VALUES
        (
            ?, ?, ?, ?, 1, ?, ?
        )
        RETURNING ARCHIVO_ID
    `, [
    `Contrato ${contratoId}`,
    `/uploads/contratos/${nombrePdf}`,
    nombrePdf,
    stat.size,
    usuarioId,
    `Contrato mantenimiento ${contratoId}`
  ]);

  const archivoId =
    archivo?.[0]?.ARCHIVO_ID ||
    toArray(archivo)?.[0]?.ARCHIVO_ID;

  await db.query(`
        UPDATE CONTRATOS_MANTENIMIENTO
        SET ARCHIVO_ENVIADO_ID=?
        WHERE ID=?
    `, [
    archivoId,
    contratoId
  ]);

  /* =========================
     EMAILS
  ========================= */

  const emailsRaw = await db.query(`
        SELECT DISTINCT EMAIL
        FROM USUARIOS
        WHERE EMPRESA_ID=?
    `, [empresa]);

  const emails =
    toArray(emailsRaw)
      .map(x => x.EMAIL)
      .filter(Boolean);

  for (const email of emails) {

    try {

      await enviarContratoEmail({

        to: email,

        pdfPath: pdf.filePath,

        contratoId,

        linkFirma:
          `http://127.0.0.1:5500/frontend/firmar.html?token=${token}`

      });

    } catch (e) {

      console.error(e.message);

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

  if (!contrato?.ID)
    throw new Error("Contrato no encontrado");

  return {

    ok: true,

    token,

    redirectUrl: `autofirma://sign?token=${token}`

  };

}

/* =========================
RECIBIR FIRMA
========================= */

async function recibirFirmaAutoFirma(data) {

  return firmarContratoTokenArchivo(data);

}
/* =========================
FIRMA TOKEN PRINCIPAL
========================= */

async function firmarContratoTokenArchivo(data) {

  const contrato = await obtenerPorToken(data.token);

  if (!contrato?.ID)
    throw new Error("Contrato no encontrado");

  if (contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO) {

    return {
      ok: true,
      contratoId: contrato.ID,
      mensaje: "Ya estaba firmado"
    };

  }

  let rutaFirmado = null;
  let archivoFirmadoId = null;

  /* =========================
     SI LLEGA PDF FIRMADO
  ========================= */

  if (data.rutaFirmado) {

    const valid = await verificarPDFFirmado(data.rutaFirmado);

    if (!valid.valido)
      throw new Error("El PDF firmado no es válido");

    rutaFirmado = data.rutaFirmado;

    const nombreFirmado = path.basename(rutaFirmado);

    const stat = fs.statSync(rutaFirmado);

    const archivoInsert = await db.query(`
            INSERT INTO ARCHIVOS
            (
                TITULO,
                URL,
                FICHERO_NOMBRE,
                TAMANIO,
                PUBLICO,
                CREADO_POR,
                DESCRIPCION
            )
            VALUES
            (
                ?, ?, ?, ?, 1, ?, ?
            )
            RETURNING ARCHIVO_ID
        `, [
      `Contrato firmado ${contrato.ID}`,
      `/uploads/firmados/${nombreFirmado}`,
      nombreFirmado,
      stat.size,
      contrato.USUARIO_FIRMA_ID || 1,
      `Contrato firmado ${contrato.ID}`
    ]);

    archivoFirmadoId =
      archivoInsert?.[0]?.ARCHIVO_ID ||
      toArray(archivoInsert)?.[0]?.ARCHIVO_ID;
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
            ESTADO=?,
            FECHA_FIRMA=CURRENT_TIMESTAMP,
            IP_FIRMA=?,
            USER_AGENT=?,
            HASH_FIRMADO=?,
            ARCHIVO_FIRMADO=?,
            ARCHIVO_FIRMADO_ID=?
        WHERE ID=?
    `, [
    ESTADOS_CONTRATO.FIRMADO,
    data.ip || null,
    data.userAgent || null,
    hashFirmado,
    rutaFirmado,
    archivoFirmadoId,
    contrato.ID
  ]);

  return {
    ok: true,
    contratoId: contrato.ID,
    estado: ESTADOS_CONTRATO.FIRMADO
  };

}

/* =========================
FIRMA TOKEN SIMPLE
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

  if (!contrato?.ID)
    throw new Error("Contrato no encontrado");

  if (contrato.ESTADO === ESTADOS_CONTRATO.FIRMADO) {

    return {
      ok: true,
      contratoId: contrato.ID
    };

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
    hashFirmado,
    contrato.ID
  ]);

  return {
    ok: true,
    contratoId: contrato.ID
  };

}

/* =========================
AUTOFIRMA
========================= */

async function firmarContratoAuto(data) {

  return firmarContratoTokenArchivo({

    token: data.token,
    rutaFirmado: data.rutaFirmado,
    ip: data.ip,
    userAgent: data.userAgent

  });

}

/* =========================
EXPORTS
========================= */

module.exports = {

  listarPorUsuario,
  listarPorEmpresa,

  verContrato,
  obtenerPorToken,

  crearContrato,

  prepararFirmaAutoFirma,
  recibirFirmaAutoFirma,

  firmarContrato,
  firmarContratoToken,
  firmarContratoTokenArchivo,
  firmarContratoAuto

};