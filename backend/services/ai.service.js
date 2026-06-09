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
// 🧠 DETECTORES (ARREGLADOS)
// =========================

function isDefinitionQuery(prompt) {
  const p = prompt.toLowerCase();

  return (
    p.includes("qué es") ||
    p.includes("que es") ||
    p.includes("what is") ||
    p.startsWith("defin") ||
    p.includes("explica") ||
    p.includes("explicame") ||
    p.includes("dime qué es")
  );
}

// SOLO versión real (SIN keywords peligrosas como "java")
function isVersionQuery(prompt) {
  const p = prompt.toLowerCase();

  const versionKeywords = [
    "versión",
    "version",
    "última versión",
    "ultima version",
    "latest version",
    "actual version"
  ];

  return versionKeywords.some(k => p.includes(k));
}

// 🔥 híbrido: definición + versión en una sola pregunta
function isHybridQuery(prompt) {
  const p = prompt.toLowerCase();

  const hasDefinition =
    p.includes("qué es") ||
    p.includes("que es") ||
    p.includes("what is");

  const hasVersion =
    p.includes("versión") ||
    p.includes("version") ||
    p.includes("última");

  return hasDefinition && hasVersion;
}

// =========================
// 📖 KNOWLEDGE BASE
// =========================

const definitions = {
  java: `Java es un lenguaje de programación de alto nivel y una plataforma de desarrollo muy utilizada para crear aplicaciones de todo tipo: programas de escritorio, aplicaciones web, sistemas empresariales, videojuegos y aplicaciones para Android.

Características principales:

- Orientado a objetos: organiza el código en clases y objetos.
- Multiplataforma: el mismo programa puede ejecutarse en diferentes sistemas operativos gracias a la Java Virtual Machine (JVM).
- Seguro y robusto: incluye mecanismos para manejar errores y proteger la ejecución.
- Muy popular: se utiliza ampliamente en empresas y grandes sistemas.

Ejemplo básico en Java:

public class HolaMundo {
    public static void main(String[] args) {
        System.out.println("¡Hola, mundo!");
    }
}

Al ejecutar este programa, la salida será:

¡Hola, mundo!

Java fue creado por James Gosling en Sun Microsystems en 1995 y actualmente es mantenido por Oracle.

Si estás empezando a programar, Java es una buena opción porque tiene mucha documentación, una gran comunidad y se usa ampliamente en el mercado laboral.`,

  angular: `Angular es un framework de desarrollo frontend basado en TypeScript, creado y mantenido por Google, que se utiliza para construir aplicaciones web de una sola página (SPA) y aplicaciones web modernas y escalables.

Su objetivo principal es facilitar el desarrollo de interfaces complejas mediante una arquitectura basada en componentes, donde cada parte de la interfaz se divide en piezas reutilizables. Esto hace que el código sea más organizado, mantenible y escalable.

Angular incluye de forma integrada muchas funcionalidades que en otros entornos suelen añadirse por separado, como:

- Enrutamiento (navegación entre vistas sin recargar la página)
- Gestión de formularios
- Comunicación HTTP con APIs
- Inyección de dependencias
- Herramientas de testing

Además, utiliza TypeScript, lo que aporta tipado estático a JavaScript y ayuda a detectar errores antes de ejecutar el código.

En resumen: Angular es una solución completa y estructurada para desarrollar aplicaciones web grandes, especialmente en entornos empresariales.`,

  react: `React es una biblioteca de JavaScript usada para crear interfaces de usuario (UI), especialmente en aplicaciones web modernas.

En otras palabras, sirve para construir páginas web que sean rápidas, dinámicas e interactivas, como redes sociales, paneles de control o aplicaciones tipo Netflix o Instagram.

¿Qué hace especial a React?

🧩 Basado en componentes: divides la interfaz en piezas reutilizables (botones, menús, tarjetas…).
⚡ Muy rápido: actualiza solo las partes de la página que cambian, sin recargar todo.
🌐 Orientado a la web moderna: se usa mucho en aplicaciones tipo SPA (Single Page Applications).
📱 Multiplataforma: con React Native puedes crear apps móviles para Android e iOS.

Ejemplo sencillo:

function Hola() {
  return <h1>Hola, mundo</h1>;
}

¿Quién lo creó?

React fue desarrollado por Meta y se lanzó en 2013. Hoy en día tiene una comunidad enorme y es una de las herramientas más usadas en desarrollo frontend.

Resumen rápido:

React es una herramienta para construir la “parte visual” de las páginas web de forma más ordenada, reutilizable y eficiente.`,
   node: `Node (normalmente llamado Node.js) es un entorno de ejecución de JavaScript fuera del navegador.

Dicho de forma sencilla: permite ejecutar JavaScript en el servidor, no solo en páginas web.

🧠 ¿Qué significa esto?

Antes, JavaScript solo funcionaba en el navegador (Chrome, Firefox…).
Con Node.js, puedes usarlo para:

- Crear servidores web
- Hacer APIs (backend)
- Gestionar bases de datos
- Crear herramientas de consola
- Construir aplicaciones completas (frontend + backend)

⚙️ Ejemplo muy básico:

console.log("Hola desde Node.js");

Esto se ejecuta en la terminal, no en el navegador.

🚀 ¿Por qué es importante?

Node permite usar JavaScript en todo el desarrollo web, lo que facilita crear aplicaciones completas sin cambiar de lenguaje.

🧱 ¿Cómo funciona?

Node.js se basa en el motor V8 de Google Chrome (el que ejecuta JavaScript en el navegador) y lo lleva al servidor.

🏗️ ¿Quién lo creó?

Node.js fue creado por Ryan Dahl en 2009.
Hoy es mantenido por la OpenJS Foundation.

🌍 Relación con otras tecnologías:

- JavaScript → lenguaje
- Node.js → entorno para ejecutarlo en servidor
- React → biblioteca para interfaces (frontend)

🧩 Resumen rápido:

Node.js es lo que te permite usar JavaScript para crear la parte “invisible” de las webs (el backend), como servidores y APIs.`,
  php: `PHP es un lenguaje de programación del lado del servidor muy usado para crear páginas web dinámicas.

En pocas palabras: PHP es lo que permite que una web “piense” y genere contenido en tiempo real antes de mostrártelo en el navegador.

🌐 ¿Qué significa “del lado del servidor”?

Significa que el código PHP se ejecuta en el servidor web, no en tu navegador.
El servidor procesa el código y envía al usuario el resultado en HTML.

⚙️ ¿Para qué se usa PHP?

- Crear páginas web dinámicas (blogs, tiendas online…)
- Gestionar bases de datos (MySQL, MariaDB…)
- Sistemas de usuarios (login, registro)
- CMS como WordPress
- APIs y servicios web

🧠 Ejemplo básico:

<?php
echo "Hola, mundo";
?>

Esto mostrará en la web:

Hola, mundo

🏗️ ¿Quién lo creó?

PHP fue creado por Rasmus Lerdorf en 1994.

🌍 ¿Dónde se usa hoy?

Aunque no es tan “moderno” como Node.js o frameworks actuales, sigue siendo muy importante gracias a:

- WordPress
- Muchas páginas web tradicionales
- Hosting barato y fácil de usar

🔄 PHP vs otras tecnologías:

- PHP → clásico, muy usado en hosting web tradicional
- Node.js → JavaScript en servidor, más moderno y flexible
- React → solo frontend (interfaz visual)

🧩 Resumen rápido:

PHP es un lenguaje que se usa en servidores para generar páginas web dinámicas y conectar la web con bases de datos.`,
  spring: `Spring Boot es un framework de Java que se utiliza para crear aplicaciones web y APIs de forma rápida y sencilla.

Dicho de forma simple: es una herramienta que te evita configurar todo manualmente cuando quieres hacer una aplicación en Java.

🚀 ¿Para qué sirve?

Spring Boot se usa principalmente para:

- Crear APIs REST
- Desarrollar aplicaciones web backend
- Construir sistemas empresariales
- Conectar con bases de datos
- Crear microservicios (aplicaciones pequeñas que trabajan juntas)

🧠 ¿Qué lo hace especial?

Antes, con Java “normal”, había que configurar muchas cosas manualmente.
Spring Boot simplifica este proceso:

⚡ Arranca proyectos muy rápido
🧩 Tiene configuración automática (auto-configuration)
📦 Incluye servidor integrado (no necesitas instalar Tomcat aparte)
🔧 Reduce mucho el código de configuración

🏗️ Ejemplo simple:

@RestController
public class HolaController {

    @GetMapping("/hola")
    public String saludar() {
        return "Hola desde Spring Boot";
    }
}

Esto crea una API que responde cuando entras a /hola.

🌱 ¿De dónde viene?

Spring Boot forma parte del ecosistema Spring Framework.
Fue creado y es mantenido por la comunidad Spring y la empresa VMware.

🔄 Spring Boot en el mundo real:

Se usa mucho en empresas porque:

- Es estable y seguro
- Funciona muy bien en sistemas grandes
- Es ideal para microservicios
- Se integra fácilmente con bases de datos y servicios en la nube

🧩 Resumen rápido:

Spring Boot es una herramienta que hace que desarrollar aplicaciones en Java sea más rápido, organizado y fácil, especialmente para el backend.`,
  kotlin: `Kotlin es un lenguaje de programación moderno que se ejecuta sobre la máquina virtual de Java (JVM) y se usa mucho para crear aplicaciones, especialmente en Android.

Dicho de forma simple: Kotlin es como una versión más moderna, limpia y segura de Java.

📱 ¿Para qué se usa Kotlin?

- Desarrollo de apps Android (el uso más común)
- Backend (servidores con frameworks como Spring)
- Aplicaciones web
- Apps multiplataforma (Android + iOS + escritorio)

🧠 ¿Qué lo hace especial?

✨ Más simple que Java: menos código para hacer lo mismo
🛡️ Más seguro: evita muchos errores comunes (como los “null”)
🔄 100% compatible con Java: puedes usar ambos en el mismo proyecto
🚀 Moderno y expresivo: código más limpio y fácil de leer

⚙️ Ejemplo básico:

fun main() {
    println("Hola, mundo")
}

📱 Ejemplo típico en Android:

val nombre = "Ana"
println("Hola $nombre")

🏗️ ¿Quién lo creó?

Kotlin fue desarrollado por la empresa JetBrains y se lanzó oficialmente en 2016.

🤖 Importancia en Android

Google lo declaró lenguaje oficial para Android, lo que hizo que su uso creciera muchísimo.

🔄 Kotlin vs Java (idea rápida):

- Java → más antiguo, más código, muy usado en empresas
- Kotlin → moderno, más corto, más seguro
- Ambos → funcionan juntos perfectamente

🧩 Resumen rápido:

Kotlin es un lenguaje moderno, principalmente usado para Android, que mejora a Java haciéndolo más simple, seguro y eficiente.`,
  android: `Android es un sistema operativo para dispositivos móviles, como teléfonos, tablets, relojes inteligentes y algunos televisores.

Dicho de forma sencilla: Android es el “software principal” que hace funcionar la mayoría de los móviles del mundo.

📱 ¿Qué hace Android?

- Gestiona el hardware del dispositivo (pantalla, cámara, batería…)
- Permite instalar y usar aplicaciones
- Conecta con Internet, redes, Bluetooth, etc.
- Proporciona una interfaz visual (pantalla, menús, botones)

🧠 ¿Dónde lo encuentras?

- Teléfonos móviles (Samsung, Xiaomi, Motorola, etc.)
- Tablets
- Smartwatches (Wear OS)
- Televisores inteligentes (Android TV)

📦 ¿De qué está hecho?

Android está basado en el sistema operativo Linux y permite que los desarrolladores creen apps usando lenguajes como:

- Kotlin
- Java
- (también C++ en casos específicos)

🏗️ ¿Quién lo creó?

Android fue desarrollado inicialmente por Android Inc. y posteriormente adquirido por Google.

📲 ¿Cómo funcionan las apps en Android?

Las aplicaciones se instalan en formato APK y se ejecutan dentro del sistema Android, utilizando su entorno de ejecución.

🔄 Android en el mundo real:

- Es el sistema operativo móvil más usado del mundo
- Compite con iOS (de iPhone)
- Tiene millones de aplicaciones en Google Play

🧩 Resumen rápido:

Android es el sistema operativo que hace funcionar la mayoría de móviles y tablets, permitiendo usar apps, Internet y todas las funciones del dispositivo.`,
  javascript: `JavaScript es un lenguaje de programación que se usa principalmente para hacer que las páginas web sean interactivas y dinámicas.

Dicho de forma sencilla: es lo que hace que una web “reaccione” cuando tú haces algo.

🌐 ¿Qué hace JavaScript?

Con JavaScript puedes:

- 🖱️ Hacer botones que responden al clic
- 📄 Cambiar contenido de una página sin recargarla
- 🎨 Crear animaciones y efectos visuales
- 📡 Enviar y recibir datos desde servidores
- 🧠 Crear aplicaciones web completas

🧠 Ejemplo sencillo:

alert("Hola mundo");

Esto muestra una ventana emergente en el navegador.

⚙️ ¿Dónde se usa?

JavaScript funciona en dos grandes entornos:

🌍 En el navegador (frontend)
- Chrome, Firefox, Edge…
- Para páginas web interactivas

🖥️ En el servidor (backend)
- Gracias a Node.js

🚀 ¿Por qué es tan importante?

- Es el único lenguaje que entienden todos los navegadores
- Permite crear webs modernas como redes sociales
- Se usa tanto en frontend como backend
- Tiene muchísimos frameworks (React, Vue, Angular…)

🧩 Ejemplos reales:

- Dar “me gusta” en una red social
- Actualizar un chat sin recargar la página
- Validar formularios en tiempo real

🏗️ ¿Quién lo creó?

JavaScript fue creado en 1995 por Brendan Eich mientras trabajaba en Netscape.

🔄 Relación con otras tecnologías:

- JavaScript → lenguaje
- React → biblioteca para interfaces
- Node.js → ejecuta JavaScript en servidor

🧩 Resumen rápido:

JavaScript es el lenguaje que hace que las páginas web pasen de ser estáticas a ser interactivas y dinámicas.`,
   powerbi: `Power BI es una herramienta de análisis de datos y visualización creada para transformar datos en gráficos, informes y paneles interactivos.

Dicho de forma sencilla: es un programa que te ayuda a entender datos de forma visual (en lugar de ver solo tablas).

📊 ¿Para qué sirve Power BI?

Con Power BI puedes:

- 📈 Crear gráficos y dashboards interactivos
- 📂 Conectar datos de Excel, bases de datos o la nube
- 🔍 Analizar información (ventas, finanzas, marketing…)
- 📑 Crear informes automáticos
- 🤝 Compartir resultados con equipos de trabajo

🧠 Ejemplo práctico:

Imagina una empresa con miles de ventas:

- Sin Power BI → tablas largas y difíciles de leer
- Con Power BI → gráficos de ventas por mes, productos más vendidos, ganancias en tiempo real

⚙️ ¿Cómo funciona?

Power BI:

- Se conecta a fuentes de datos (Excel, SQL, APIs…)
- Limpia y organiza la información
- Crea visualizaciones (gráficos, mapas, tablas)
- Permite explorar los datos de forma interactiva

📦 Componentes principales:

- Power BI Desktop → crear informes en el ordenador
- Power BI Service → publicar y compartir en la nube
- Power BI Mobile → ver informes en el móvil

🏗️ ¿Quién lo creó?

Power BI es un producto de Microsoft.

📊 ¿Dónde se usa?

- Empresas (ventas, finanzas, RRHH)
- Marketing digital
- Análisis de negocios
- Informes ejecutivos

🧩 Resumen rápido:

Power BI es una herramienta de Microsoft que convierte datos en gráficos e informes interactivos para facilitar la toma de decisiones.`,
html: `HTML (HyperText Markup Language) es el lenguaje de marcado que se usa para crear la estructura de las páginas web.

Dicho de forma sencilla: HTML es el “esqueleto” de una página web.

🌐 ¿Para qué sirve HTML?

HTML se usa para definir:

- 🧱 Títulos y textos
- 🖼️ Imágenes
- 🔗 Enlaces
- 📄 Párrafos
- 📋 Formularios (login, registro…)
- 🧩 La estructura general de una web

🧠 Ejemplo básico:

<!DOCTYPE html>
<html>
  <head>
    <title>Mi primera web</title>
  </head>
  <body>
    <h1>Hola mundo</h1>
    <p>Esta es mi página web</p>
  </body>
</html>

⚙️ ¿Cómo funciona?

HTML usa etiquetas (tags) como:

- <h1> → títulos grandes
- <p> → párrafos
- <a> → enlaces
- <img> → imágenes

El navegador (Chrome, Firefox…) lee esas etiquetas y muestra la página.

🧩 Importante:

HTML por sí solo:

❌ No hace la página interactiva
❌ No tiene estilos
❌ No tiene lógica

Por eso se combina con:

🎨 CSS → diseño y estilos
⚙️ JavaScript → interactividad

🏗️ ¿Quién lo creó?

HTML fue creado por Tim Berners-Lee en los inicios de la web.

🌍 Resumen rápido:

HTML es el lenguaje que define la estructura de las páginas web, es decir, cómo se organizan los contenidos que ves en Internet.`,
css: `CSS (Cascading Style Sheets) es un lenguaje que se usa para dar estilo y diseño a las páginas web creadas con HTML.

Dicho de forma sencilla: CSS es lo que hace que una web pase de verse “simple” a verse bonita y visualmente atractiva.

🎨 ¿Para qué sirve CSS?

CSS se utiliza para controlar el aspecto visual de una página web:

- 🎨 Colores de texto y fondo
- 🔤 Tipografías (fuentes)
- 📏 Tamaños y espacios
- 📐 Posicionamiento de elementos
- 🧱 Diseño de la página (layout)
- ✨ Animaciones y efectos visuales

🧠 Ejemplo básico:

h1 {
  color: blue;
  font-size: 32px;
}

Esto hará que todos los títulos <h1> se vean en color azul y con tamaño grande.

⚙️ ¿Cómo funciona?

CSS funciona aplicando reglas a los elementos HTML:

- Seleccionas un elemento (por ejemplo h1, p, div)
- Le aplicas estilos (color, tamaño, margen, etc.)
- El navegador interpreta esas reglas y las muestra visualmente

🧩 ¿Por qué es importante?

Sin CSS, todas las páginas web se verían iguales y sin diseño.

CSS permite:

- Crear webs modernas y atractivas
- Mejorar la experiencia del usuario
- Adaptar diseños a móvil, tablet y ordenador (responsive design)

🔄 Relación con otras tecnologías:

- HTML → estructura de la página
- CSS → diseño y apariencia
- JavaScript → interactividad

🌍 Resumen rápido:

CSS es el lenguaje que se encarga de la parte visual de una página web, permitiendo darle estilo, colores y diseño para que no se vea solo como texto plano.`
};

// =========================
// ⚡ AI SERVICE
// =========================

class AIService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 1000 * 60 * 60;
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
      return `Android: https://developer.android.com/studio/releases`;
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
  // 🚀 MAIN ENTRY (ARREGLADO)
  // =========================

  async preguntar(prompt, contexto = "") {
    const cacheKey = this.getCacheKey(prompt, contexto);

    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    // 🔥 1. HÍBRIDO (PRIORIDAD MÁXIMA)
    if (isHybridQuery(prompt)) {
      const def = await this.handleDefinitionQuery(prompt);
      const ver = await this.handleVersionQuery(prompt);

      const result = `${def}\n\n📦 Última versión:\n${ver}`;

      this.setCache(cacheKey, result);
      return result;
    }

    // 📖 2. DEFINICIÓN
    if (isDefinitionQuery(prompt)) {
      const result = await this.handleDefinitionQuery(prompt);
      this.setCache(cacheKey, result);
      return result;
    }

    // 🔢 3. VERSIÓN
    if (isVersionQuery(prompt)) {
      const result = await this.handleVersionQuery(prompt);
      this.setCache(cacheKey, result);
      return result;
    }

    // 🤖 4. IA NORMAL
    for (const model of this.models) {
      try {
        const res = await this.askModel(model, prompt, contexto);
        const text = res.message.content;

        this.setCache(cacheKey, text);
        this.mejorarEnBackground(prompt, text);

        return text;
      } catch {}
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
      } catch {}
    });
  }

  // =========================
  // ⚡ STREAMING
  // =========================

  async streamPregunta(prompt, contexto = "", onToken) {
    const modelUsed = this.models[0];

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