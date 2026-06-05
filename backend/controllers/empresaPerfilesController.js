const auto = require("../services/automatizadorContratos");
const db = require("../models/db");

/* =========================
   ASIGNAR PERFIL + GENERAR CONTRATO
========================= */
exports.asignarPerfil = async (req, res) => {
  try {
    const empresaId = Number(req.body.empresaId);
    const perfilId = Number(req.body.perfilId);
    const creadoPor = req.user?.id;

    /* =========================
       VALIDACIONES
    ========================= */
    if (!creadoPor) {
      return res.status(401).json({
        error: "No autenticado"
      });
    }

    if (!empresaId || isNaN(empresaId)) {
      return res.status(400).json({
        error: "empresaId inválido"
      });
    }

    if (!perfilId || isNaN(perfilId)) {
      return res.status(400).json({
        error: "perfilId inválido"
      });
    }

    /* =========================
       EVITAR DUPLICADOS
    ========================= */
    const existe = await db.query(
      `
      SELECT FIRST 1 1
      FROM EMPRESA_PERFILES
      WHERE EMPRESA_ID = ? AND PERFIL_ID = ?
      `,
      [empresaId, perfilId]
    );

    if (existe?.length > 0) {
      return res.status(409).json({
        error: "La empresa ya tiene este perfil asignado"
      });
    }

    /* =========================
       INSERT RELACIÓN
    ========================= */
    await db.query(
      `
      INSERT INTO EMPRESA_PERFILES (EMPRESA_ID, PERFIL_ID)
      VALUES (?, ?)
      `,
      [empresaId, perfilId]
    );

    /* =========================
       GENERAR CONTRATO AUTOMÁTICO
    ========================= */
    const contrato = await auto.generarContratoAutomatico(
      empresaId,
      perfilId,
      creadoPor
    );

    if (!contrato?.contratoId) {
      throw new Error("Error al generar contrato automático");
    }

    /* =========================
       RESPUESTA FINAL
    ========================= */
    return res.status(200).json({
      ok: true,
      mensaje: "Perfil asignado y contrato generado correctamente",
      contrato
    });

  } catch (err) {
    console.error("ERROR ASIGNAR PERFIL:", err);

    return res.status(500).json({
      error: "Error interno al asignar perfil",
      detalle: err.message
    });
  }
};