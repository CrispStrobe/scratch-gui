/* eslint-disable */
// Vendored synth core from CrispStrobe/CrispFXR-web (src/App.js), React UI removed.
// Exposes SynthParams (sfxr presets) + AudioSynthesizer (Web Audio render) + audioBufferToWav.
// (c) CrispStrobe. Used by the Brickwright Sound FX generator.

const SQUARE = 0, SAWTOOTH = 1, SINE = 2, NOISE = 3;

class SynthParams {
  constructor() {
    this.wave_type = SQUARE;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.3;
    this.p_env_punch = 0;
    this.p_env_decay = 0.4;
    this.p_base_freq = 0.3;
    this.p_freq_limit = 0;
    this.p_freq_ramp = 0;
    this.p_freq_dramp = 0;
    this.p_vib_strength = 0;
    this.p_vib_speed = 0;
    this.p_arp_mod = 0;
    this.p_arp_speed = 0;
    this.p_duty = 0;
    this.p_duty_ramp = 0;
    this.p_repeat_speed = 0;
    this.p_pha_offset = 0;
    this.p_pha_ramp = 0;
    this.p_lpf_freq = 1;
    this.p_lpf_ramp = 0;
    this.p_lpf_resonance = 0;
    this.p_hpf_freq = 0;
    this.p_hpf_ramp = 0;
    // Enhanced features
    this.fm_freq = 0;
    this.fm_depth = 0;
    this.lfo_rate = 0;
    this.lfo_depth = 0;
    this.noise_type = 0; // 0=white, 1=pink, 2=brown
    this.sub_bass = 0;
    this.distortion = 0;
    this.chorus_rate = 0;
    this.chorus_depth = 0;
    this.reverb_size = 0;
    this.reverb_decay = 0;
    this.delay_time = 0;
    this.delay_feedback = 0;
    this.ring_mod_freq = 0;
    this.ring_mod_depth = 0;
    this.bit_crush = 0;
    this.sample_reduction = 0;
    this.sound_vol = 0.5;
    this.sample_rate = 44100;
    this.sample_size = 16;
    this.flanger_rate = 0;
    this.flanger_depth = 0;
    this.flanger_delay = 0.5; // a default value
  }

  // validate all
  validate() {
    for (const key in this) {
      if (typeof this[key] === 'number' && (isNaN(this[key]) || !isFinite(this[key]))) {
        this[key] = 0;
      }
    }
    return this;
  }

  // Preset methods
  pickupCoin() {
    this.reset();
    this.wave_type = SAWTOOTH;
    this.p_base_freq = 0.4 + Math.random() * 0.5;
    this.p_env_attack = 0;
    this.p_env_sustain = Math.random() * 0.1;
    this.p_env_decay = 0.1 + Math.random() * 0.4;
    this.p_env_punch = 0.3 + Math.random() * 0.3;
    if (Math.random() > 0.5) {
      this.p_arp_speed = 0.5 + Math.random() * 0.2;
      this.p_arp_mod = 0.2 + Math.random() * 0.4;
    }
    return this;
  }

  laserShoot() {
    this.reset();
    this.wave_type = Math.floor(Math.random() * 3);
    this.p_base_freq = 0.3 + Math.random() * 0.6;
    this.p_freq_ramp = -0.35 - Math.random() * 0.3;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.1 + Math.random() * 0.2;
    this.p_env_decay = Math.random() * 0.4;
    this.p_hpf_freq = Math.random() * 0.3;
    this.distortion = Math.random() * 0.3;
    return this;
  }

  explosion() {
    this.reset();
    this.wave_type = NOISE;
    this.noise_type = 0;
    this.p_base_freq = Math.pow(0.1 + Math.random() * 0.4, 2);
    this.p_freq_ramp = -0.1 + Math.random() * 0.4;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.1 + Math.random() * 0.3;
    this.p_env_decay = Math.random() * 0.5;
    this.p_env_punch = 0.2 + Math.random() * 0.6;
    this.distortion = 0.2 + Math.random() * 0.5;
    this.reverb_size = Math.random() * 0.4;
    if (Math.random() > 0.5) {
      this.p_pha_offset = -0.3 + Math.random() * 0.9;
      this.p_pha_ramp = -Math.random() * 0.3;
    }
    return this;
  }

  powerUp() {
    this.reset();
    this.wave_type = Math.random() > 0.5 ? SAWTOOTH : SQUARE;
    this.p_base_freq = 0.2 + Math.random() * 0.3;
    this.p_freq_ramp = 0.1 + Math.random() * 0.4;
    this.p_env_attack = 0;
    this.p_env_sustain = Math.random() * 0.4;
    this.p_env_decay = 0.1 + Math.random() * 0.4;
    this.chorus_rate = Math.random() * 0.3;
    this.chorus_depth = Math.random() * 0.2;
    return this;
  }

  hitHurt() {
    this.reset();
    this.wave_type = Math.floor(Math.random() * 3);
    if (this.wave_type === SINE) this.wave_type = NOISE;
    this.p_base_freq = 0.2 + Math.random() * 0.6;
    this.p_freq_ramp = -0.3 - Math.random() * 0.4;
    this.p_env_attack = 0;
    this.p_env_sustain = Math.random() * 0.1;
    this.p_env_decay = 0.1 + Math.random() * 0.2;
    if (Math.random() > 0.5) this.p_hpf_freq = Math.random() * 0.3;
    this.distortion = Math.random() * 0.4;
    return this;
  }

  jump() {
    this.reset();
    this.wave_type = SQUARE;
    this.p_duty = Math.random() * 0.6;
    this.p_base_freq = 0.3 + Math.random() * 0.3;
    this.p_freq_ramp = 0.1 + Math.random() * 0.2;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.1 + Math.random() * 0.3;
    this.p_env_decay = 0.1 + Math.random() * 0.2;
    if (Math.random() > 0.5) this.p_hpf_freq = Math.random() * 0.3;
    if (Math.random() > 0.5) this.p_lpf_freq = 1 - Math.random() * 0.6;
    return this;
  }

  ambient() {
    this.reset();
    this.wave_type = SINE;
    this.p_base_freq = 0.1 + Math.random() * 0.3;
    this.p_env_attack = 0.3 + Math.random() * 0.5;
    this.p_env_sustain = 0.5 + Math.random() * 0.5;
    this.p_env_decay = 0.3 + Math.random() * 0.7;
    this.fm_freq = Math.random() * 0.3;
    this.fm_depth = Math.random() * 0.4;
    this.reverb_size = 0.6 + Math.random() * 0.4;
    this.reverb_decay = 0.5 + Math.random() * 0.5;
    this.p_lpf_freq = 0.3 + Math.random() * 0.4;
    return this;
  }

  bell() {
    this.reset();
    this.wave_type = SINE;
    this.p_base_freq = 0.5 + Math.random() * 0.4;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.1;
    this.p_env_decay = 0.6 + Math.random() * 0.4;
    this.fm_freq = 0.8 + Math.random() * 0.2;
    this.fm_depth = 0.3 + Math.random() * 0.4;
    this.reverb_size = 0.3 + Math.random() * 0.3;
    return this;
  }

  bass() {
    this.reset();
    this.wave_type = SAWTOOTH;
    this.p_base_freq = 0.05 + Math.random() * 0.15;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.3 + Math.random() * 0.4;
    this.p_env_decay = 0.2 + Math.random() * 0.3;
    this.sub_bass = 0.4 + Math.random() * 0.6;
    this.p_lpf_freq = 0.2 + Math.random() * 0.3;
    this.distortion = Math.random() * 0.2;
    return this;
  }

  lead() {
    this.reset();
    this.wave_type = SAWTOOTH;
    this.p_base_freq = 0.4 + Math.random() * 0.4;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.4 + Math.random() * 0.4;
    this.p_env_decay = 0.2 + Math.random() * 0.3;
    this.p_vib_speed = 0.2 + Math.random() * 0.3;
    this.p_vib_strength = 0.1 + Math.random() * 0.2;
    this.chorus_rate = Math.random() * 0.2;
    this.delay_time = Math.random() * 0.3;
    return this;
  }

  blip() {
    this.reset();
    this.wave_type = SINE;
    this.p_base_freq = 0.5 + Math.random() * 0.3;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.01 + Math.random() * 0.05;
    this.p_env_decay = 0.1 + Math.random() * 0.2;
    this.p_freq_ramp = 0.1 + Math.random() * 0.3;
    return this;
  }

  zap() {
    this.reset();
    this.wave_type = SQUARE;
    this.p_base_freq = 0.6 + Math.random() * 0.4;
    this.p_freq_ramp = -0.5 - Math.random() * 0.3;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.05 + Math.random() * 0.1;
    this.p_env_decay = 0.1 + Math.random() * 0.2;
    this.p_duty = -0.2 + Math.random() * 0.4;
    this.distortion = 0.1 + Math.random() * 0.3;
    return this;
  }

  woosh() {
    this.reset();
    this.wave_type = NOISE;
    this.noise_type = 1; // Pink noise
    this.p_base_freq = 0.1 + Math.random() * 0.2;
    this.p_env_attack = 0.1 + Math.random() * 0.3;
    this.p_env_sustain = 0.2 + Math.random() * 0.4;
    this.p_env_decay = 0.3 + Math.random() * 0.5;
    this.p_lpf_freq = 0.3 + Math.random() * 0.4;
    this.p_lpf_ramp = -0.2 - Math.random() * 0.3;
    this.reverb_size = 0.3 + Math.random() * 0.4;
    return this;
  }

  drone() {
    this.reset();
    this.wave_type = SAWTOOTH;
    this.p_base_freq = 0.05 + Math.random() * 0.15;
    this.p_env_attack = 0.5 + Math.random() * 1.0;
    this.p_env_sustain = 2.0 + Math.random() * 2.0;
    this.p_env_decay = 1.0 + Math.random() * 2.0;
    this.p_vib_speed = 0.1 + Math.random() * 0.2;
    this.p_vib_strength = 0.05 + Math.random() * 0.1;
    this.chorus_rate = 0.1 + Math.random() * 0.2;
    this.chorus_depth = 0.2 + Math.random() * 0.3;
    this.p_lpf_freq = 0.4 + Math.random() * 0.3;
    return this;
  }

  click() {
    this.reset();
    this.wave_type = SQUARE;
    this.p_base_freq = 0.8 + Math.random() * 0.2;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.01;
    this.p_env_decay = 0.02 + Math.random() * 0.03;
    this.p_duty = 0.1 + Math.random() * 0.2;
    this.p_hpf_freq = 0.2 + Math.random() * 0.3;
    return this;
  }

  glitch() {
    this.reset();
    this.wave_type = Math.floor(Math.random() * 3);
    this.p_base_freq = 0.2 + Math.random() * 0.6;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.05 + Math.random() * 0.1;
    this.p_env_decay = 0.1 + Math.random() * 0.3;
    this.p_arp_speed = 0.8 + Math.random() * 0.2;
    this.p_arp_mod = -0.5 + Math.random() * 1.0;
    this.bit_crush = 0.3 + Math.random() * 0.5;
    this.distortion = 0.2 + Math.random() * 0.4;
    this.p_repeat_speed = 0.3 + Math.random() * 0.4;
    return this;
  }

  portal() {
    this.reset();
    this.wave_type = SINE;
    this.p_base_freq = 0.3 + Math.random() * 0.3;
    this.p_env_attack = 0.2 + Math.random() * 0.3;
    this.p_env_sustain = 0.5 + Math.random() * 0.5;
    this.p_env_decay = 0.8 + Math.random() * 1.0;
    this.fm_freq = 0.3 + Math.random() * 0.4;
    this.fm_depth = 0.4 + Math.random() * 0.6;
    this.ring_mod_freq = 0.1 + Math.random() * 0.3;
    this.ring_mod_depth = 0.2 + Math.random() * 0.3;
    this.reverb_size = 0.6 + Math.random() * 0.4;
    this.delay_time = 0.2 + Math.random() * 0.3;
    this.delay_feedback = 0.3 + Math.random() * 0.4;
    return this;
  }

  warning() {
    this.reset();
    this.wave_type = SQUARE;
    this.p_base_freq = 0.15 + Math.random() * 0.1;
    this.p_env_attack = 0;
    this.p_env_sustain = 0.3 + Math.random() * 0.2;
    this.p_env_decay = 0.1 + Math.random() * 0.2;
    this.p_duty = -0.3 + Math.random() * 0.2;
    this.p_repeat_speed = 0.5 + Math.random() * 0.3;
    this.distortion = 0.1 + Math.random() * 0.2;
    this.p_lpf_freq = 0.6 + Math.random() * 0.3;
    return this;
  }

  random() {
    this.reset();
    this.wave_type = Math.floor(Math.random() * 4);
    this.p_base_freq = Math.pow(Math.random(), 2);
    this.p_freq_ramp = Math.pow(Math.random() * 2 - 1, 5);
    this.p_env_attack = Math.pow(Math.random() * 2 - 1, 3);
    this.p_env_sustain = Math.pow(Math.random() * 2 - 1, 2);
    this.p_env_decay = Math.random() * 2 - 1;
    this.p_env_punch = Math.pow(Math.random() * 0.8, 2);
    this.p_duty = Math.random() * 2 - 1;
    this.p_duty_ramp = Math.pow(Math.random() * 2 - 1, 3);
    this.p_vib_strength = Math.pow(Math.random() * 2 - 1, 3);
    this.p_vib_speed = Math.random() * 2 - 1;
    this.p_arp_mod = Math.random() * 2 - 1;
    this.p_arp_speed = Math.random() * 2 - 1;
    this.p_lpf_freq = 1 - Math.pow(Math.random(), 3);
    this.p_lpf_ramp = Math.pow(Math.random() * 2 - 1, 3);
    this.p_hpf_freq = Math.pow(Math.random(), 5);
    this.p_hpf_ramp = Math.pow(Math.random() * 2 - 1, 5);
    this.distortion = Math.random() * 0.4;
    this.reverb_size = Math.random() * 0.5;
    return this;
  }

  reset() {
    Object.assign(this, new SynthParams());
    return this;
  }

  clone() {
    const clone = new SynthParams();
    Object.assign(clone, this);
    return clone;
  }

  morphTo(target, amount) {
    const result = this.clone();
    for (const key in result) {
      if (typeof result[key] === 'number' && typeof target[key] === 'number') {
        result[key] = result[key] + (target[key] - result[key]) * amount;
      }
    }
    return result;
  }
}

class AudioSynthesizer {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    // this.initAudio();
  }

  async initAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.isInitialized = true;
    } catch (e) {
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initAudio();
    }
  }

  generateNoise(type, length) {
    const noise = new Float32Array(length);
    let b0 = 0, b1 = 0, b2 = 0, b6 = 0;
    
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      
      switch (type) {
        case 0: // White noise
          noise[i] = white;
          break;
        case 1: // Pink noise
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          noise[i] = b0 + b1 + b2 + white * 0.3104856;
          break;
        case 2: // Brown noise
          b6 = (b6 + white * 0.02) * 0.996;
          noise[i] = b6 * 3.5;
          break;
        default:
          noise[i] = white;
          break;
      }
    }
    return noise;
  }

  applyDistortion(sample, amount) {
    if (amount <= 0) return sample;
    const drive = 1 + amount * 10;
    return Math.tanh(sample * drive) / drive;
  }

  applyBitCrush(sample, amount) {
    if (amount <= 0) return sample;
    const bits = Math.floor(16 - amount * 15);
    const levels = Math.pow(2, bits);
    return Math.floor(sample * levels) / levels;
  }

  async generateBufferWithSettings(params, duration = 1.0, customSampleRate = null, customBitDepth = null) {
    const targetSampleRate = customSampleRate || this.audioContext.sampleRate;
    const targetBitDepth = customBitDepth || 16;
    
    // Generate buffer at full resolution first - AWAIT this since it's async
    const buffer = await this.generateBuffer(params, duration);
    
    // Check if buffer generation failed
    if (!buffer || !buffer.getChannelData) {
      return null;
    }
    
    try {
      const originalData = buffer.getChannelData(0);
      const originalSampleRate = this.audioContext.sampleRate;
      
      // If we need to downsample, do it
      if (targetSampleRate < originalSampleRate) {
        
        // Calculate the downsampling ratio
        const ratio = originalSampleRate / targetSampleRate;
        const newLength = Math.floor(originalData.length / ratio);
        
        // Create downsampled data
        const downsampledData = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
          const sourceIndex = Math.floor(i * ratio);
          downsampledData[i] = originalData[sourceIndex];
        }
        
        // Now upsample back to original rate for playback (with no interpolation for pixelated effect)
        const upsampledData = new Float32Array(originalData.length);
        for (let i = 0; i < originalData.length; i++) {
          const downsampledIndex = Math.floor((i / originalData.length) * newLength);
          upsampledData[i] = downsampledData[Math.min(downsampledIndex, newLength - 1)];
        }
        
        // Copy the processed data back
        originalData.set(upsampledData);
      }
      
      // Apply bit depth reduction
      if (targetBitDepth < 16) {
        const levels = Math.pow(2, targetBitDepth - 1) - 1;
        
        for (let i = 0; i < originalData.length; i++) {
          // Quantize to the target bit depth
          const quantized = Math.floor(originalData[i] * levels) / levels;
          originalData[i] = Math.max(-1, Math.min(1, quantized));
        }
      }
      
      return buffer;
    } catch (error) {
      return null;
    }
  }

  async generateBuffer(params, duration = 1.0) {
    
    await this.ensureInitialized();
    
    if (!this.audioContext || !this.isInitialized) {
      return null;
    }

    try {
      // Validate and sanitize parameters
      if (!params) {
        params = new SynthParams();
      }
      
      // Create safe parameters with fallbacks
      const safeParams = {
        wave_type: Math.max(0, Math.min(3, Math.floor(params.wave_type || 0))),
        p_env_attack: Math.max(0, Math.min(3, params.p_env_attack || 0)),
        p_env_sustain: Math.max(0, Math.min(3, params.p_env_sustain || 0.3)),
        p_env_decay: Math.max(0, Math.min(3, params.p_env_decay || 0.4)),
        p_env_punch: Math.max(0, Math.min(3, params.p_env_punch || 0)),
        p_base_freq: Math.max(0.001, Math.min(2, params.p_base_freq || 0.3)),
        p_freq_limit: Math.max(0, Math.min(1, params.p_freq_limit || 0)),
        p_freq_ramp: Math.max(-1, Math.min(1, params.p_freq_ramp || 0)),
        p_freq_dramp: Math.max(-1, Math.min(1, params.p_freq_dramp || 0)),
        p_vib_strength: Math.max(0, Math.min(1, params.p_vib_strength || 0)),
        p_vib_speed: Math.max(0, Math.min(1, params.p_vib_speed || 0)),
        p_arp_mod: Math.max(-1, Math.min(1, params.p_arp_mod || 0)),
        p_arp_speed: Math.max(0, Math.min(1, params.p_arp_speed || 0)),
        p_duty: Math.max(-1, Math.min(1, params.p_duty || 0)),
        p_duty_ramp: Math.max(-1, Math.min(1, params.p_duty_ramp || 0)),
        p_repeat_speed: Math.max(0, Math.min(1, params.p_repeat_speed || 0)),
        p_pha_offset: Math.max(-1, Math.min(1, params.p_pha_offset || 0)),
        p_pha_ramp: Math.max(-1, Math.min(1, params.p_pha_ramp || 0)),
        p_lpf_freq: Math.max(0, Math.min(1, params.p_lpf_freq || 1)),
        p_lpf_ramp: Math.max(-1, Math.min(1, params.p_lpf_ramp || 0)),
        p_lpf_resonance: Math.max(0, Math.min(1, params.p_lpf_resonance || 0)),
        p_hpf_freq: Math.max(0, Math.min(1, params.p_hpf_freq || 0)),
        p_hpf_ramp: Math.max(-1, Math.min(1, params.p_hpf_ramp || 0)),
        fm_freq: Math.max(0, Math.min(1, params.fm_freq || 0)),
        fm_depth: Math.max(0, Math.min(1, params.fm_depth || 0)),
        lfo_rate: Math.max(0, Math.min(1, params.lfo_rate || 0)),
        lfo_depth: Math.max(0, Math.min(1, params.lfo_depth || 0)),
        noise_type: Math.max(0, Math.min(2, Math.floor(params.noise_type || 0))),
        sub_bass: Math.max(0, Math.min(1, params.sub_bass || 0)),
        distortion: Math.max(0, Math.min(1, params.distortion || 0)),
        chorus_rate: Math.max(0, Math.min(1, params.chorus_rate || 0)),
        chorus_depth: Math.max(0, Math.min(1, params.chorus_depth || 0)),
        reverb_size: Math.max(0, Math.min(1, params.reverb_size || 0)),
        reverb_decay: Math.max(0, Math.min(1, params.reverb_decay || 0)),
        delay_time: Math.max(0, Math.min(1, params.delay_time || 0)),
        delay_feedback: Math.max(0, Math.min(1, params.delay_feedback || 0)),
        ring_mod_freq: Math.max(0, Math.min(1, params.ring_mod_freq || 0)),
        ring_mod_depth: Math.max(0, Math.min(1, params.ring_mod_depth || 0)),
        bit_crush: Math.max(0, Math.min(1, params.bit_crush || 0)),
        sample_reduction: Math.max(0, Math.min(1, params.sample_reduction || 0)),
        sound_vol: Math.max(0, Math.min(1, params.sound_vol || 0.5)),
        flanger_rate: Math.max(0, Math.min(1, params.flanger_rate || 0)),
        flanger_depth: Math.max(0, Math.min(1, params.flanger_depth || 0)),
        flanger_delay: Math.max(0.1, Math.min(1, params.flanger_delay || 0.5))
      };

      const sampleRate = this.audioContext.sampleRate;
      const safeDuration = Math.max(0.1, Math.min(10, duration));
      const length = Math.floor(sampleRate * safeDuration);

      
      if (length <= 0 || length > sampleRate * 10) {
        return null;
      }
      
      const buffer = this.audioContext.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      let phase = 0, subPhase = 0, fmPhase = 0;
      let frequency = safeParams.p_base_freq * 440;
      let envelope = 1;
      let dutyCycle = Math.max(0.01, Math.min(0.99, 0.5 - safeParams.p_duty * 0.5));
      let arpTime = 0;
      let arpValue = 1;
      
      // Pre-generate noise if needed
      let noise = null;
      if (safeParams.wave_type === NOISE) {
        try {
          noise = this.generateNoise(safeParams.noise_type, length);
        } catch (e) {
          noise = new Float32Array(length).fill(0);
        }
      }


      // Effect state with safe initialization
      const maxDelaySize = Math.floor(sampleRate * 0.5);
      const delayBuffer = new Array(maxDelaySize).fill(0);
      let delayIndex = 0;
      
      const maxChorusSize = Math.floor(sampleRate * 0.02);
      const chorusDelay = new Array(maxChorusSize).fill(0);
      let chorusIndex = 0;
      
      const maxFlangerSize = Math.floor(sampleRate * 0.02);
      const flangerBuffer = new Array(maxFlangerSize).fill(0);
      let flangerIndex = 0;

      const attackSamples = Math.floor(safeParams.p_env_attack * sampleRate);
      const sustainSamples = Math.floor(safeParams.p_env_sustain * sampleRate);
      const decaySamples = Math.floor(safeParams.p_env_decay * sampleRate);

      for (let i = 0; i < length; i++) {
        try {
          const t = i / sampleRate;
          
          // Envelope calculation with bounds checking
          if (i < attackSamples) {
            envelope = attackSamples > 0 ? i / attackSamples : 1;
          } else if (i < attackSamples + sustainSamples) {
            const sustainProgress = sustainSamples > 0 ? (i - attackSamples) / sustainSamples : 0;
            envelope = 1 + (1 - sustainProgress) * 2 * safeParams.p_env_punch;
          } else if (i < attackSamples + sustainSamples + decaySamples) {
            const decayProgress = decaySamples > 0 ? (i - attackSamples - sustainSamples) / decaySamples : 1;
            envelope = Math.max(0, 1 - decayProgress);
          } else {
            envelope = 0;
          }

          // retrigger logic
          if (safeParams.p_repeat_speed > 0) {
            const retriggerRate = safeParams.p_repeat_speed * 20; // Hz
            const retriggerPeriod = sampleRate / retriggerRate;
            const retriggerPhase = (i % retriggerPeriod) / retriggerPeriod;
            
            if (retriggerPhase < 0.1) { // 10% of period for retrigger
              envelope *= retriggerPhase / 0.1; // Fade in
            }
          }

          // Arpeggiator with bounds checking
          if (safeParams.p_arp_speed > 0) {
            arpTime += safeParams.p_arp_speed * 50 / sampleRate;
            if (arpTime >= 1) {
              arpTime = 0;
              arpValue = 1 + safeParams.p_arp_mod * (Math.random() * 2 - 1);
            }
          }

          // Frequency modulation with bounds checking
          frequency += safeParams.p_freq_ramp * 10;
          frequency = Math.max(20, Math.min(20000, frequency));
          
          // Apply arpeggiator
          let currentFreq = frequency * Math.max(0.1, Math.min(10, arpValue));

          // FM synthesis
          if (safeParams.fm_depth > 0 && safeParams.fm_freq > 0) {
            fmPhase += (2 * Math.PI * safeParams.fm_freq * 50) / sampleRate;
            if (fmPhase > 2 * Math.PI) fmPhase -= 2 * Math.PI;
            const fmOsc = Math.sin(fmPhase);
            currentFreq += fmOsc * safeParams.fm_depth * 100;
          }

          // LFO modulation
          if (safeParams.lfo_depth > 0 && safeParams.lfo_rate > 0) {
            const lfo = Math.sin(2 * Math.PI * safeParams.lfo_rate * 5 * t);
            currentFreq += lfo * safeParams.lfo_depth * 50;
          }

          // Vibrato
          if (safeParams.p_vib_strength > 0 && safeParams.p_vib_speed > 0) {
            const vibrato = Math.sin(2 * Math.PI * safeParams.p_vib_speed * 50 * t);
            currentFreq += vibrato * safeParams.p_vib_strength * currentFreq * 0.1;
          }

          // Duty cycle modulation
          if (safeParams.p_duty_ramp !== 0) {
            dutyCycle += safeParams.p_duty_ramp * 0.0001;
            dutyCycle = Math.max(0.01, Math.min(0.99, dutyCycle));
          }

          // Waveform generation with bounds checking
          let sample = 0;
          currentFreq = Math.max(20, Math.min(20000, currentFreq));
          phase += (2 * Math.PI * currentFreq) / sampleRate;
          if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
          
          switch (safeParams.wave_type) {
            case SQUARE:
              sample = (phase / (2 * Math.PI)) < dutyCycle ? 1 : -1;
              break;
            case SAWTOOTH:
              sample = (phase / Math.PI) - 1;
              break;
            case SINE:
              sample = Math.sin(phase);
              break;
            case NOISE:
              sample = noise && noise[i] ? noise[i] : (Math.random() * 2 - 1);
              break;
            default:
              sample = Math.sin(phase);
              break;
          }

          // Clamp sample to prevent overflow
          sample = Math.max(-1, Math.min(1, sample));

          // Sub-bass oscillator
          if (safeParams.sub_bass > 0) {
            subPhase += (Math.PI * currentFreq) / sampleRate;
            if (subPhase > 2 * Math.PI) subPhase -= 2 * Math.PI;
            const subSample = Math.sin(subPhase);
            sample += subSample * safeParams.sub_bass * 0.5;
          }

          // Ring modulation
          if (safeParams.ring_mod_depth > 0 && safeParams.ring_mod_freq > 0) {
            const ringOsc = Math.sin(2 * Math.PI * safeParams.ring_mod_freq * 200 * t);
            sample *= (1 - safeParams.ring_mod_depth + safeParams.ring_mod_depth * ringOsc);
          }

          // Low-pass filter (simple)
          if (safeParams.p_lpf_freq < 1) {
            const cutoff = Math.max(0, Math.min(1, safeParams.p_lpf_freq));
            const prevSample = i > 0 ? data[i - 1] : 0;
            sample = sample * cutoff + (1 - cutoff) * prevSample;
          }

          // High-pass filter (simple)
          if (safeParams.p_hpf_freq > 0) {
            const prevSample = i > 0 ? data[i - 1] : 0;
            sample = sample - prevSample * Math.max(0, Math.min(1, safeParams.p_hpf_freq));
          }

          // Apply distortion
          if (safeParams.distortion > 0) {
            sample = this.applyDistortion(sample, safeParams.distortion);
          }

          // Apply bit crushing
          if (safeParams.bit_crush > 0) {
            sample = this.applyBitCrush(sample, safeParams.bit_crush);
          }

          // Chorus effect
          if (safeParams.chorus_rate > 0 && safeParams.chorus_depth > 0) {
            const chorusLfo = Math.sin(2 * Math.PI * safeParams.chorus_rate * 5 * t);
            const chorusDelayTime = Math.floor(0.01 * sampleRate + chorusLfo * 0.005 * sampleRate);
            const chorusDelayedIndex = (chorusIndex - Math.max(1, Math.min(maxChorusSize - 1, chorusDelayTime)) + maxChorusSize) % maxChorusSize;
            const chorused = chorusDelay[chorusDelayedIndex] || 0;
            sample += chorused * safeParams.chorus_depth * 0.3;
            chorusDelay[chorusIndex] = sample;
            chorusIndex = (chorusIndex + 1) % maxChorusSize;
          }

          // Delay effect
          if (safeParams.delay_time > 0) {
            const delayTimeInSamples = Math.floor(safeParams.delay_time * sampleRate * 0.3);
            const delayedIndex = (delayIndex - Math.max(1, Math.min(maxDelaySize - 1, delayTimeInSamples)) + maxDelaySize) % maxDelaySize;
            const delayed = delayBuffer[delayedIndex] || 0;
            sample += delayed * safeParams.delay_feedback * 0.5;
            delayBuffer[delayIndex] = sample;
            delayIndex = (delayIndex + 1) % maxDelaySize;
          }

          // Flanger effect
          if (safeParams.flanger_rate > 0 && safeParams.flanger_depth > 0) {
            const flangerLfo = Math.sin(2 * Math.PI * safeParams.flanger_rate * 1 * t);
            const baseDelay = Math.floor(safeParams.flanger_delay * 0.01 * sampleRate);
            const modDelay = Math.floor(flangerLfo * safeParams.flanger_depth * 0.005 * sampleRate);
            const totalDelay = Math.max(1, Math.min(maxFlangerSize - 1, baseDelay + modDelay));
            const flangerDelayedIndex = (flangerIndex - totalDelay + maxFlangerSize) % maxFlangerSize;
            const flanged = flangerBuffer[flangerDelayedIndex] || 0;
            sample += flanged * 0.3;
            flangerBuffer[flangerIndex] = sample;
            flangerIndex = (flangerIndex + 1) % maxFlangerSize;
          }

          // Final bounds checking and envelope application
          sample = Math.max(-1, Math.min(1, sample));
          envelope = Math.max(0, Math.min(1, envelope));
          
          // Apply envelope and volume
          const finalSample = sample * envelope * safeParams.sound_vol * 0.3;
          data[i] = Math.max(-1, Math.min(1, isNaN(finalSample) ? 0 : finalSample));
          
          // Log progress every 10000 samples to avoid spam
          if (i % 10000 === 0 && i > 0) {
          }

        } catch (sampleError) {
          data[i] = 0; // Safe fallback
        }
      }

      return buffer;
    } catch (error) {
      return null;
    }
  }

  async playBuffer(buffer) {
    if (!this.audioContext || !buffer) return;
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start();
    return source;
  }

  setMasterVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }
}

// Smooth parameter interpolation hook

function audioBufferToWav(audioBuffer, targetSampleRate = null, targetBitDepth = 16) {
  const originalSampleRate = audioBuffer.sampleRate;
  const originalData = audioBuffer.getChannelData(0);
  
  // Determine final sample rate and bit depth
  const finalSampleRate = targetSampleRate || originalSampleRate;
  const finalBitDepth = targetBitDepth || 16;
  
  let finalData;
  
  // Downsample if needed
  if (finalSampleRate < originalSampleRate) {
    const ratio = originalSampleRate / finalSampleRate;
    const newLength = Math.floor(originalData.length / ratio);
    finalData = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const sourceIndex = Math.floor(i * ratio);
      finalData[i] = originalData[sourceIndex];
    }
  } else {
    finalData = originalData;
  }
  
  // Apply bit depth reduction
  if (finalBitDepth < 16) {
    const levels = Math.pow(2, finalBitDepth - 1) - 1;
    for (let i = 0; i < finalData.length; i++) {
      finalData[i] = Math.floor(finalData[i] * levels) / levels;
    }
  }
  
  const numChannels = 1;
  const format = 1;
  const bytesPerSample = finalBitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const buffer = new ArrayBuffer(44 + finalData.length * bytesPerSample);
  const view = new DataView(buffer);
  
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  let offset = 0;
  writeString(offset, 'RIFF'); offset += 4;
  view.setUint32(offset, buffer.byteLength - 8, true); offset += 4;
  writeString(offset, 'WAVE'); offset += 4;
  writeString(offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, format, true); offset += 2;
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, finalSampleRate, true); offset += 4; // Use final sample rate
  view.setUint32(offset, finalSampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, finalBitDepth, true); offset += 2; // Use final bit depth
  writeString(offset, 'data'); offset += 4;
  view.setUint32(offset, finalData.length * bytesPerSample, true); offset += 4;
  
  // Write samples based on bit depth
  if (finalBitDepth === 8) {
    for (let i = 0; i < finalData.length; i++) {
      const sample = Math.max(-1, Math.min(1, finalData[i]));
      const intSample = Math.floor((sample + 1) * 127.5); // Convert to 0-255 range for 8-bit
      view.setUint8(offset, intSample);
      offset += 1;
    }
  } else {
    // 16-bit
    for (let i = 0; i < finalData.length; i++) {
      const sample = Math.max(-1, Math.min(1, finalData[i]));
      const intSample = Math.floor(sample * 0x7FFF);
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
}


// Add these utility functions before the CompleteCrispFXR component

export { SynthParams, AudioSynthesizer, audioBufferToWav, SQUARE, SAWTOOTH, SINE, NOISE };
export default AudioSynthesizer;
