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

  // Search coming-soon card
  search_coming_soon_title: "Search coming soon",
  search_coming_soon_body: "⌘K will open a command palette in a future release.",

  // Generic
  back: "← Back",
  loading: "Loading…",
};

export type CopyKey = keyof typeof en;
