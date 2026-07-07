const contratosService = require("../services/contratos.service");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");
const fs = require("fs");
const path = require("path");

/* =========================
   UTIL
========================= */
function safe(value) {
  return value === null || value === undefined ? "" : value;
}

function normalizeContrato(c) {
  if (!c) return null;

  return {
    ...c,
    EMPRESA_ID: safe(c.EMPRESA_ID),
    PERFIL_ID: safe(c.PERFIL_ID),
    ESTADO: safe(c.ESTADO),
    TOKEN: safe(c.TOKEN || c.TOKEN_FIRMA),
    ARCHIVO_ENVIADO_ID: safe(c.ARCHIVO_ENVIADO_ID),
    ARCHIVO_FIRMADO_ID: safe(c.ARCHIVO_FIRMADO_ID),
    FECHA_ENVIO: safe(c.FECHA_ENVIO),
    FECHA_FIRMA: safe(c.FECHA_FIRMA),
    USUARIO_FIRMA_ID: safe(c.USUARIO_FIRMA_ID),
  };
}

/* 🔥 NUEVO: normalizador de perfiles */
function normalizarPerfilesInput(body) {
  if (body.perfiles !== undefined) return body.perfiles;
  if (body.perfilId !== undefined) return body.perfilId;
  return null;
}

/* =========================
   LISTAR USUARIO
========================= */
exports.listar = async (req, res) => {
  try {
    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const datos = await contratosService.listarPorUsuario(usuarioId);
    return res.json((datos || []).map(normalizeContrato));
  } catch (err) {
    return res.status(500).json({
      error: "Error al listar contratos",
      detalle: err.message,
    });
  }
};

/* =========================
   LISTAR EMPRESA
========================= */
exports.listarPorEmpresa = async (req, res) => {
  try {
    const empresaId = Number(req.params.empresaId);

    if (isNaN(empresaId)) {
      return res.status(400).json({ error: "Empresa inválida" });
    }

    const datos = await contratosService.listarPorEmpresa(empresaId);
    return res.json((datos || []).map(normalizeContrato));
  } catch (err) {
    return res.status(500).json({
      error: "Error al listar contratos",
      detalle: err.message,
    });
  }
};

/* =========================
   CREAR CONTRATO
========================= */
exports.crear = async (req, res) => {
  try {
    const empresaId = Number(req.body.empresaId);
    const perfilesRaw = normalizarPerfilesInput(req.body);
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (isNaN(empresaId)) {
      return res.status(400).json({ error: "Empresa inválida" });
    }

    if (!perfilesRaw) {
      return res.status(400).json({ error: "Perfiles no enviados" });
    }

    const perfiles = Array.isArray(perfilesRaw)
      ? perfilesRaw
      : [perfilesRaw];

    const perfilesNumeros = perfiles
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0);

    if (perfilesNumeros.length === 0) {
      return res.status(400).json({ error: "IDs inválidos" });
    }

    const result = await contratosService.crearContrato(
      empresaId,
      perfilesNumeros,
      usuarioId
    );

    return res.json({
      ok: true,
      contratoId: result?.contratoId || null,
      token: result?.token || null,
      linkFirma:
        result?.linkFirma ||
        `http://localhost:3000/firma.html?token=${result?.token || ""}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Error al crear contrato",
      detalle: err.message,
    });
  }
};

/* =========================
   VER CONTRATO POR ID
========================= */
exports.verContrato = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const contrato = await contratosService.verContrato(id);

    if (!contrato) {
      return res.status(404).json({ error: "Contrato no encontrado" });
    }

    return res.json(
      normalizeContrato({
        ...contrato,
        estado_definido:
          ESTADOS_CONTRATO?.[contrato.ESTADO] || contrato.ESTADO,
      })
    );
  } catch (err) {
    return res.status(500).json({
      error: "Error al obtener contrato",
      detalle: err.message,
    });
  }
};

/* =========================
   DESCARGAR CONTRATO
========================= */
exports.descargarContrato = async (req, res) => {
  try {
    console.log("===== DESCARGAR CONTRATO =====");

    const contrato = await contratosService.obtenerPorToken(req.params.token);

    console.log("Contrato:", contrato);

    if (!contrato?.FICHERO_NOMBRE) {
      console.log("No hay FICHERO_NOMBRE");
      return res.status(404).json({ error: "Contrato no encontrado" });
    }

    const fichero = path.join(
      __dirname,
      "..",
      "uploads",
      "contratos",
      contrato.FICHERO_NOMBRE
    );

    console.log("Ruta:", fichero);
    console.log("Existe:", fs.existsSync(fichero));

    if (!fs.existsSync(fichero)) {
      return res.status(404).json({ error: "PDF inexistente" });
    }

    return res.sendFile(fichero);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};

/* =========================
   VER POR TOKEN
========================= */
exports.verContratoPorToken = async (req, res) => {
  try {
    const token = req.params.token;

    if (!token) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const contrato = await contratosService.obtenerPorToken(token);

    if (!contrato) {
      return res.status(404).json({ error: "Contrato no encontrado" });
    }

    return res.json(normalizeContrato(contrato));
  } catch (err) {
    return res.status(500).json({
      error: "Error al obtener contrato",
      detalle: err.message,
    });
  }
};

/* =========================
   FIRMAR POR TOKEN
========================= */
exports.firmarPorToken = async (req, res) => {
  try {
    const token = req.params.token;

    if (!token) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "";

    const userAgent = req.headers["user-agent"] || "";

    const result = await contratosService.firmarContratoToken({
      token,
      ip,
      userAgent,
    });

    return res.json({
      ok: true,
      estado: ESTADOS_CONTRATO.FIRMADO,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Error al firmar contrato",
      detalle: err.message,
    });
  }
};

/* =========================
   FIRMAR CON PDF
========================= */
exports.firmarPorTokenArchivo = async (req, res) => {
  try {
    const token = req.params.token;

    if (!token) {
      return res.status(400).json({ error: "Token inválido" });
    }

    if (!req.file?.path) {
      return res.status(400).json({ error: "Falta PDF firmado" });
    }

    console.log("PDF firmado recibido:", req.file.filename);

    const result = await contratosService.firmarContratoTokenArchivo({
      token,
      archivoFirmado: req.file.filename,
      rutaFirmado: req.file.path,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.json({
      ok: true,
      mensaje: "Contrato firmado correctamente",
      archivo: req.file.filename,
      ruta: req.file.path,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Error al firmar contrato",
      detalle: err.message,
    });
  }
};

/* =========================
   FIRMAR GENERAL
========================= */
exports.firmar = async (req, res) => {
  try {
    const result = await contratosService.firmarContrato({
      id: req.params.id,
      token: req.params.token,
      archivoFirmado: req.file?.filename,
      rutaFirmado: req.file?.path,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   AUTO FIRMA
========================= */

exports.iniciarAutoFirma = async (req, res) => {
  try {

    const token = req.params.token;

    const data = await contratosService.prepararFirmaAutoFirma(token);

    return res.json(data);

  } catch (err) {

    console.error("Error iniciando AutoFirma:", err);

    return res.status(500).json({
      error: err.message
    });

  }
};


exports.recibirFirmaAutoFirma = async (req, res) => {

  try {

    const { token } = req.body;

    const pdf = req.file;


    if (!pdf) {

      return res.status(400).json({
        error: "No se recibió el PDF firmado"
      });

    }


    if (!token) {

      return res.status(400).json({
        error: "No se recibió el token del contrato"
      });

    }


    console.log("===== AUTOFIRMA RECIBIDA =====");
    console.log("Token:", token);
    console.log("Archivo:", pdf.filename);
    console.log("Ruta:", pdf.path);



    const resultado = await contratosService.firmarContratoAuto({

      token,

      rutaFirmado: pdf.path,

      ip:
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        req.ip,

      userAgent:
        req.headers["user-agent"] || ""

    });



    return res.json({

      ok: true,

      mensaje: "Contrato firmado correctamente",

      resultado

    });



  } catch (err) {


    console.error("💥 Error AutoFirma:", err);


    return res.status(500).json({

      error: "Error interno firmando contrato",

      detalle: err.message

    });


  }

};
/* =========================
   AUDITORÍA
========================= */
exports.obtenerAuditoria = async (req, res) => {
  try {
    const contratoId = Number(req.params.id);

    if (isNaN(contratoId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    if (!contratosService.obtenerAuditoria) {
      return res.status(501).json({ error: "Auditoría no implementada" });
    }

    const logs = await contratosService.obtenerAuditoria(contratoId);

    return res.json({ contratoId, logs });
  } catch (err) {
    return res.status(500).json({
      error: "Error al obtener auditoría",
      detalle: err.message,
    });
  }
};

/* =========================
   BORRAR CONTRATO
========================= */
exports.borrarContrato = async (req, res) => {
  try {
    const resultado = await contratosService.borrarContrato(req.params.id);
    return res.json(resultado);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};