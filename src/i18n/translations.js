// Bản dịch cho app CHRTV — 5 ngôn ngữ.
// Mỗi text có 5 key (vi/en/zh/fil/fr). Dùng t('key') trong component.
// Thêm ngôn ngữ: thêm key mới + 5 bản dịch.

export const LANGUAGES = [
  { code: 'vi',  label: 'Tiếng Việt',     flag: '🇻🇳', country: 'Việt Nam' },
  { code: 'fil', label: 'Filipino',        flag: '🇵🇭', country: 'Pilipinas' },
  { code: 'zh',  label: '中文',            flag: '🇨🇳', country: '中国' },
  { code: 'en',  label: 'English',         flag: '🇬🇧', country: 'International' },
  { code: 'fr',  label: 'Français',        flag: '🇫🇷', country: 'France' },
];

// Hàm tiện: rút gọn bản dịch (nếu 1 ngôn ngữ chưa có → fallback vi → en → key)
// Dùng cú pháp: { vi: '...', en: '...', zh: '...', fil: '...', fr: '...' }
const T = {
  // ============== APP CHUNG ==============
  'app.brand': { vi: 'CHRTV', en: 'CHRTV', zh: 'CHRTV', fil: 'CHRTV', fr: 'CHRTV' },
  'app.tagline': { vi: 'Truyền hình & phim trực tuyến', en: 'Live TV & Movies Online', zh: '在线电视与电影', fil: 'Live TV at Mga Pelikula Online', fr: 'TV en direct & Films en ligne' },
  'app.search.placeholder': { vi: 'Tìm kênh, phim...', en: 'Search channels, movies...', zh: '搜索频道、电影...', fil: 'Maghanap ng channel, pelikula...', fr: 'Rechercher chaînes, films...' },
  'app.live_now': { vi: 'TRỰC TIẾP', en: 'LIVE NOW', zh: '直播中', fil: 'LIVE NGAYON', fr: 'EN DIRECT' },
  'app.loading': { vi: 'Đang tải...', en: 'Loading...', zh: '加载中...', fil: 'Naglo-load...', fr: 'Chargement...' },

  // ============== NAV / SIDEBAR ==============
  'nav.home': { vi: 'Trang Chủ', en: 'Home', zh: '首页', fil: 'Home', fr: 'Accueil' },
  'nav.live': { vi: 'Truyền Hình', en: 'Live TV', zh: '电视直播', fil: 'Live TV', fr: 'TV en direct' },
  'nav.movies': { vi: 'Phim Ảnh', en: 'Movies', zh: '电影', fil: 'Mga Pelikula', fr: 'Films' },
  'nav.settings': { vi: 'Cài Đặt', en: 'Settings', zh: '设置', fil: 'Mga Setting', fr: 'Paramètres' },
  'nav.admin': { vi: 'Quản Trị', en: 'Admin', zh: '管理', fil: 'Admin', fr: 'Admin' },
  'nav.profile': { vi: 'Hồ Sơ', en: 'Profile', zh: '个人资料', fil: 'Profile', fr: 'Profil' },
  'nav.login': { vi: 'Đăng Nhập', en: 'Sign In', zh: '登录', fil: 'Mag-sign In', fr: 'Se connecter' },
  'nav.logout': { vi: 'Đăng Xuất', en: 'Sign Out', zh: '退出', fil: 'Mag-sign Out', fr: 'Se déconnecter' },

  // ============== AUTH ==============
  'auth.title.login':    { vi: 'Đăng Nhập',        en: 'Sign In',         zh: '登录',         fil: 'Mag-sign In',     fr: 'Se connecter' },
  'auth.title.register': { vi: 'Đăng Ký',          en: 'Sign Up',         zh: '注册',         fil: 'Mag-sign Up',     fr: "S'inscrire" },
  'auth.title.verify':   { vi: 'Xác Minh Email',   en: 'Verify Email',    zh: '验证邮箱',     fil: 'I-verify ang Email', fr: 'Vérifier l\'email' },
  'auth.title.forgot':   { vi: 'Quên Mật Khẩu',   en: 'Forgot Password', zh: '忘记密码',     fil: 'Nakalimutan ang Password', fr: 'Mot de passe oublié' },
  'auth.title.reset':    { vi: 'Đặt Lại Mật Khẩu', en: 'Reset Password',  zh: '重置密码',     fil: 'I-reset ang Password', fr: 'Réinitialiser' },

  'auth.login.help':    { vi: 'Đăng nhập để đồng bộ dữ liệu',     en: 'Sign in to sync your data',          zh: '登录以同步数据',           fil: 'Mag-sign in para i-sync ang data', fr: 'Connectez-vous pour synchroniser' },
  'auth.register.help': { vi: 'Tạo tài khoản mới miễn phí',         en: 'Create a free account',              zh: '免费创建账户',             fil: 'Gumawa ng libreng account', fr: 'Créer un compte gratuit' },
  'auth.verify.help':   { vi: 'Nhập mã 6 số đã gửi đến email của bạn', en: 'Enter the 6-digit code sent to your email', zh: '输入发送到您邮箱的6位验证码', fil: 'Ilagay ang 6-digit code na ipinadala sa iyong email', fr: 'Entrez le code à 6 chiffres envoyé' },

  'auth.email_or_username': { vi: 'Email hoặc Username', en: 'Email or Username', zh: '邮箱或用户名', fil: 'Email o Username', fr: 'Email ou nom d\'utilisateur' },
  'auth.email':             { vi: 'Email',              en: 'Email',             zh: '邮箱',         fil: 'Email',           fr: 'Email' },
  'auth.username':          { vi: 'Tên đăng nhập',      en: 'Username',          zh: '用户名',       fil: 'Username',        fr: 'Nom d\'utilisateur' },
  'auth.password':          { vi: 'Mật khẩu',          en: 'Password',          zh: '密码',         fil: 'Password',        fr: 'Mot de passe' },
  'auth.new_password':      { vi: 'Mật khẩu mới',      en: 'New password',      zh: '新密码',       fil: 'Bagong password', fr: 'Nouveau mot de passe' },
  'auth.confirm_password':  { vi: 'Nhập lại mật khẩu', en: 'Confirm password',  zh: '确认密码',     fil: 'Kumpirmahin ang password', fr: 'Confirmer le mot de passe' },
  'auth.verify_code':       { vi: 'Mã xác minh (6 số)', en: 'Verification code (6 digits)', zh: '验证码（6位）', fil: 'Code ng verification (6 digit)', fr: 'Code de vérification (6 chiffres)' },
  'auth.reset_code':        { vi: 'Mã đặt lại',         en: 'Reset code',         zh: '重置代码',   fil: 'Reset code',     fr: 'Code de réinitialisation' },

  'auth.btn.login':    { vi: 'Đăng Nhập',  en: 'Sign In',   zh: '登录',    fil: 'Mag-sign In', fr: 'Se connecter' },
  'auth.btn.register': { vi: 'Đăng Ký',    en: 'Sign Up',   zh: '注册',    fil: 'Mag-sign Up', fr: "S'inscrire" },
  'auth.btn.verify':   { vi: 'Xác Minh',   en: 'Verify',    zh: '验证',    fil: 'I-verify',    fr: 'Vérifier' },
  'auth.btn.send_reset': { vi: 'Gửi mã',  en: 'Send code', zh: '发送代码', fil: 'Magpadala ng code', fr: 'Envoyer le code' },
  'auth.btn.reset':    { vi: 'Đặt Lại',    en: 'Reset',     zh: '重置',    fil: 'I-reset',     fr: 'Réinitialiser' },
  'auth.btn.resend':   { vi: 'Gửi lại mã', en: 'Resend',    zh: '重新发送', fil: 'Magpadala muli', fr: 'Renvoyer' },

  'auth.link.to_register': { vi: 'Đăng ký mới',           en: 'Create account',      zh: '创建账户',     fil: 'Gumawa ng account', fr: 'Créer un compte' },
  'auth.link.to_login':    { vi: 'Đã có tài khoản? Đăng nhập', en: 'Have an account? Sign in', zh: '已有账户？登录', fil: 'May account na? Mag-sign in', fr: 'Déjà un compte ? Se connecter' },
  'auth.link.forgot':      { vi: 'Quên mật khẩu?',       en: 'Forgot password?',    zh: '忘记密码？',   fil: 'Nakalimutan ang password?', fr: 'Mot de passe oublié ?' },

  'auth.msg.registered': { vi: 'Đăng ký thành công! Nhập mã xác minh từ email.', en: 'Registered! Enter the code sent to your email.', zh: '注册成功！请输入邮件中的验证码。', fil: 'Nakarehistro na! Ilagay ang code sa iyong email.', fr: 'Inscription réussie ! Entrez le code reçu par email.' },
  'auth.msg.code_sent':  { vi: 'Mã đặt lại đã gửi đến email.', en: 'Reset code sent to your email.', zh: '重置代码已发送到您的邮箱。', fil: 'Naipadala na ang reset code sa iyong email.', fr: 'Code de réinitialisation envoyé.' },
  'auth.msg.reset_ok':   { vi: 'Đặt lại thành công!', en: 'Password reset successfully!', zh: '密码重置成功！', fil: 'Matagumpay na na-reset ang password!', fr: 'Mot de passe réinitialisé !' },
  'auth.msg.login_ok':   { vi: 'Đăng nhập thành công!', en: 'Signed in successfully!', zh: '登录成功！', fil: 'Matagumpay na naka-sign in!', fr: 'Connexion réussie !' },
  'auth.msg.verified':   { vi: 'Xác minh email thành công!', en: 'Email verified successfully!', zh: '邮箱验证成功！', fil: 'Matagumpay na na-verify ang email!', fr: 'Email vérifié !' },
  'auth.msg.verify_code_label': { vi: 'Mã xác minh: ', en: 'Verification code: ', zh: '验证码：', fil: 'Code ng verification: ', fr: 'Code de vérification : ' },
  'auth.password_hint': { vi: 'Mật khẩu (≥6 ký tự)', en: 'Password (≥6 chars)', zh: '密码（至少6个字符）', fil: 'Password (≥6 na karakter)', fr: 'Mot de passe (≥6 caractères)' },
  'auth.new_password_hint': { vi: 'Mật khẩu mới (≥6)', en: 'New password (≥6)', zh: '新密码（至少6个字符）', fil: 'Bagong password (≥6)', fr: 'Nouveau mot de passe (≥6)' },
  'auth.forgot.help': { vi: 'Nhập email để nhận mã đặt lại mật khẩu', en: 'Enter your email to receive a reset code', zh: '输入您的邮箱以接收重置代码', fil: 'Ilagay ang iyong email para makatanggap ng reset code', fr: 'Entrez votre email pour recevoir un code de réinitialisation' },
  'auth.reset.help': { vi: 'Nhập mã và mật khẩu mới', en: 'Enter the code and your new password', zh: '输入代码和新密码', fil: 'Ilagay ang code at bagong password', fr: 'Entrez le code et votre nouveau mot de passe' },

  'auth.terms_label':   { vi: 'Bằng việc tạo tài khoản, bạn đồng ý với ', en: 'By creating an account, you agree to the ', zh: '创建账户即表示您同意', fil: 'Sa pamamagitan ng paggawa ng account, sumasang-ayon ka sa ', fr: 'En créant un compte, vous acceptez les ' },
  'auth.terms_link':    { vi: 'Điều khoản',               en: 'Terms of Service',   zh: '服务条款',     fil: 'Mga Tuntunin',   fr: "Conditions d'utilisation" },
  'auth.no_access':      { vi: 'Bạn cần tài khoản Admin', en: 'Admin account required', zh: '需要管理员账户', fil: 'Kailangan ng Admin account', fr: 'Compte administrateur requis' },
  'auth.no_access.desc': { vi: 'Đăng nhập bằng tài khoản Admin để truy cập.', en: 'Please sign in with an admin account.', zh: '请使用管理员账户登录。', fil: 'Mag-sign in gamit ang Admin account.', fr: 'Connectez-vous avec un compte admin.' },

  'profile.who_is_watching': { vi: 'Ai đang xem?', en: 'Who is watching?', zh: '谁在看？', fil: 'Sino ang nanonood?', fr: 'Qui regarde ?' },
  'profile.select_profile': { vi: 'Chọn hồ sơ để tiếp tục', en: 'Select a profile to continue', zh: '选择个人资料继续', fil: 'Pumili ng profile para magpatuloy', fr: 'Choisissez un profil pour continuer' },
  'profile.add_profile':    { vi: 'Thêm hồ sơ',            en: 'Add profile',             zh: '添加个人资料',      fil: 'Magdagdag ng profile', fr: 'Ajouter un profil' },
  'profile.name':           { vi: 'Tên hồ sơ',              en: 'Profile name',            zh: '个人资料名称',     fil: 'Pangalan ng profile', fr: 'Nom du profil' },
  'profile.choose_avatar':  { vi: 'Chọn avatar',            en: 'Choose avatar',           zh: '选择头像',         fil: 'Pumili ng avatar', fr: 'Choisir un avatar' },
  'profile.edit_profile':   { vi: 'Sửa hồ sơ',              en: 'Edit profile',            zh: '编辑个人资料',     fil: 'I-edit ang profile', fr: 'Modifier le profil' },
  'profile.delete_profile': { vi: 'Xóa hồ sơ',              en: 'Delete profile',          zh: '删除个人资料',     fil: 'Tanggalin ang profile', fr: 'Supprimer le profil' },


  // ============== MOVIES ==============
  'movies.title':                  { vi: 'Phim · TV Shows',         en: 'Movies · TV Shows',         zh: '电影 · 电视剧',                fil: 'Mga Pelikula · TV Shows',          fr: 'Films · Séries TV' },
  'movies.search.placeholder':     { vi: 'Tìm phim, TV show, diễn viên...', en: 'Search movies, TV shows, actors...', zh: '搜索电影、电视剧、演员...', fil: 'Maghanap ng pelikula, TV show, artista...', fr: 'Rechercher films, séries, acteurs...' },
  'movies.row.trending':           { vi: '🔥 Xu Hướng Tuần',        en: '🔥 Trending This Week',    zh: '🔥 本周热门',                 fil: '🔥 Trending Ngayong Linggo',        fr: '🔥 Tendances de la semaine' },
  'movies.row.now_playing':        { vi: '🎬 Đang Chiếu Rạp',       en: '🎬 In Theaters',           zh: '🎬 正在热映',                 fil: '🎬 Sinehan Ngayon',                fr: '🎬 Au cinéma' },
  'movies.row.top_rated':          { vi: '⭐ Đánh Giá Cao Nhất',    en: '⭐ Top Rated',             zh: '⭐ 最高评分',                 fil: '⭐ Pinakamataas na Rating',         fr: '⭐ Les mieux notés' },
  'movies.row.upcoming':           { vi: '📅 Sắp Chiếu',            en: '📅 Upcoming',              zh: '📅 即将上映',                 fil: '📅 Pupunta',                       fr: '📅 À venir' },
  'movies.row.popular_tv':         { vi: '📺 TV Shows Phổ Biến',    en: '📺 Popular TV Shows',      zh: '📺 热门电视剧',                fil: '📺 Sikat na TV Shows',              fr: '📺 Séries TV populaires' },
  'movies.row.featured':           { vi: '✨ Đề Xuất',              en: '✨ Featured',              zh: '✨ 推荐',                     fil: '✨ Itinatampok',                   fr: '✨ En vedette' },
  'movies.genre.all':              { vi: 'Tất cả',                  en: 'All',                     zh: '全部',                       fil: 'Lahat',                           fr: 'Tous' },
  'movies.load_more':              { vi: 'Xem thêm',                en: 'Load more',               zh: '加载更多',                   fil: 'Mag-load pa',                     fr: 'Voir plus' },
  'movies.results':                { vi: 'Kết quả',                 en: 'Results',                 zh: '结果',                       fil: 'Mga Resulta',                     fr: 'Résultats' },
  'movies.no_results':             { vi: 'Không tìm thấy phim nào. Thử từ khóa khác.', en: 'No movies found. Try another keyword.', zh: '未找到电影。请尝试其他关键词。', fil: 'Walang nahanap na pelikula. Subukan ang ibang keyword.', fr: 'Aucun film trouvé. Essayez un autre mot-clé.' },
  'movies.loading_catalog':        { vi: 'Đang nạp kho phim…',      en: 'Loading catalog…',        zh: '正在加载电影库…',            fil: 'Naglo-load ng catalog…',           fr: 'Chargement du catalogue…' },
  'movies.count_label':            { vi: 'phim & TV show',          en: 'movies & TV shows',       zh: '电影与电视剧',                fil: 'pelikula at TV show',              fr: 'films & séries' },
  'movies.btn.play':               { vi: 'Xem phim',                en: 'Watch now',               zh: '立即观看',                   fil: 'Panoorin',                        fr: 'Regarder' },
  'movies.btn.info':               { vi: 'Thông tin',               en: 'Info',                    zh: '详情',                       fil: 'Impormasyon',                      fr: 'Info' },
  'movies.tmdb_key_btn.label':     { vi: '🔑 Cài TMDB key',         en: '🔑 Set TMDB key',         zh: '🔑 设置 TMDB 密钥',          fil: '🔑 I-set ang TMDB key',           fr: '🔑 Définir clé TMDB' },
  'movies.tmdb_key_btn.ok':        { vi: '🔑 Key TMDB ✓',           en: '🔑 TMDB Key ✓',           zh: '🔑 TMDB 密钥 ✓',             fil: '🔑 TMDB Key ✓',                   fr: '🔑 Clé TMDB ✓' },
  'movies.tmdb_keybox.title':      { vi: '⚠️ Bạn đang dùng key mặc định — chỉ tìm trong phim có sẵn. Dán key TMDB thật để tìm TOÀN BỘ phim:', en: '⚠️ Using default key — only matches in local catalog. Paste a real TMDB key to search ALL movies:', zh: '⚠️ 您正在使用默认密钥——只能在本地电影库中搜索。粘贴真正的 TMDB 密钥以搜索全部电影：', fil: '⚠️ Ginagamit ang default key — nasa local catalog lang. Mag-paste ng totoong TMDB key para maghanap ng LAHAT ng pelikula:', fr: '⚠️ Vous utilisez la clé par défaut — seulement le catalogue local. Collez une vraie clé TMDB pour TOUS les films :' },
  'movies.tmdb_keybox.change':     { vi: 'Thay đổi TMDB API key (lưu trên trình duyệt này):', en: 'Change TMDB API key (saved in this browser):', zh: '更改 TMDB API 密钥（保存在此浏览器）：', fil: 'Palitan ang TMDB API key (naka-save sa browser na ito):', fr: 'Changer la clé TMDB API (sauvegardée dans ce navigateur) :' },
  'movies.tmdb_keybox.placeholder':{ vi: 'Dán key TMDB vào đây (vd: 1a2b3c4d...)', en: 'Paste TMDB key here (e.g. 1a2b3c4d...)', zh: '在此粘贴 TMDB 密钥（例如：1a2b3c4d...）', fil: 'Mag-paste ng TMDB key dito (hal. 1a2b3c4d...)', fr: 'Coller la clé TMDB ici (ex. 1a2b3c4d...)' },
  'movies.tmdb_keybox.btn.save':   { vi: 'Lưu key & tìm lại',       en: 'Save key & search',       zh: '保存密钥并搜索',             fil: 'I-save ang key at maghanap',       fr: 'Enregistrer et rechercher' },
  'movies.tmdb_keybox.btn.saving': { vi: 'Đang kiểm tra…',          en: 'Checking…',               zh: '检查中…',                   fil: 'Tinitignan…',                      fr: 'Vérification…' },
  'movies.tmdb_keybox.hint':       { vi: 'Key miễn phí tại themoviedb.org/settings/api — dán vào đây, app lưu ngay trên trình duyệt bạn.', en: 'Free key at themoviedb.org/settings/api — paste here, saved in your browser.', zh: '免费密钥：themoviedb.org/settings/api — 粘贴此处，保存在浏览器中。', fil: 'Libreng key sa themoviedb.org/settings/api — mag-paste dito, naka-save sa browser.', fr: 'Clé gratuite sur themoviedb.org/settings/api — collez ici, sauvegardée dans votre navigateur.' },

  // ============== TOAST / COMMON ==============
  'toast.kid_blocked': { vi: 'Hồ sơ trẻ em — bị giới hạn nội dung', en: 'Kid profile — content restricted', zh: '儿童档案 — 内容受限', fil: 'Profile ng bata — limitado', fr: 'Profil enfant — contenu restreint' },
  'toast.tmdb_ok':     { vi: 'Đã lưu TMDB API key — kho phim mở rộng toàn bộ TMDB', en: 'TMDB key saved — catalog expanded', zh: 'TMDB 密钥已保存 — 电影库扩展', fil: 'Naka-save ang TMDB key — lumawak ang catalog', fr: 'Clé TMDB enregistrée — catalogue étendu' },

  // ============== SETTINGS ==============
  'settings.title':     { vi: 'Cài Đặt',           en: 'Settings',         zh: '设置',          fil: 'Mga Setting',     fr: 'Paramètres' },
  'settings.appearance': { vi: 'Giao Diện', en: 'Appearance', zh: '外观', fil: 'Itsura', fr: 'Apparence' },
  'settings.theme': { vi: 'Chế độ nền', en: 'Theme', zh: '主题', fil: 'Tema', fr: 'Thème' },
  'settings.dark': { vi: 'Tối', en: 'Dark', zh: '深色', fil: 'Madilim', fr: 'Sombre' },
  'settings.light': { vi: 'Sáng', en: 'Light', zh: '浅色', fil: 'Maliwanag', fr: 'Clair' },
  'settings.video': { vi: 'Video', en: 'Video', zh: '视频', fil: 'Video', fr: 'Vidéo' },
  'settings.default_quality': { vi: 'Chất lượng mặc định', en: 'Default quality', zh: '默认画质', fil: 'Default na kalidad', fr: 'Qualité par défaut' },
  'settings.auto': { vi: 'Tự động', en: 'Auto', zh: '自动', fil: 'Awtomatiko', fr: 'Auto' },
  'settings.buffer_goal': { vi: 'Buffer goal', en: 'Buffer goal', zh: '缓冲目标', fil: 'Buffer goal', fr: 'Buffer (secondes)' },
  'settings.auto_next': { vi: 'Tự chuyển kênh khi lỗi', en: 'Auto-next on error', zh: '出错时自动切换频道', fil: 'Auto-next kapag error', fr: 'Chaîne suivante si erreur' },
  'settings.gesture': { vi: 'Gesture điều khiển', en: 'Gesture control', zh: '手势控制', fil: 'Gesture control', fr: 'Contrôle gestuel' },
  'settings.parental': { vi: 'Kiểm soát phụ huynh', en: 'Parental Control', zh: '家长控制', fil: 'Parental Control', fr: 'Contrôle parental' },
  'settings.parental_enable': { vi: 'Bật kiểm soát', en: 'Enable control', zh: '启用控制', fil: 'I-enable ang control', fr: 'Activer' },
  'settings.pin_placeholder': { vi: 'Nhập PIN', en: 'Enter PIN', zh: '输入 PIN', fil: 'Ilagay ang PIN', fr: 'Entrer le code PIN' },
  'settings.data_sources': { vi: 'Nguồn dữ liệu', en: 'Data Sources', zh: '数据源', fil: 'Mga Source ng Data', fr: 'Sources de données' },
  'settings.epg_url': { vi: 'URL EPG tùy chỉnh', en: 'Custom EPG URL', zh: '自定义 EPG 网址', fil: 'Custom EPG URL', fr: 'URL EPG personnalisée' },
  'settings.confirm_reset': { vi: 'Xác nhận xóa tất cả?', en: 'Confirm reset all?', zh: '确认重置所有？', fil: 'Kumpirmahin ang reset?', fr: 'Confirmer la réinitialisation ?' },
  'settings.reset_default': { vi: 'Đặt lại mặc định', en: 'Reset to default', zh: '重置为默认', fil: 'I-reset sa default', fr: 'Réinitialiser' },

  'settings.language':  { vi: 'Ngôn ngữ',          en: 'Language',         zh: '语言',          fil: 'Wika',            fr: 'Langue' },
  'settings.choose_lang':{ vi: 'Chọn ngôn ngữ',   en: 'Choose language',  zh: '选择语言',      fil: 'Pumili ng wika',  fr: 'Choisir la langue' },

  // ============== COMMON ==============
  'common.back':   { vi: 'Quay lại',  en: 'Back',    zh: '返回',  fil: 'Bumalik',  fr: 'Retour' },
  'common.close':  { vi: 'Đóng',      en: 'Close',   zh: '关闭',  fil: 'Isara',    fr: 'Fermer' },
  'common.cancel': { vi: 'Huỷ',       en: 'Cancel',  zh: '取消',  fil: 'Kanselahin', fr: 'Annuler' },
  'common.save':   { vi: 'Lưu',       en: 'Save',    zh: '保存',  fil: 'I-save',   fr: 'Enregistrer' },
  'common.continue':{ vi: 'Tiếp tục', en: 'Continue', zh: '继续',  fil: 'Magpatuloy', fr: 'Continuer' },

  // ============== PLAYER ==============
  'player.live':          { vi: 'TRỰC TIẾP',         en: 'LIVE',                  zh: '直播',     fil: 'LIVE',       fr: 'EN DIRECT' },
  'video.backup_stream': { vi: 'Luồng dự phòng', en: 'Backup stream', zh: '备用流', fil: 'Backup stream', fr: 'Flux de secours' },

  'epg.title':           { vi: 'EPG & Xem Lại',         en: 'EPG & Replay',      zh: '电子节目单与回看',         fil: 'EPG & Replay',    fr: 'EPG & Replay' },
  'epg.today':           { vi: 'Hôm Nay',                en: 'Today',             zh: '今天',                    fil: 'Ngayon',          fr: "Aujourd'hui" },
  'epg.yesterday':       { vi: 'Hôm Qua',                en: 'Yesterday',         zh: '昨天',                    fil: 'Kahapon',         fr: 'Hier' },
  'epg.no_channel_found':{ vi: 'Không tìm thấy kênh.',   en: 'No channel found.', zh: '未找到频道。',            fil: 'Walang nahanap na channel.', fr: 'Aucune chaîne trouvée.' },
  'epg.back':            { vi: 'Xem lại',                en: 'Replay',            zh: '回看',                    fil: 'Replay',          fr: 'Replay' },

  'player.replay':        { vi: 'Xem lại',            en: 'Replay',                zh: '回看',     fil: 'Replay',     fr: 'Replay' },
  'player.pause':         { vi: 'Tạm dừng',           en: 'Pause',                 zh: '暂停',     fil: 'I-pause',    fr: 'Pause' },
  'player.play':          { vi: 'Phát',               en: 'Play',                  zh: '播放',     fil: 'I-play',     fr: 'Lecture' },
  'player.mute':          { vi: 'Tắt tiếng',          en: 'Mute',                  zh: '静音',     fil: 'I-mute',     fr: 'Muet' },
  'player.unmute':        { vi: 'Bật tiếng',          en: 'Unmute',                zh: '取消静音', fil: 'I-unmute',   fr: 'Son' },
  'player.fullscreen':    { vi: 'Toàn màn hình',      en: 'Fullscreen',            zh: '全屏',     fil: 'Fullscreen', fr: 'Plein écran' },
  'player.exit_fullscreen':{vi: 'Thoát toàn màn hình', en: 'Exit fullscreen',     zh: '退出全屏', fil: 'Lumabas sa fullscreen', fr: 'Quitter plein écran' },
  'player.up_next':       { vi: 'Tiếp theo',          en: 'Up next',               zh: '下一个',   fil: 'Susunod',    fr: 'À suivre' },

  // ============== LANGUAGE PICKER ==============
  'langpicker.title':   { vi: 'Chọn ngôn ngữ của bạn', en: 'Choose your language', zh: '选择您的语言', fil: 'Piliin ang iyong wika', fr: 'Choisissez votre langue' },
  'langpicker.subtitle':{ vi: 'Bạn có thể đổi lại bất cứ lúc nào', en: 'You can change this anytime', zh: '您随时可以更改', fil: 'Maaari mong palitan anumang oras', fr: 'Vous pouvez changer à tout moment' },
  'langpicker.suggest': { vi: '🌍 Gợi ý theo vị trí của bạn', en: '🌍 Suggested for your region', zh: '🌍 根据您的位置推荐', fil: '🌍 Inirerekomenda para sa iyong rehiyon', fr: '🌍 Suggéré pour votre région' },
};

// ========== HÀM TIỆN ==========
export function translate(key, lang) {
  const entry = T[key];
  if (!entry) return key;
  return entry[lang] || entry.en || entry.vi || key;
}

// ========== GEO-DETECT: gợi ý ngôn ngữ từ timezone/browser ==========
export function detectLang() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const locale = (navigator.language || 'en').toLowerCase();
    // VN
    if (['Asia/Ho_Chi_Minh','Asia/Saigon','Asia/Hanoi'].includes(tz) || locale.startsWith('vi')) return 'vi';
    // Philippines
    if (['Asia/Manila'].includes(tz) || locale.startsWith('fil') || locale.startsWith('tl')) return 'fil';
    // China / Taiwan / HK
    if (['Asia/Shanghai','Asia/Hong_Kong','Asia/Taipei','Asia/Chongqing','Asia/Harbin'].includes(tz) || locale.startsWith('zh')) return 'zh';
    // France / Belgium / Suisse / Canada (Pháp ngữ)
    if (['Europe/Paris','Europe/Brussels','Europe/Zurich','America/Montreal'].includes(tz) || locale.startsWith('fr')) return 'fr';
    // Mặc định
    return 'en';
  } catch { return 'en'; }
}
