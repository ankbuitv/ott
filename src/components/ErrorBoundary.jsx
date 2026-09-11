import React from 'react';
import { reportClientError, getRecentClientErrors } from '../services/clientErrors';

/**
 * Lớp chặn lỗi render toàn app: thay vì crash sạch (màn hình đen vì nền tối),
 * hiện thông báo rõ ràng + nút tải lại. Giúp mọi lỗi runtime còn sót đều
 * nhìn thấy được thay vì thành màn hình đen khó đoán.
 *
 * Từ bản này, lỗi còn được:
 *  - gửi về server qua POST /api/telemetry/player (engine 'js') → xem ở
 *    Admin → tab "Lỗi player" (không cần người dùng mở DevTools);
 *  - ghi vào sessionStorage `chrtv_last_errors` nên tải lại xong vẫn đọc được
 *    "nãy crash vì gì" + đếm số lần lặp trong phiên.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, times: 1 };
    this.retry = this.retry.bind(this);
    this.copy = this.copy.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Đếm số lần lặp trong cùng phiên để hiện "lỗi này lặp lại N lần" trên màn báo lỗi
    this._times = (this._times || 0) + 1;
    try { this.setState({ times: this._times, info }); } catch {}
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack || '');
    const msg = String((error && (error.message || error)) || 'Lỗi không xác định');
    const stack = String((error && error.stack) || '')
      .split('\n')
      .slice(1, 5)
      .join(' <- ')
      .slice(0, 160);
    const comp = String((info && info.componentStack) || '')
      .split('\n')
      .map((s) => s.trim().replace(/^at\s+/, ''))
      .filter(Boolean)[0] || '';
    reportClientError({
      code: 'render',
      detail: `${msg}${comp ? ` [${comp}]` : ''}${stack ? ` || ${stack}` : ''}`,
      fatal: 1,
    });
  }

  retry() {
    this.setState({ error: null, info: null });
  }

  copy() {
    try {
      const e = this.state.error;
      const txt = `${e?.message || e}\n${e?.stack || ''}\n${this.state.info?.componentStack || ''}`;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt.slice(0, 4000));
    } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String((this.state.error && (this.state.error.message || this.state.error)) || 'Lỗi không xác định');
    const recent = getRecentClientErrors();
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0d0e12] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-2xl mb-4">⚠️</div>
          <h2 className="text-white font-black text-lg mb-1.5">Có lỗi bất ngờ xảy ra</h2>
          <p className="text-stone-500 text-[12px] mb-1.5 leading-relaxed">
            Ứng dụng vừa gặp lỗi khi hiển thị. Bấm tải lại để tiếp tục — nếu lặp lại, hãy gửi dòng lỗi bên dưới.
          </p>
          {this.state.times > 1 && (
            <p className="text-amber-300/80 text-[11px] mb-3">
              Lỗi này lặp lại <b>{this.state.times}</b> lần trong phiên — nhiều lúc là do danh sách kênh/cấu hình tải về bị lỗi thời, thử tải lại hẳn (Ctrl+Shift+R).
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={() => { window.location.reload(); }}
              className="px-5 py-2.5 rounded-xl grad-brand text-white text-[13px] font-black active:scale-95 transition"
            >
              ⟳ Tải lại ứng dụng
            </button>
            <button onClick={this.retry} className="px-4 py-2.5 rounded-xl border border-white/10 text-stone-300 text-[12px] font-bold hover:text-white transition">
              Bỏ qua, dùng tiếp
            </button>
            <button onClick={this.copy} className="px-3 py-2.5 rounded-xl border border-white/10 text-stone-400 text-[12px] hover:text-white transition">
              Chép log
            </button>
          </div>
          <details className="mt-1 text-left">
            <summary className="text-[11px] text-stone-600 cursor-pointer select-none">Chi tiết lỗi ({recent.length || 1} gần nhất)</summary>
            <pre className="mt-2 p-3 rounded-xl bg-black/50 border border-white/10 text-[10px] text-red-300/90 whitespace-pre-wrap break-words max-h-52 overflow-y-auto">{msg}</pre>
            {recent.length > 1 && (
              <pre className="mt-1 p-3 rounded-xl bg-black/30 border border-white/5 text-[10px] text-stone-400 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {recent.map((r, i) => `${i + 1}. [${r.code}] ${r.detail}`).join('\n')}
              </pre>
            )}
            {this.state.info && (
              <pre className="mt-1 p-2 rounded-lg bg-black/30 border border-white/5 text-[9px] text-stone-500 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{this.state.info.componentStack}</pre>
            )}
          </details>
        </div>
      </div>
    );
  }
}
