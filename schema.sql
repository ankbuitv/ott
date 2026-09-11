-- CHRTV Database Schema for Cloudflare D1

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'user' CHECK(role IN ('user','admin','moderator')),
  email_verified INTEGER DEFAULT 0,
  verify_code TEXT DEFAULT '',
  verify_expires INTEGER DEFAULT 0,
  reset_token TEXT DEFAULT '',
  reset_expires INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (JWT)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User profiles / settings sync
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  theme TEXT DEFAULT 'dark',
  default_quality TEXT DEFAULT 'auto',
  buffer_goal INTEGER DEFAULT 10,
  language TEXT DEFAULT 'vi',
  parental_pin TEXT DEFAULT '',
  parental_enabled INTEGER DEFAULT 0,
  settings_json TEXT DEFAULT '{}',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Favorites (per user)
CREATE TABLE IF NOT EXISTS user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  group_name TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, channel_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Watch history (per user)
CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  last_position INTEGER DEFAULT 0,
  watch_count INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, channel_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo TEXT DEFAULT '',
  group_title TEXT DEFAULT '',
  stream_url TEXT NOT NULL,
  catchup_type TEXT DEFAULT 'append',
  catchup_days INTEGER DEFAULT 7,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cấu hình chung của hệ thống (hiện dùng cho logo watermark — xem LOGO_WATERMARK.md)
--   key 'watermark'       -> JSON cấu hình mặc định (bật/tắt, vị trí, cỡ, kiểu, phạm vi trang)
--   key 'watermark_logo'  -> nội dung SVG đã sanitize do admin upload (rỗng = dùng /watermark.svg)
CREATE TABLE IF NOT EXISTS site_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT 0
);

-- Logo watermark theo TỪNG KÊNH: JSON đè lên cấu hình chung
-- (mode 'on'|'off', pos/x/y/size/opacity/margin/style/tint/text...).
-- Để bảng riêng vì writeChannels() DELETE + INSERT lại `channels` mỗi lần nạp M3U —
-- nếu nhét cột vào `channels` thì mọi tuỳ chỉnh của admin sẽ bay theo đợt refresh.
CREATE TABLE IF NOT EXISTS channel_watermark (
  channel_id TEXT PRIMARY KEY,
  wm TEXT NOT NULL,
  updated_at INTEGER DEFAULT 0
);

-- Channel ratings
CREATE TABLE IF NOT EXISTS channel_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK(type IN ('info','warning','event','promo')),
  channel_id TEXT DEFAULT '',
  url TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  target TEXT DEFAULT 'all',
  created_by INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER DEFAULT 0
);

-- Analytics events
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  user_id INTEGER DEFAULT 0,
  channel_id TEXT DEFAULT '',
  data TEXT DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Program reminders
CREATE TABLE IF NOT EXISTS program_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  program_title TEXT NOT NULL,
  remind_at DATETIME NOT NULL,
  is_sent INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- EPG cache
CREATE TABLE IF NOT EXISTS epg_cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Per-channel EPG overrides (admin can customize EPG for a single channel)
CREATE TABLE IF NOT EXISTS epg_overrides (
  channel_id TEXT PRIMARY KEY,
  channel_name TEXT DEFAULT '',
  programmes TEXT NOT NULL,
  updated_at INTEGER DEFAULT 0
);

-- M3U sources
CREATE TABLE IF NOT EXISTS m3u_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin broadcast messages
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER DEFAULT 0
);

-- User multi-profiles (Netflix-style who's watching + kid PIN)
CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  is_child INTEGER DEFAULT 0,
  pin_hash TEXT DEFAULT '',
  active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event, created_at);
CREATE INDEX IF NOT EXISTS idx_program_reminders_user ON program_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- ===== BỔ SUNG: thống kê / cộng đồng / thương mại (worker ensureSchema tự tạo) =====
CREATE TABLE IF NOT EXISTS watch_counters (channel_id TEXT PRIMARY KEY, views INTEGER DEFAULT 0, seconds INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS presence (sid TEXT PRIMARY KEY, user_id INTEGER DEFAULT 0, name TEXT DEFAULT '', kind TEXT DEFAULT '', ref_id TEXT DEFAULT '', ref_name TEXT DEFAULT '', updated_at INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS user_xp (user_id INTEGER PRIMARY KEY, xp INTEGER DEFAULT 0, watch_sec INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS public_profiles (user_id INTEGER PRIMARY KEY, handle TEXT UNIQUE, bio TEXT DEFAULT '', avatar_url TEXT DEFAULT '', is_public INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT DEFAULT '', body TEXT NOT NULL, status TEXT DEFAULT 'visible', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS fan_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_by INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS fan_members (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(group_id, user_id));
CREATE TABLE IF NOT EXISTS gift_codes (code TEXT PRIMARY KEY, plan TEXT DEFAULT 'vip', days INTEGER DEFAULT 30, max_uses INTEGER DEFAULT 1, used INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, note TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_plans (user_id INTEGER PRIMARY KEY, plan TEXT DEFAULT 'standard', expires_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT DEFAULT '', plan TEXT NOT NULL, amount INTEGER DEFAULT 0, order_code TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'pending', payload TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, paid_at DATETIME DEFAULT NULL);
CREATE TABLE IF NOT EXISTS payment_config (id INTEGER PRIMARY KEY CHECK (id = 1), bank_id TEXT DEFAULT '', account_no TEXT DEFAULT '', account_name TEXT DEFAULT '', template TEXT DEFAULT 'compact2', sepay_token TEXT DEFAULT '', note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY AUTOINCREMENT, slot TEXT DEFAULT 'banner', title TEXT DEFAULT '', image_url TEXT DEFAULT '', link_url TEXT DEFAULT '', video_url TEXT DEFAULT '', starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS scheduled_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT DEFAULT '', body TEXT DEFAULT '', link_type TEXT DEFAULT 'none', link_value TEXT DEFAULT '', image_url TEXT DEFAULT '', publish_at TEXT NOT NULL, is_done INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS predictions (user_id INTEGER NOT NULL, event_key TEXT NOT NULL, league TEXT DEFAULT '', home TEXT DEFAULT '', away TEXT DEFAULT '', ph INTEGER DEFAULT 0, pa INTEGER DEFAULT 0, points INTEGER DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, event_key));
