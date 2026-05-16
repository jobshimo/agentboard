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

  // Install diagnostics (printed during install/uninstall operations)
  "install.diag.backup": "  backup: {path}",
  "install.diag.instr_block": "  instructions block ({id}): {status}",
  "install.diag.instr_backup": "  instructions backup: {path}",
  "install.diag.dry_run_install": "  [dry-run] would install instructions block v{version} → {path}",
  "install.diag.auto_instr_block": "  [{id}] instructions block: {status}",
  "install.diag.auto_instr_backup": "  [{id}] instructions backup: {path}",
  "install.diag.auto_dry_run_install": "  [{id}] [dry-run] would install instructions block v{version} → {path}",
  "uninstall.diag.instr_block": "  instructions block ({id}): {status}",
  "uninstall.diag.dry_run_remove": "  [dry-run] would remove instructions block → {path}",
  "uninstall.diag.auto_instr_block": "  [{id}] instructions block: {status}",
  "uninstall.diag.auto_dry_run_remove": "  [{id}] [dry-run] would remove instructions block → {path}",

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

  // TUI v2 — Menu sections
  "tui.section.server": "SERVER",
  "tui.section.client": "CLIENT",
  "tui.section.diagnose": "DIAGNOSE",
  "tui.section.reference": "REFERENCE",

  // TUI v2 — Menu screen title and prompt
  "tui.menu.title": "agentboard",
  "tui.menu.prompt": "Pick an action",
  "tui.menu.prompt_hint": "or press the bracketed key",

  // TUI v2 — Menu item hints
  "tui.hint.start_daemon": "probe and spawn :7733",
  "tui.hint.open_web_ui": "http://localhost:7733",
  "tui.hint.list_projects": "repos tracked by the daemon",
  "tui.hint.install_mcp": "Claude Code, OpenCode, Copilot",
  "tui.hint.uninstall": "remove MCP config entries",
  "tui.hint.doctor": "report current setup state",
  "tui.hint.update_check": "check npm for a newer version",
  "tui.hint.language_toggle": "EN / ES",
  "tui.hint.quit": "",

  // TUI v2 — Footer labels (menu screen)
  "tui.footer.navigate": "navigate",
  "tui.footer.select": "select",
  "tui.footer.hotkey": "hotkey",
  "tui.footer.lang": "lang",
  "tui.footer.quit": "quit",
  "tui.footer.back": "back",

  // TUI v2 — Install screen
  "tui.install.title": "Install MCP in clients",
  "tui.install.prompt": "Select a client",
  "tui.install.running": "Installing…",
  "tui.install.done": "Done. Press Esc to return.",

  // TUI v2 — Uninstall screen
  "tui.uninstall.title": "Uninstall MCP from clients",
  "tui.uninstall.prompt": "Select a client",
  "tui.uninstall.running": "Uninstalling…",
  "tui.uninstall.done": "Done. Press Esc to return.",

  // TUI v2 — Projects screen
  "tui.projects.title": "Known projects",
  "tui.projects.empty": "No projects yet.",
  "tui.projects.empty_hint": "Open a repo with the agent or run `agentboard daemon` from a project root.",

  // TUI v2 — Doctor screen
  "tui.doctor.title": "Doctor",
  "tui.doctor.running": "Running diagnostics…",

  // TUI v2 — Update screen
  "tui.update.title": "Update check",
  "tui.update.running": "Checking npm…",
  "tui.update.up_to_date": "You are up to date.",
  "tui.update.newer": "Newer version available: {latest}",
  "tui.update.install_cmd": "Run: npm install -g @jobshimo/agentboard@latest",
  "tui.update.error": "Could not reach npm (offline?).",

  // TUI v2 — Action feedback
  "tui.action.daemon_started": "Daemon started (PID {pid}). Returning to menu…",
  "tui.action.daemon_spawn_error": "Failed to start daemon: {error}",
  "tui.action.browser_opening": "Opening http://localhost:7733 in your browser…",
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

  // Install diagnostics (printed during install/uninstall operations)
  "install.diag.backup": "  respaldo: {path}",
  "install.diag.instr_block": "  bloque de instrucciones ({id}): {status}",
  "install.diag.instr_backup": "  respaldo de instrucciones: {path}",
  "install.diag.dry_run_install": "  [dry-run] instalaría bloque de instrucciones v{version} → {path}",
  "install.diag.auto_instr_block": "  [{id}] bloque de instrucciones: {status}",
  "install.diag.auto_instr_backup": "  [{id}] respaldo de instrucciones: {path}",
  "install.diag.auto_dry_run_install": "  [{id}] [dry-run] instalaría bloque de instrucciones v{version} → {path}",
  "uninstall.diag.instr_block": "  bloque de instrucciones ({id}): {status}",
  "uninstall.diag.dry_run_remove": "  [dry-run] eliminaría bloque de instrucciones → {path}",
  "uninstall.diag.auto_instr_block": "  [{id}] bloque de instrucciones: {status}",
  "uninstall.diag.auto_dry_run_remove": "  [{id}] [dry-run] eliminaría bloque de instrucciones → {path}",

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

  // TUI v2 — Menu sections
  "tui.section.server": "SERVIDOR",
  "tui.section.client": "CLIENTE",
  "tui.section.diagnose": "DIAGNÓSTICO",
  "tui.section.reference": "REFERENCIA",

  // TUI v2 — Menu screen title and prompt
  "tui.menu.title": "agentboard",
  "tui.menu.prompt": "Elegí una acción",
  "tui.menu.prompt_hint": "o apretá la letra entre corchetes",

  // TUI v2 — Menu item hints
  "tui.hint.start_daemon": "probar y arrancar :7733",
  "tui.hint.open_web_ui": "http://localhost:7733",
  "tui.hint.list_projects": "repos rastreados por el daemon",
  "tui.hint.install_mcp": "Claude Code, OpenCode, Copilot",
  "tui.hint.uninstall": "eliminar entradas de configuración MCP",
  "tui.hint.doctor": "estado actual del setup",
  "tui.hint.update_check": "buscar nueva versión en npm",
  "tui.hint.language_toggle": "EN / ES",
  "tui.hint.quit": "",

  // TUI v2 — Footer labels (menu screen)
  "tui.footer.navigate": "moverse",
  "tui.footer.select": "elegir",
  "tui.footer.hotkey": "hotkey",
  "tui.footer.lang": "idioma",
  "tui.footer.quit": "salir",
  "tui.footer.back": "volver",

  // TUI v2 — Install screen
  "tui.install.title": "Instalar MCP en clientes",
  "tui.install.prompt": "Seleccioná un cliente",
  "tui.install.running": "Instalando…",
  "tui.install.done": "Listo. Presioná Esc para volver.",

  // TUI v2 — Uninstall screen
  "tui.uninstall.title": "Desinstalar MCP de clientes",
  "tui.uninstall.prompt": "Seleccioná un cliente",
  "tui.uninstall.running": "Desinstalando…",
  "tui.uninstall.done": "Listo. Presioná Esc para volver.",

  // TUI v2 — Projects screen
  "tui.projects.title": "Proyectos conocidos",
  "tui.projects.empty": "Sin proyectos aún.",
  "tui.projects.empty_hint": "Abrí un repo con el agente o ejecutá `agentboard daemon` desde la raíz del proyecto.",

  // TUI v2 — Doctor screen
  "tui.doctor.title": "Doctor",
  "tui.doctor.running": "Ejecutando diagnósticos…",

  // TUI v2 — Update screen
  "tui.update.title": "Buscar actualizaciones",
  "tui.update.running": "Consultando npm…",
  "tui.update.up_to_date": "Estás al día.",
  "tui.update.newer": "Nueva versión disponible: {latest}",
  "tui.update.install_cmd": "Ejecutá: npm install -g @jobshimo/agentboard@latest",
  "tui.update.error": "No se pudo llegar a npm (¿sin conexión?).",

  // TUI v2 — Action feedback
  "tui.action.daemon_started": "Daemon iniciado (PID {pid}). Volviendo al menú…",
  "tui.action.daemon_spawn_error": "Error al iniciar daemon: {error}",
  "tui.action.browser_opening": "Abriendo http://localhost:7733 en el navegador…",
} as const;

/**
 * Translates a string key into the given language.
 * Falls back to the key itself when the key is unknown.
 */
export function t(key: string, lang: "en" | "es"): string {
  const map = lang === "es" ? es : en;
  return (map as Record<string, string>)[key] ?? key;
}
