const contratosService = require("../services/contratos.service");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");


/* =========================
   LISTAR MIS CONTRATOS
========================= */
exports.listar = async (req, res) => {
  try {
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const datos = await contratosService.listarPorUsuario(usuarioId);

    res.json(datos);
  } catch (error) {
    res.status(500).json({
      error: "Error al listar contratos",
      detalle: error.message,
    });
  }
};


/* =========================
   LISTAR POR EMPRESA
========================= */
exports.listarPorEmpresa = async (req, res) => {
  try {
    const empresaId = Number(req.params.empresaId);

    if (!empresaId || isNaN(empresaId)) {
      return res.status(400).json({ error: "Empresa inválida" });
    }

    const datos = await contratosService.listarPorEmpresa(empresaId);

    res.json(datos);
  } catch (err) {
    res.status(500).json({
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

    if (!empresaId || isNaN(empresaId)) {
      return res.status(400).json({ error: "empresaId inválido" });
    }

    if (!perfilId || isNaN(perfilId)) {
      return res.status(400).json({ error: "perfilId inválido" });
    }

    const result = await contratosService.crearContrato(
      empresaId,
      perfilId,
      usuarioId
    );

    res.json({
      ok: true,
      contrato: result
    });

  } catch (err) {
    res.status(500).json({
      error: "Error al crear contrato",
      detalle: err.message,
    });
  }
};


/* =========================
   FIRMAR CONTRATO (FLUJO SaaS REAL)
========================= */
exports.firmar = async (req, res) => {
  try {
    const contratoId = Number(req.params.id);
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (!contratoId || isNaN(contratoId)) {
      return res.status(400).json({ error: "Contrato inválido" });
    }

    const archivoFirmado = req.file;

    if (!archivoFirmado) {
      return res.status(400).json({ error: "Falta PDF firmado" });
    }

    const result = await contratosService.marcarFirmado(
      contratoId,
      archivoFirmado,
      usuarioId
    );

    res.json({
      ok: true,
      estado: ESTADOS_CONTRATO.BLOQUEADO,
      result
    });

  } catch (err) {
    res.status(500).json({
      error: "Error al firmar contrato",
      detalle: err.message,
    });
  }
};

exports.firmarPorToken = async (req, res) => {
  try {
    const token = req.params.token;
    const usuarioId = req.user?.id || null;

    const ip =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress;

    const userAgent = req.headers["user-agent"];

    if (!token) {
      return res.status(400).json({ error: "Token inválido" });
    }

    const result = await contratosService.firmarContratoToken({
      token,
      usuarioId,
      ip,
      userAgent
    });

    res.json({
      ok: true,
      estado: "BLOQUEADO",
      result
    });

  } catch (err) {
    res.status(500).json({
      error: "Error en firma por token",
      detalle: err.message,
    });
  }
};

/* =========================
   VER CONTRATO
========================= */
exports.verContrato = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const contrato = await contratosService.verContrato(id);

    if (!contrato) {
      return res.status(404).json({ error: "Contrato no encontrado" });
    }

    res.json({
      ...contrato,
      estado_definido: ESTADOS_CONTRATO[contrato.ESTADO] || contrato.ESTADO
    });

  } catch (err) {
    res.status(500).json({
      error: "Error al obtener contrato",
      detalle: err.message,
    });
  }
};


/* =========================
   🔥 NUEVO: OBTENER AUDITORÍA
   (te faltaba en el controlador)
========================= */
exports.obtenerAuditoria = async (req, res) => {
  try {
    const contratoId = Number(req.params.id);

    if (!contratoId || isNaN(contratoId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const logs = await contratosService.obtenerAuditoria(contratoId);

    res.json({
      contratoId,
      logs
    });

  } catch (err) {
    res.status(500).json({
      error: "Error al obtener auditoría",
      detalle: err.message,
    });
  }
};