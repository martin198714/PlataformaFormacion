const { Ollama } = require("ollama");
const ollama = new Ollama();

class AIService {

  constructor() {
    this.cache = new Map();

    // 🧠 orden de modelos (rápido → inteligente)
    this.models = ["phi3", "mistral", "llama3"];
  }

  // =========================
  // ⚡ CACHE INTELIGENTE
  // =========================
  getCacheKey(prompt, contexto) {
    return `${prompt.trim().toLowerCase()}::${contexto?.trim().toLowerCase() || ""}`;
  }

  // =========================
  // 🚀 MODELO CON FALLBACK
  // =========================
  async askModel(model, prompt, contexto) {
    return ollama.chat({
      model,
      options: {
        temperature: 0.3,
        num_predict: 1000 // 🔥 rápido
      },
      messages: [
        {
          role: "system",
          content: "Responde claro, directo y en pocas líneas."
        },
        {
          role: "user",
          content: contexto
            ? `CONTEXTO:\n${contexto}\n\n${prompt}`
            : prompt
        }
      ]
    });
  }

  // =========================
  // ⚡ TURBO PRINCIPAL
  // =========================
  async preguntar(prompt, contexto = "") {

    const cacheKey = this.getCacheKey(prompt, contexto);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let lastError = null;

    // 🔁 fallback automático de modelos
    for (const model of this.models) {
      try {
        const res = await this.askModel(model, prompt, contexto);
        const text = res.message.content;

        this.cache.set(cacheKey, text);

        // 🧊 mejora en background (NO bloquea)
        this.mejorarEnBackground(prompt, text);

        return text;

      } catch (err) {
        lastError = err;
      }
    }

    return "⚠️ No se pudo generar respuesta en este momento.";
  }

  // =========================
  // 🧊 MEJORA EN BACKGROUND
  // =========================
  async mejorarEnBackground(prompt, respuestaRapida) {

    try {
      // 🔥 NO bloquea usuario
      setImmediate(async () => {

        try {
          const res = await ollama.chat({
            model: "llama3",
            options: {
              temperature: 0.4,
              num_predict: 500
            },
            messages: [
              {
                role: "system",
                content: `
Amplía la respuesta SOLO si aporta valor.
Añade ejemplos si hace falta.
No repitas.
`
              },
              {
                role: "user",
                content: respuestaRapida
              }
            ]
          });

          this.cache.set(prompt, res.message.content);

        } catch (e) {
          // silencioso
        }

      });

    } catch (e) {}
  }

  // =========================
  // ⚡ STREAMING (CHATGPT STYLE)
  // =========================
  async streamPregunta(prompt, contexto = "", onToken) {

    let modelUsed = null;

    for (const model of this.models) {
      try {
        modelUsed = model;
        break;
      } catch {}
    }

    const stream = await ollama.chat({
      model: modelUsed || "phi3",
      stream: true,
      options: {
        temperature: 0.3,
        num_predict: 300
      },
      messages: [
        {
          role: "system",
          content: "Responde claro y breve."
        },
        {
          role: "user",
          content: contexto
            ? `CONTEXTO:\n${contexto}\n\n${prompt}`
            : prompt
        }
      ]
    });

    let full = "";

    for await (const part of stream) {
      const token = part.message?.content || "";
      full += token;
      if (onToken) onToken(token);
    }

    const cacheKey = this.getCacheKey(prompt, contexto);
    this.cache.set(cacheKey, full);

    return full;
  }
}

module.exports = new AIService();