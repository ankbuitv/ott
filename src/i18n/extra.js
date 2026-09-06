// Bản dịch mở rộng cho CHRTV PLAY — 10 ngôn ngữ bổ sung (ja/ko/th/id/ms/hi/de/es/pt/ru).
// Key nào chưa có sẽ tự fallback về tiếng Anh (xem translate() trong translations.js).

export const EXTRA_LANGUAGES = [
  { code: 'ja', label: '日本語', flag: '🇯🇵', country: '日本' },
  { code: 'ko', label: '한국어', flag: '🇰🇷', country: '한국' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭', country: 'ประเทศไทย' },
  { code: 'id', label: 'Indonesia', flag: '🇮🇩', country: 'Indonesia' },
  { code: 'ms', label: 'Melayu', flag: '🇲🇾', country: 'Malaysia' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳', country: 'भारत' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', country: 'Deutschland' },
  { code: 'es', label: 'Español', flag: '🇪🇸', country: 'España' },
  { code: 'pt', label: 'Português', flag: '🇧🇷', country: 'Brasil' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', country: 'Россия' },
];

export const EXTRA = {
  // ============== NAV ==============
  'nav.home': { ja: 'ホーム', ko: '홈', th: 'หน้าแรก', id: 'Beranda', ms: 'Laman Utama', hi: 'होम', de: 'Start', es: 'Inicio', pt: 'Início', ru: 'Главная' },
  'nav.live': { ja: 'ライブTV', ko: '실시간 TV', th: 'ทีวีสด', id: 'TV Langsung', ms: 'TV Langsung', hi: 'लाइव टीवी', de: 'Live-TV', es: 'TV en vivo', pt: 'TV ao vivo', ru: 'Прямой эфир' },
  'nav.movies': { ja: '映画', ko: '영화', th: 'ภาพยนตร์', id: 'Film', ms: 'Filem', hi: 'फिल्में', de: 'Filme', es: 'Películas', pt: 'Filmes', ru: 'Фильмы' },
  'nav.settings': { ja: '設定', ko: '설정', th: 'ตั้งค่า', id: 'Pengaturan', ms: 'Tetapan', hi: 'सेटिंग्स', de: 'Einstellungen', es: 'Ajustes', pt: 'Configurações', ru: 'Настройки' },
  'nav.admin': { ja: '管理', ko: '관리', th: 'ผู้ดูแล', id: 'Admin', ms: 'Admin', hi: 'एडमिन', de: 'Admin', es: 'Admin', pt: 'Admin', ru: 'Админ' },
  'nav.profile': { ja: 'プロフィール', ko: '프로필', th: 'โปรไฟล์', id: 'Profil', ms: 'Profil', hi: 'प्रोफ़ाइल', de: 'Profil', es: 'Perfil', pt: 'Perfil', ru: 'Профиль' },
  'nav.login': { ja: 'ログイン', ko: '로그인', th: 'เข้าสู่ระบบ', id: 'Masuk', ms: 'Log Masuk', hi: 'लॉग इन', de: 'Anmelden', es: 'Iniciar sesión', pt: 'Entrar', ru: 'Войти' },
  'nav.logout': { ja: 'ログアウト', ko: '로그아웃', th: 'ออกจากระบบ', id: 'Keluar', ms: 'Log Keluar', hi: 'लॉग आउट', de: 'Abmelden', es: 'Cerrar sesión', pt: 'Sair', ru: 'Выйти' },
  'nav.shortcuts': { ja: 'Shorts', ko: 'Shorts', th: 'Shorts', id: 'Shorts', ms: 'Shorts', hi: 'Shorts', de: 'Shorts', es: 'Shorts', pt: 'Shorts', ru: 'Shorts' },
  'nav.plans': { ja: 'プラン購入', ko: '요금제', th: 'ซื้อแพ็กเกจ', id: 'Beli Paket', ms: 'Beli Pakej', hi: 'प्लान खरीदें', de: 'Pakete', es: 'Planes', pt: 'Planos', ru: 'Тарифы' },
  'nav.notifications': { ja: '通知', ko: '알림', th: 'การแจ้งเตือน', id: 'Notifikasi', ms: 'Pemberitahuan', hi: 'सूचनाएं', de: 'Mitteilungen', es: 'Notificaciones', pt: 'Notificações', ru: 'Уведомления' },
  'nav.read_all': { ja: 'すべて既読', ko: '모두 읽음', th: 'อ่านทั้งหมด', id: 'Tandai dibaca', ms: 'Tandakan dibaca', hi: 'सभी पढ़ा हुआ', de: 'Alle lesen', es: 'Marcar leídas', pt: 'Marcar lidas', ru: 'Прочитать все' },
  'nav.no_notifs': { ja: '通知はありません', ko: '알림이 없습니다', th: 'ยังไม่มีการแจ้งเตือน', id: 'Belum ada notifikasi', ms: 'Tiada pemberitahuan', hi: 'कोई सूचना नहीं', de: 'Keine Mitteilungen', es: 'Sin notificaciones', pt: 'Sem notificações', ru: 'Нет уведомлений' },
  // ============== APP ==============
  'app.brand': { ja: 'CHRTV PL▷Y', ko: 'CHRTV PL▷Y', th: 'CHRTV PL▷Y', id: 'CHRTV PL▷Y', ms: 'CHRTV PL▷Y', hi: 'CHRTV PL▷Y', de: 'CHRTV PL▷Y', es: 'CHRTV PL▷Y', pt: 'CHRTV PL▷Y', ru: 'CHRTV PL▷Y' },
  'app.tagline': { ja: 'Entertainment in your hands', ko: 'Entertainment in your hands', th: 'Entertainment in your hands', id: 'Entertainment in your hands', ms: 'Entertainment in your hands', hi: 'Entertainment in your hands', de: 'Entertainment in your hands', es: 'Entertainment in your hands', pt: 'Entertainment in your hands', ru: 'Entertainment in your hands' },
  'app.search.placeholder': { ja: 'チャンネル、映画を検索...', ko: '채널, 영화 검색...', th: 'ค้นหาช่อง, หนัง...', id: 'Cari kanal, film...', ms: 'Cari saluran, filem...', hi: 'चैनल, फिल्म खोजें...', de: 'Sender, Filme suchen...', es: 'Buscar canales, películas...', pt: 'Buscar canais, filmes...', ru: 'Поиск каналов, фильмов...' },
  'app.live_now': { ja: 'ライブ', ko: '생방송', th: 'สด', id: 'LIVE', ms: 'LANGSUNG', hi: 'लाइव', de: 'LIVE', es: 'EN VIVO', pt: 'AO VIVO', ru: 'ЭФИР' },
  'app.loading': { ja: '読み込み中...', ko: '로딩 중...', th: 'กำลังโหลด...', id: 'Memuat...', ms: 'Memuatkan...', hi: 'लोड हो रहा है...', de: 'Wird geladen...', es: 'Cargando...', pt: 'Carregando...', ru: 'Загрузка...' },
  'app.watch': { ja: '見る', ko: '시청', th: 'ดู', id: 'Tonton', ms: 'Tonton', hi: 'देखें', de: 'Ansehen', es: 'Ver', pt: 'Assistir', ru: 'Смотреть' },
  'app.watch_now': { ja: '今すぐ見る', ko: '지금 시청', th: 'ดูเลย', id: 'Tonton sekarang', ms: 'Tonton sekarang', hi: 'अभी देखें', de: 'Jetzt ansehen', es: 'Ver ahora', pt: 'Assistir agora', ru: 'Смотреть сейчас' },
  'app.favorites': { ja: 'お気に入り', ko: '즐겨찾기', th: 'รายการโปรด', id: 'Favorit', ms: 'Kegemaran', hi: 'पसंदीदा', de: 'Favoriten', es: 'Favoritos', pt: 'Favoritos', ru: 'Избранное' },
  'app.watching': { ja: '再生中: ', ko: '재생 중: ', th: 'กำลังเล่น: ', id: 'Sedang diputar: ', ms: 'Sedang dimainkan: ', hi: 'चल रहा है: ', de: 'Läuft gerade: ', es: 'Reproduciendo: ', pt: 'Tocando agora: ', ru: 'Сейчас играет: ' },
  // ============== COMMON ==============
  'common.back': { ja: '戻る', ko: '뒤로', th: 'ย้อนกลับ', id: 'Kembali', ms: 'Kembali', hi: 'वापस', de: 'Zurück', es: 'Atrás', pt: 'Voltar', ru: 'Назад' },
  'common.close': { ja: '閉じる', ko: '닫기', th: 'ปิด', id: 'Tutup', ms: 'Tutup', hi: 'बंद करें', de: 'Schließen', es: 'Cerrar', pt: 'Fechar', ru: 'Закрыть' },
  'common.cancel': { ja: 'キャンセル', ko: '취소', th: 'ยกเลิก', id: 'Batal', ms: 'Batal', hi: 'रद्द करें', de: 'Abbrechen', es: 'Cancelar', pt: 'Cancelar', ru: 'Отмена' },
  'common.save': { ja: '保存', ko: '저장', th: 'บันทึก', id: 'Simpan', ms: 'Simpan', hi: 'सहेजें', de: 'Speichern', es: 'Guardar', pt: 'Salvar', ru: 'Сохранить' },
  'common.continue': { ja: '続ける', ko: '계속', th: 'ดำเนินการต่อ', id: 'Lanjutkan', ms: 'Teruskan', hi: 'जारी रखें', de: 'Weiter', es: 'Continuar', pt: 'Continuar', ru: 'Продолжить' },
  // ============== PLAYER ==============
  'player.live': { ja: 'ライブ', ko: '생방송', th: 'สด', id: 'LIVE', ms: 'LANGSUNG', hi: 'लाइव', de: 'LIVE', es: 'EN VIVO', pt: 'AO VIVO', ru: 'ЭФИР' },
  'player.replay': { ja: '再放送', ko: '다시 보기', th: 'ดูย้อนหลัง', id: 'Tayangan ulang', ms: 'Ulangan', hi: 'पुनः प्रसारण', de: 'Wiederholung', es: 'Repetición', pt: 'Reprise', ru: 'Повтор' },
  'player.pause': { ja: '一時停止', ko: '일시정지', th: 'หยุดชั่วคราว', id: 'Jeda', ms: 'Jeda', hi: 'रोकें', de: 'Pause', es: 'Pausar', pt: 'Pausar', ru: 'Пауза' },
  'player.play': { ja: '再生', ko: '재생', th: 'เล่น', id: 'Putar', ms: 'Main', hi: 'चलाएं', de: 'Abspielen', es: 'Reproducir', pt: 'Reproduzir', ru: 'Играть' },
  'player.mute': { ja: 'ミュート', ko: '음소거', th: 'ปิดเสียง', id: 'Bisukan', ms: 'Bisukan', hi: 'म्यूट', de: 'Stumm', es: 'Silenciar', pt: 'Silenciar', ru: 'Без звука' },
  'player.unmute': { ja: 'ミュート解除', ko: '음소거 해제', th: 'เปิดเสียง', id: 'Suarakan', ms: 'Nyahbisukan', hi: 'अनम्यूट', de: 'Ton an', es: 'Activar sonido', pt: 'Ativar som', ru: 'Со звуком' },
  'player.fullscreen': { ja: '全画面', ko: '전체 화면', th: 'เต็มจอ', id: 'Layar penuh', ms: 'Skrin penuh', hi: 'पूर्ण स्क्रीन', de: 'Vollbild', es: 'Pantalla completa', pt: 'Tela cheia', ru: 'Во весь экран' },
  'player.exit_fullscreen': { ja: '全画面を終了', ko: '전체 화면 종료', th: 'ออกจากเต็มจอ', id: 'Keluar layar penuh', ms: 'Keluar skrin penuh', hi: 'पूर्ण स्क्रीन से बाहर', de: 'Vollbild beenden', es: 'Salir de pantalla completa', pt: 'Sair da tela cheia', ru: 'Выйти из полноэкранного' },
  'player.up_next': { ja: '次の番組', ko: '다음 프로그램', th: 'รายการถัดไป', id: 'Berikutnya', ms: 'Seterusnya', hi: 'आगे', de: 'Als Nächstes', es: 'A continuación', pt: 'A seguir', ru: 'Далее' },
  'player.stats': { ja: '統計', ko: '통계', th: 'สถิติ', id: 'Statistik', ms: 'Statistik', hi: 'आंकड़े', de: 'Statistik', es: 'Estadísticas', pt: 'Estatísticas', ru: 'Статистика' },
  'player.resolution': { ja: '解像度', ko: '해상도', th: 'ความละเอียด', id: 'Resolusi', ms: 'Resolusi', hi: 'रिज़ॉल्यूशन', de: 'Auflösung', es: 'Resolución', pt: 'Resolução', ru: 'Разрешение' },
  'player.dropped': { ja: 'ドロップフレーム', ko: '드롭 프레임', th: 'เฟรมที่หาย', id: 'Frame terlewat', ms: 'Bingkai tercicir', hi: 'छूटे फ्रेम', de: 'Verlorene Frames', es: 'Fotogramas perdidos', pt: 'Quadros perdidos', ru: 'Потерянные кадры' },
  'player.quality': { ja: '画質', ko: '화질', th: 'คุณภาพ', id: 'Kualitas', ms: 'Kualiti', hi: 'क्वालिटी', de: 'Qualität', es: 'Calidad', pt: 'Qualidade', ru: 'Качество' },
  'player.auto_quality': { ja: '自動', ko: '자동', th: 'อัตโนมัติ', id: 'Otomatis', ms: 'Automatik', hi: 'ऑटो', de: 'Automatisch', es: 'Automático', pt: 'Automático', ru: 'Авто' },
  'player.language': { ja: '言語', ko: '언어', th: 'ภาษา', id: 'Bahasa', ms: 'Bahasa', hi: 'भाषा', de: 'Sprache', es: 'Idioma', pt: 'Idioma', ru: 'Язык' },
  'player.subtitles': { ja: '字幕', ko: '자막', th: 'คำบรรยาย', id: 'Subtitle', ms: 'Sarikata', hi: 'उपशीर्षक', de: 'Untertitel', es: 'Subtítulos', pt: 'Legendas', ru: 'Субтитры' },
  'player.channel_list': { ja: 'チャンネル一覧', ko: '채널 목록', th: 'รายการช่อง', id: 'Daftar kanal', ms: 'Senarai saluran', hi: 'चैनल सूची', de: 'Senderliste', es: 'Lista de canales', pt: 'Lista de canais', ru: 'Список каналов' },
  'player.search_channel': { ja: 'チャンネルを検索...', ko: '채널 검색...', th: 'ค้นหาช่อง...', id: 'Cari kanal...', ms: 'Cari saluran...', hi: 'चैनल खोजें...', de: 'Sender suchen...', es: 'Buscar canales...', pt: 'Buscar canais...', ru: 'Поиск каналов...' },
  'player.sleep': { ja: 'スリープタイマー', ko: '취침 타이머', th: 'ตั้งเวลาปิด', id: 'Timer tidur', ms: 'Pemasa tidur', hi: 'स्लीप टाइमर', de: 'Sleeptimer', es: 'Temporizador', pt: 'Temporizador', ru: 'Таймер сна' },
  'player.watching_together': { ja: 'ウォッチパーティ', ko: '워치 파티', th: 'ดูด้วยกัน (Watch Party)', id: 'Nonton bareng', ms: 'Tonton Bersama', hi: 'साथ में देखें (Watch Party)', de: 'Watch Party', es: 'Ver juntos (Watch Party)', pt: 'Assistir junto (Watch Party)', ru: 'Смотреть вместе (Watch Party)' },
  'player.ff': { ja: '早送り', ko: '빨리 감기', th: 'กรอไปหน้า', id: 'Maju cepat', ms: 'Mara pantas', hi: 'आगे बढ़ाएं', de: 'Vorspulen', es: 'Avanzar', pt: 'Avançar', ru: 'Вперёд' },
  'player.rw': { ja: '巻き戻し', ko: '되감기', th: 'กรอกลับ', id: 'Mundur', ms: 'Undur', hi: 'पीछे करें', de: 'Zurückspulen', es: 'Retroceder', pt: 'Retroceder', ru: 'Назад' },
  'player.copy_link': { ja: 'チャンネルリンクをコピーしました', ko: '채널 링크가 복사되었습니다', th: 'คัดลอกลิงก์ช่องแล้ว', id: 'Tautan kanal disalin', ms: 'Pautan saluran disalin', hi: 'चैनल लिंक कॉपी हुआ', de: 'Senderlink kopiert', es: 'Enlace del canal copiado', pt: 'Link do canal copiado', ru: 'Ссылка на канал скопирована' },
  'player.sleep_done': { ja: 'スリープタイマーで自動停止しました', ko: '취침 타이머로 자동 종료', th: 'ปิดอัตโนมัติตามเวลาที่ตั้ง', id: 'Mati otomatis oleh timer tidur', ms: 'Mati automatik oleh pemasa tidur', hi: 'स्लीप टाइमर द्वारा ऑटो बंद', de: 'Auto-Aus durch Sleeptimer', es: 'Apagado auto por temporizador', pt: 'Desligamento auto pelo temporizador', ru: 'Автоотключение по таймеру' },
  'video.backup_stream': { ja: '予備ストリーム', ko: '백업 스트림', th: 'สตรีมสำรอง', id: 'Stream cadangan', ms: 'Strim sandaran', hi: 'बैकअप स्ट्रीम', de: 'Ersatzstream', es: 'Transmisión de respaldo', pt: 'Transmissão reserva', ru: 'Резервный поток' },
  // ============== AUTH ==============
  'auth.title.login': { ja: 'ログイン', ko: '로그인', th: 'เข้าสู่ระบบ', id: 'Masuk', ms: 'Log Masuk', hi: 'लॉग इन', de: 'Anmelden', es: 'Iniciar sesión', pt: 'Entrar', ru: 'Войти' },
  'auth.title.register': { ja: '新規登録', ko: '회원가입', th: 'สมัครสมาชิก', id: 'Daftar', ms: 'Daftar', hi: 'साइन अप', de: 'Registrieren', es: 'Registrarse', pt: 'Cadastrar', ru: 'Регистрация' },
  'auth.title.verify': { ja: 'メール確認', ko: '이메일 인증', th: 'ยืนยันอีเมล', id: 'Verifikasi Email', ms: 'Sahkan E-mel', hi: 'ईमेल सत्यापित करें', de: 'E-Mail bestätigen', es: 'Verificar correo', pt: 'Verificar e-mail', ru: 'Подтвердить e-mail' },
  'auth.title.forgot': { ja: 'パスワードを忘れた方', ko: '비밀번호 찾기', th: 'ลืมรหัสผ่าน', id: 'Lupa Kata Sandi', ms: 'Lupa Kata Laluan', hi: 'पासवर्ड भूल गए', de: 'Passwort vergessen', es: 'Olvidé mi contraseña', pt: 'Esqueci a senha', ru: 'Забыли пароль' },
  'auth.title.reset': { ja: 'パスワード再設定', ko: '비밀번호 재설정', th: 'ตั้งรหัสผ่านใหม่', id: 'Atur Ulang Kata Sandi', ms: 'Tetapkan Semula Kata Laluan', hi: 'पासवर्ड रीसेट करें', de: 'Passwort zurücksetzen', es: 'Restablecer contraseña', pt: 'Redefinir senha', ru: 'Сбросить пароль' },
  'auth.btn.login': { ja: 'ログイン', ko: '로그인', th: 'เข้าสู่ระบบ', id: 'Masuk', ms: 'Log Masuk', hi: 'लॉग इन', de: 'Anmelden', es: 'Entrar', pt: 'Entrar', ru: 'Войти' },
  'auth.btn.register': { ja: '登録', ko: '가입', th: 'สมัคร', id: 'Daftar', ms: 'Daftar', hi: 'साइन अप', de: 'Registrieren', es: 'Registrarse', pt: 'Cadastrar', ru: 'Создать' },
  'auth.btn.verify': { ja: '確認', ko: '인증', th: 'ยืนยัน', id: 'Verifikasi', ms: 'Sahkan', hi: 'सत्यापित करें', de: 'Bestätigen', es: 'Verificar', pt: 'Verificar', ru: 'Подтвердить' },
  'auth.link.to_register': { ja: '新規登録', ko: '새 계정 만들기', th: 'สมัครบัญชีใหม่', id: 'Buat akun baru', ms: 'Cipta akaun baharu', hi: 'नया खाता बनाएं', de: 'Neues Konto erstellen', es: 'Crear cuenta nueva', pt: 'Criar conta nova', ru: 'Создать аккаунт' },
  'auth.link.to_login': { ja: 'アカウントをお持ちの方・ログイン', ko: '계정이 있으신가요? 로그인', th: 'มีบัญชีแล้ว? เข้าสู่ระบบ', id: 'Sudah punya akun? Masuk', ms: 'Sudah ada akaun? Log masuk', hi: 'खाता है? लॉग इन करें', de: 'Konto vorhanden? Anmelden', es: '¿Tienes cuenta? Entra', pt: 'Já tem conta? Entre', ru: 'Есть аккаунт? Войти' },
  'auth.link.forgot': { ja: 'パスワードを忘れた方?', ko: '비밀번호를 잊으셨나요?', th: 'ลืมรหัสผ่าน?', id: 'Lupa kata sandi?', ms: 'Lupa kata laluan?', hi: 'पासवर्ड भूल गए?', de: 'Passwort vergessen?', es: '¿Olvidaste tu contraseña?', pt: 'Esqueceu a senha?', ru: 'Забыли пароль?' },
  // ============== FAVORITES / HISTORY ==============
  'fav.title': { ja: 'お気に入りチャンネル', ko: '즐겨찾는 채널', th: 'ช่องโปรด', id: 'Kanal favorit', ms: 'Saluran kegemaran', hi: 'पसंदीदा चैनल', de: 'Lieblingssender', es: 'Canales favoritos', pt: 'Canais favoritos', ru: 'Любимые каналы' },
  'fav.empty': { ja: 'お気に入りはまだありません', ko: '즐겨찾기가 없습니다', th: 'ยังไม่มีช่องโปรด', id: 'Belum ada favorit', ms: 'Tiada kegemaran lagi', hi: 'अभी कोई पसंदीदा नहीं', de: 'Noch keine Favoriten', es: 'Sin favoritos aún', pt: 'Sem favoritos ainda', ru: 'Пока нет избранного' },
  'hist.title': { ja: '視聴履歴', ko: '시청 기록', th: 'ประวัติการดู', id: 'Riwayat tonton', ms: 'Sejarah tontonan', hi: 'देखने का इतिहास', de: 'Verlauf', es: 'Historial', pt: 'Histórico', ru: 'История просмотров' },
  'hist.empty': { ja: '視聴履歴はまだありません', ko: '시청 기록이 없습니다', th: 'ยังไม่มีประวัติ', id: 'Belum ada riwayat', ms: 'Tiada sejarah lagi', hi: 'अभी कोई इतिहास नहीं', de: 'Noch kein Verlauf', es: 'Sin historial aún', pt: 'Sem histórico ainda', ru: 'История пуста' },
  // ============== MOVIES / EPG / HOME ==============
  'movies.title': { ja: '映画・TV番組', ko: '영화 · TV 프로그램', th: 'หนัง · ซีรีส์', id: 'Film · Acara TV', ms: 'Filem · Rancangan TV', hi: 'फिल्में · टीवी शो', de: 'Filme · Serien', es: 'Películas · Series', pt: 'Filmes · Séries', ru: 'Фильмы · Сериалы' },
  'movies.search.placeholder': { ja: '映画、番組、俳優を検索...', ko: '영화, 프로그램, 배우 검색...', th: 'ค้นหาหนัง ซีรีส์ นักแสดง...', id: 'Cari film, acara TV, aktor...', ms: 'Cari filem, rancangan TV, pelakon...', hi: 'फिल्म, टीवी शो, अभिनेता खोजें...', de: 'Filme, Serien, Schauspieler suchen...', es: 'Buscar películas, series, actores...', pt: 'Buscar filmes, séries, atores...', ru: 'Поиск фильмов, сериалов, актёров...' },
  'epg.title': { ja: 'EPG・見逃し配信', ko: 'EPG · 다시 보기', th: 'ผังรายการ & ดูย้อนหลัง', id: 'EPG & Tayangan Ulang', ms: 'EPG & Ulangan', hi: 'EPG और पुनः प्रसारण', de: 'EPG & Wiederholung', es: 'EPG y repetición', pt: 'EPG e reprise', ru: 'EPG и повторы' },
  'epg.today': { ja: '今日', ko: '오늘', th: 'วันนี้', id: 'Hari Ini', ms: 'Hari Ini', hi: 'आज', de: 'Heute', es: 'Hoy', pt: 'Hoje', ru: 'Сегодня' },
  'epg.yesterday': { ja: '昨日', ko: '어제', th: 'เมื่อวาน', id: 'Kemarin', ms: 'Semalam', hi: 'कल', de: 'Gestern', es: 'Ayer', pt: 'Ontem', ru: 'Вчера' },
  'epg.tomorrow': { ja: '明日', ko: '내일', th: 'พรุ่งนี้', id: 'Besok', ms: 'Esok', hi: 'आने वाला कल', de: 'Morgen', es: 'Mañana', pt: 'Amanhã', ru: 'Завтра' },
  'home.picked_for_you': { ja: 'おすすめ', ko: '추천', th: 'แนะนำสำหรับคุณ', id: 'Pilihan untukmu', ms: 'Pilihan untuk anda', hi: 'आपके लिए', de: 'Für dich', es: 'Para ti', pt: 'Para você', ru: 'Для вас' },
  'home.channels': { ja: 'チャンネル', ko: '채널', th: 'ช่อง', id: 'kanal', ms: 'saluran', hi: 'चैनल', de: 'Sender', es: 'canales', pt: 'canais', ru: 'каналов' },
  // ============== WELCOME / PICKER / PLANS ==============
  'welcome.title': { ja: 'CHRTV PLAYへようこそ', ko: 'CHRTV PLAY에 오신 것을 환영합니다', th: 'ยินดีต้อนรับสู่ CHRTV PLAY', id: 'Selamat datang di CHRTV PLAY', ms: 'Selamat datang ke CHRTV PLAY', hi: 'CHRTV PLAY में आपका स्वागत है', de: 'Willkommen bei CHRTV PLAY', es: 'Bienvenido a CHRTV PLAY', pt: 'Bem-vindo ao CHRTV PLAY', ru: 'Добро пожаловать в CHRTV PLAY' },
  'welcome.sub': { ja: 'テレビ・映画・スポーツ — 無料で今すぐ視聴', ko: 'TV · 영화 · 스포츠 — 무료로 지금 시청', th: 'ทีวี • หนัง • กีฬา — ดูฟรีเลยตอนนี้', id: 'TV • Film • Olahraga — tonton gratis sekarang', ms: 'TV • Filem • Sukan — tonton percuma sekarang', hi: 'टीवी • फिल्में • खेल — अभी मुफ्त देखें', de: 'TV • Filme • Sport — jetzt gratis ansehen', es: 'TV • Películas • Deportes — mira gratis ahora', pt: 'TV • Filmes • Esportes — assista grátis agora', ru: 'ТВ • Фильмы • Спорт — смотрите бесплатно' },
  'welcome.cta': { ja: '今すぐ視聴開始', ko: '지금 시청 시작', th: 'เริ่มดูเลย', id: 'Mulai menonton', ms: 'Mula menonton', hi: 'अभी देखना शुरू करें', de: 'Jetzt ansehen', es: 'Empezar a ver', pt: 'Começar a assistir', ru: 'Начать просмотр' },
  'welcome.later': { ja: '後で', ko: '나중에', th: 'ไว้ทีหลัง', id: 'Nanti', ms: 'Kemudian', hi: 'बाद में', de: 'Später', es: 'Después', pt: 'Depois', ru: 'Позже' },
  'langpicker.title': { ja: '言語を選択', ko: '언어 선택', th: 'เลือกภาษาของคุณ', id: 'Pilih bahasamu', ms: 'Pilih bahasa anda', hi: 'अपनी भाषा चुनें', de: 'Sprache wählen', es: 'Elige tu idioma', pt: 'Escolha seu idioma', ru: 'Выберите язык' },
  'langpicker.subtitle': { ja: 'いつでも変更できます', ko: '언제든지 변경할 수 있습니다', th: 'เปลี่ยนได้ทุกเมื่อ', id: 'Bisa diubah kapan saja', ms: 'Boleh ditukar bila-bila masa', hi: 'आप इसे कभी भी बदल सकते हैं', de: 'Jederzeit änderbar', es: 'Puedes cambiarlo cuando quieras', pt: 'Pode mudar quando quiser', ru: 'Можно изменить в любой момент' },
  'langpicker.suggest': { ja: 'お住まいの地域のおすすめ', ko: '지역 맞춤 추천', th: 'แนะนำตามพื้นที่ของคุณ', id: 'Saran sesuai wilayahmu', ms: 'Cadangan mengikut wilayah anda', hi: 'आपके क्षेत्र के लिए सुझाव', de: 'Für deine Region empfohlen', es: 'Sugerido para tu región', pt: 'Sugerido para sua região', ru: 'Рекомендовано для вашего региона' },
  'plans.free_hint': { ja: '今なら無料で有効化できます', ko: '지금 무료로 활성화 가능', th: 'ตอนนี้เปิดใช้งานฟรี', id: 'Saat ini gratis aktivasi', ms: 'Pengaktifan percuma buat masa ini', hi: 'अभी मुफ्त में सक्रिय करें', de: 'Derzeit gratis aktivierbar', es: 'Activación gratis por ahora', pt: 'Ativação grátis por enquanto', ru: 'Сейчас активация бесплатна' },
  // ============== SETTINGS (cơ bản) ==============
  'settings.title': { ja: '設定', ko: '설정', th: 'ตั้งค่า', id: 'Pengaturan', ms: 'Tetapan', hi: 'सेटिंग्स', de: 'Einstellungen', es: 'Ajustes', pt: 'Configurações', ru: 'Настройки' },
  'settings.language': { ja: '言語', ko: '언어', th: 'ภาษา', id: 'Bahasa', ms: 'Bahasa', hi: 'भाषा', de: 'Sprache', es: 'Idioma', pt: 'Idioma', ru: 'Язык' },
  'settings.choose_lang': { ja: '言語を選択', ko: '언어 선택', th: 'เลือกภาษา', id: 'Pilih bahasa', ms: 'Pilih bahasa', hi: 'भाषा चुनें', de: 'Sprache wählen', es: 'Elegir idioma', pt: 'Escolher idioma', ru: 'Выбрать язык' },
  'settings.appearance': { ja: '外観', ko: '외관', th: 'รูปลักษณ์', id: 'Tampilan', ms: 'Penampilan', hi: 'दिखावट', de: 'Darstellung', es: 'Apariencia', pt: 'Aparência', ru: 'Оформление' },
  'settings.dark': { ja: 'ダーク', ko: '다크', th: 'มืด', id: 'Gelap', ms: 'Gelap', hi: 'डार्क', de: 'Dunkel', es: 'Oscuro', pt: 'Escuro', ru: 'Тёмная' },
  'settings.light': { ja: 'ライト', ko: '라이트', th: 'สว่าง', id: 'Terang', ms: 'Cerah', hi: 'लाइट', de: 'Hell', es: 'Claro', pt: 'Claro', ru: 'Светлая' },
};

// Gộp bản dịch mở rộng vào bảng T chính (gọi 1 lần khi load module translations)
export function applyExtra(T) {
  for (const [key, dict] of Object.entries(EXTRA)) {
    if (T[key]) Object.assign(T[key], dict);
    else T[key] = { ...dict };
  }
  return T;
}
