const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

/* =========================
   GENERAR PDF CONTRATO
========================= */
async function generarPDFContrato({
  contratoId,
  empresaNombre,
  perfiles,
  hash
}) {
  try {

    if (
      !contratoId ||
      !empresaNombre ||
      !Array.isArray(perfiles) ||
      perfiles.length === 0
    ) {
      console.log({
        contratoId,
        empresaNombre,
        perfiles,
        hash
      });

      throw new Error("Datos insuficientes para generar PDF");
    }

    const pdfDoc = await PDFDocument.create();

    const page = pdfDoc.addPage([600, 800]);

    const font = await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

    page.drawText(
      "CONTRATO DE SERVICIO",
      {
        x: 50,
        y: 750,
        size: 20,
        font
      }
    );

    page.drawText(
      `Contrato ID: ${contratoId}`,
      {
        x: 50,
        y: 700,
        size: 12,
        font
      }
    );

    page.drawText(
      `Empresa: ${empresaNombre}`,
      {
        x: 50,
        y: 680,
        size: 12,
        font
      }
    );

    page.drawText(
      `Perfiles: ${perfiles.join(", ")}`,
      {
        x: 50,
        y: 660,
        size: 12,
        font
      }
    );

    page.drawText(
      `HASH: ${hash}`,
      {
        x: 50,
        y: 620,
        size: 10,
        font
      }
    );

    const pdfBytes = await pdfDoc.save();

    const dir = path.join(
      __dirname,
      "../uploads/contratos"
    );

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true
      });
    }

    const fileName = `contrato_${contratoId}.pdf`;

    const filePath = path.join(
      dir,
      fileName
    );

    fs.writeFileSync(
      filePath,
      pdfBytes
    );

    return {
      fileName,
      filePath
    };

  } catch (err) {

    console.error(
      "ERROR PDF:",
      err.message
    );

    throw err;
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

/* =========================
   VALIDAR PDF FIRMADO
========================= */
async function verificarPDFFirmado(pdfPath) {
  try {
    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF no encontrado");
    }

    const buffer = fs.readFileSync(pdfPath);

    const contenido = buffer.toString("latin1");

    const tieneByteRange =
      contenido.includes("/ByteRange");

    const tieneContents =
      contenido.includes("/Contents");

    const tieneAdobe =
      contenido.includes("Adobe.PPKLite");

    const tieneETSI =
      contenido.includes("ETSI.CAdES");

    return {
      valido:
        tieneByteRange &&
        tieneContents,

      detalles: {
        tieneByteRange,
        tieneContents,
        tieneAdobe,
        tieneETSI,
      },
    };

  } catch (err) {

    console.error(
      "ERROR VALIDANDO PDF:",
      err.message
    );

    return {
      valido: false,
      detalles: null,
    };
  }
}

module.exports = {
  generarPDFContrato,
  aplicarFirmaPDF,
  verificarPDFFirmado
};