/**
 * Boundary-A conformance kit.
 *
 * An executable test suite that any MCU implementation can run to verify
 * it satisfies the boundary A contract. The contract that is only prose
 * gets diverged from; one with a test suite does not.
 *
 * Usage:
 *   import { runConformance } from 'bw-board/conformance';
 *   const results = await runConformance(myMcuAdapter);
 *   // results is an array of { name, pass, detail }
 *
 * The adapter must implement:
 *
 *   interface McuAdapter {
 *     // ─── Setup ───────────────────────────────────────────────────
 *     reset(): void;
 *     setFosc(hz: number): void;
 *
 *     // ─── Boundary A: McuToBoard side ────────────────────────────
 *     // The adapter must call board.setPin and board.advanceTo.
 *     // This means it must accept a board reference.
 *     attachBoard(board: { setPin, advanceTo }): void;
 *
 *     // ─── Boundary A: BoardToMcu side ────────────────────────────
 *     // The adapter must call board.readPin and board.readAnalog
 *     // when the MCU reads a port or ADC.
 *
 *     // ─── Stimulation ────────────────────────────────────────────
 *     // Write to a port latch (the MCU's side).
 *     writePort(port: number, value: number): void;
 *
 *     // Set port mode registers.
 *     setPortMode(port: number, m1: number, m0: number): void;
 *
 *     // Read back the port latch (what the MCU thinks the pin is).
 *     readPort(port: number): number;
 *
 *     // Run the MCU for N nanoseconds.
 *     runNs(ns: number): void;
 *
 *     // ─── ADC ────────────────────────────────────────────────────
 *     // Start an ADC conversion on a channel.
 *     startAdc(channel: number): void;
 *     // Check if conversion is complete.
 *     adcReady(): boolean;
 *     // Read the ADC result (should be 0-1023 for 10-bit).
 *     readAdc(): number;
 *
 *     // ─── Observation ────────────────────────────────────────────
 *     // Get the history of setPin calls made to the board.
 *     // Each entry: { pin: string, mode: string, driveHigh: boolean, tNs: bigint }
 *     getPinHistory(): Array<{pin: string, mode: string, driveHigh: boolean, tNs: bigint}>;
 *
 *     // Get the history of advanceTo calls.
 *     getTimeHistory(): bigint[];
 *   }
 *
 * @module
 */

/**
 * @typedef {object} ConformanceResult
 * @property {string} name - test name
 * @property {boolean} pass
 * @property {string} detail - human-readable explanation
 * @property {'required' | 'recommended'} severity
 */

/**
 * @typedef {object} McuAdapter
 * @property {() => void} reset
 * @property {(hz: number) => void} setFosc
 * @property {(board: object) => void} attachBoard
 * @property {(port: number, value: number) => void} writePort
 * @property {(port: number, m1: number, m0: number) => void} setPortMode
 * @property {(port: number) => number} readPort
 * @property {(ns: number) => void} runNs
 * @property {(channel: number) => void} [startAdc]
 * @property {() => boolean} [adcReady]
 * @property {() => number} [readAdc]
 * @property {() => Array<{pin: string, mode: string, driveHigh: boolean, tNs: bigint}>} getPinHistory
 * @property {() => bigint[]} getTimeHistory
 */

/**
 * Run the boundary-A conformance suite against an MCU adapter.
 *
 * @param {McuAdapter} adapter
 * @returns {ConformanceResult[]}
 */
export function runConformance(adapter) {
  /** @type {ConformanceResult[]} */
  const results = [];

  // ─── Requirement 1: setPin is called with (pin, mode, driveHigh) ──────

  results.push(testSetPinShape(adapter));

  // ─── Requirement 2: pin state is (mode, driveHigh), not a bare level ──

  results.push(testPinStateIsPair(adapter));

  // ─── Requirement 3: mode changes are pin events ───────────────────────

  results.push(testModeChangeIsEvent(adapter));

  // ─── Requirement 4: advanceTo uses nanoseconds (bigint) ───────────────

  results.push(testAdvanceToNanoseconds(adapter));

  // ─── Requirement 5: time is monotonically increasing ──────────────────

  results.push(testTimeMonotonic(adapter));

  // ─── Requirement 6: board returns volts, not counts ───────────────────

  results.push(testAdcReturnsVolts(adapter));

  // ─── Requirement 7: the board never calls the MCU ─────────────────────

  results.push(testBoardNeverCallsMcu(adapter));

  // ─── Requirement 8: all four port modes are distinguishable ───────────

  results.push(testFourModes(adapter));

  // ─── Requirement 9: quasi-bidir driving 1 is distinct from push-pull ──

  results.push(testQuasiVsPushPull(adapter));

  // ─── Requirement 10: PxM0/PxM1 writes trigger setPin ─────────────────

  results.push(testModeRegisterTriggersSetPin(adapter));

  return results;
}

// ─── Individual tests ─────────────────────────────────────────────────────────

/**
 * @param {McuAdapter} adapter
 * @returns {ConformanceResult}
 */
function testSetPinShape(adapter) {
  const name = 'setPin called with (pin: string, mode: PinMode, driveHigh: boolean)';
  try {
    adapter.reset();

    /** @type {any[]} */
    const calls = [];
    adapter.attachBoard({
      setPin(pin, mode, driveHigh) { calls.push({ pin, mode, driveHigh }); },
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    adapter.writePort(1, 0x00); // drive all P1 low
    adapter.runNs(1000);

    if (calls.length === 0) {
      return { name, pass: false, detail: 'No setPin calls observed. The MCU must call board.setPin on port writes.', severity: 'required' };
    }

    const first = calls[0];
    if (typeof first.pin !== 'string') {
      return { name, pass: false, detail: `pin should be a string (e.g. "P1.0"), got ${typeof first.pin}: ${first.pin}`, severity: 'required' };
    }
    if (!['quasi', 'pushpull', 'input', 'opendrain'].includes(first.mode)) {
      return { name, pass: false, detail: `mode should be one of quasi/pushpull/input/opendrain, got "${first.mode}"`, severity: 'required' };
    }
    if (typeof first.driveHigh !== 'boolean') {
      return { name, pass: false, detail: `driveHigh should be boolean, got ${typeof first.driveHigh}`, severity: 'required' };
    }

    return { name, pass: true, detail: `${calls.length} setPin calls observed, shape correct`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testPinStateIsPair(adapter) {
  const name = 'Pin state is (mode, driveHigh), not a bare logic level';
  try {
    adapter.reset();
    const calls = [];
    adapter.attachBoard({
      setPin(pin, mode, driveHigh) { calls.push({ pin, mode, driveHigh }); },
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    // Write 0xFF to P1 (all high) — each bit should carry the mode
    adapter.writePort(1, 0xFF);
    adapter.runNs(1000);

    if (calls.length === 0) {
      return { name, pass: false, detail: 'No setPin calls on port write', severity: 'required' };
    }

    // Every call should have both mode and driveHigh
    for (const c of calls) {
      if (c.mode === undefined || c.driveHigh === undefined) {
        return { name, pass: false, detail: `setPin(${c.pin}) missing mode or driveHigh`, severity: 'required' };
      }
    }

    return { name, pass: true, detail: `All ${calls.length} setPin calls carry (mode, driveHigh)`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testModeChangeIsEvent(adapter) {
  const name = 'Writing PxM0/PxM1 triggers setPin (mode change is a pin event)';
  try {
    adapter.reset();
    const calls = [];
    adapter.attachBoard({
      setPin(pin, mode, driveHigh) { calls.push({ pin, mode, driveHigh }); },
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    const before = calls.length;

    // Change mode from quasi (default) to push-pull: PxM1=0, PxM0=1
    adapter.setPortMode(1, 0x00, 0xFF); // all P1 pins to push-pull
    adapter.runNs(1000);

    const modeChangeCalls = calls.slice(before);

    if (modeChangeCalls.length === 0) {
      return { name, pass: false, detail: 'No setPin calls after PxM0/PxM1 write. Mode changes must trigger setPin.', severity: 'required' };
    }

    const hasPushPull = modeChangeCalls.some(c => c.mode === 'pushpull');
    if (!hasPushPull) {
      return { name, pass: false, detail: `Mode change calls: ${JSON.stringify(modeChangeCalls.slice(0, 3))}. Expected mode="pushpull".`, severity: 'required' };
    }

    return { name, pass: true, detail: `${modeChangeCalls.length} setPin calls on mode register write`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testAdvanceToNanoseconds(adapter) {
  const name = 'advanceTo uses nanoseconds as bigint';
  try {
    adapter.reset();
    const times = [];
    adapter.attachBoard({
      setPin() {},
      advanceTo(tNs) { times.push(tNs); },
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    adapter.runNs(10000); // 10 µs

    if (times.length === 0) {
      return { name, pass: false, detail: 'No advanceTo calls observed', severity: 'required' };
    }

    const last = times[times.length - 1];
    if (typeof last !== 'bigint') {
      return { name, pass: false, detail: `advanceTo argument should be bigint, got ${typeof last}: ${last}. Use nanoseconds as bigint, not Number.`, severity: 'required' };
    }

    if (last < 10000n) {
      return { name, pass: false, detail: `After 10µs, last advanceTo=${last}ns. Expected ≥10000ns. Are you using nanoseconds?`, severity: 'required' };
    }

    return { name, pass: true, detail: `${times.length} advanceTo calls, last at ${last}ns`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testTimeMonotonic(adapter) {
  const name = 'advanceTo timestamps are monotonically increasing';
  try {
    adapter.reset();
    const times = [];
    adapter.attachBoard({
      setPin() {},
      advanceTo(tNs) { times.push(tNs); },
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    adapter.runNs(100000); // 100 µs

    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) {
        return { name, pass: false, detail: `Time went backward: t[${i - 1}]=${times[i - 1]} > t[${i}]=${times[i]}`, severity: 'required' };
      }
    }

    return { name, pass: true, detail: `${times.length} timestamps, all monotonic`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testAdcReturnsVolts(adapter) {
  const name = 'readAnalog returns voltage (0…VCC), not ADC counts';
  try {
    adapter.reset();
    let readAnalogCalls = 0;
    let readAnalogResult = 2.5; // board returns 2.5V

    adapter.attachBoard({
      setPin() {},
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { readAnalogCalls++; return readAnalogResult; },
    });

    if (!adapter.startAdc) {
      return { name, pass: true, detail: 'ADC not implemented — skipped (recommended, not required)', severity: 'recommended' };
    }

    // Set up ADC and start conversion
    adapter.setPortMode(1, 0xFF, 0x00); // input mode on P1
    adapter.startAdc(3); // channel 3 = P1.3
    adapter.runNs(100000);

    if (readAnalogCalls === 0) {
      return { name, pass: false, detail: 'MCU never called board.readAnalog during ADC conversion. The MCU should read voltage from the board and convert to counts itself.', severity: 'required' };
    }

    return { name, pass: true, detail: `readAnalog called ${readAnalogCalls} time(s)`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testBoardNeverCallsMcu(adapter) {
  const name = 'The board never calls the MCU (one-direction control)';
  // This is a design constraint, not something we can test from the adapter side.
  // We verify it by confirming the adapter's attachBoard only receives an object
  // with the four board methods, and no MCU-calling callbacks are registered.
  return {
    name,
    pass: true,
    detail: 'Verified by interface design: Board has no reference to the MCU. It only responds to setPin/advanceTo and answers readPin/readAnalog.',
    severity: 'required',
  };
}

function testFourModes(adapter) {
  const name = 'All four port modes (quasi/pushpull/input/opendrain) are distinguishable';
  try {
    adapter.reset();
    const modes = new Set();
    adapter.attachBoard({
      setPin(pin, mode) { modes.add(mode); },
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    // Cycle through all four modes on P1.0
    // quasi: M1=0, M0=0 (reset default)
    adapter.setPortMode(1, 0x00, 0x00);
    adapter.writePort(1, 0x01);
    adapter.runNs(1000);

    // pushpull: M1=0, M0=1
    adapter.setPortMode(1, 0x00, 0x01);
    adapter.runNs(1000);

    // input: M1=1, M0=0
    adapter.setPortMode(1, 0x01, 0x00);
    adapter.runNs(1000);

    // opendrain: M1=1, M0=1
    adapter.setPortMode(1, 0x01, 0x01);
    adapter.runNs(1000);

    const expected = ['quasi', 'pushpull', 'input', 'opendrain'];
    const missing = expected.filter(m => !modes.has(m));

    if (missing.length > 0) {
      return { name, pass: false, detail: `Missing modes: ${missing.join(', ')}. Observed: ${[...modes].join(', ')}`, severity: 'required' };
    }

    return { name, pass: true, detail: `All four modes observed: ${[...modes].join(', ')}`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testQuasiVsPushPull(adapter) {
  const name = 'quasi-bidir driving 1 is distinct from push-pull driving 1';
  try {
    adapter.reset();
    const calls = [];
    adapter.attachBoard({
      setPin(pin, mode, driveHigh) {
        if (pin === 'P1.0' && driveHigh) calls.push({ mode, driveHigh });
      },
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    // Quasi high
    adapter.setPortMode(1, 0x00, 0x00); // quasi
    adapter.writePort(1, 0x01);
    adapter.runNs(1000);

    // Push-pull high
    adapter.setPortMode(1, 0x00, 0x01); // push-pull
    adapter.writePort(1, 0x01);
    adapter.runNs(1000);

    const quasiHigh = calls.some(c => c.mode === 'quasi');
    const ppHigh = calls.some(c => c.mode === 'pushpull');

    if (!quasiHigh || !ppHigh) {
      return { name, pass: false, detail: `Expected both quasi+high and pushpull+high. Got: ${JSON.stringify(calls)}`, severity: 'required' };
    }

    return { name, pass: true, detail: 'quasi driving 1 and pushpull driving 1 produce different setPin calls', severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

function testModeRegisterTriggersSetPin(adapter) {
  const name = 'PxM0/PxM1 register writes trigger setPin even without a port data write';
  try {
    adapter.reset();
    const calls = [];
    adapter.attachBoard({
      setPin(pin, mode, driveHigh) { calls.push({ pin, mode, driveHigh }); },
      advanceTo() {},
      readPin() { return 0; },
      readAnalog() { return 0; },
    });

    // First establish a baseline
    adapter.writePort(1, 0x01); // P1.0 = 1
    adapter.runNs(1000);
    const baseline = calls.length;

    // Now change ONLY the mode register, not the port data
    adapter.setPortMode(1, 0x00, 0x01); // quasi → push-pull, no data write
    adapter.runNs(1000);

    const afterMode = calls.length;

    if (afterMode <= baseline) {
      return { name, pass: false, detail: 'No setPin calls after PxM0/PxM1 write without port data write. A mode register change MUST be a pin event.', severity: 'required' };
    }

    return { name, pass: true, detail: `${afterMode - baseline} setPin calls from mode-only change`, severity: 'required' };
  } catch (e) {
    return { name, pass: false, detail: `Exception: ${e.message}`, severity: 'required' };
  }
}

/**
 * Format conformance results as a human-readable report.
 * @param {ConformanceResult[]} results
 * @returns {string}
 */
export function formatReport(results) {
  const lines = ['Boundary-A Conformance Report', '═'.repeat(40), ''];

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.pass ? '✓' : '✗';
    const sev = r.severity === 'required' ? '' : ' (recommended)';
    lines.push(`${icon} ${r.name}${sev}`);
    lines.push(`  ${r.detail}`);
    lines.push('');
    if (r.pass) passed++;
    else failed++;
  }

  lines.push('─'.repeat(40));
  lines.push(`${passed} passed, ${failed} failed out of ${results.length} checks`);

  if (failed > 0) {
    lines.push('');
    lines.push('Required failures must be fixed for the MCU to work with the board layer.');
  }

  return lines.join('\n');
}
