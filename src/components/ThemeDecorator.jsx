import { useEffect, useRef, useState } from "react";
import { fetchActiveTheme, THEME_PRESETS } from "../services/siteTheme.js";

// Demo theme via ?demo=fifa-asean-cup-2026 hoặc ?demo=1 (mặc định FIFA ASEAN)
function getDemoThemeFromUrl() {
  try {
    const url = new URL(window.location.href);
    const demo = url.searchParams.get("demo") || url.searchParams.get("theme_demo");
    if (!demo) return null;
    // ?demo=1 hoặc ?demo=fifa → lấy preset đầu
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
        background_url: p.background_url || "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=80",
        banner_url: p.banner_url || "",
        logo_url: "",
        confetti: p.confetti || "trophy",
        css: "",
        sort_order: 0,
      };
    }
    // ?demo=<key> → tìm preset theo key
    const found = THEME_PRESETS.find(x => x.key === demo);
    if (found) {
      return {
        ...found,
        id: 9999,
        background_url: found.background_url || "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=80",
        banner_url: found.banner_url || "",
        logo_url: "",
        confetti: found.confetti || "trophy",
        css: "",
      };
    }
  } catch {}
  return null;
}

// Hiệu ứng confetti nhẹ (canvas 2D) — không dùng lib ngoài.
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
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 1.5 + 0.5,
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 2,
        size: 14 + Math.random() * 14,
        emoji: EMOJI[Math.floor(Math.random() * EMOJI.length)],
        life: 0,
      });
    };

    let lastSpawn = 0;
    const loop = (t) => {
      if (t - lastSpawn > 180) {
        if (particles.length < 32) spawn();
        lastSpawn = t;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        p.vy += 0.015;
        p.life++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.font = `${p.size}px system-ui`;
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      });
      particles = particles.filter((p) => p.y < canvas.height + 40 && p.life < 800);
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
    // Nếu đang demo thì không fetch API
    if (theme && theme.id === 9999) return;
    let mounted = true;
    fetchActiveTheme().then((t) => {
      if (mounted) setTheme(t);
    });
    // Poll mỗi 2 phút (đổi chủ đề realtime)
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
    // Custom CSS (admin nhập) — sanitize nhẹ: chỉ cho phép trong <style> riêng
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

  const hasBanner = !!(theme.banner_url || theme.description);

  return (
    <>
      {/* CSS vars toàn site — override nhẹ, không phá layout */}
      <style>{`
        :root[data-site-theme] {
          --brand: var(--theme-primary, #f36f21);
        }
        [data-site-theme] body, body[data-theme] {
          /* nếu có background_url thì phủ nhẹ */
        }
        .site-theme-banner {
          position: sticky;
          top: 0;
          z-index: 9997;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 8px 14px;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: .02em;
          color: #fff;
          background: linear-gradient(90deg, var(--theme-primary), var(--theme-accent));
          border-bottom: 1px solid rgba(255,255,255,.15);
          box-shadow: 0 4px 18px rgba(0,0,0,.25);
        }
        .site-theme-banner img {
          height: 28px;
          max-width: 160px;
          object-fit: contain;
          border-radius: 8px;
          background: rgba(255,255,255,.9);
          padding: 2px 6px;
        }
        .site-theme-banner .close {
          margin-left: auto;
          background: rgba(0,0,0,.2);
          border: 0;
          color: #fff;
          border-radius: 999px;
          width: 22px;
          height: 22px;
          cursor: pointer;
          font-weight: 900;
        }
        .site-theme-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: -1;
          opacity: .12;
          background-image: var(--theme-bg-url);
          background-size: cover;
          background-position: center;
          filter: blur(0.5px);
        }
      `}</style>

      {theme.background_url ? <div className="site-theme-bg" aria-hidden /> : null}

      {hasBanner ? (
        <div className="site-theme-banner" role="banner" aria-label={theme.name}>
          <span style={{ fontSize: 18 }}>{theme.emoji || "🎉"}</span>
          <span>{theme.name}</span>
          {theme.description ? <span style={{ opacity: .9, fontWeight: 500, fontSize: 12, marginLeft: 6 }} className="hide-mobile">— {theme.description}</span> : null}
          {theme.banner_url ? <img src={theme.banner_url} alt="" loading="lazy" /> : null}
          <button className="close" aria-label="Đóng" onClick={() => setTheme(null)}>×</button>
        </div>
      ) : null}

      <ConfettiCanvas kind={theme.confetti} />
    </>
  );
}
