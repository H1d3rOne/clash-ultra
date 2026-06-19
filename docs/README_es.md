<h1 align="center">
  <img src="../src-tauri/icons/icon.png" alt="Clash" width="128" />
  <br>
  Clash Ultra
  <br>
</h1>

<h3 align="center">
Una interfaz gráfica para Clash Meta construida con <a href="https://github.com/tauri-apps/tauri">Tauri</a>.
</h3>

<p align="center">
  Idiomas:
  <a href="../README.md">简体中文</a> ·
  <a href="./README_en.md">English</a> ·
  <a href="./README_es.md">Español</a> ·
  <a href="./README_ru.md">Русский</a> ·
  <a href="./README_ja.md">日本語</a> ·
  <a href="./README_ko.md">한국어</a> ·
  <a href="./README_fa.md">فارسی</a>
</p>

## Vista previa

| Oscuro                              | Claro                               |
| ----------------------------------- | ----------------------------------- |
| ![Vista oscura](./preview_dark.png) | ![Vista clara](./preview_light.png) |

## Instalación

Visita la [página de lanzamientos](https://github.com/H1d3rOne/clash-ultra/releases) y descarga el instalador que corresponda a tu plataforma.<br>
Ofrecemos paquetes para Windows (x64/x86), Linux (x64/arm64) y macOS 10.15+ (Intel/Apple).

#### Cómo elegir el canal de lanzamiento

| Canal       | Descripción                                                                    | Enlace                                                                                 |
| :---------- | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| Stable      | Compilaciones oficiales de alta fiabilidad; ideales para el uso diario.        | [Release](https://github.com/H1d3rOne/clash-ultra/releases)                 |
| Alpha (EOL) | Compilaciones heredadas usadas para validar el flujo de publicación.           | [Alpha](https://github.com/H1d3rOne/clash-ultra/releases/tag/alpha)         |
| AutoBuild   | Compilaciones continuas para pruebas y retroalimentación. Espera cambios beta. | [AutoBuild](https://github.com/H1d3rOne/clash-ultra/releases/tag/autobuild) |

#### Guías de instalación y preguntas frecuentes

Consulta la [documentación del proyecto](https://clash-ultra.github.io/clash-ultra/) para encontrar los pasos de instalación, solución de problemas y preguntas frecuentes.

### Canal de Telegram

Únete a [@clash_ultra_app](https://t.me/clash_ultra_app) para enterarte de las novedades.

---

## Funciones

- Basado en Rust de alto rendimiento y en el framework Tauri 2
- Incluye el núcleo integrado [Clash.Meta (mihomo)](https://github.com/MetaCubeX/mihomo) y permite cambiar al canal `Alpha`
- Interfaz limpia y elegante con controles de color de tema, iconos de grupos proxy/bandeja y `CSS Injection`
- Gestión avanzada de perfiles (herramientas Merge y Script) con sugerencias de sintaxis para configuraciones
- Control del proxy del sistema, modo guardián y soporte para `TUN` (adaptador de red virtual)
- Editores visuales para nodos y reglas
- Copias de seguridad y sincronización mediante WebDAV

### Preguntas frecuentes

Visita la [página de FAQ](https://clash-ultra.github.io/clash-ultra/faq/windows.html) para obtener instrucciones específicas por plataforma.

### Donaciones

[Apoya el desarrollo de Clash Ultra](https://github.com/sponsors/clash-ultra-app)

## Desarrollo

Consulta [CONTRIBUTING.md](../CONTRIBUTING.md) para conocer las pautas de contribución.

Después de instalar todos los requisitos de **Tauri**, ejecuta el entorno de desarrollo con:

```shell
pnpm i
pnpm run prebuild
pnpm dev
```

## Contribuciones

Se agradecen los issues y pull requests.

## Agradecimientos

Clash Ultra se basa en, o se inspira en, los siguientes proyectos:

- [tauri-apps/tauri](https://github.com/tauri-apps/tauri): Construye aplicaciones de escritorio más pequeñas, rápidas y seguras con un frontend web.
- [Dreamacro/clash](https://github.com/Dreamacro/clash): Túnel basado en reglas escrito en Go.
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo): Túnel basado en reglas escrito en Go.
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg): Interfaz de Clash para Windows y macOS.
- [vitejs/vite](https://github.com/vitejs/vite): Herramientas de frontend de nueva generación con una experiencia rapidísima.

## Licencia

Licencia GPL-3.0. Consulta el [archivo de licencia](../LICENSE) para más detalles.
