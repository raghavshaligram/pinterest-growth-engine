// Pinspider logo mark: a spider-web (radial threads + concentric arcs)
// with a small pin/thumbtack anchored at the center. Literal to the
// product name ("pin" + "spider") and visually unrelated to Pinterest's
// script "P" -- no red-circle-with-white-letter shape, no wordmark.

export function PinspiderMark({
  size = 22,
  color = "var(--accent)",
  bg = "var(--bg-card)",
  className,
}: {
  size?: number;
  color?: string;
  bg?: string;
  className?: string;
}) {
  // 8 radial threads, evenly spaced
  const threads = Array.from({ length: 8 }, (_, i) => {
    const rad = (i * Math.PI) / 4;
    return { x: 12 + 10.5 * Math.cos(rad), y: 12 + 10.5 * Math.sin(rad) };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Pinspider"
      className={className}
    >
      {/* radial threads */}
      {threads.map((t, i) => (
        <line
          key={`t-${i}`}
          x1={12}
          y1={12}
          x2={t.x}
          y2={t.y}
          stroke={color}
          strokeWidth={0.9}
          strokeLinecap="round"
          opacity={0.55}
        />
      ))}
      {/* concentric web arcs (top hemisphere only for asymmetric, poster-like feel) */}
      {[4, 7, 10].map((r, i) => (
        <circle
          key={`c-${i}`}
          cx={12}
          cy={12}
          r={r}
          stroke={color}
          strokeWidth={0.8}
          opacity={0.45}
          strokeDasharray="1.5 1.8"
        />
      ))}
      {/* pin head + shaft anchored at center */}
      <circle cx={12} cy={12} r={2.6} fill={color} />
      <circle cx={11.2} cy={11.2} r={0.7} fill={bg} opacity={0.85} />
    </svg>
  );
}
