"use client";

import { useRef } from "react";

/** Cartão que inclina levemente na direção do cursor, com brilho que o segue. */
export function Tilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function mover(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - py) * 6}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 8}deg`);
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  }

  function sair() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div ref={ref} onMouseMove={mover} onMouseLeave={sair} className={`tilt ${className ?? ""}`}>
      {children}
    </div>
  );
}
