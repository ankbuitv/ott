# Đợt 48 — Danh sách build (trạng thái triển khai)

> Branch: `arena/01a07b6d-ott` — PR duy nhất lên `main`.
> Preview local: API worker `http://127.0.0.1:8787` (D1 local) · Web `http://127.0.0.1:3000` (Vite proxy).
> Kiểm chứng: `node scripts/pack48-smoke.mjs` (**57 pass / 0 fail**) · `node --check worker/worker.js` · `npx vite build` (exit 0) · sanity API real D1 local trên từng route mới (`/api/movie/wishlist`, `/api/actors/follow`, `/api/party/poll*`, `/api/stats/trending-search`, `/api/sports/follow` + `/api/team/notify` fan-out vi/en).

## A. Mã chia sẻ & liên kết

| Mục | Trạng thái | Nơi triển khai |
| --- | --- | --- |
| Bảng `movie_share_codes(kind, code, media_type, tmdb_id, season, episode, created_by, used, expires_at)` | ✅ | `worker/worker.js` SCHEMA + `handleShareCodesApi` |
| `POST /api/movie/share` (auth, 20/h, mã 6 ký tự, 10 phút, redeem không giới hạn) | ✅ | worker + UI nút “Chia sẻ” trong `ShareMovieModal` |
| `GET /api/movie/share?code=` public (rate-limit IP) | ✅ | worker |
| Dọn mã hết hạn trong `db_cleanup` | ✅ | worker `db_cleanup` + `p48RunDueJobs` |
| “Nhập mã 🎟️” ở tab Phim — mở đúng phim/tập | ✅ | `MoviesScreen.jsx` FAB + `CodesModal` (Pack48Ui) |
| #2 Mã tổng quát theo `kind` (movie/channel/event/party/invite/challenge/playlist/resume/short/creator) | ✅ | `POST/GET /api/codes` |
| #10 Mã mời +200 XP & +3 ngày gói cho cả 2 phía | ✅ | `POST /api/codes/claim` + “Mã của tôi” |
| #1 Xem chung qua mã | ✅ | `/api/party/*` + nút “Xem chung” tab Truyền hình (`TVPage`) |
| #35 Kèo dự đoán tỉ số gửi bạn qua mã | ✅ API mã `challenge`/`payload`; UI nhận mã hiện toast hướng dẫn | worker + CodesModal |
| #11 Playlist chia sẻ (playlist từ Watchlist) | ⚠️ Cơ chế mã `playlist` + payload có sẵn; UI soạn playlist cá nhân hoá chưa đầy đủ | — |

## B. Phim & khám phá

| Mục | Trạng thái | Nơi |
| --- | --- | --- |
| #7 Resume TV mã 6 số phone→TV + đồng bộ progress | ✅ | `/api/movie/progress*`, `/api/resume`, FAB “Đồng bộ TV”, merge history |
| #8 Follow series → “TẬP MỚI” | ✅ follow + badge (chi tiết TV) + toast tập mới khi có; push từ xa khi mở app | `MovieDetailModal` + `useSeriesFollows` (MoviesPack) |
| #9 Bình luận gắn phút | ✅ `tstamp` cột + UI chip tua phút + khay chat trong player | worker POST bind, `CommentsBox`, `MoviePlayerModal` |
| #68 Voice-note gắn phút | ✅ `kind='voice'`, `voice_url`, record ≤30s (client) | `useVoiceComment` (Pack48Ui) + CommentsBox |
| #25 “Vì bạn xem…” gợi ý cục bộ | ✅ có sẵn (row “Dành cho bạn”) từ lịch sử + TMDB recommendations | `MoviesScreen` |
| #26 Cinema mode | ✅ TV “Rạp hát” (TVPage) + phim fullscreen | — |
| #27 Trạng thái Đã xem/Đang xem/Muốn xem + % series | ✅ WatchStatusBar (local per-device) | MoviesPack + detail |
| #28 Lọc nâng cao năm/điểm + sắp xếp | ✅ AdvancedFilters trên catalog | MoviesScreen |
| #29 Báo khi wishlist có nguồn tốt hơn | ✅ Wishlist server + khi mở `/api/movie/sources` mà phim đang wishlist có nguồn chất lượng cao (HD/FHD/UHD…) → notification + push “Phim bạn quan tâm đã có bản ngon hơn” (≤1 lần/3 ngày/phim) | worker `movie_wishlists` + `maybeWishlistQualityNotify` |
| #30 Nhắc “sắp chiếu” | ✅ UpcomingModal nút chuông + local reminder | có sẵn + xác nhận |
| #79 Nhãn độ tuổi TMDB + lọc trẻ em | ✅ AgeBadge 18+/P theo adult/genre; chế độ Kids có sẵn | MoviesPack + MoviesScreen |
| #62 Tìm kiếm tổng hợp | ✅ 1 ô tìm kiếm gộp: kênh TV (`/api/search`), creator + shorts trùng từ khoá, phim TMDB (local + remote) — mở kênh nhảy thẳng tab Truyền hình, creator/short nhảy tab Shorts | MoviesScreen (panel “Kết quả gộp”) + App.jsx wiring |
| #63 Tìm kiếm bằng giọng nói | ✅ có sẵn (voiceSearch + mic) | MoviesScreen |
| #64 Trending searches | ✅ `/api/stats/search` ghi cụm tìm (≥2 ký tự) + `/api/stats/trending-search` top; chips 🔥 Xu hướng khi ô tìm trống — bấm là tìm luôn | worker `trending_searches` + MoviesScreen |
| #65 Trang diễn viên + follow | ✅ follow diễn viên (`/api/actors/follow`, GET/POST, theo dõi/bỏ) + nút follow trong modal diễn viên (danh sách cast + trang diễn viên) | worker `actor_follows` + `PersonModal` (MoviesScreen) |
| #66 “Quay số” chọn phim theo tâm trạng | ✅ RouletteModal (6 mood) | MoviesScreen |

## C. Thể thao

| Mục | Trạng thái | Nơi |
| --- | --- | --- |
| #4 Giờ kickoff theo timezone + “nhắc tôi” | ✅ giờ local + nút remind (local notification) | SportsScreen/MatchDetailModal |
| #32 Follow đội → push | ✅ follow đội server (`/api/sports/follow` GET/POST) + nút follow từng đội trong chi tiết trận; khi trận live/ghi bàn → fan-out notification + web-push vi/en cho fan còn lại qua `/api/team/notify` (client tự báo khi mở trận live) | worker `team_follows` + MatchDetailModal |
| #33 Chat trận + poll thời gian thực | ✅ Tab “💬 Chat trận” trong chi tiết trận: chat/reaction theo phòng `match-<idEvent>` (tái dùng hạ tầng party) + poll tạo/vote/đếm %, tự làm mới 2.5s | MatchDetailModal `MatchChat` + worker `party_polls` |
| #34 Diễn biến bàn thắng | ✅ Timeline (goal/yellow/red/sub/corner) có sẵn | MatchDetailModal |
| #75 Tường tỉ số nhiều trận | ✅ Live scoreboard cards | SportsScreen |

## D. Vùng & BXH

| Mục | Trạng thái | Nơi |
| --- | --- | --- |
| B Blocklist quốc gia (`blocked_regions` + region preview) | ✅ server: playlist/events/ads/movie_sources lọc + `403 REGION_BLOCKED`; admin tab “Vùng chặn” | worker + AdminExtras |
| Hiển thị “không khả dụng ở 🇩🇪 DE” | ✅ server chặn/ẩn; toast/hướng dẫn vùng chặn ở client khi cần | — |
| #5 Top-10 theo quốc gia (heartbeat ghi `country`) | ✅ `watch_cc` + `/api/stats/top-country` + row “Đang hot tại 🇻🇳” | MoviesScreen/HotCountryRow |

## E. Shorts/Creator

| Mục | Trạng thái | Nơi |
| --- | --- | --- |
| #37 Tặng sao bằng XP | ✅ nút ⭐ trên short (50 XP/sao, chặn thiếu XP) | ShortsScreen + worker |
| #38 BXH creator tuần + huy hiệu | ✅ API `/api/shorts/creator/weekly` + modal BXH (🏆 3 huy chương đầu, ⭐/fan) mở từ nút “BXH sao tuần” | worker + ShortsScreen `WeeklyBoardModal` |
| #39 Ghim bình luận + Q&A | ✅ admin ghim (`/admin/comments`), hiển thị GHIM trong CommentsBox | worker + UI |
| #40 Challenge hashtag tuần | ✅ chips 🔥 thử thách đang chạy + modal tổng hợp từng challenge (bấm short là phát ngay, kể cả short ngoài feed) | worker `/api/challenges` + ShortsScreen `ChallengesModal` |

## F. Player/Dữ liệu

| Mục | Trạng thái | Nơi |
| --- | --- | --- |
| #15 Auto quality + data-saver (khoá ≤480p, tắt trailer tự phát) | ✅ Settings sẵn có + trailer fallback không auto dính pre-roll | SettingsPage/MoviePlayer |
| #16 Player settings theo profile | ⚠️ Settings lưu theo thiết bị (chưa theo từng profile) | — |
| #17 Thống kê dữ liệu + cảnh báo | ✅ đếm MB theo giây xem × chất lượng; hiện hôm nay/7 ngày + cảnh báo | `prefs.js` + SettingsPage |
| #22 Timeshift tua lại X giờ | ✅ nút −1/−2/−3 giờ theo EPG (kênh có catchup) | TVPage |

## G. Tài khoản & Admin

| Mục | Trạng thái | Nơi |
| --- | --- | --- |
| #48 Device manager + cảnh báo đăng nhập lạ | ✅ danh sách thiết bị + IP + “Đá hết thiết bị khác” + email khi IP lạ | SettingsPage + worker |
| #61 Onboarding quiz 3 câu | ✅ quiz trong Cài đặt giao diện; cá nhân hoá thứ tự phim/nhóm kênh | SettingsPage/prefs.js |
| #53 Dashboard realtime (bản đồ/hot kênh/lỗi) | ✅ tab Realtime admin | AdminExtras `/admin/realtime` |
| #57 Tab “Cảnh báo” in-dash + ack (không Telegram) | ✅ rules/feed/test/push/ack | worker `p48_alerts` + admin UI |
| #54 Biển bảo trì kênh + kênh thay thế | ✅ overlay bảo trì + gợi ý cùng nhóm | TVPage + worker |
| #56 Scheduled preview + auto-expiry | ✅ tạo/hẹn giờ/preview/expire | worker + AdminExtras SchedTab |
| #85 Link affiliate (vé rạp/sách) | ✅ admin config + chips trong chi tiết phim | MoviesPack/AffiliateChips |
| #86 Kênh tài trợ + banner EPG | ✅ cờ `sponsored` hiện “TÀI TRỢ”; BroadcastBanner có sẵn | worker/TVPage |
| #83 Chủ đề theo mùa | ✅ cài đặt + chip mùa | prefs.js/SettingsPage |
| #84 Wrapped năm | ✅ `/api/wrapped` + nút “✨ Wrapped” (auth) | MoviesScreen/WrappedModal |

## Còn thiếu rõ ràng (đã liệt kê ⚠️)
UI soạn playlist cá nhân hoá từ Watchlist (#11 — cơ chế mã `playlist` đã có), player settings theo profile (#16 — Settings hiện lưu theo thiết bị).

## Hướng dẫn kiểm thử nhanh (preview local)
1. Mở `http://127.0.0.1:3000` → tab **Phim**: nút “🎟️ Nhập mã” (nhập mã từ bạn bè / tự tạo qua Share trong chi tiết), “📺 Đồng bộ TV” (tạo mã 6 số ở máy A, nhập ở máy B), “🎲 Quay số”, “✨ Wrapped”, “Lọc”.
2. Tab **Phim**: ô tìm kiếm trống hiện 🔥 **Xu hướng** — bấm chip là tìm luôn; gõ từ khoá bất kỳ → kết quả **gộp** kênh TV (bấm mở kênh + nhảy tab Truyền hình), creator/shorts, phim.
3. Chi tiết phim TV: nút chuông **Theo dõi series**, thanh **Muốn xem/Đang xem/Đã xem**, chips **vé rạp/sách**, badge tuổi. Mở diễn viên (hàng Cast) → nút **Theo dõi diễn viên** (đồng bộ server).
4. Thêm phim vào **wishlist** (theo dõi) → mở lại nguồn phim đó khi đã có bản HD: nhận notification “bản ngon hơn” (≤1 lần/3 ngày).
5. Mở phim có nguồn HLS → nút **Bình luận** (ghim phút `@MM:SS` + ghi chú thoại).
6. Tab **Truyền hình**: chọn kênh → “Xem chung” tạo phòng; nút −1/−2/−3 giờ (nếu kênh catchup); kênh bảo trì hiện biển + kênh thay thế.
7. Tab **Thể thao** → chi tiết trận: nút follow từng đội (đội theo dõi khi live/ghi bàn sẽ fan-out push), tab **💬 Chat trận** (vào phòng, nhắn/react/tạo poll — tự làm mới 2.5s).
8. Tab **Shorts**: chips 🔥 thử thách hashtag + nút **BXH sao tuần**; bấm short trong challenge là phát ngay.
9. Admin (đăng nhập admin): panel mới Realtime/Cảnh báo/Vùng chặn/Bảo trì/Challenge/Affiliate + lịch đăng có preview.
