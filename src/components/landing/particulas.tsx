"use client";

import { useEffect, useRef } from "react";

/**
 * Campo de partículas ligadas por proximidade, atrás do hero.
 *
 * Canvas 2D, ~70 pontos, uma linha entre os que estão perto. Barato o
 * suficiente para rodar em celular e parar quando a aba some ou quando a
 * pessoa pediu menos movimento. É o único efeito "vivo" da landing; o resto
 * é CSS.
 */
export function Particulas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    type P = { x: number; y: number; vx: number; vy: number };
    let pontos: P[] = [];

    function dimensionar() {
      const r = canvas!.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, (w * h) / 14000));
      pontos = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
      }));
    }

    let frame = 0;
    let vivo = true;
    const ALCANCE = 120;

    function passo() {
      if (!vivo) return;
      ctx!.clearRect(0, 0, w, h);
      for (const p of pontos) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      for (let i = 0; i < pontos.length; i++) {
        for (let j = i + 1; j < pontos.length; j++) {
          const a = pontos[i];
          const b = pontos[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d > ALCANCE) continue;
          ctx!.strokeStyle = `rgba(255,107,61,${(1 - d / ALCANCE) * 0.28})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }
      ctx!.fillStyle = "rgba(255,107,61,0.7)";
      for (const p of pontos) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx!.fill();
      }
      frame = requestAnimationFrame(passo);
    }

    dimensionar();
    passo();

    const onResize = () => dimensionar();
    const onVisibilidade = () => {
      vivo = !document.hidden;
      if (vivo) passo();
      else cancelAnimationFrame(frame);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilidade);
    return () => {
      vivo = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilidade);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
