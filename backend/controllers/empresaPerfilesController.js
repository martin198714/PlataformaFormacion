const auto = require("../services/automatizadorContratos");
const db = require("../models/db");

function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  return [];
}

/* =========================
   ASIGNAR PERFIL + CONTRATO
========================= */
exports.asignarPerfil = async (req, res) => {
  try {
    const empresaId = Number(req.body.empresaId);
    const perfilId = Number(req.body.perfilId);
    const creadoPor = req.user?.id;

    if (!creadoPor) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (!empresaId || isNaN(empresaId)) {
      return res.status(400).json({ error: "empresaId inválido" });
    }

    if (!perfilId || isNaN(perfilId)) {
      return res.status(400).json({ error: "perfilId inválido" });
    }

    /* =========================
       FIX DUPLICADOS (SEGURÍSIMO)
    ========================= */
    const existeRaw = await db.query(
      `SELECT 1
       FROM EMPRESA_PERFILES
       WHERE EMPRESA_ID = ? AND PERFIL_ID = ?
       ROWS 1`,
      [empresaId, perfilId]
    );

    const existe = toArray(existeRaw);

    if (Array.isArray(existe) && existe.length > 0) {
      return res.status(409).json({
        error: "La empresa ya tiene este perfil asignado",
      });
    }

    await db.query(
      `INSERT INTO EMPRESA_PERFILES (EMPRESA_ID, PERFIL_ID)
       VALUES (?, ?)`,
      [empresaId, perfilId]
    );

    const contrato = await auto.generarContratoAutomatico(
      empresaId,
      [perfilId], // 🔥 IMPORTANTE: SIEMPRE ARRAY
      creadoPor
    );

    if (!contrato) {
      throw new Error("No se pudo generar contrato");
    }

    return res.json({
      ok: true,
      mensaje: "Perfil asignado y contrato generado",
      contrato,
    });

  } catch (err) {
    console.error("ERROR ASIGNAR PERFIL:", err);

    return res.status(500).json({
      error: "Error interno",
      detalle: err.message,
    });
  }
};