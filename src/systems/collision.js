// Small, allocation-free geometry helpers used by the game loop.

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

// Swept test: does the segment (x0,y0)->(x1,y1) pass within r of (cx,cy)?
// Used for bullets so fast projectiles cannot tunnel through targets on slow frames.
export function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((cx - x0) * dx + (cy - y0) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const px = x0 + dx * t - cx;
  const py = y0 + dy * t - cy;
  return px * px + py * py <= r * r;
}

// Circle vs axis-aligned box (box given by centre and half extents).
export function circleHitsBox(cx, cy, r, bx, by, hw, hh) {
  const nx = Math.max(bx - hw, Math.min(cx, bx + hw));
  const ny = Math.max(by - hh, Math.min(cy, by + hh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

// Segment vs box, approximated by sampling: cheap and good enough for bullets vs obstacles.
export function segmentHitsBox(x0, y0, x1, y1, bx, by, hw, hh) {
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (x >= bx - hw && x <= bx + hw && y >= by - hh && y <= by + hh) return true;
  }
  return false;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
