import React from 'react';

/**
 * Lớp chặn lỗi render toàn app: thay vì crash sạch (màn hình đen vì nền tối),
 * hiện thông báo rõ ràng + nút tải lại. Giúp mọi lỗi runtime còn sót đều
 * nhìn thấy được thay vì thành màn hình đen khó đoán.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack || '');
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String((this.state.error && (this.state.error.message || this.state.error)) || 'Lỗi không xác định');
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0d0e12] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-2xl mb-4">⚠️</div>
          <h2 className="text-white font-black text-lg mb-1.5">Có lỗi bất ngờ xảy ra</h2>
          <p className="text-stone-500 text-[12px] mb-4 leading-relaxed">Ứng dụng vừa gặp lỗi khi hiển thị. Bấm tải lại để tiếp tục — nếu lặp lại, hãy gửi dòng lỗi bên dưới.</p>
          <button
            onClick={() => { window.location.reload(); }}
            className="px-6 py-3 rounded-xl grad-brand text-white text-[13px] font-black active:scale-95 transition"
          >
            ⟳ Tải lại ứng dụng
          </button>
          <details className="mt-4 text-left">
            <summary className="text-[11px] text-stone-600 cursor-pointer select-none">Chi tiết lỗi</summary>
            <pre className="mt-2 p-3 rounded-xl bg-black/50 border border-white/10 text-[10px] text-red-300/90 whitespace-pre-wrap break-words max-h-52 overflow-y-auto">{msg}</pre>
            {this.state.info && (
              <pre className="mt-1 p-2 rounded-lg bg-black/30 border border-white/5 text-[9px] text-stone-500 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{this.state.info.componentStack}</pre>
            )}
          </details>
        </div>
      </div>
    );
  }
}
