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

/* =========================
   APLICAR FIRMA AL PDF
========================= */
async function aplicarFirmaPDF({
  pdfPath,
  contratoId,
  usuarioId,
  hash,
  ip
}) {
  try {

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF no encontrado");
    }

    const pdfBytes = fs.readFileSync(pdfPath);

    const pdfDoc = await PDFDocument.load(pdfBytes);

    const page = pdfDoc.getPages()[0];

    const font = await pdfDoc.embedFont(
      StandardFonts.HelveticaBold
    );

    const fechaFirma = new Date().toLocaleString("es-ES");

    page.drawText("DOCUMENTO FIRMADO ELECTRÓNICAMENTE", {
      x: 50,
      y: 250,
      size: 14,
      font,
      color: rgb(0, 0.5, 0)
    });

    page.drawText(`Contrato: ${contratoId}`, {
      x: 50,
      y: 225,
      size: 10,
      font
    });

    page.drawText(`Usuario firma: ${usuarioId}`, {
      x: 50,
      y: 210,
      size: 10,
      font
    });

    page.drawText(`Fecha firma: ${fechaFirma}`, {
      x: 50,
      y: 195,
      size: 10,
      font
    });

    page.drawText(`IP: ${ip}`, {
      x: 50,
      y: 180,
      size: 10,
      font
    });

    page.drawText(`HASH: ${hash}`, {
      x: 50,
      y: 165,
      size: 8,
      font
    });

    const firmadoBytes = await pdfDoc.save();

    const firmadoPath = pdfPath.replace(
      ".pdf",
      "_firmado.pdf"
    );

    fs.writeFileSync(
      firmadoPath,
      firmadoBytes
    );

    return {
      ok: true,
      firmadoPath,
      firmadoNombre: path.basename(firmadoPath)
    };

  } catch (err) {

    console.error(
      "ERROR FIRMA PDF:",
      err.message
    );

    throw err;
  }
}

module.exports = {
  generarPDFContrato,
  aplicarFirmaPDF
};