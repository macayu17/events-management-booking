// Decorative barcode with realistic varied bar widths, derived deterministically
// from a seed (ticket/order code) so the same ticket always renders the same bars.
export default function Barcode({ seed = '', height = 30, className = '' }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967296);
  };

  const TOTAL = 160;
  const bars = [];
  let x = 0;
  while (x < TOTAL) {
    const w = 1 + Math.floor(rand() * 4); // bar width 1–4
    const gap = 1 + Math.floor(rand() * 3); // gap 1–3
    if (x + w <= TOTAL) bars.push(<rect key={x} x={x} y="0" width={w} height={height} fill="var(--ink)" />);
    x += w + gap;
  }

  return (
    <svg viewBox={`0 0 ${TOTAL} ${height}`} preserveAspectRatio="none" className={className} style={{ height, width: '100%' }} aria-hidden="true">
      {bars}
    </svg>
  );
}
