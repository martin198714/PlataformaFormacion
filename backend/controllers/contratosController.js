const contratosService = require("../services/contratos.service");
const { ESTADOS_CONTRATO } = require("../utils/estadosContrato");

function safe(v) {
  return v ?? "";
}

function normalize(c) {
  if (!c) return null;
  return {
    ...c,
    EMPRESA_ID: safe(c.EMPRESA_ID),
    PERFIL_NOMBRE: safe(c.PERFIL_NOMBRE),
    ESTADO: safe(c.ESTADO),
    FICHERO_NOMBRE: safe(c.FICHERO_NOMBRE),
  };
}

exports.listar = async (req, res) => {
  const data = await contratosService.listarPorUsuario(req.user.id);
  res.json(data.map(normalize));
};

exports.crear = async (req, res) => {
  const result = await contratosService.crearContrato(
    req.body.empresaId,
    req.body.perfilId,
    req.user.id
  );

  res.json({ ok: true, ...result });
};

exports.verContrato = async (req, res) => {
  const data = await contratosService.verContrato(req.params.id);
  res.json(normalize(data));
};

exports.verContratoPorToken = async (req, res) => {
  const data = await contratosService.obtenerPorToken(req.params.token);
  res.json(normalize(data));
};

exports.firmarPorToken = async (req, res) => {
  const result = await contratosService.firmarContratoToken({
    token: req.params.token,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.json(result);
};

exports.firmarPorTokenArchivo = async (req, res) => {
  const result = await contratosService.firmarContratoTokenArchivo({
    token: req.params.token,
    archivoFirmado: req.file.filename,
    rutaFirmado: req.file.path,
  });

  res.json(result);
};