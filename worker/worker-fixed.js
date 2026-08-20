async function ensureTables(env) {
  try {
    // Create all core tables individually for reliability
    const sqls = [
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, avatar_url TEXT DEFAULT '', display_name TEXT DEFAULT '', role TEXT DEFAULT 'user', email_verified INTEGER DEFAULT 0, verify_code TEXT DEFAULT '', verify_expires INTEGER DEFAULT 0, reset_token TEXT DEFAULT '', reset_expires INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS user_settings (user_id INTEGER PRIMARY KEY, theme TEXT DEFAULT 'dark', default_quality TEXT DEFAULT 'auto', language TEXT DEFAULT 'vi', settings_json TEXT DEFAULT '{}', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS user_favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, sort_order INTEGER DEFAULT 0, group_name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, channel_id))",
      "CREATE TABLE IF NOT EXISTS watch_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, last_position INTEGER DEFAULT 0, watch_count INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, channel_id))",
      "CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, logo TEXT DEFAULT '', group_title TEXT DEFAULT '', stream_url TEXT NOT NULL, catchup_type TEXT DEFAULT 'append', catchup_days INTEGER DEFAULT 7, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS channel_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(channel_id, user_id))",
      "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT DEFAULT 'info', channel_id TEXT DEFAULT '', is_read INTEGER DEFAULT 0, target TEXT DEFAULT 'all', created_by INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at INTEGER DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, user_id INTEGER DEFAULT 0, channel_id TEXT DEFAULT '', data TEXT DEFAULT '{}', ip TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS epg_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS broadcasts (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, type TEXT DEFAULT 'info', is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at INTEGER DEFAULT 0)",
      "CREATE TABLE IF NOT EXISTS user_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, avatar_url TEXT DEFAULT '', is_child INTEGER DEFAULT 0, pin_hash TEXT DEFAULT '', active INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    ];
    for (const sql of sqls) {
      try { await env.DB.prepare(sql).run(); } catch (e) { console.error('SQL error:', e.message, sql.substring(0, 60)); }
    }
  } catch (e) {
    console.error('ensureTables error:', e.message || e);
  }
}