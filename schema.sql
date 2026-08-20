-- ==============================================================================
-- CHRTV - Cloudflare D1 Database Schema
-- Tác giả: CHRTV OTT Full-stack Architect
-- Mô tả: Cấu trúc cơ sở dữ liệu SQLite cho Cloudflare D1 Database
-- ==============================================================================

-- Bảng 1: Danh sách các kênh truyền hình
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    logo TEXT,
    group_title TEXT DEFAULT 'Khác',
    stream_url TEXT NOT NULL,
    catchup_type TEXT DEFAULT 'append',
    catchup_days INTEGER DEFAULT 7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng 2: Danh sách kênh yêu thích của người dùng
CREATE TABLE IF NOT EXISTS user_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    channel_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel_id)
);

-- Bảng 3: Lịch sử xem kênh truyền hình
CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default_user',
    channel_id TEXT NOT NULL,
    last_position REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel_id)
);

-- Tạo các Chỉ Mức (Index) tối ưu hóa tốc độ truy vấn
CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(group_title);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user_updated ON watch_history(user_id, updated_at DESC);
