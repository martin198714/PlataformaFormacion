const express = require("express");
const router = express.Router();
const path = require("path"); 

const contratosController = require("../controllers/contratosController");
const { authMiddleware } = require("../middlewares/auth");

// =========================
// CONTRATOS
// =========================

router.get("/", authMiddleware, contratosController.listar);

router.get(
  "/empresa/:empresaId",
  authMiddleware,
  contratosController.listarPorEmpresa
);

router.get(
  "/:id",
  authMiddleware,
  contratosController.verContrato
);

router.post(
  "/crear",
  authMiddleware,
  contratosController.crear
);

/* =========================
   FIRMA NORMAL (AUTH)
========================= */
router.post(
  "/firmar/:id",
  authMiddleware,
  contratosController.firmar
);

/* =========================
   FIRMA POR TOKEN (🔥 SaaS REAL)
   👉 ESTE ES EL IMPORTANTE
========================= */
router.post(
  "/firmar/token/:token",
  contratosController.firmarPorToken
);

router.get("/firma/:token", async (req, res) => {
  const token = req.params.token;

  try {
    const contrato = await contratosController.verPorToken(token);

    if (!contrato) {
      return res.status(404).send("Contrato no encontrado");
    }

    if (contrato.ESTADO === "BLOQUEADO") {
      return res.send("Este contrato ya está firmado");
    }

    return res.sendFile(
      path.join(__dirname, "../public/firma.html")
    );

  } catch (err) {
    console.error(err);
    res.status(500).send("Error servidor");
  }
});

module.exports = router;