/**
 * Wire routing — avoid overlapping parts with L-shaped or Z-shaped paths.
 *
 * Given two terminal positions and a list of part bounding boxes,
 * returns an SVG path string that routes around obstacles.
 *
 * Strategy (simple, fast, no full maze router):
 * 1. Try L-shape (horizontal then vertical). If it doesn't cross any part, use it.
 * 2. Try reverse L-shape (vertical then horizontal). If clear, use it.
 * 3. Fall back to Z-shape: go halfway horizontally, then vertical, then the rest.
 */

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} BBox
 */

/**
 * Check if a horizontal segment (y fixed, x from x1 to x2) crosses a bbox.
 */
function hSegCrosses(y, x1, x2, bbox, margin = 5) {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  return (
    y >= bbox.y - margin && y <= bbox.y + bbox.h + margin &&
    hi >= bbox.x - margin && lo <= bbox.x + bbox.w + margin
  );
}

/**
 * Check if a vertical segment (x fixed, y from y1 to y2) crosses a bbox.
 */
function vSegCrosses(x, y1, y2, bbox, margin = 5) {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  return (
    x >= bbox.x - margin && x <= bbox.x + bbox.w + margin &&
    hi >= bbox.y - margin && lo <= bbox.y + bbox.h + margin
  );
}

/**
 * Check if an L-shape path (a→mid→b) crosses any obstacle.
 */
function lShapeCrosses(a, mid, b, obstacles) {
  for (const obs of obstacles) {
    // Horizontal segment: a → mid
    if (a.y === mid.y && hSegCrosses(a.y, a.x, mid.x, obs)) return true;
    // Vertical segment: mid → b
    if (mid.x === b.x && vSegCrosses(mid.x, mid.y, b.y, obs)) return true;
    // Or the reverse orientation
    if (a.x === mid.x && vSegCrosses(a.x, a.y, mid.y, obs)) return true;
    if (mid.y === b.y && hSegCrosses(mid.y, mid.x, b.x, obs)) return true;
  }
  return false;
}

/**
 * Get bounding boxes for parts, excluding the two parts being connected.
 *
 * @param {Array} parts — all parts with x, y
 * @param {string} skipA — part ID to exclude
 * @param {string} skipB — part ID to exclude
 * @returns {BBox[]}
 */
export function partBBoxes(parts, skipA, skipB) {
  return parts
    .filter(p => p.id !== skipA && p.id !== skipB)
    .map(p => {
      // Approximate bounding box per kind
      switch (p.kind) {
        case 'mcu': {
          const pinCount = p.terminals?.length || 4;
          const chipH = Math.max(60, pinCount * 30 + 20);
          return { x: p.x - 50, y: p.y - chipH / 2, w: 120, h: chipH };
        }
        case 'resistor': return { x: p.x - 40, y: p.y - 15, w: 80, h: 30 };
        case 'led': return { x: p.x - 15, y: p.y - 20, w: 30, h: 45 };
        case 'potentiometer': return { x: p.x - 30, y: p.y - 30, w: 60, h: 65 };
        case 'buzzer': return { x: p.x - 20, y: p.y - 20, w: 40, h: 45 };
        case 'button': return { x: p.x - 18, y: p.y - 18, w: 36, h: 40 };
        default: return { x: p.x - 15, y: p.y - 15, w: 30, h: 30 };
      }
    });
}

/**
 * Route a wire between two points, avoiding obstacles.
 *
 * @param {{ x: number, y: number }} a — start
 * @param {{ x: number, y: number }} b — end
 * @param {BBox[]} obstacles
 * @returns {string} SVG path d attribute
 */
export function routeWire(a, b, obstacles) {
  // L-shape: horizontal first
  const midH = { x: b.x, y: a.y };
  if (!lShapeCrosses(a, midH, b, obstacles)) {
    return `M ${a.x} ${a.y} L ${midH.x} ${midH.y} L ${b.x} ${b.y}`;
  }

  // Reverse L-shape: vertical first
  const midV = { x: a.x, y: b.y };
  if (!lShapeCrosses(a, midV, b, obstacles)) {
    return `M ${a.x} ${a.y} L ${midV.x} ${midV.y} L ${b.x} ${b.y}`;
  }

  // Z-shape: horizontal halfway, vertical, horizontal rest
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
}
