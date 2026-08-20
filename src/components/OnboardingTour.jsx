import React, { useState, useEffect } from 'react';
import { Tv, Search, Calendar, Play, ArrowRight, ArrowLeft, Check } from 'lucide-react';

const STEPS = [
  {
    icon: Tv,
    title: 'Chào mừng đến CHRTV',
    desc: 'Xem truyền hình trực tuyến mọi lúc mọi nơi. Hỗ trợ Smart TV, mobile và web.',
  },
  {
    icon: Search,
    title: 'Tìm kênh yêu thích',
    desc: 'Dùng ô tìm kiếm hoặc lọc theo thể loại (VTV, HTV, Thể Thao...) để tìm nhanh kênh bạn muốn.',
  },
  {
    icon: Calendar,
    title: 'Lịch phát sóng EPG',
    desc: 'Tab "Lịch EPG" cho phép xem chương trình trong 7 ngày qua và nhấn để xem lại bất cứ lúc nào.',
  },
  {
    icon: Play,
    title: 'Trải nghiệm xem',
    desc: 'Khi xem, di chuyển chuột để hiện thanh điều khiển. Sau 5s không tương tác sẽ tự ẩn. Nhấn Enter mở danh sách kênh, phím I xem thông số kỹ thuật.',
  },
];

export default function OnboardingTour({ forceShow = false, onComplete }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceShow) { setVisible(true); return; }
    try {
      const completed = localStorage.getItem('chrtv_onboarded');
      if (!completed) setVisible(true);
    } catch { setVisible(true); }
  }, [forceShow]);

  if (!visible) return null;

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleFinish();
  };

  const handleFinish = () => {
    try { localStorage.setItem('chrtv_onboarded', '1'); } catch {}
    setVisible(false);
    onComplete && onComplete();
  };

  const StepIcon = STEPS[step].icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#13151c] border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-600/15 flex items-center justify-center mx-auto mb-4">
            <StepIcon className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-extrabold text-white mb-2">{STEPS[step].title}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{STEPS[step].desc}</p>
        </div>

        <div className="px-6 pb-3 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === step ? 'w-6 bg-red-600' : 'w-1.5 bg-slate-700'}`}
            />
          ))}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-all flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-all flex items-center justify-center gap-1"
          >
            {isLast ? <><Check className="w-3.5 h-3.5" /> Bắt đầu</> : <>Tiếp <ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
