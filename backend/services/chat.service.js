const knowledge = require("../services/knowledge.service");
const archivoService = require("../services/archivo.service");
const capituloService = require("../services/capitulo.service");
const ai = require("../services/ai.service");

function detectarIntencion(msg) {
  msg = (msg || "").toLowerCase().trim();

  if (["hola", "buenas", "hey"].includes(msg)) return "saludo";

  if (
    msg.includes("manual") ||
    msg.includes("pdf") ||
    msg.includes("documento")
  ) {
    return "archivo";
  }

  if (/\bcurso\b|\bcursos\b|\bclase\b/.test(msg)) {
    return "curso";
  }

  if (/\bvideo\b|\bvideos\b/.test(msg)) {
    return "video";
  }

  return "ia";
}

class ChatService {
  async handleMessage(userId, message) {
    const original = (message || "").trim();
    const msg = original.toLowerCase();

    userId = Number(userId);

    if (!userId || isNaN(userId)) {
      return {
        response: "❌ Usuario no válido",
        data: [],
      };
    }

    const intent = detectarIntencion(original);

    // =====================
    // 👋 SALUDO
    // =====================
    if (intent === "saludo") {
      return {
        response: "👋 Hola, ¿cómo puedo ayudarte?",
        data: [],
      };
    }

    // =====================
    // 📚 MANUALES
    // =====================
    if (intent === "archivo") {
      const esListado = msg.includes("manuales");

      if (esListado) {
        const docs = await archivoService.buscarManuales(userId);

        return {
          response: docs.length
            ? "📚 Manuales encontrados:"
            : "📄 No se han encontrado manuales.",
          data: docs,
          source: "db",
          type: "archivo",
        };
      }

      let term = msg
        .replace(/manuales?/g, "")
        .replace(/pdf/g, "")
        .replace(/documento/g, "")
        .trim();

      const docs = term
        ? await archivoService.buscarArchivo(term, userId)
        : await archivoService.buscarManuales(userId);

      return {
        response: docs.length
          ? "📚 Resultados:"
          : "📄 No he encontrado ese manual.",
        data: docs,
        source: "db",
        type: "archivo",
      };
    }

    // =====================
    // 📚 CURSOS (REPARADO ✅)
    // =====================
    if (intent === "curso") {
      // Ahora pasamos 'userId' como segundo argumento para que la base de datos filtre por perfil
      let cursos = await knowledge.buscarCurso(original, userId);

      if (!cursos.length) {
        cursos = await knowledge.buscarCurso(msg, userId);
      }

      return {
        response: cursos.length
          ? "📚 Cursos encontrados:"
          : "📚 No se han encontrado cursos relacionados con tu perfil.",
        data: cursos,
        source: "db",
        type: "curso",
      };
    }

    // =====================
    // 🎬 VIDEOS
    // =====================
    if (intent === "video") {
      const esListado = msg.includes("videos");

      if (esListado) {
        const caps = await capituloService.buscarCapitulos("", userId);

        return {
          response: caps.length
            ? "🎬 Videos encontrados:"
            : "📄 No se han encontrado videos relacionados con tu perfil.",
          data: caps,
          source: "db",
          type: "video",
        };
      }

      let term = msg
        .replace(/videos?/g, "")
        .replace(/video/g, "")
        .replace(/play/g, "")
        .replace(/reproducir/g, "")
        .trim();

      const caps = await capituloService.buscarCapitulos(term, userId);

      return {
        response: caps.length
          ? "🎬 Resultados:"
          : "📄 No he encontrado videos.",
        data: caps,
        source: "db",
        type: "video",
      };
    }

    // =====================
    // 🤖 IA
    // =====================
    const respuesta = await ai.preguntar(original);

    return {
      response: respuesta,
      data: [],
      source: "ai",
      type: "ai",
    };
  }
}

module.exports = new ChatService();