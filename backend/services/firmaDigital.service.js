const fs = require("fs");

async function verificarFirmaPDF(pathPdf) {
  try {
    const buffer = fs.readFileSync(pathPdf);

    const texto = buffer.toString("latin1");

    const tieneFirma =
      texto.includes("/ByteRange") &&
      texto.includes("/Contents");

    return {
      valido: tieneFirma
    };
  } catch (err) {
    console.error(err);

    return {
      valido: false
    };
  }
}

module.exports = {
  verificarFirmaPDF
};