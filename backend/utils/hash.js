const crypto = require("crypto");

/* =========================
   GENERAR HASH ESTABLE SHA256
========================= */
function generarHash(data) {

  if (!data || typeof data !== "object") {
    throw new Error("Datos inválidos para generar hash");
  }

  // 🔒 normalizar JSON (orden estable de claves)
  const normalized = JSON.stringify(
    Object.keys(data)
      .sort()
      .reduce((acc, key) => {
        acc[key] = data[key];
        return acc;
      }, {})
  );

  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex");
}

module.exports = { generarHash };