/**
 * i18n string map for agentboard CLI + TUI.
 * No external deps — plain object lookup.
 *
 * Extend: add a key to BOTH `en` and `es`. The test suite enforces parity.
 */

export const en = {
  // TUI menu items
  "menu.start_daemon": "Start daemon",
  "menu.open_web_ui": "Open Web UI",
  "menu.list_projects": "List known projects",
  "menu.install_mcp": "Install MCP in clients",
  "menu.uninstall": "Uninstall",
  "menu.doctor": "Doctor",
  "menu.update_check": "Update check",
  "menu.language_toggle": "Language (l) — English",
  "menu.quit": "Quit (q)",

  // TUI status messages
  "tui.daemon_starting": "Starting daemon…",
  "tui.daemon_started": "Daemon started.",
  "tui.daemon_started_pid": "Daemon started (PID {pid}).",
  "tui.daemon_already_running": "Daemon already running.",
  "tui.opening_browser": "Opening browser…",
  "tui.no_projects": "No projects yet — open a repo with the agent or run `agentboard daemon` from a project root.",
  "tui.projects_header": "Known projects:",
  "tui.press_any_key": "Press any key to return to the menu.",
  "tui.press_esc": "Press Esc or q to return.",
  "tui.hotkeys": "l = toggle language  q = quit",

  // Install sub-menu
  "install.menu.title": "Install MCP — select client",
  "install.menu.all_detected": "All detected",
  "install.menu.back": "Back",
  "install.status.registered": "registered",
  "install.status.not_registered": "not registered",
  "install.status.not_detected": "not detected",
  "install.success": "Installed: {client}",
  "install.already": "Already installed: {client}",
  "install.dry_run": "[dry-run] would install: {client} → {file}",
  "install.no_clients_detected": "No supported MCP clients detected. Install Claude Code, OpenCode, or GitHub Copilot first.",

  // Uninstall sub-menu
  "uninstall.menu.title": "Uninstall MCP — select client",
  "uninstall.success": "Uninstalled: {client}",
  "uninstall.not_present": "Not installed: {client}",
  "uninstall.dry_run": "[dry-run] would uninstall: {client} → {file}",
  "uninstall.not_registered": "agentboard was not registered in any supported MCP client.",

  // Doctor
  "doctor.title": "agentboard doctor",
  "doctor.section.daemon": "daemon",
  "doctor.section.clients": "clients",
  "doctor.section.registry": "registry",
  "doctor.section.version": "version",
  "doctor.section.paths": "paths",
  "doctor.ok": "[ok]",
  "doctor.warn": "[warn]",
  "doctor.err": "[err]",
  "doctor.daemon.running": "running  pid={pid}  port={port}  uptime={uptime}s",
  "doctor.daemon.not_running": "not running — run: agentboard daemon",
  "doctor.mcp.registered": "{name}  mcp: registered",
  "doctor.mcp.outdated": "{name}  mcp: outdated — run: agentboard install",
  "doctor.mcp.not_registered": "{name}  mcp: not registered — run: agentboard install --client {id}",
  "doctor.mcp.not_detected": "{name}  not detected",
  "doctor.instr.current": "{name}  instructions: current",
  "doctor.instr.outdated": "{name}  instructions: outdated",
  "doctor.instr.missing": "{name}  instructions: missing — run: agentboard install --client {id}",
  "doctor.instr.na": "{name}  instructions: n/a",
  "doctor.registry.summary": "known repos: {repos}  last-seen: {lastSeen}",
  "doctor.version.current": "current: v{version}",
  "doctor.version.newer": "newer available: v{latest} — run: npm i -g @jobshimo/agentboard",
  "doctor.version.up_to_date": "up to date",
  "doctor.version.unknown": "update check failed (offline?)",
  "doctor.paths.agb_home": "agb-home:   {path}",
  "doctor.paths.config_found": "config.yaml: {path}",
  "doctor.paths.config_missing": "config.yaml: {path}  (not found — defaults apply)",

  // Update check
  "update.checking": "Checking for updates…",
  "update.up_to_date": "Up to date.",
  "update.newer_available": "Newer version available: {latest}",
  "update.error": "Could not check for updates.",

  // Language toggle
  "language.current": "Language: English",
  "language.switched": "Language changed. Restart not required.",
} as const;

export type StringKey = keyof typeof en;

export const es: Record<StringKey, string> = {
  // TUI menu items
  "menu.start_daemon": "Iniciar daemon",
  "menu.open_web_ui": "Abrir Web UI",
  "menu.list_projects": "Listar proyectos",
  "menu.install_mcp": "Instalar MCP en clientes",
  "menu.uninstall": "Desinstalar",
  "menu.doctor": "Doctor",
  "menu.update_check": "Buscar actualizaciones",
  "menu.language_toggle": "Idioma (l) — Español",
  "menu.quit": "Salir (q)",

  // TUI status messages
  "tui.daemon_starting": "Iniciando daemon…",
  "tui.daemon_started": "Daemon iniciado.",
  "tui.daemon_started_pid": "Daemon iniciado (PID {pid}).",
  "tui.daemon_already_running": "El daemon ya está en ejecución.",
  "tui.opening_browser": "Abriendo navegador…",
  "tui.no_projects": "Sin proyectos aún — abrí un repo con el agente o ejecutá `agentboard daemon` desde la raíz del proyecto.",
  "tui.projects_header": "Proyectos conocidos:",
  "tui.press_any_key": "Presioná cualquier tecla para volver al menú.",
  "tui.press_esc": "Presioná Esc o q para volver.",
  "tui.hotkeys": "l = cambiar idioma  q = salir",

  // Install sub-menu
  "install.menu.title": "Instalar MCP — seleccioná cliente",
  "install.menu.all_detected": "Todos los detectados",
  "install.menu.back": "Volver",
  "install.status.registered": "registrado",
  "install.status.not_registered": "no registrado",
  "install.status.not_detected": "no detectado",
  "install.success": "Instalado: {client}",
  "install.already": "Ya instalado: {client}",
  "install.dry_run": "[dry-run] instalaría: {client} → {file}",
  "install.no_clients_detected": "No se detectaron clientes MCP. Instalá Claude Code, OpenCode o GitHub Copilot primero.",

  // Uninstall sub-menu
  "uninstall.menu.title": "Desinstalar MCP — seleccioná cliente",
  "uninstall.success": "Desinstalado: {client}",
  "uninstall.not_present": "No instalado: {client}",
  "uninstall.dry_run": "[dry-run] desinstalaría: {client} → {file}",
  "uninstall.not_registered": "agentboard no estaba registrado en ningún cliente MCP.",

  // Doctor
  "doctor.title": "agentboard doctor",
  "doctor.section.daemon": "daemon",
  "doctor.section.clients": "clientes",
  "doctor.section.registry": "registro",
  "doctor.section.version": "versión",
  "doctor.section.paths": "rutas",
  "doctor.ok": "[ok]",
  "doctor.warn": "[warn]",
  "doctor.err": "[err]",
  "doctor.daemon.running": "corriendo  pid={pid}  puerto={port}  uptime={uptime}s",
  "doctor.daemon.not_running": "no corriendo — ejecutá: agentboard daemon",
  "doctor.mcp.registered": "{name}  mcp: registrado",
  "doctor.mcp.outdated": "{name}  mcp: desactualizado — ejecutá: agentboard install",
  "doctor.mcp.not_registered": "{name}  mcp: no registrado — ejecutá: agentboard install --client {id}",
  "doctor.mcp.not_detected": "{name}  no detectado",
  "doctor.instr.current": "{name}  instrucciones: al día",
  "doctor.instr.outdated": "{name}  instrucciones: desactualizadas",
  "doctor.instr.missing": "{name}  instrucciones: faltan — ejecutá: agentboard install --client {id}",
  "doctor.instr.na": "{name}  instrucciones: n/a",
  "doctor.registry.summary": "repos conocidos: {repos}  última vez: {lastSeen}",
  "doctor.version.current": "actual: v{version}",
  "doctor.version.newer": "nueva versión disponible: v{latest} — ejecutá: npm i -g @jobshimo/agentboard",
  "doctor.version.up_to_date": "al día",
  "doctor.version.unknown": "no se pudo verificar actualizaciones (¿sin conexión?)",
  "doctor.paths.agb_home": "agb-home:   {path}",
  "doctor.paths.config_found": "config.yaml: {path}",
  "doctor.paths.config_missing": "config.yaml: {path}  (no encontrado — se usan valores por defecto)",

  // Update check
  "update.checking": "Buscando actualizaciones…",
  "update.up_to_date": "Al día.",
  "update.newer_available": "Nueva versión disponible: {latest}",
  "update.error": "No se pudo verificar actualizaciones.",

  // Language toggle
  "language.current": "Idioma: Español",
  "language.switched": "Idioma cambiado. No es necesario reiniciar.",
} as const;

/**
 * Translates a string key into the given language.
 * Falls back to the key itself when the key is unknown.
 */
export function t(key: string, lang: "en" | "es"): string {
  const map = lang === "es" ? es : en;
  return (map as Record<string, string>)[key] ?? key;
}
