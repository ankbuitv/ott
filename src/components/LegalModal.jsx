import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

const CONTENT = {
  vi: {
    terms: {
      title: 'Điều khoản sử dụng',
      body: [
        ['1. Chấp nhận điều khoản', 'Khi tạo tài khoản hoặc sử dụng CHRTV PLAY (sản phẩm của ANKB CO.), bạn đồng ý tuân thủ toàn bộ điều khoản này. Nếu không đồng ý, vui lòng ngừng sử dụng dịch vụ.'],
        ['2. Tài khoản', 'Bạn phải từ đủ tuổi theo luật địa phương (hoặc có giám hộ đồng ý), cung cấp email chính xác và tự bảo mật mật khẩu. Mỗi người chỉ dùng tài khoản của mình; chia sẻ tài khoản có thể bị khoá.'],
        ['3. Gói cước & thanh toán', 'Một số kênh/nội dung yêu cầu gói cước. Trong thời gian khuyến mãi, việc kích hoạt có thể miễn phí. Khi áp dụng thu phí, chúng tôi sẽ thông báo trước qua email và trong ứng dụng.'],
        ['4. Sử dụng hợp lệ', 'Bạn không được: sao chép/phát lại luồng (re-stream), vượt qua biện pháp kỹ thuật, dùng bot cào dữ liệu, tải lên nội dung vi phạm pháp luật, quấy rối người khác trong chat/xem chung.'],
        ['5. Nội dung bên thứ ba', 'Kho phim dùng dữ liệu TMDB; lịch thể thao dùng API công cộng; một số kênh do đối tác cung cấp. Chúng tôi không đảm bảo mọi nội dung luôn khả dụng 24/7.'],
        ['6. Chấm dứt', 'Chúng tôi có thể tạm ngưng/khoá tài khoản vi phạm mà không cần báo trước. Bạn có thể xoá tài khoản bất cứ lúc nào trong phần Cài đặt.'],
        ['7. Miễn trừ trách nhiệm', 'Dịch vụ cung cấp "nguyên trạng". Trong phạm vi luật cho phép, ANKB CO. không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc dùng dịch vụ.'],
        ['8. Liên hệ', 'Mọi thắc mắc về điều khoản, gửi email hỗ trợ trong ứng dụng (mục Cài đặt → Giới thiệu).'],
      ],
    },
    policy: {
      title: 'Chính sách bảo mật',
      body: [
        ['1. Dữ liệu chúng tôi thu thập', 'Email, tên hiển thị khi đăng ký; lịch sử xem, kênh yêu thích, hẹn nhắc EPG để cá nhân hoá; nhật ký kỹ thuật (thiết bị, lỗi phát) để sửa lỗi. Chúng tôi KHÔNG thu thập mật khẩu ngân hàng hay dữ liệu nhạy cảm.'],
        ['2. Cách dùng dữ liệu', 'Cung cấp/vận hành dịch vụ, ghi nhớ tuỳ chọn, chống gian lận, cải thiện chất lượng luồng. Không bán dữ liệu cá nhân cho bên thứ ba.'],
        ['3. Lưu trữ & bảo mật', 'Mật khẩu được băm một chiều; token phiên có hạn; kết nối mã hoá HTTPS. Bạn có thể bật xác thực 2 lớp (2FA) trong Cài đặt.'],
        ['4. Quyền của bạn', 'Xem, sửa, xoá dữ liệu của mình; rút lại sự đồng ý; yêu cầu xuất dữ liệu. Gửi yêu cầu qua email hỗ trợ trong ứng dụng.'],
        ['5. Trẻ em', 'Hồ sơ trẻ em bị giới hạn nội dung phim; phụ huynh nên đặt mã PIN kiểm soát trong Cài đặt.'],
        ['6. Thay đổi chính sách', 'Khi có thay đổi quan trọng, chúng tôi sẽ thông báo trong ứng dụng và cập nhật ngày hiệu lực tại đây.'],
      ],
    },
    dmca: {
      title: 'Bản quyền (DMCA)',
      body: [
        ['1. Tôn trọng bản quyền', 'CHRTV PLAY tôn trọng quyền sở hữu trí tuệ. Kênh/phim do đối tác cấp phép hoặc nguồn công khai; video cộng đồng do người dùng đăng.'],
        ['2. Khiếu nại', 'Chủ sở hữu quyền gửi khiếu nại gồm: thông tin liên hệ, mô tả nội dung vi phạm (tên kênh/video + link trong app), cam kết sở hữu hợp pháp. Chúng tôi xử lý trong tối đa 7 ngày làm việc.'],
        ['3. Tái phạm', 'Tài khoản/kênh tái vi phạm nhiều lần sẽ bị gỡ và khoá vĩnh viễn.'],
      ],
    },
    contact: {
      title: 'Liên hệ',
      body: [
        ['Hỗ trợ', 'Gửi email hỗ trợ hiển thị trong ứng dụng (Cài đặt → Giới thiệu → email hỗ trợ). Vui lòng mô tả lỗi kèm tên kênh/thời điểm để được xử lý nhanh.'],
        ['Đối tác nội dung', 'Muốn đưa kênh của bạn lên CHRTV PLAY? Liên hệ qua email đối tác trong mục Mua Gói.'],
        ['Giờ làm việc', 'Hỗ trợ qua email, phản hồi trong 1–2 ngày làm việc. Hiện chưa hỗ trợ qua điện thoại.'],
      ],
    },
  },
  en: {
    terms: {
      title: 'Terms of Service',
      body: [
        ['1. Acceptance', 'By creating an account or using CHRTV PLAY (a product of ANKB CO.), you agree to these terms. If you disagree, please stop using the service.'],
        ['2. Accounts', 'You must be of legal age (or have guardian consent), provide an accurate email and keep your password safe. Sharing accounts may lead to suspension.'],
        ['3. Plans & billing', 'Some channels/content require a plan. During promotions, activation may be free. Before paid billing starts, we will notify you via email and in-app.'],
        ['4. Acceptable use', 'You must not: re-stream our feeds, bypass technical measures, scrape with bots, upload unlawful content, or harass others in chat/party.'],
        ['5. Third-party content', 'Movie data comes from TMDB; sports schedules from public APIs; some channels from partners. Availability 24/7 is not guaranteed.'],
        ['6. Termination', 'We may suspend violating accounts without notice. You can delete your account anytime in Settings.'],
        ['7. Disclaimer', 'The service is provided "as is". To the extent permitted by law, ANKB CO. is not liable for indirect damages.'],
        ['8. Contact', 'Questions about these terms? Email support shown in the app (Settings → About).'],
      ],
    },
    policy: {
      title: 'Privacy Policy',
      body: [
        ['1. Data we collect', 'Email and display name at signup; watch history, favorites, EPG reminders for personalization; technical logs (device, playback errors). We do NOT collect banking passwords or sensitive data.'],
        ['2. How we use it', 'To operate the service, remember preferences, prevent fraud and improve stream quality. We never sell personal data.'],
        ['3. Storage & security', 'Passwords are one-way hashed; session tokens expire; HTTPS everywhere. Enable 2FA in Settings.'],
        ['4. Your rights', 'Access, correct, delete or export your data; withdraw consent. Send requests via in-app support email.'],
        ['5. Children', 'Kid profiles cannot access movies; parents should set a parental PIN in Settings.'],
        ['6. Changes', 'Material changes will be announced in-app with a new effective date here.'],
      ],
    },
    dmca: {
      title: 'Copyright (DMCA)',
      body: [
        ['1. Respect', 'CHRTV PLAY respects IP rights. Channels/movies are licensed from partners or public sources; community videos are user-uploaded.'],
        ['2. Complaints', 'Rights holders should send: contact info, description of infringing content (channel/video name + in-app link), ownership statement. We act within 7 business days.'],
        ['3. Repeat offenders', 'Repeat infringers will be removed and permanently banned.'],
      ],
    },
    contact: {
      title: 'Contact',
      body: [
        ['Support', 'Email the support address shown in the app (Settings → About). Include channel name + time for faster help.'],
        ['Content partners', 'Want your channel on CHRTV PLAY? Contact us via the partner email in Plans.'],
        ['Hours', 'Email support, replies within 1–2 business days. No phone support yet.'],
      ],
    },
  },
};

export default function LegalModal({ tab = 'terms', onClose, onTab }) {
  const { t, lang } = useI18n();
  const [active, setActive] = useState(tab);
  const L = (CONTENT[lang] || CONTENT.vi)[active] || CONTENT.vi.terms;

  const tabs = [
    { id: 'terms', label: t('footer.terms') },
    { id: 'policy', label: t('footer.policy') },
    { id: 'dmca', label: t('footer.dmca') },
    { id: 'contact', label: t('footer.contact') },
  ];

  const switchTab = (id) => { setActive(id); if (onTab) onTab(id); };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
          <h2 className="text-base font-black text-white">{L.title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex gap-1.5 px-5 pt-3 shrink-0 overflow-x-auto scrollbar-none">
          {tabs.map(tb => (
            <button
              key={tb.id}
              onClick={() => switchTab(tb.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${active === tb.id ? 'grad-brand text-white' : 'bg-white/[0.06] text-stone-400 hover:text-white'}`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {L.body.map(([h, p], i) => (
            <div key={i}>
              <p className="text-[13px] font-black text-[#ffb37a] mb-1">{h}</p>
              <p className="text-[12px] text-stone-300 leading-relaxed">{p}</p>
            </div>
          ))}
          <p className="text-[10px] text-stone-600 pt-2 border-t border-white/5">CHRTV PL▷Y - A Product of ANKB CO. © 2025 · {t('footer.updated')}</p>
        </div>
      </div>
    </div>
  );
}
