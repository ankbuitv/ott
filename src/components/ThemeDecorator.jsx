import { useEffect, useRef, useState } from "react";
import { fetchActiveTheme, THEME_PRESETS } from "../services/siteTheme.js";

// Demo theme via ?demo=fifa
function getDemoThemeFromUrl() {
  try {
    const url = new URL(window.location.href);
    const demo = url.searchParams.get("demo") || url.searchParams.get("theme_demo");
    if (!demo) return null;
    if (demo === "1" || demo.toLowerCase().includes("fifa")) {
      const p = THEME_PRESETS.find(x => x.key.includes("fifa-asean")) || THEME_PRESETS[0];
      return {
        ...p,
        id: 9999,
        key: p.key,
        name: p.name,
        emoji: p.emoji,
        description: p.description,
        primary_color: p.primary_color,
        secondary_color: p.secondary_color,
        accent_color: p.accent_color,
        background_url: p.background_url || "",
        banner_url: p.banner_url || "",
        logo_url: "",
        confetti: p.confetti || "trophy",
        css: "",
        sort_order: 0,
      };
    }
    const found = THEME_PRESETS.find(x => x.key === demo);
    if (found) {
      return {
        ...found,
        id: 9999,
        background_url: found.background_url || "",
        banner_url: found.banner_url || "",
        logo_url: "",
        confetti: found.confetti || "trophy",
        css: "",
      };
    }
  } catch {}
  return null;
}

// Confetti nhẹ full màn (optional)
function ConfettiCanvas({ kind }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!kind || kind === "none") return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let particles = [];
    const EMOJI = {
      trophy: ["🏆", "⚽", "🎉"],
      fireworks: ["🎆", "🧧", "✨"],
      snow: ["❄️", "⛄", "🎄"],
      ball: ["⚽", "🥅", "🏟️"],
      pumpkin: ["🎃", "👻", "🍬"],
    }[kind] || ["✨", "🎉", "⭐"];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const spawn = () => {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 1.2 + 0.4,
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 1.5,
        size: 12 + Math.random() * 12,
        emoji: EMOJI[Math.floor(Math.random() * EMOJI.length)],
        life: 0,
      });
    };
    let lastSpawn = 0;
    const loop = (t) => {
      if (t - lastSpawn > 220) {
        if (particles.length < 22) spawn();
        lastSpawn = t;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        p.vy += 0.012;
        p.life++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.font = `${p.size}px system-ui`;
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      });
      particles = particles.filter((p) => p.y < canvas.height + 40 && p.life < 700);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [kind]);
  if (!kind || kind === "none") return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 9998,
      }}
    />
  );
}

// Trang trí header TopNav: icon bóng đá, cúp, cờ ASEAN bay lơ lửng trong header
function TopNavDecor({ theme, setTheme }) {
  if (!theme) return null;
  // Icon set theo loại theme
  const isFootball = ["trophy", "ball"].includes(theme.confetti) || theme.key?.includes("fifa") || theme.key?.includes("worldcup") || theme.key?.includes("euro") || theme.key?.includes("asean");
  
  // ASEAN flags cho FIFA ASEAN Cup
  const aseanFlags = ["🇻🇳", "🇹🇭", "🇮🇩", "🇲🇾", "🇸🇬", "🇵🇭", "🇲🇲", "🇰🇭", "🇱🇦", "🇧🇳"];
  const footballIcons = isFootball 
    ? ["⚽", "🏆", "🥅", "🏟️", "⚽", "🏆", ...aseanFlags.slice(0, 6)]
    : [theme.emoji || "🎉", "✨", "🎊"];

  return (
    <>
      <style>{`
        /* TopNav được theme hoá */
        html[data-site-theme] .topbar-mytv {
          background: linear-gradient(90deg, 
            color-mix(in srgb, var(--theme-primary) 92%, black),
            color-mix(in srgb, var(--theme-secondary) 96%, black)
          ) !important;
          border-bottom: 2px solid var(--theme-accent) !important;
          box-shadow: 0 2px 20px color-mix(in srgb, var(--theme-primary) 30%, transparent), 0 0 0 1px rgba(255,255,255,.06) inset !important;
          position: sticky;
          overflow: visible !important;
        }
        html[data-site-theme] .topbar-mytv::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .08;
          background-image: var(--theme-bg-url);
          background-size: cover;
          background-position: center;
        }
        /* Logo glow theo theme */
        html[data-site-theme] .topbar-mytv img[alt="CHRTV PLAY"] {
          filter: drop-shadow(0 0 10px var(--theme-accent)) drop-shadow(0 4px 14px color-mix(in srgb, var(--theme-primary) 60%, transparent)) !important;
        }
        /* Badge nhỏ góc logo */
        .theme-logo-badge {
          position: absolute;
          top: -6px;
          right: -10px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: var(--theme-accent);
          color: #000;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          box-shadow: 0 2px 8px rgba(0,0,0,.4);
          animation: theme-bounce 1.8s ease-in-out infinite;
          z-index: 2;
        }
        @keyframes theme-bounce {
          0%,100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.08); }
        }
        /* Container icon trang trí trong header */
        .site-theme-topnav-decor {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 64px;
          pointer-events: none;
          overflow: hidden;
          z-index: 41;
        }
        @media (max-width: 640px) {
          .site-theme-topnav-decor { height: 56px; }
        }
        .site-theme-topnav-decor .t-icon {
          position: absolute;
          font-size: 14px;
          opacity: .85;
          filter: drop-shadow(0 1px 3px rgba(0,0,0,.5));
          animation: t-float var(--dur, 3s) ease-in-out infinite;
          animation-delay: var(--delay, 0s);
          user-select: none;
        }
        @keyframes t-float {
          0%,100% { transform: translateY(0) rotate(var(--rot, 0deg)); }
          50% { transform: translateY(-4px) rotate(calc(var(--rot, 0deg) + 8deg)); }
        }
        /* Dải chạy chữ nhỏ dưới header (marquee) - chỉ khi có description */
        .site-theme-marquee {
          position: absolute;
          bottom: -18px;
          left: 0;
          right: 0;
          height: 18px;
          background: var(--theme-accent);
          color: #000;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .04em;
          display: flex;
          align-items: center;
          overflow: hidden;
          white-space: nowrap;
          z-index: 6;
        }
        .site-theme-marquee span {
          display: inline-block;
          padding-left: 100%;
          animation: marquee 18s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        /* Nút tắt theme nhỏ trong header */
        .theme-close-btn {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: auto;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: rgba(0,0,0,.35);
          border: 1px solid rgba(255,255,255,.15);
          color: #fff;
          font-size: 11px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
        }
        .theme-close-btn:hover { background: rgba(0,0,0,.55); }
      `}</style>

      {/* Lớp trang trí icon trong header */}
      <div className="site-theme-topnav-decor" aria-hidden>
        {footballIcons.map((icon, i) => {
          // Phân bố icon đều trong header, tránh che search
          const left = 8 + (i * 7) % 78; // 8% - 86%
          const top = i % 3 === 0 ? 4 : i % 3 === 1 ? 28 : 16;
          const rot = (i * 13) % 30 - 15;
          const dur = 2.2 + (i % 4) * 0.6;
          const delay = (i * 0.18) % 2;
          // Ẩn bớt trên mobile để không rối
          const hideOnMobile = i > 6 ? " hidden md:block" : "";
          return (
            <span
              key={i}
              className={`t-icon${hideOnMobile}`}
              style={{
                left: `${left}%`,
                top: `${top}px`,
                "--rot": `${rot}deg`,
                "--dur": `${dur}s`,
                "--delay": `${delay}s`,
                fontSize: i < 2 ? 16 : 13,
                opacity: i < 2 ? 0.95 : 0.65,
              }}
            >
              {icon}
            </span>
          );
        })}
        {/* Cúp vàng nổi bật giữa header (chỉ desktop) */}
        {isFootball && (
          <span className="t-icon hidden lg:block" style={{ left: "46%", top: "6px", fontSize: 22, opacity: 0.9, "--rot": "-8deg", "--dur": "2.5s" }}>
            🏆
          </span>
        )}
        <button className="theme-close-btn" onClick={() => setTheme(null)} title="Tắt trang trí" style={{ pointerEvents: "auto" }}>×</button>
      </div>
    </>
  );
}

export default function ThemeDecorator() {
  const [theme, setTheme] = useState(() => {
    const demo = getDemoThemeFromUrl();
    if (demo) {
      try {
        localStorage.setItem("chrtv_active_theme_v1", JSON.stringify(demo));
        localStorage.setItem("chrtv_active_theme_ts", String(Date.now()));
      } catch {}
      return demo;
    }
    return null;
  });

  useEffect(() => {
    if (theme && theme.id === 9999) return;
    let mounted = true;
    fetchActiveTheme().then((t) => {
      if (mounted) setTheme(t);
    });
    const iv = setInterval(() => {
      fetchActiveTheme({ force: true }).then((t) => {
        if (mounted) setTheme(t);
      });
    }, 120000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!theme) {
      root.style.removeProperty("--theme-primary");
      root.style.removeProperty("--theme-secondary");
      root.style.removeProperty("--theme-accent");
      root.dataset.siteTheme = "";
      const el = document.getElementById("site-theme-custom-css");
      if (el) el.remove();
      root.style.removeProperty("--theme-bg-url");
      try { window.dispatchEvent(new CustomEvent("chrtv-theme-change", { detail: null })); } catch {}
      return;
    }
    root.style.setProperty("--theme-primary", theme.primary_color || "#f36f21");
    root.style.setProperty("--theme-secondary", theme.secondary_color || "#1a1c24");
    root.style.setProperty("--theme-accent", theme.accent_color || "#ffb37a");
    root.dataset.siteTheme = theme.key || "";
    if (theme.background_url) {
      root.style.setProperty("--theme-bg-url", `url("${theme.background_url}")`);
    } else {
      root.style.removeProperty("--theme-bg-url");
    }
    let styleEl = document.getElementById("site-theme-custom-css");
    if (theme.css) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "site-theme-custom-css";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = theme.css;
    } else if (styleEl) {
      styleEl.remove();
    }
    try { window.dispatchEvent(new CustomEvent("chrtv-theme-change", { detail: theme })); } catch {}
  }, [theme]);

  if (!theme) return null;

  // Tìm TopNav và inject decor vào đó bằng portal-like: render decor nhưng CSS sẽ gắn vào .topbar-mytv
  // Dải marquee nhỏ dưới header (optional)
  const showMarquee = !!(theme.description && theme.key?.includes("fifa"));

  return (
    <>
      <TopNavDecor theme={theme} setTheme={setTheme} />
      {showMarquee && (
        <div
          className="site-theme-marquee"
          style={{
            top: "64px",
            bottom: "auto",
            position: "fixed",
            zIndex: 39,
          }}
        >
          <span>
            {theme.emoji} {theme.name} — {theme.description} &nbsp; • &nbsp; {theme.emoji} {theme.name} — {theme.description} &nbsp; • &nbsp; 🏆 ASEAN CUP 2026 • 🇻🇳 VIỆT NAM VÔ ĐỊCH • ⚽ LIVE TRÊN CHRTV PLAY •
          </span>
          <button className="theme-close-btn" onClick={() => setTheme(null)} title="Tắt trang trí">×</button>
        </div>
      )}
      {/* Confetti chỉ khi không phải demo header-only, hoặc khi user muốn */}
      {theme.confetti && theme.confetti !== "none" && !showMarquee ? <ConfettiCanvas kind={theme.confetti} /> : null}
      {/* Nếu là FIFA thì confetti nhẹ hơn, chỉ trong header nên không render full-screen */}
      {showMarquee && theme.confetti !== "none" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 64, pointerEvents: "none", zIndex: 41, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "space-around", alignItems: "center", opacity: 0.18, fontSize: 18 }}>
            <span>⚽</span><span>🏆</span><span>🇻🇳</span><span>⚽</span><span>🇹🇭</span><span>🏆</span><span>🇮🇩</span><span>⚽</span>
          </div>
        </div>
      )}
    </>
  );
}
