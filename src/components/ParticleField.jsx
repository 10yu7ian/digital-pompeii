import { useEffect, useRef } from "react";

export default function ParticleField({ count = 70 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let W, H;

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };

    const mkParticle = (startY = null) => ({
      x:     Math.random() * (W || 800),
      y:     startY ?? Math.random() * (H || 600),
      vx:    (Math.random() - 0.5) * 0.15,
      vy:    -(Math.random() * 0.35 + 0.08),
      size:  Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.35 + 0.05,
      glow:  Math.random() > 0.78,
      phase: Math.random() * Math.PI * 2,
      amp:   Math.random() * 0.4 + 0.1,
    });

    resize();
    window.addEventListener("resize", resize);
    let particles = Array.from({ length: count }, () => mkParticle());

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const t = performance.now() / 1000;

      particles.forEach((p, i) => {
        p.x += p.vx + Math.sin(t * 0.4 + p.phase) * p.amp * 0.012;
        p.y += p.vy;

        // Fade near top edge
        const edge = H * 0.18;
        const a = p.y < edge ? p.alpha * (p.y / edge) : p.alpha;

        if (p.y < -8) { particles[i] = mkParticle(H + 8); return; }

        if (p.glow) {
          // Ember halo
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
          g.addColorStop(0, `rgba(210, 130, 35, ${a * 0.55})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.glow
          ? `rgba(220, 155, 55, ${a})`
          : `rgba(165, 158, 148, ${a * 0.45})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ display: "block" }}
    />
  );
}
