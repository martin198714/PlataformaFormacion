const { Ollama } = require("ollama");
const ollama = new Ollama();

// =========================
// 🌐 HELPERS VERSIONES REALES
// =========================

async function getNpmVersion(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  const data = await res.json();
  return data.version;
}

async function getMavenLatest(groupId, artifactId) {
  const url = `https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`;
  const res = await fetch(url);
  const data = await res.json();
  return data.response.docs?.[0]?.latestVersion || "desconocida";
}

async function getGithubLatest(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
  const data = await res.json();
  return data.tag_name || data.name;
}

async function getPhpVersion() {
  try {
    const res = await fetch("https://www.php.net/releases/index.php");
    const html = await res.text();
    const match = html.match(/PHP\s+(\d+\.\d+\.\d+)/);
    return match ? match[1] : "desconocida";
  } catch {
    return "desconocida";
  }
}

// =========================
// 🧠 DETECTOR DE VERSIONES
// =========================

function isVersionQuery(prompt) {
  const p = prompt.toLowerCase();

  return (
    p.includes("versión") ||
    p.includes("version") ||
    p.includes("latest") ||
    p.includes("última") ||
    p.includes("actual") ||
    p.includes("angular") ||
    p.includes("react") ||
    p.includes("java") ||
    p.includes("spring") ||
    p.includes("php") ||
    p.includes("kotlin") ||
    p.includes("android") ||
    p.includes("javascript") ||
    p.includes("node")
  );
}

// =========================
// ⚡ AI SERVICE
// =========================

class AIService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 1000 * 60 * 60; // 1 hora

    this.models = ["phi3", "mistral", "llama3"];
  }

  // =========================
  // 🧊 CACHE CON TTL
  // =========================
  getCacheKey(prompt, contexto) {
    return `${prompt.trim().toLowerCase()}::${contexto?.trim().toLowerCase() || ""}`;
  }

  getCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.time > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  setCache(key, value) {
    this.cache.set(key, {
      value,
      time: Date.now()
    });
  }

  // =========================
  // 🚀 MODELO
  // =========================
  async askModel(model, prompt, contexto) {
    return ollama.chat({
      model,
      options: {
        temperature: 0.3,
        num_predict: 800
      },
      messages: [
        {
          role: "system",
          content: "Responde claro, directo y breve."
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
  // 🌐 VERSION ROUTER REAL
  // =========================
  async handleVersionQuery(prompt) {
    const p = prompt.toLowerCase();

    if (p.includes("angular")) {
      return `Angular (npm): ${await getNpmVersion("@angular/core")}`;
    }

    if (p.includes("react")) {
      return `React (npm): ${await getNpmVersion("react")}`;
    }

    if (p.includes("node")) {
      return `Node.js (npm): ${await getNpmVersion("node")}`;
    }

    if (p.includes("spring")) {
      return `Spring Boot (Maven): ${await getMavenLatest("org.springframework.boot", "spring-boot")}`;
    }

    if (p.includes("java")) {
      return `Java: versión depende del JDK (recomendado LTS: 21 / 17).`;
    }

    if (p.includes("php")) {
      return `PHP: ${await getPhpVersion()}`;
    }

    if (p.includes("kotlin")) {
      return `Kotlin (GitHub): ${await getGithubLatest("JetBrains/kotlin")}`;
    }

    if (p.includes("android")) {
      return `Android Studio: ver https://developer.android.com/studio/releases`;
    }

    return "No se pudo determinar versión.";
  }

  // =========================
  // ⚡ TURBO PRINCIPAL
  // =========================
  async preguntar(prompt, contexto = "") {

    const cacheKey = this.getCacheKey(prompt, contexto);

    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    // 🔥 VERSIONES REALES
    if (isVersionQuery(prompt)) {
      const result = await this.handleVersionQuery(prompt);
      this.setCache(cacheKey, result);
      return result;
    }

    // 🤖 IA NORMAL
    let lastError = null;

    for (const model of this.models) {
      try {
        const res = await this.askModel(model, prompt, contexto);
        const text = res.message.content;

        this.setCache(cacheKey, text);

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
    setImmediate(async () => {
      try {
        const res = await ollama.chat({
          model: "llama3",
          options: {
            temperature: 0.4,
            num_predict: 400
          },
          messages: [
            {
              role: "system",
              content: "Amplía solo si aporta valor, sin repetir."
            },
            {
              role: "user",
              content: respuestaRapida
            }
          ]
        });

        const cacheKey = this.getCacheKey(prompt, "");
        this.setCache(cacheKey, res.message.content);

      } catch (e) {
        // silencioso
      }
    });
  }

  // =========================
  // ⚡ STREAMING
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

    this.setCache(this.getCacheKey(prompt, contexto), full);

    return full;
  }
}

module.exports = new AIService();