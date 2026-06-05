const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/* =========================
   GENERAR PDF CONTRATO
========================= */
async function generarPDFContrato({ contratoId, empresaId, perfilId, hash }) {
  try {
    if (!contratoId || !empresaId || !perfilId) {
      throw new Error("Datos insuficientes para generar PDF");
    }

    /* =========================
       CREAR DOCUMENTO PDF
    ========================= */
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    /* =========================
       CONTENIDO DOCUMENTO
    ========================= */
    page.drawText("CONTRATO DE SERVICIO", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Contrato ID: ${contratoId}`, {
      x: 50,
      y: 700,
      size: 12,
      font,
    });

    page.drawText(`Empresa ID: ${empresaId}`, {
      x: 50,
      y: 680,
      size: 12,
      font,
    });

    page.drawText(`Perfil ID: ${perfilId}`, {
      x: 50,
      y: 660,
      size: 12,
      font,
    });

    page.drawText(`HASH: ${hash}`, {
      x: 50,
      y: 620,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Documento generado automáticamente`, {
      x: 50,
      y: 580,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    /* =========================
       GENERAR BUFFER PDF
    ========================= */
    const pdfBytes = await pdfDoc.save();

    /* =========================
       CARPETA SEGURA
    ========================= */
    const dir = path.join(__dirname, "../uploads/contratos");

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    /* =========================
       GUARDAR ARCHIVO
    ========================= */
    const fileName = `contrato_${contratoId}.pdf`;
    const filePath = path.join(dir, fileName);

    fs.writeFileSync(filePath, pdfBytes);

    return {
      fileName,
      filePath
    };

  } catch (err) {
    console.error("ERROR PDF:", err.message);
    throw new Error("Error generando PDF de contrato");
  }
}

module.exports = { generarPDFContrato };