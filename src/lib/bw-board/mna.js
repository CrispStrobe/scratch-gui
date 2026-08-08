/**
 * Modified Nodal Analysis (MNA) solver.
 *
 * Linear MNA with Newton–Raphson for nonlinear elements (diodes/LEDs).
 * Used only for branchCurrent and resistance — the closed-form path
 * in board.js handles everything else.
 *
 * Matrix form:  [G  B] [v]   [I]
 *               [C  D] [j] = [E]
 *
 * Where:
 *   G = conductance matrix (n×n, n = number of non-ground nodes)
 *   B, C, D = voltage source coupling
 *   v = node voltages
 *   j = branch currents through voltage sources
 *   I = current source vector
 *   E = voltage source values
 *
 * @module
 */

/**
 * Dense matrix backed by a flat Float64Array.
 */
class Matrix {
  /**
   * @param {number} rows
   * @param {number} cols
   */
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.data = new Float64Array(rows * cols);
  }

  /** @param {number} r @param {number} c @returns {number} */
  get(r, c) { return this.data[r * this.cols + c]; }

  /** @param {number} r @param {number} c @param {number} v */
  set(r, c, v) { this.data[r * this.cols + c] = v; }

  /** @param {number} r @param {number} c @param {number} v */
  add(r, c, v) { this.data[r * this.cols + c] += v; }

  /** Create a copy */
  clone() {
    const m = new Matrix(this.rows, this.cols);
    m.data.set(this.data);
    return m;
  }
}

/**
 * Solve Ax = b using Gaussian elimination with partial pivoting.
 * Modifies A and b in place. Returns x.
 *
 * @param {Matrix} A - n×n matrix
 * @param {Float64Array} b - n-vector
 * @returns {Float64Array} solution vector x
 */
function solve(A, b) {
  const n = A.rows;
  if (A.cols !== n || b.length !== n) {
    throw new Error(`Dimension mismatch: A is ${A.rows}×${A.cols}, b has ${b.length} elements`);
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(A.get(col, col));
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A.get(row, col));
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }

    if (maxVal < 1e-15) {
      throw new Error(`Singular matrix at column ${col}`);
    }

    // Swap rows
    if (maxRow !== col) {
      for (let j = col; j < n; j++) {
        const tmp = A.get(col, j);
        A.set(col, j, A.get(maxRow, j));
        A.set(maxRow, j, tmp);
      }
      const tmp = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmp;
    }

    // Eliminate below
    const pivot = A.get(col, col);
    for (let row = col + 1; row < n; row++) {
      const factor = A.get(row, col) / pivot;
      for (let j = col; j < n; j++) {
        A.add(row, j, -factor * A.get(col, j));
      }
      b[row] -= factor * b[col];
    }
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let j = row + 1; j < n; j++) {
      sum -= A.get(row, j) * x[j];
    }
    x[row] = sum / A.get(row, row);
  }

  return x;
}

// ─── LED / diode model for Newton–Raphson ────────────────────────────────────

/**
 * Piecewise-linear diode model.
 * Below Vf: very high resistance (1 MΩ) — effectively off.
 * Above Vf: dynamic resistance Rd with voltage offset Vf.
 *
 * For Newton–Raphson, we linearize around the current operating point:
 *   I = G_eq * V_across + I_eq
 *
 * @param {number} vAcross - voltage across the diode (anode - cathode)
 * @param {number} vf - forward voltage
 * @param {number} rd - dynamic resistance
 * @returns {{ gEq: number, iEq: number }}
 */
function diodeCompanion(vAcross, vf, rd) {
  if (vAcross < vf) {
    // Off region: very high resistance
    const gOff = 1e-9; // 1 GΩ
    return { gEq: gOff, iEq: 0 };
  } else {
    // On region: I = (V - Vf) / Rd
    // Linearized: I = (1/Rd) * V - Vf/Rd
    // So G_eq = 1/Rd, I_eq = -Vf/Rd (Norton source current)
    const gEq = 1 / rd;
    const iEq = -vf / rd;
    return { gEq, iEq };
  }
}

// ─── MNA circuit builder ─────────────────────────────────────────────────────

/**
 * @typedef {import('./types.js').Part} Part
 * @typedef {import('./types.js').Net} Net
 * @typedef {import('./types.js').TheveninSource} TheveninSource
 */

/**
 * Build and solve an MNA system from parts and nets.
 *
 * @param {Part[]} parts
 * @param {Net[]} nets
 * @param {Map<string, TheveninSource>} pinSources - PinId → Thévenin equivalent
 * @param {Map<string, number>} controls - part id → control value
 * @param {number} vcc
 * @param {object} [opts]
 * @param {boolean} [opts.powerOff] - if true, omit VCC/GND/MCU sources (for resistance)
 * @param {string} [opts.testNodeA] - inject test current from this net (for resistance)
 * @param {string} [opts.testNodeB] - inject test current to this net (for resistance)
 * @param {number} [opts.testCurrent] - test current magnitude (default 0.001 A)
 * @returns {{ nodeVoltages: Map<string, number>, branchCurrents: Map<string, Map<string, number>> }}
 */
export function solveMNA(parts, nets, pinSources, controls, vcc, opts = {}) {
  const powerOff = opts.powerOff ?? false;
  const testNodeA = opts.testNodeA;
  const testNodeB = opts.testNodeB;
  const testCurrent = opts.testCurrent ?? 0.001;

  // Build node list. Ground is implicit (node index -1 → not in matrix).
  // For resistance measurement, use testNodeB as the reference so that
  // the test nodes are always relative to each other, even if the GND
  // part is on a disconnected net.
  let groundNetId = null;

  if (powerOff && testNodeB) {
    groundNetId = testNodeB;
  } else {
    for (const net of nets) {
      for (const t of net.terminals) {
        const part = parts.find(p => p.id === t.part);
        if (part && part.kind === 'gnd') {
          groundNetId = net.id;
          break;
        }
      }
      if (groundNetId) break;
    }
  }

  // Assign node indices (skip ground and, when power is off, skip nets that
  // only connect to active sources and have no passive element terminals).
  const passiveKinds = new Set(['resistor', 'capacitor', 'diode', 'led',
    'potentiometer', 'button', 'switch', 'buzzer', 'ldr', 'ntc',
    'npn', 'pnp', 'zener', 'inductor']);

  /** @type {Map<string, number>} net id → node index */
  const nodeIndex = new Map();
  let nodeCount = 0;
  for (const net of nets) {
    if (net.id === groundNetId) continue;

    if (powerOff) {
      // Only include nets that have at least one passive element terminal
      const hasPassive = net.terminals.some(t => {
        const p = parts.find(pp => pp.id === t.part);
        return p && passiveKinds.has(p.kind);
      });
      if (!hasPassive) continue;
    }

    nodeIndex.set(net.id, nodeCount++);
  }

  if (nodeCount === 0) {
    return { nodeVoltages: new Map(), branchCurrents: new Map() };
  }

  // Count voltage sources (VCC only, unless powerOff)
  let vsCount = 0;
  /** @type {Map<string, number>} part id → voltage source index in the extra rows */
  const vsIndex = new Map();

  if (!powerOff) {
    for (const part of parts) {
      if (part.kind === 'vcc') {
        // Find the net VCC is connected to
        const vccNet = findNet(nets, part.id, 'vcc');
        if (vccNet && nodeIndex.has(vccNet)) {
          vsIndex.set(part.id, vsCount++);
        }
      }
    }
  }

  const dim = nodeCount + vsCount;
  const A = new Matrix(dim, dim);
  const b = new Float64Array(dim);

  // Part index for looking up nets
  /** @type {Map<string, Part>} */
  const partMap = new Map(parts.map(p => [p.id, p]));

  // ─── Stamp elements ─────────────────────────────────────────────────────

  // Diode/LED/transistor operating points for Newton–Raphson
  /** @type {Map<string, number>} part id → voltage across junction */
  const diodeVoltages = new Map();
  for (const part of parts) {
    if (part.kind === 'led' || part.kind === 'diode' || part.kind === 'npn'
        || part.kind === 'pnp' || part.kind === 'zener') {
      diodeVoltages.set(part.id, 0); // initial guess
    }
  }

  // Newton–Raphson iterations
  const MAX_NR_ITER = 50;
  const NR_TOL = 1e-6;

  let solution = new Float64Array(dim);

  for (let iter = 0; iter < MAX_NR_ITER; iter++) {
    // Clear matrix
    A.data.fill(0);
    b.fill(0);

    for (const part of parts) {
      switch (part.kind) {
        case 'resistor':
          stampResistor(A, b, part, nets, nodeIndex, groundNetId);
          break;

        case 'led':
        case 'diode':
          stampDiode(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages);
          break;

        case 'potentiometer':
          stampPotentiometer(A, b, part, nets, nodeIndex, groundNetId, controls);
          break;

        case 'button':
        case 'switch':
          stampButton(A, b, part, nets, nodeIndex, groundNetId, controls);
          break;

        case 'vcc':
          if (!powerOff) {
            stampVoltageSource(A, b, part, nets, nodeIndex, groundNetId, vsIndex, vcc);
          }
          break;

        case 'mcu':
          if (!powerOff) {
            stampMcuPins(A, b, part, nets, nodeIndex, groundNetId, pinSources);
          }
          break;

        case 'buzzer':
          stampBuzzerResistance(A, b, part, nets, nodeIndex, groundNetId);
          break;

        case 'ldr':
        case 'ntc':
          stampVariableResistor(A, b, part, nets, nodeIndex, groundNetId, controls);
          break;

        case 'inductor':
          // Inductor companion model is time-dependent and handled
          // separately in advanceTo. For DC steady-state MNA, an
          // inductor is a short circuit (zero resistance wire).
          stampTwoTerminal(A,
            findNet(nets, part.id, 'a'),
            findNet(nets, part.id, 'b'),
            1 / 0.001, // 1 mΩ — effectively a wire for DC
            nodeIndex);
          break;

        case 'npn':
          stampNPN(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages);
          break;

        case 'pnp':
          stampPNP(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages);
          break;

        case 'zener':
          stampZener(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages);
          break;

        // gnd, capacitor, inductor, seven_segment, rgb_led: handled elsewhere or composite
      }
    }

    // Inject test current for resistance measurement
    if (testNodeA && testNodeB) {
      const idxA = nodeIndex.get(testNodeA);
      const idxB = nodeIndex.get(testNodeB);
      if (idxA !== undefined) b[idxA] += testCurrent;
      if (idxB !== undefined) b[idxB] -= testCurrent;
    }

    // Solve
    const Acopy = A.clone();
    const bcopy = new Float64Array(b);
    try {
      solution = solve(Acopy, bcopy);
    } catch {
      // Singular matrix — bail
      break;
    }

    // Update diode/transistor operating points and check convergence
    let maxDelta = 0;
    for (const part of parts) {
      if (!diodeVoltages.has(part.id)) continue;

      let vNew;
      if (part.kind === 'npn') {
        // Track Vbe
        const netB = findNet(nets, part.id, 'base');
        const netE = findNet(nets, part.id, 'emitter');
        const idxB = netB ? nodeIndex.get(netB) : undefined;
        const idxE = netE ? nodeIndex.get(netE) : undefined;
        vNew = (idxB !== undefined ? solution[idxB] : 0) - (idxE !== undefined ? solution[idxE] : 0);
      } else if (part.kind === 'pnp') {
        const netE = findNet(nets, part.id, 'emitter');
        const netB = findNet(nets, part.id, 'base');
        const idxE = netE ? nodeIndex.get(netE) : undefined;
        const idxB = netB ? nodeIndex.get(netB) : undefined;
        vNew = (idxE !== undefined ? solution[idxE] : 0) - (idxB !== undefined ? solution[idxB] : 0);
      } else {
        // LED, diode, zener: anode - cathode
        const anodeNet = findNet(nets, part.id, 'anode');
        const cathodeNet = findNet(nets, part.id, 'cathode');
        const anodeIdx = anodeNet ? nodeIndex.get(anodeNet) : undefined;
        const cathodeIdx = cathodeNet ? nodeIndex.get(cathodeNet) : undefined;
        vNew = (anodeIdx !== undefined ? solution[anodeIdx] : 0) -
               (cathodeIdx !== undefined ? solution[cathodeIdx] : 0);
      }

      const vOld = diodeVoltages.get(part.id) ?? 0;

      maxDelta = Math.max(maxDelta, Math.abs(vNew - vOld));
      diodeVoltages.set(part.id, vNew);
    }

    // If no diodes or converged, stop
    if (diodeVoltages.size === 0 || maxDelta < NR_TOL) break;
  }

  // ─── Extract results ────────────────────────────────────────────────────

  /** @type {Map<string, number>} */
  const nodeVoltages = new Map();
  if (groundNetId) nodeVoltages.set(groundNetId, 0);
  for (const [netId, idx] of nodeIndex) {
    nodeVoltages.set(netId, solution[idx]);
  }

  // Compute branch currents for each part
  /** @type {Map<string, Map<string, number>>} part id → terminal → current */
  const branchCurrents = new Map();

  for (const part of parts) {
    const currents = new Map();
    branchCurrents.set(part.id, currents);

    if (part.kind === 'resistor') {
      const netA = findNet(nets, part.id, 'a');
      const netB = findNet(nets, part.id, 'b');
      const vA = netA ? (nodeVoltages.get(netA) ?? 0) : 0;
      const vB = netB ? (nodeVoltages.get(netB) ?? 0) : 0;
      const ohms = /** @type {number} */ (part.params.ohms ?? 1000);
      const i = (vA - vB) / ohms; // current from a to b
      currents.set('a', -i); // into terminal a
      currents.set('b', i);  // into terminal b
    }

    if (part.kind === 'led' || part.kind === 'diode') {
      const anodeNet = findNet(nets, part.id, 'anode');
      const cathodeNet = findNet(nets, part.id, 'cathode');
      const vAnode = anodeNet ? (nodeVoltages.get(anodeNet) ?? 0) : 0;
      const vCathode = cathodeNet ? (nodeVoltages.get(cathodeNet) ?? 0) : 0;
      const vf = /** @type {number} */ (part.params.vf ?? 2.0);
      const rd = 10; // dynamic resistance
      const vAcross = vAnode - vCathode;
      const i = vAcross >= vf ? (vAcross - vf) / rd : 0;
      currents.set('anode', i);    // into anode
      currents.set('cathode', -i); // out of cathode
    }

    if (part.kind === 'zener') {
      const anodeNet = findNet(nets, part.id, 'anode');
      const cathodeNet = findNet(nets, part.id, 'cathode');
      const vAnode = anodeNet ? (nodeVoltages.get(anodeNet) ?? 0) : 0;
      const vCathode = cathodeNet ? (nodeVoltages.get(cathodeNet) ?? 0) : 0;
      const vf = /** @type {number} */ (part.params.vf ?? 0.7);
      const vz = /** @type {number} */ (part.params.vz ?? 5.1);
      const rd = 10;
      const rzener = /** @type {number} */ (part.params.rz ?? 5);
      const vAcross = vAnode - vCathode;
      let i;
      if (vAcross >= vf) i = (vAcross - vf) / rd;
      else if (vAcross <= -vz) i = (vAcross + vz) / rzener;
      else i = 0;
      currents.set('anode', i);
      currents.set('cathode', -i);
    }

    if (part.kind === 'npn' || part.kind === 'pnp') {
      // Extract collector current from node voltages
      const netB = findNet(nets, part.id, 'base');
      const netC = findNet(nets, part.id, 'collector');
      const netE = findNet(nets, part.id, 'emitter');
      const vB = netB ? (nodeVoltages.get(netB) ?? 0) : 0;
      const vC = netC ? (nodeVoltages.get(netC) ?? 0) : 0;
      const vE = netE ? (nodeVoltages.get(netE) ?? 0) : 0;
      const beta = /** @type {number} */ (part.params.beta ?? 100);
      const vbeThresh = /** @type {number} */ (part.params.vbe ?? 0.7);
      const rd = 10;

      let ib, ic;
      if (part.kind === 'npn') {
        const vbe = vB - vE;
        ib = vbe >= vbeThresh ? (vbe - vbeThresh) / rd : 0;
        ic = beta * ib;
      } else {
        const veb = vE - vB;
        ib = veb >= vbeThresh ? (veb - vbeThresh) / rd : 0;
        ic = beta * ib;
      }
      currents.set('base', ib);
      currents.set('collector', ic);
      currents.set('emitter', -(ib + ic));
    }

    if (part.kind === 'ldr' || part.kind === 'ntc') {
      const netA = findNet(nets, part.id, 'a');
      const netB = findNet(nets, part.id, 'b');
      const vA = netA ? (nodeVoltages.get(netA) ?? 0) : 0;
      const vB = netB ? (nodeVoltages.get(netB) ?? 0) : 0;
      let ohms;
      if (part.kind === 'ldr') {
        const rDark = /** @type {number} */ (part.params.rDark ?? 1000000);
        const rLight = /** @type {number} */ (part.params.rLight ?? 100);
        const light = controls.get(part.id) ?? 0;
        ohms = Math.max(0.001, rDark * Math.pow(rLight / rDark, light));
      } else {
        const rCold = /** @type {number} */ (part.params.rCold ?? 100000);
        const rHot = /** @type {number} */ (part.params.rHot ?? 1000);
        const temp = controls.get(part.id) ?? 0;
        ohms = Math.max(0.001, rCold * Math.pow(rHot / rCold, temp));
      }
      const i = (vA - vB) / ohms;
      currents.set('a', -i);
      currents.set('b', i);
    }

    if (part.kind === 'inductor') {
      const netA = findNet(nets, part.id, 'a');
      const netB = findNet(nets, part.id, 'b');
      const vA = netA ? (nodeVoltages.get(netA) ?? 0) : 0;
      const vB = netB ? (nodeVoltages.get(netB) ?? 0) : 0;
      // DC: inductor is a wire, current = V_drop / R_wire
      const i = (vA - vB) / 0.001;
      currents.set('a', -i);
      currents.set('b', i);
    }

    if (part.kind === 'vcc' && vsIndex.has(part.id)) {
      const vsIdx = vsIndex.get(part.id);
      const iVcc = solution[nodeCount + vsIdx];
      currents.set('vcc', iVcc);
    }
  }

  return { nodeVoltages, branchCurrents };
}

// ─── Stamp functions ─────────────────────────────────────────────────────────

/**
 * Find the net connected to a specific terminal of a part.
 * @param {Net[]} nets
 * @param {string} partId
 * @param {string} terminal
 * @returns {string | undefined}
 */
function findNet(nets, partId, terminal) {
  for (const net of nets) {
    for (const t of net.terminals) {
      if (t.part === partId && t.terminal === terminal) {
        return net.id;
      }
    }
  }
  return undefined;
}

/**
 * Stamp a resistor into the conductance matrix.
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 */
function stampResistor(A, b, part, nets, nodeIndex, groundNetId) {
  const netA = findNet(nets, part.id, 'a');
  const netB = findNet(nets, part.id, 'b');
  const ohms = /** @type {number} */ (part.params.ohms ?? 1000);
  const g = 1 / ohms;

  const idxA = netA ? nodeIndex.get(netA) : undefined;
  const idxB = netB ? nodeIndex.get(netB) : undefined;

  if (idxA !== undefined) A.add(idxA, idxA, g);
  if (idxB !== undefined) A.add(idxB, idxB, g);
  if (idxA !== undefined && idxB !== undefined) {
    A.add(idxA, idxB, -g);
    A.add(idxB, idxA, -g);
  }
}

/**
 * Stamp a diode/LED using its linearized companion model.
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 * @param {Map<string, number>} diodeVoltages
 */
function stampDiode(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages) {
  const anodeNet = findNet(nets, part.id, 'anode');
  const cathodeNet = findNet(nets, part.id, 'cathode');
  const vf = /** @type {number} */ (part.params.vf ?? 2.0);
  const rd = 10;

  const vAcross = diodeVoltages.get(part.id) ?? 0;
  const { gEq, iEq } = diodeCompanion(vAcross, vf, rd);

  const idxA = anodeNet ? nodeIndex.get(anodeNet) : undefined;
  const idxC = cathodeNet ? nodeIndex.get(cathodeNet) : undefined;

  // Stamp conductance
  if (idxA !== undefined) A.add(idxA, idxA, gEq);
  if (idxC !== undefined) A.add(idxC, idxC, gEq);
  if (idxA !== undefined && idxC !== undefined) {
    A.add(idxA, idxC, -gEq);
    A.add(idxC, idxA, -gEq);
  }

  // Stamp Norton current source
  if (idxA !== undefined) b[idxA] -= iEq; // current into anode
  if (idxC !== undefined) b[idxC] += iEq; // current out of cathode
}

/**
 * Stamp a potentiometer as two resistors (a-wiper and wiper-b).
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 * @param {Map<string, number>} controls
 */
function stampPotentiometer(A, b, part, nets, nodeIndex, groundNetId, controls) {
  const position = controls.get(part.id) ?? 0.5;
  const totalOhms = /** @type {number} */ (part.params.ohms ?? 10000);

  // R_a_wiper = totalOhms * (1 - position), R_wiper_b = totalOhms * position
  // Avoid zero resistance
  const rAW = Math.max(1, totalOhms * (1 - position));
  const rWB = Math.max(1, totalOhms * position);

  const netA = findNet(nets, part.id, 'a');
  const netW = findNet(nets, part.id, 'wiper');
  const netB = findNet(nets, part.id, 'b');

  // Stamp a-wiper as a resistor
  stampTwoTerminal(A, netA, netW, 1 / rAW, nodeIndex);
  // Stamp wiper-b as a resistor
  stampTwoTerminal(A, netW, netB, 1 / rWB, nodeIndex);
}

/**
 * Stamp a button: closed = very low resistance, open = very high resistance.
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 * @param {Map<string, number>} controls
 */
function stampButton(A, b, part, nets, nodeIndex, groundNetId, controls) {
  const pressed = (controls.get(part.id) ?? 0) === 1;
  const netA = findNet(nets, part.id, 'a');
  const netB = findNet(nets, part.id, 'b');
  const g = pressed ? 1 / 0.001 : 1e-12; // 1mΩ when closed, effectively open when not
  stampTwoTerminal(A, netA, netB, g, nodeIndex);
}

/**
 * Stamp a VCC voltage source.
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 * @param {Map<string, number>} vsIndex
 * @param {number} vcc
 */
function stampVoltageSource(A, b, part, nets, nodeIndex, groundNetId, vsIndex, vcc) {
  const vccNet = findNet(nets, part.id, 'vcc');
  if (!vccNet) return;
  const nodeIdx = nodeIndex.get(vccNet);
  if (nodeIdx === undefined) return;
  const vsIdx = vsIndex.get(part.id);
  if (vsIdx === undefined) return;

  const dim = nodeIndex.size;
  const row = dim + vsIdx;

  // Voltage source from ground to vccNet: V(vccNet) - V(gnd) = vcc
  // V(gnd) = 0, so V(vccNet) = vcc
  A.set(row, nodeIdx, 1);
  A.set(nodeIdx, row, 1);
  b[row] = vcc;
}

/**
 * Stamp MCU pins as Norton equivalents.
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 * @param {Map<string, TheveninSource>} pinSources
 */
function stampMcuPins(A, b, part, nets, nodeIndex, groundNetId, pinSources) {
  for (const terminal of part.terminals) {
    const source = pinSources.get(terminal);
    if (!source || source === 'high-z') continue;

    const pinNet = findNet(nets, part.id, terminal);
    if (!pinNet) continue;
    const nodeIdx = nodeIndex.get(pinNet);
    if (nodeIdx === undefined) continue;

    // Norton equivalent: G = 1/Rth, I = Vth/Rth
    const g = 1 / source.rTh;
    const iNorton = source.vTh / source.rTh;

    A.add(nodeIdx, nodeIdx, g);
    b[nodeIdx] += iNorton;
  }
}

/**
 * Stamp a buzzer as a small resistance.
 * @param {Matrix} A
 * @param {Float64Array} b
 * @param {Part} part
 * @param {Net[]} nets
 * @param {Map<string, number>} nodeIndex
 * @param {string | null} groundNetId
 */
function stampBuzzerResistance(A, b, part, nets, nodeIndex, groundNetId) {
  const netA = findNet(nets, part.id, 'a');
  const netB = findNet(nets, part.id, 'b');
  const g = 1 / 100; // 100 Ω
  stampTwoTerminal(A, netA, netB, g, nodeIndex);
}

/**
 * Helper: stamp a conductance between two nets.
 * @param {Matrix} A
 * @param {string | undefined} netA
 * @param {string | undefined} netB
 * @param {number} g - conductance
 * @param {Map<string, number>} nodeIndex
 */
function stampTwoTerminal(A, netA, netB, g, nodeIndex) {
  const idxA = netA ? nodeIndex.get(netA) : undefined;
  const idxB = netB ? nodeIndex.get(netB) : undefined;

  if (idxA !== undefined) A.add(idxA, idxA, g);
  if (idxB !== undefined) A.add(idxB, idxB, g);
  if (idxA !== undefined && idxB !== undefined) {
    A.add(idxA, idxB, -g);
    A.add(idxB, idxA, -g);
  }
}

// ─── New component stamp functions ──────────────────────────────────────────

/**
 * Stamp a variable resistor (LDR or NTC). Resistance depends on control value.
 */
function stampVariableResistor(A, b, part, nets, nodeIndex, groundNetId, controls) {
  let ohms;
  if (part.kind === 'ldr') {
    const rDark = /** @type {number} */ (part.params.rDark ?? 1000000);
    const rLight = /** @type {number} */ (part.params.rLight ?? 100);
    const light = controls.get(part.id) ?? 0;
    ohms = rDark * Math.pow(rLight / rDark, light);
  } else {
    // ntc
    const rCold = /** @type {number} */ (part.params.rCold ?? 100000);
    const rHot = /** @type {number} */ (part.params.rHot ?? 1000);
    const temp = controls.get(part.id) ?? 0;
    ohms = rCold * Math.pow(rHot / rCold, temp);
  }
  ohms = Math.max(ohms, 0.001);
  const netA = findNet(nets, part.id, 'a');
  const netB = findNet(nets, part.id, 'b');
  stampTwoTerminal(A, netA, netB, 1 / ohms, nodeIndex);
}

/**
 * Stamp an NPN transistor. Simplified Ebers-Moll:
 * Terminals: base, collector, emitter.
 * B-E junction: diode with Vbe ≈ 0.7V.
 * C-E: controlled current source Ic = β × Ib (β from params, default 100).
 * Linearized: Ic = gm × Vbe - Ic0 (Norton companion model).
 */
function stampNPN(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages) {
  const beta = /** @type {number} */ (part.params.beta ?? 100);
  const vbe = /** @type {number} */ (part.params.vbe ?? 0.7);
  const rd = 10; // base-emitter dynamic resistance

  const netB = findNet(nets, part.id, 'base');
  const netC = findNet(nets, part.id, 'collector');
  const netE = findNet(nets, part.id, 'emitter');

  const idxB = netB ? nodeIndex.get(netB) : undefined;
  const idxC = netC ? nodeIndex.get(netC) : undefined;
  const idxE = netE ? nodeIndex.get(netE) : undefined;

  // B-E junction: diode model
  const vAcross = diodeVoltages.get(part.id) ?? 0;
  const { gEq, iEq } = diodeCompanion(vAcross, vbe, rd);

  // Stamp B-E diode
  if (idxB !== undefined) A.add(idxB, idxB, gEq);
  if (idxE !== undefined) A.add(idxE, idxE, gEq);
  if (idxB !== undefined && idxE !== undefined) {
    A.add(idxB, idxE, -gEq);
    A.add(idxE, idxB, -gEq);
  }
  if (idxB !== undefined) b[idxB] -= iEq;
  if (idxE !== undefined) b[idxE] += iEq;

  // C-E current source: Ic = β × Ib = β × gEq × Vbe + β × iEq
  // This is a voltage-controlled current source from B-E to C-E.
  // gm = β × gEq, Ic0 = β × iEq
  const gm = beta * gEq;
  const ic0 = beta * iEq;

  // Stamp: current from collector to emitter proportional to Vbe
  if (idxC !== undefined && idxB !== undefined) A.add(idxC, idxB, gm);
  if (idxC !== undefined && idxE !== undefined) A.add(idxC, idxE, -gm);
  if (idxE !== undefined && idxB !== undefined) A.add(idxE, idxB, -gm);
  if (idxE !== undefined) A.add(idxE, idxE, gm);

  if (idxC !== undefined) b[idxC] -= ic0;
  if (idxE !== undefined) b[idxE] += ic0;
}

/**
 * Stamp a PNP transistor. Mirror of NPN with reversed polarities.
 * Terminals: base, collector, emitter.
 */
function stampPNP(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages) {
  const beta = /** @type {number} */ (part.params.beta ?? 100);
  const vbe = /** @type {number} */ (part.params.vbe ?? 0.7);
  const rd = 10;

  const netB = findNet(nets, part.id, 'base');
  const netC = findNet(nets, part.id, 'collector');
  const netE = findNet(nets, part.id, 'emitter');

  const idxB = netB ? nodeIndex.get(netB) : undefined;
  const idxC = netC ? nodeIndex.get(netC) : undefined;
  const idxE = netE ? nodeIndex.get(netE) : undefined;

  // E-B junction: diode (reversed from NPN — emitter is higher)
  const vAcross = -(diodeVoltages.get(part.id) ?? 0);
  const { gEq, iEq } = diodeCompanion(vAcross, vbe, rd);

  // Stamp E-B diode
  if (idxE !== undefined) A.add(idxE, idxE, gEq);
  if (idxB !== undefined) A.add(idxB, idxB, gEq);
  if (idxE !== undefined && idxB !== undefined) {
    A.add(idxE, idxB, -gEq);
    A.add(idxB, idxE, -gEq);
  }
  if (idxE !== undefined) b[idxE] -= iEq;
  if (idxB !== undefined) b[idxB] += iEq;

  // C-E current source (reversed direction from NPN)
  const gm = beta * gEq;
  const ic0 = beta * iEq;

  if (idxE !== undefined && idxE !== undefined) A.add(idxE, idxE, gm);
  if (idxE !== undefined && idxB !== undefined) A.add(idxE, idxB, -gm);
  if (idxC !== undefined && idxE !== undefined) A.add(idxC, idxE, -gm);
  if (idxC !== undefined && idxB !== undefined) A.add(idxC, idxB, gm);

  if (idxE !== undefined) b[idxE] -= ic0;
  if (idxC !== undefined) b[idxC] += ic0;
}

/**
 * Stamp a Zener diode.
 * Forward: like a regular diode (Vf ≈ 0.7V).
 * Reverse: conducts at Vz (breakdown voltage), maintaining Vz across it.
 * Terminals: anode, cathode.
 */
function stampZener(A, b, part, nets, nodeIndex, groundNetId, diodeVoltages) {
  const vf = /** @type {number} */ (part.params.vf ?? 0.7);
  const vz = /** @type {number} */ (part.params.vz ?? 5.1);
  const rd = 10;
  const rzener = /** @type {number} */ (part.params.rz ?? 5); // zener dynamic R

  const netA = findNet(nets, part.id, 'anode');
  const netC = findNet(nets, part.id, 'cathode');
  const idxA = netA ? nodeIndex.get(netA) : undefined;
  const idxC = netC ? nodeIndex.get(netC) : undefined;

  const vAcross = diodeVoltages.get(part.id) ?? 0;

  let gEq, iEq;
  if (vAcross >= vf) {
    // Forward conduction
    gEq = 1 / rd;
    iEq = -vf / rd;
  } else if (vAcross <= -vz) {
    // Zener breakdown (reverse conduction)
    gEq = 1 / rzener;
    iEq = vz / rzener; // current flows cathode→anode in breakdown
  } else {
    // Off region
    gEq = 1e-9;
    iEq = 0;
  }

  if (idxA !== undefined) A.add(idxA, idxA, gEq);
  if (idxC !== undefined) A.add(idxC, idxC, gEq);
  if (idxA !== undefined && idxC !== undefined) {
    A.add(idxA, idxC, -gEq);
    A.add(idxC, idxA, -gEq);
  }
  if (idxA !== undefined) b[idxA] -= iEq;
  if (idxC !== undefined) b[idxC] += iEq;
}

export { Matrix, solve, diodeCompanion, findNet };
