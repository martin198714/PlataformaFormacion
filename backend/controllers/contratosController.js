const contratosService = require("../services/contratos.service");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");

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
    const perfilId = Number(req.body.perfilId);
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (isNaN(empresaId) || isNaN(perfilId)) {
      return res.status(400).json({ error: "IDs inválidos" });
    }

    const result = await contratosService.crearContrato(
      empresaId,
      perfilId,
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
   VER CONTRATO POR ID (SAFE FALLBACK)
========================= */
exports.verContrato = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const contrato =
      contratosService.obtenerPorId
        ? await contratosService.obtenerPorId(id)
        : contratosService.obtenerPorToken
          ? await contratosService.obtenerPorToken(id)
          : null;

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
   FIRMAR POR TOKEN (IP + USER AGENT)
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
      return res.status(400).json({
        error: "Falta PDF firmado",
      });
    }

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
   AUDITORÍA (SAFE)
========================= */
exports.obtenerAuditoria = async (req, res) => {
  try {
    const contratoId = Number(req.params.id);

    if (isNaN(contratoId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    if (!contratosService.obtenerAuditoria) {
      return res.status(501).json({
        error: "Auditoría no implementada",
      });
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