/**
 * 8051 opcode lengths and SFR names.
 *
 * GENERATED from `stc-compiler/stc_disasm.py` — do not hand-edit; regenerate
 * from the same source if it changes.
 *
 * Why not ask the emulator. `emu_disasm(addr)` gives the mnemonic but not the
 * instruction's LENGTH, and the trace pane needs the length to show the opcode
 * bytes of each executed instruction. Adding a `emu_disasm_len` export would
 * mean rebuilding and re-pinning the WASM by hash, for a fact that is already
 * written down — and written down in the one place with an oracle behind it:
 * stc_disasm round-trips 380/380 images byte-exactly, which is only possible if
 * every length is right. `bench/` cross-checks this copy against that source.
 *
 * @module
 */

/** Length in bytes of the instruction starting with each opcode, 0x00..0xFF. */
const LENGTHS =
    '12311211111111113231121111111111' +
    '32112211111111113211221111111111' +
    '22232211111111112223221111111111' +
    '22232211111111112221232222222222' +
    '22211322222222223221221111111111' +
    '22211122222222222221333333333333' +
    '22211211111111112221131122222222' +
    '12111211111111111211121111111111';

/**
 * How many bytes the instruction at this opcode occupies (1, 2 or 3).
 * Every one of the 256 opcodes has an entry — the 8051 has no undefined ones
 * (0xA5 is the sole reserved opcode and is one byte).
 */
export function instructionLength (opcode) {
    return Number(LENGTHS[opcode & 0xFF]);
}

/**
 * SFR names by address, for the STC12 family.
 *
 * Numerically these overlap `iram` and are a DIFFERENT memory — the trap
 * DEBUG-CONTROL-MODEL §6 calls out. A UI that lists them must say which space
 * it is showing.
 */
export const SFR_NAMES = {
    '128': 'P0',
    '129': 'SP',
    '130': 'DPL',
    '131': 'DPH',
    '135': 'PCON',
    '136': 'TCON',
    '137': 'TMOD',
    '138': 'TL0',
    '139': 'TL1',
    '140': 'TH0',
    '141': 'TH1',
    '142': 'AUXR',
    '144': 'P1',
    '145': 'P1M1',
    '146': 'P1M0',
    '147': 'P0M1',
    '148': 'P0M0',
    '149': 'P2M1',
    '150': 'P2M0',
    '151': 'CLK_DIV',
    '152': 'SCON',
    '153': 'SBUF',
    '154': 'S2CON',
    '155': 'S2BUF',
    '156': 'BRT',
    '157': 'P1ASF',
    '160': 'P2',
    '162': 'AUXR1',
    '168': 'IE',
    '169': 'SADDR',
    '176': 'P3',
    '177': 'P3M1',
    '178': 'P3M0',
    '179': 'P4M1',
    '180': 'P4M0',
    '182': 'IP2H',
    '183': 'IPH',
    '184': 'IP',
    '185': 'SADEN',
    '187': 'P4SW',
    '188': 'ADC_CONTR',
    '189': 'ADC_RES',
    '190': 'ADC_RESL',
    '192': 'P4',
    '200': 'P5',
    '201': 'P5M1',
    '202': 'P5M0',
    '208': 'PSW',
    '216': 'CCON',
    '217': 'CMOD',
    '218': 'CCAPM0',
    '219': 'CCAPM1',
    '224': 'ACC',
    '233': 'CL',
    '240': 'B',
    '242': 'PCA_PWM0',
    '243': 'PCA_PWM1',
    '249': 'CH',
    '250': 'CCAP0H',
    '251': 'CCAP1H'
};

/** Name for an SFR address, or its hex if this part does not define one. */
export function sfrName (addr) {
    return SFR_NAMES[addr] || `0x${addr.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** PSW bits, most significant first — the order emu8051's TUI prints them. */
export const PSW_BITS = [
    { bit: 7, name: 'C', title: 'Carry' },
    { bit: 6, name: 'AC', title: 'Auxiliary carry' },
    { bit: 5, name: 'F0', title: 'User flag 0' },
    { bit: 4, name: 'RS1', title: 'Register bank select 1' },
    { bit: 3, name: 'RS0', title: 'Register bank select 0' },
    { bit: 2, name: 'OV', title: 'Overflow' },
    { bit: 1, name: 'F1', title: 'User flag 1' },
    { bit: 0, name: 'P', title: 'Parity of the accumulator' }
];
