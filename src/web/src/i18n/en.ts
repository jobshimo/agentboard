// English copy strings — all visible UI text lives here.
// Keys named for Spanish drop-in replacement later (flat map, no nesting).

export const en = {
  // Topbar
  brand_name: "agentboard",
  brand_version: "v0.1.0",
  search_placeholder: "Search tasks, refs…",
  search_shortcut: "⌘K",
  tab_board: "Board",
  tab_settings: "Settings",
  aria_notifications: "Notifications",
  aria_theme_toggle: "Theme",
  aria_settings: "Settings",

  // Notifications popover
  notif_title: "Notifications",
  notif_mark_all_read: "Mark all read",

  // Connection indicator
  conn_live: "WS · live",
  conn_reconnecting: "reconnecting…",
  conn_offline: "offline",

  // Sidebar sections
  sidebar_views: "Views",
  sidebar_board: "Board",
  sidebar_all_tasks: "All tasks",
  sidebar_closed: "Closed",
  sidebar_workflows: "Workflows",
  sidebar_references: "References",
  sidebar_settings: "Settings",
  sidebar_mcp_endpoint: "Open MCP endpoint",
  ref_github: "GitHub",
  ref_jira: "Jira",
  ref_linear: "Linear",
  ref_local: "Local only",

  // Column mode toggle
  columns_by: "Columns by",
  col_macro: "macro-status",
  col_workflow: "workflow step",

  // Placeholder views (S10b/c/d)
  placeholder_board: "Board view — S10b",
  placeholder_detail: "Task detail — S10c",
  placeholder_settings: "Settings — S10d",

  // Settings view
  settings_title: "Settings",
  settings_lede_prefix: "Local config for",
  settings_lede_global: "Workflows live in",
  settings_lede_override: "globally; this repo can override via",

  // Server section
  settings_server_title: "Server",
  settings_server_desc: "Local launcher running. The agent talks via the MCP endpoint; the UI talks via REST + WebSocket.",
  settings_kv_web_ui: "Web UI",
  settings_kv_mcp_endpoint: "MCP endpoint",
  settings_kv_database: "Database",
  settings_kv_snapshot_dir: "Snapshot dir",
  settings_kv_version: "Version",
  settings_kv_uptime: "Uptime",

  // MCP section
  settings_mcp_title: "MCP activation",
  settings_mcp_mode_lazy: "lazy",
  settings_mcp_mode_always_on: "always-on",
  settings_mcp_mode_prompt: "prompt",

  // Workflows section
  settings_workflows_title: "Workflows",
  settings_workflows_desc: "Installed templates. Snapshots are taken from these at task start.",
  settings_workflows_empty: "No workflows found.",
  settings_workflow_btn_open: "Open YAML",
  settings_workflow_btn_copy: "Copy to repo",

  // Attention section
  settings_attention_title: "Attention",

  // Snapshots section
  settings_snapshots_title: "Snapshots",
  settings_snapshots_desc: "Export current board to markdown for git commit.",
  settings_export_btn: "agentboard export",
  settings_export_in_progress: "Exporting…",
  settings_export_last: "last export ·",

  // Search coming-soon card
  search_coming_soon_title: "Search coming soon",
  search_coming_soon_body: "⌘K will open a command palette in a future release.",

  // Generic
  back: "← Back",
  loading: "Loading…",
};

export type CopyKey = keyof typeof en;
