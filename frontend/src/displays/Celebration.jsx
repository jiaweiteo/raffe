import React, { useEffect, useRef } from "react";
import { Sparkles, Trophy } from "lucide-react";
import { money } from "../format";

function Fireworks() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    let width, height, frame;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#ffeab0", "#e5b856", "#fffef0", "#c9a24c", "#dce6c8"];
    const bursts = [
      { at: 0.65, x: 0.18, y: 0.3 },
      { at: 0.85, x: 0.82, y: 0.25 },
      { at: 1.55, x: 0.5, y: 0.15 },
      { at: 2.3, x: 0.08, y: 0.5 },
      { at: 2.55, x: 0.93, y: 0.45 },
      { at: 3.25, x: 0.3, y: 0.23 },
      { at: 3.55, x: 0.72, y: 0.2 },
      { at: 4.4, x: 0.5, y: 0.12 },
    ].map((burst) => ({
      ...burst,
      particles: Array.from({ length: 70 }, (_, index) => ({
        angle: (index * Math.PI * 2) / 70,
        speed: 60 + Math.random() * 130,
        color: colors[index % colors.length],
        size: 1.1 + Math.random() * 1.6,
      })),
    }));
    const confetti = Array.from({ length: 190 }, (_, index) => ({
      x: Math.random(),
      y: -Math.random() * height * 1.1,
      speed: 45 + Math.random() * 110,
      sway: 15 + Math.random() * 55,
      spin: Math.random() * Math.PI * 2,
      color: colors[index % colors.length],
      size: 3 + Math.random() * 5,
    }));
    const began = performance.now();
    const draw = (now) => {
      const elapsed = (now - began) / 1000;
      context.clearRect(0, 0, width, height);
      for (const burst of bursts) {
        const age = elapsed - burst.at;
        if (age < 0 || age > 2.1) continue;
        const distance = (1 - Math.exp(-age * 1.6)) / 1.6;
        for (const particle of burst.particles) {
          const x =
            burst.x * width +
            Math.cos(particle.angle) * particle.speed * distance;
          const y =
            burst.y * height +
            Math.sin(particle.angle) * particle.speed * distance +
            age * age * 25;
          context.globalAlpha = Math.max(0, 1 - age / 2.1);
          context.fillStyle = particle.color;
          context.beginPath();
          context.arc(x, y, particle.size, 0, Math.PI * 2);
          context.fill();
        }
      }
      if (elapsed > 0.8)
        for (const piece of confetti) {
          const age = elapsed - 0.8;
          const x =
            piece.x * width + Math.sin(age * 1.8 + piece.spin) * piece.sway;
          const y = piece.y + age * piece.speed;
          context.globalAlpha =
            Math.min(1, age) * Math.min(1, Math.max(0, (8 - elapsed) / 1.5));
          context.fillStyle = piece.color;
          context.save();
          context.translate(x, y);
          context.rotate(piece.spin + age * 1.5);
          context.fillRect(
            -piece.size / 2,
            -piece.size / 2,
            piece.size,
            Math.max(1, piece.size * Math.cos(age * 3 + piece.spin)),
          );
          context.restore();
        }
      context.globalAlpha = 1;
      if (elapsed < 8.5) frame = requestAnimationFrame(draw);
      else context.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas className="celebration-canvas" ref={canvasRef} aria-hidden="true" />
  );
}

export default function Celebration({ celebration, reduced }) {
  const guests = new Intl.ListFormat("en-SG", {
    style: "long",
    type: "conjunction",
  }).format(celebration.guestNames || []);
  return (
    <div
      className={`celebration ${reduced ? "reduced" : ""}`}
      key={celebration.id}
    >
      <div className="celebration-glow" aria-hidden="true" />
      <div className="celebration-rays" aria-hidden="true" />
      {!reduced && <Fireworks />}
      <div
        className="celebration-announcement"
        role="status"
        aria-live="polite"
      >
        <div className="celebration-emblem">
          <Trophy size={48} strokeWidth={1} />
        </div>
        <p className="celebration-eyebrow">
          {celebration.preview
            ? "CELEBRATION PREVIEW"
            : "A LITTLE MORE LUCK JUST ARRIVED"}
        </p>
        <h2>
          {celebration.preview
            ? "Let’s make some magic."
            : "The pot just got bigger!"}
        </h2>
        <div className="celebration-amount">+{money(celebration.amount)}</div>
        <p className="celebration-caption">
          <Sparkles size={18} />
          <span>
            {guests ? `Added by ${guests}. Huat ah!!!` : "Huat ah!!!"}
            {celebration.preview && (
              <small className="celebration-preview-note">
                Effect preview only · no payment recorded
              </small>
            )}
          </span>
          <Sparkles size={18} />
        </p>
      </div>
    </div>
  );
}
