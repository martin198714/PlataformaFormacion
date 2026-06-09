const { Ollama } = require("ollama");
const ollama = new Ollama();

// =========================
// 🌐 VERSION HELPERS
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
  return data.tag_name || data.name || "desconocida";
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
// 🧠 DETECTORES
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
    p.includes("node") ||
    p.includes("spring") ||
    p.includes("php") ||
    p.includes("kotlin") ||
    p.includes("android") ||
    p.includes("java")
  );
}

function isDefinitionQuery(prompt) {
  const p = prompt.toLowerCase();

  return (
    p.includes("qué es") ||
    p.includes("que es") ||
    p.includes("what is") ||
    p.startsWith("defin") ||
    p.includes("explica") ||
    p.includes("explicame")
  );
}

// =========================
// 📖 KNOWLEDGE BASE
// =========================

const definitions = {
  java: "Java es un lenguaje de programación orientado a objetos, muy usado en backend, sistemas empresariales y Android.",
  angular: "Angular es un framework frontend basado en TypeScript creado por Google.",
  react: "React es una librería de JavaScript para construir interfaces de usuario basada en componentes.",
  node: "Node.js es un entorno de ejecución de JavaScript en el servidor.",
  php: "PHP es un lenguaje backend muy usado en desarrollo web.",
  spring: "Spring Boot es un framework de Java para crear aplicaciones backend.",
  kotlin: "Kotlin es un lenguaje moderno muy usado en Android.",
  android: "Android es un sistema operativo móvil basado en Linux desarrollado por Google.",
  javascript: "JavaScript es el lenguaje principal del desarrollo web moderno.",
  powerbi: "Power BI es una herramienta de Microsoft para análisis y visualización de datos."
};

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
  // 💾 CACHE
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
  // 🤖 OLLAMA CALL
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
  // 🔢 VERSION ROUTER
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

    if (p.includes("php")) {
      return `PHP: ${await getPhpVersion()}`;
    }

    if (p.includes("kotlin")) {
      return `Kotlin (GitHub): ${await getGithubLatest("JetBrains/kotlin")}`;
    }

    if (p.includes("android")) {
      return `Android: ver https://developer.android.com/studio/releases`;
    }

    if (p.includes("java")) {
      return `Java: versiones LTS recomendadas 17 / 21`;
    }

    return "No se pudo determinar versión.";
  }

  // =========================
  // 📖 DEFINITIONS
  // =========================

  async handleDefinitionQuery(prompt) {
    const p = prompt.toLowerCase();

    for (const key of Object.keys(definitions)) {
      if (p.includes(key)) {
        return definitions[key];
      }
    }

    const res = await ollama.chat({
      model: "llama3",
      messages: [
        {
          role: "system",
          content: "Explica de forma clara, sencilla y corta qué es lo que el usuario pregunta."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    return res.message.content;
  }

  // =========================
  // 🚀 MAIN ENTRY
  // =========================

  async preguntar(prompt, contexto = "") {
    const cacheKey = this.getCacheKey(prompt, contexto);

    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    // 🔢 VERSIONES
    if (isVersionQuery(prompt)) {
      const result = await this.handleVersionQuery(prompt);
      this.setCache(cacheKey, result);
      return result;
    }

    // 📖 DEFINICIONES
    if (isDefinitionQuery(prompt)) {
      const result = await this.handleDefinitionQuery(prompt);
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
  // 🧠 BACKGROUND IMPROVEMENT
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

      } catch (e) {}
    });
  }

  // =========================
  // ⚡ STREAMING
  // =========================

  async streamPregunta(prompt, contexto = "", onToken) {
    let modelUsed = this.models[0];

    const stream = await ollama.chat({
      model: modelUsed,
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