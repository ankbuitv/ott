-- Database scoped to `wrangler dev --local`; not a production migration.
CREATE TABLE IF NOT EXISTS preview_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preview_vod (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 category TEXT NOT NULL,
 image TEXT NOT NULL,
 source TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('published','draft')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS preview_vod_status_idx ON preview_vod(status, created_at);
INSERT OR IGNORE INTO preview_vod (id,title,description,category,image,source,status,created_at,updated_at)
 SELECT 'demo-mien-song-lang','Miền sóng lặng','Một hành trình tưởng tượng qua những miền biển và những câu chuyện chưa kể.','Khám phá','/images/film-coast.jpg','hls','published',1,1
 WHERE NOT EXISTS (SELECT 1 FROM preview_meta WHERE key='vod-seeded-v1');
INSERT OR IGNORE INTO preview_vod (id,title,description,category,image,source,status,created_at,updated_at)
 SELECT 'demo-sau-con-mua','Sau cơn mưa','Khi thành phố lên đèn, những khoảnh khắc bình dị bỗng trở nên đáng nhớ.','Đời sống','/images/film-city.jpg','mp4','published',2,2
 WHERE NOT EXISTS (SELECT 1 FROM preview_meta WHERE key='vod-seeded-v1');
INSERT OR IGNORE INTO preview_vod (id,title,description,category,image,source,status,created_at,updated_at)
 SELECT 'demo-giua-tang-may','Giữa tầng mây','Chạm đến khoảng lặng giữa núi đồi trong một chuyến đi hư cấu.','Khám phá','/images/film-mountain.jpg','dash','published',3,3
 WHERE NOT EXISTS (SELECT 1 FROM preview_meta WHERE key='vod-seeded-v1');
INSERT OR IGNORE INTO preview_vod (id,title,description,category,image,source,status,created_at,updated_at)
 SELECT 'demo-nhip-dap-san-co','Nhịp đập sân cỏ','Những cảm xúc rất riêng được lấy cảm hứng từ tình yêu thể thao.','Thể thao','/images/film-stadium.jpg','hls','published',4,4
 WHERE NOT EXISTS (SELECT 1 FROM preview_meta WHERE key='vod-seeded-v1');
INSERT OR IGNORE INTO preview_meta (key,value) VALUES ('vod-seeded-v1','1');

-- Tài khoản chỉ dùng với D1 local. Không phải migration hoặc cấu hình production.
CREATE TABLE IF NOT EXISTS preview_accounts (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 password_iterations INTEGER NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('user','admin')),
 created_at INTEGER NOT NULL
);
-- A single atomic DB constraint closes first-admin setup, including races.
CREATE UNIQUE INDEX IF NOT EXISTS preview_one_admin_idx ON preview_accounts(role) WHERE role = 'admin';
CREATE TABLE IF NOT EXISTS preview_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES preview_accounts(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS preview_sessions_account_idx ON preview_sessions(account_id);
CREATE TABLE IF NOT EXISTS preview_login_attempts (
 email TEXT PRIMARY KEY,
 failures INTEGER NOT NULL,
 window_started INTEGER NOT NULL
);
