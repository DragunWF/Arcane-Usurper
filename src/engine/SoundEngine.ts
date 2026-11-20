import {
  AUDIO_CONFIG,
  AUDIO_MODES,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  type AudioMode,
  type DrainThrottleMode,
} from '../config/gameConfig';

/**
 * Narrow service interface exposed to ECS systems (ISP & DIP).
 * Systems depend on IAudioTrigger rather than instantiating SoundEngine directly.
 */
export interface IAudioTrigger {
  readonly isMuted: boolean;
  readonly isUnlocked: boolean;
  readonly mode: AudioMode;
  unlock(): boolean;
  toggleMute(): boolean;
  setMode(mode: AudioMode): void;
  setSiphonThrottle(mode: DrainThrottleMode): void;
  playVoidBolt(): void;
  playShadowBlink(): void;
  playUmbralPulse(): void;
  playIceLance(): void;
  playGlacialLaser(duration?: number): void;
  stopLaserLoop(): void;
  playIceShatter(intensity?: number): void;
  playPlayerHit(): void;
  playTiaraPing(): void;
  playVictoryClimax(): void;
  dispose(): void;
}

interface ActiveLaserNodes {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  env: GainNode;
}

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Procedural Web Audio API synthesizer and dynamic multi-phase music sequencer.
 * Ported verbatim from the legacy Glacial Spire monolith with zero external audio assets.
 */
export class SoundEngine implements IAudioTrigger {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Ambient Wintry Wind Nodes
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windLfo: OscillatorNode | null = null;

  // Active Laser Loop Tracking
  private activeLaserNodes: ActiveLaserNodes | null = null;

  // Dynamic Sequencer State
  private _mode: AudioMode = AUDIO_MODES.SILENT;
  private siphonThrottle: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW;
  private _isMuted = false;
  private _isUnlocked = false;
  private stepIndex = 0;
  private nextNoteTime = 0;
  private schedulerId: ReturnType<typeof setInterval> | null = null;

  public get isMuted(): boolean {
    return this._isMuted;
  }

  public get isUnlocked(): boolean {
    return this._isUnlocked;
  }

  public get mode(): AudioMode {
    return this._mode;
  }

  /**
   * Safely initializes and resumes AudioContext on the first user click or keydown.
   */
  public unlock(): boolean {
    try {
      if (!this.ctx) {
        const win = window as WindowWithWebkitAudio;
        const AudioCtx = window.AudioContext || win.webkitAudioContext;
        if (!AudioCtx) return false;
        this.ctx = new AudioCtx();

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = AUDIO_CONFIG.compressorThreshold;
        compressor.knee.value = AUDIO_CONFIG.compressorKnee;
        compressor.ratio.value = AUDIO_CONFIG.compressorRatio;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this._isMuted ? 0 : AUDIO_CONFIG.masterVolume;

        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = AUDIO_CONFIG.bgmGain;

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = AUDIO_CONFIG.sfxGain;

        this.bgmGain.connect(compressor);
        this.sfxGain.connect(compressor);
        compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.buildNoiseBuffer();
        this.startWintryWindBed();
        this.startSequencerLoop();

        if (this._mode !== AUDIO_MODES.SILENT && this.windGain) {
          const now = this.ctx.currentTime;
          this.windGain.gain.cancelScheduledValues(now);
          this.windGain.gain.setTargetAtTime(
            AUDIO_CONFIG.windGains[this._mode],
            now,
            AUDIO_CONFIG.windRampTimeConstant,
          );
        }
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      this._isUnlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * AUDIO_CONFIG.noiseBufferDurationSec;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private startWintryWindBed(): void {
    if (!this.ctx || !this.noiseBuffer || !this.bgmGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = AUDIO_CONFIG.windFilterFrequency;
    filter.Q.value = AUDIO_CONFIG.windFilterQ;

    // Subtle slow LFO sweeping wind resonance
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = AUDIO_CONFIG.windLfoFrequency;
    lfoGain.gain.value = AUDIO_CONFIG.windLfoGain;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const gain = this.ctx.createGain();
    gain.gain.value = AUDIO_CONFIG.minGainFloor;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start();

    this.windSource = src;
    this.windFilter = filter;
    this.windGain = gain;
    this.windLfo = lfo;
  }

  /**
   * Toggles master audio mute cleanly and returns the new muted boolean.
   */
  public toggleMute(): boolean {
    this._isMuted = !this._isMuted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(
        this._isMuted ? 0 : AUDIO_CONFIG.masterVolume,
        now,
        AUDIO_CONFIG.muteRampTimeConstant,
      );
    }
    return this._isMuted;
  }

  /**
   * Switches dynamic background music sequencer mode.
   */
  public setMode(mode: AudioMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this.stepIndex = 0;

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.nextNoteTime = now + AUDIO_CONFIG.modeSwitchLeadTimeSec;

    // Adjust subtle wintry wind bed per mode
    if (this.windGain) {
      const targetWind = AUDIO_CONFIG.windGains[mode];
      this.windGain.gain.cancelScheduledValues(now);
      this.windGain.gain.setTargetAtTime(
        targetWind,
        now,
        AUDIO_CONFIG.windRampTimeConstant,
      );
    }

    if (mode === AUDIO_MODES.VICTORY) {
      this.playVictoryChord(now);
    } else if (mode === AUDIO_MODES.DEFEAT) {
      this.playDefeatToll(now);
    }
  }

  private getStepDuration(): number {
    if (this._mode === AUDIO_MODES.COMBAT_P1) {
      return (60 / AUDIO_CONFIG.p1Tempo) * 0.5;
    }
    if (this._mode === AUDIO_MODES.COMBAT_P2) {
      return (60 / AUDIO_CONFIG.p2Tempo) * 0.5;
    }
    if (this._mode === AUDIO_MODES.COMBAT_P3) {
      return (60 / AUDIO_CONFIG.p3Tempo) * 0.25;
    }
    if (this._mode === AUDIO_MODES.STAGGER) {
      return AUDIO_CONFIG.staggerStepDuration;
    }
    if (this._mode === AUDIO_MODES.SIPHON) {
      if (this.siphonThrottle === DRAIN_THROTTLE_MODES.SAVOR) {
        return AUDIO_CONFIG.siphonStepDuration * 1.45;
      }
      if (this.siphonThrottle === DRAIN_THROTTLE_MODES.SURGE) {
        return AUDIO_CONFIG.siphonStepDuration * 0.52;
      }
      return AUDIO_CONFIG.siphonStepDuration;
    }
    if (this._mode === AUDIO_MODES.DEFEAT) {
      return DIORAMA_CONFIG.defeatMusicBoxStepDuration;
    }
    return AUDIO_CONFIG.defaultStepDuration;
  }

  public setSiphonThrottle(mode: DrainThrottleMode): void {
    this.siphonThrottle = mode;
  }

  private startSequencerLoop(): void {
    if (!this.ctx) return;
    if (this.schedulerId !== null) clearInterval(this.schedulerId);
    this.nextNoteTime = this.ctx.currentTime + AUDIO_CONFIG.initialNoteLeadTimeSec;

    this.schedulerId = setInterval(() => {
      if (
        !this.ctx ||
        this.ctx.state !== 'running' ||
        this._mode === AUDIO_MODES.SILENT
      ) {
        return;
      }
      while (
        this.nextNoteTime <
        this.ctx.currentTime + AUDIO_CONFIG.schedulerLookAheadSec
      ) {
        this.scheduleSequencerStep(this.stepIndex, this.nextNoteTime);
        this.nextNoteTime += this.getStepDuration();
        this.stepIndex++;
      }
    }, AUDIO_CONFIG.schedulerIntervalMs);
  }

  private scheduleSequencerStep(step: number, time: number): void {
    if (
      this._mode === AUDIO_MODES.COMBAT_P1 ||
      this._mode === AUDIO_MODES.COMBAT_P2 ||
      this._mode === AUDIO_MODES.COMBAT_P3
    ) {
      const isP3 = this._mode === AUDIO_MODES.COMBAT_P3;
      const isP2 = this._mode === AUDIO_MODES.COMBAT_P2;
      const arp = isP3
        ? AUDIO_CONFIG.arpP3
        : isP2
          ? AUDIO_CONFIG.arpP2
          : AUDIO_CONFIG.arpP1;

      // Crystalline FM/Sine Cathedral Bell Arpeggio
      const noteFreq = arp[step % arp.length];
      const shouldPlayBell = isP3 ? step % 2 === 0 || step % 4 === 3 : true;
      if (shouldPlayBell && noteFreq !== undefined) {
        const brightness = isP3 ? 0.16 : isP2 ? 0.12 : 0.085;
        this.synthCathedralBell(time, noteFreq, brightness, isP3 ? 0.34 : 0.46);
      }

      // Pulsing Dark-Synth Bassline
      const bassRate = isP3 ? 4 : 2;
      if (step % bassRate === 0) {
        const barIdx =
          Math.floor(step / (bassRate * 2)) % AUDIO_CONFIG.bassLine.length;
        const bassFreq = AUDIO_CONFIG.bassLine[barIdx];
        if (bassFreq !== undefined) {
          this.synthDarkBass(
            time,
            bassFreq,
            isP3 ? 0.24 : isP2 ? 0.19 : 0.15,
            isP3 ? 0.26 : 0.38,
          );
        }
      }

      // Subtle Escalating Percussion Pulse
      if (isP2 && step % 2 === 1) {
        this.synthIceTick(time, 0.045);
      } else if (isP3) {
        if (step % 4 === 0) this.synthHeartbeatThump(time, 0.18, 72);
        if (step % 2 === 1) this.synthIceTick(time, 0.055);
      }
    } else if (this._mode === AUDIO_MODES.STAGGER) {
      // Tense quiet sub-bass heartbeat (lub-dub) + faint solitary wind chime
      const beatPos = step % 4;
      if (beatPos === 0) {
        this.synthHeartbeatThump(time, 0.22, 54);
      } else if (beatPos === 1) {
        this.synthHeartbeatThump(time + 0.18, 0.14, 48);
      }
      if (step % 8 === 0) {
        const freq =
          AUDIO_CONFIG.staggerChimes[
            Math.floor(step / 8) % AUDIO_CONFIG.staggerChimes.length
          ];
        if (freq !== undefined) {
          this.synthCathedralBell(time, freq, 0.045, 1.35);
        }
      }
    } else if (this._mode === AUDIO_MODES.SIPHON) {
      // Hypnotic amethyst shimmer & warm sub-pulse modulated by SAVOR/FLOW/SURGE throttle
      const stepDiv =
        this.siphonThrottle === DRAIN_THROTTLE_MODES.SURGE ? 2 : 4;
      if (step % stepDiv === 0) {
        const f =
          AUDIO_CONFIG.siphonNotes[
            Math.floor(step / stepDiv) % AUDIO_CONFIG.siphonNotes.length
          ];
        if (f !== undefined) {
          const pitchMult =
            this.siphonThrottle === DRAIN_THROTTLE_MODES.SURGE
              ? 2.5
              : this.siphonThrottle === DRAIN_THROTTLE_MODES.SAVOR
                ? 1.5
                : 2.0;
          const bellGain =
            this.siphonThrottle === DRAIN_THROTTLE_MODES.SURGE ? 0.085 : 0.06;
          this.synthCathedralBell(time, f * pitchMult, bellGain, 1.1);
          this.synthHeartbeatThump(
            time,
            this.siphonThrottle === DRAIN_THROTTLE_MODES.SAVOR ? 0.1 : 0.14,
            this.siphonThrottle === DRAIN_THROTTLE_MODES.SURGE ? 72 : 56,
          );
        }
      }
    } else if (this._mode === AUDIO_MODES.DEFEAT) {
      // Delicate ethereal frost music-box loop for Forced Frost Puppet diorama
      const notes = DIORAMA_CONFIG.defeatMusicBoxNotes;
      const noteFreq = notes[step % notes.length];
      if (noteFreq !== undefined) {
        this.synthCathedralBell(time, noteFreq * 2.0, 0.055, 0.72);
        if (step % 4 === 0) {
          this.synthCathedralBell(time, noteFreq, 0.04, 1.35);
        }
      }
    }
  }

  private synthCathedralBell(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.bgmGain) return;
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const env = this.ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, time);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * 2.0, time);
    modGain.gain.setValueAtTime(freq * 0.42, time);
    modGain.gain.exponentialRampToValueAtTime(1.0, time + duration * 0.7);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.012);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(this.bgmGain);

    carrier.start(time);
    mod.start(time);
    carrier.stop(time + duration + 0.02);
    mod.stop(time + duration + 0.02);
  }

  private synthDarkBass(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, time);
    filter.frequency.exponentialRampToValueAtTime(125, time + duration);
    filter.Q.value = 2.4;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.015);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private synthHeartbeatThump(
    time: number,
    peakGain: number,
    startFreq = 58,
  ): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.16);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.014);
    env.gain.exponentialRampToValueAtTime(AUDIO_CONFIG.minGainFloor, time + 0.22);

    osc.connect(env);
    env.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  private synthIceTick(time: number, peakGain: number): void {
    if (!this.ctx || !this.noiseBuffer || !this.bgmGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6500;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(peakGain, time);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + 0.045,
    );

    src.connect(filter);
    filter.connect(env);
    env.connect(this.bgmGain);
    src.start(time);
    src.stop(time + 0.05);
  }

  private playVictoryChord(time: number): void {
    AUDIO_CONFIG.victoryChord.forEach((freq, i) => {
      this.synthCathedralBell(time + i * 0.09, freq, 0.12, 2.1);
    });
  }

  private playDefeatToll(time: number): void {
    AUDIO_CONFIG.defeatToll.forEach((freq, i) => {
      this.synthCathedralBell(time + i * 0.24, freq, 0.11, 1.8);
    });
  }

  // =========================================================================
  // SYNTHESIZED COMBAT SOUND EFFECTS
  // =========================================================================

  /**
   * Crisp dark-amethyst plasma burst (rapid pitch-drop oscillator + filtered noise).
   */
  public playVoidBolt(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oscEnv = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(145, now + 0.13);

    oscEnv.gain.setValueAtTime(0.001, now);
    oscEnv.gain.linearRampToValueAtTime(0.24, now + 0.008);
    oscEnv.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      now + 0.14,
    );

    osc.connect(oscEnv);
    oscEnv.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2100, now);
      filter.Q.value = 1.8;

      const nEnv = this.ctx.createGain();
      nEnv.gain.setValueAtTime(0.16, now);
      nEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.085,
      );

      noise.connect(filter);
      filter.connect(nEnv);
      nEnv.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.095);
    }
  }

  /**
   * Phase-shift shadow whoosh (bandpass white-noise sweep).
   */
  public playShadowBlink(): void {
    if (
      !this.ctx ||
      !this.sfxGain ||
      this.ctx.state !== 'running' ||
      !this.noiseBuffer
    ) {
      return;
    }
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.24);
    filter.Q.value = 2.6;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.32, now + 0.025);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      now + 0.26,
    );

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.28);
  }

  /**
   * Deep sub-bass gravity thump + resonant violet harmonic ring.
   */
  public playUmbralPulse(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;

    // Sub-bass gravity thump
    const sub = ctx.createOscillator();
    const subEnv = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.36);

    subEnv.gain.setValueAtTime(0.001, now);
    subEnv.gain.linearRampToValueAtTime(0.45, now + 0.015);
    subEnv.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      now + 0.42,
    );

    sub.connect(subEnv);
    subEnv.connect(sfxGain);
    sub.start(now);
    sub.stop(now + 0.44);

    // Resonant violet harmonic ring
    AUDIO_CONFIG.umbralPulseRingNotes.forEach((freq) => {
      const ring = ctx.createOscillator();
      const rEnv = ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(freq, now);
      ring.frequency.exponentialRampToValueAtTime(freq * 0.94, now + 0.55);

      rEnv.gain.setValueAtTime(0.001, now);
      rEnv.gain.linearRampToValueAtTime(0.11, now + 0.02);
      rEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.58,
      );

      ring.connect(rEnv);
      rEnv.connect(sfxGain);
      ring.start(now);
      ring.stop(now + 0.6);
    });
  }

  /**
   * High crystalline chime + sharp frost dart hiss.
   */
  public playIceLance(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;

    AUDIO_CONFIG.iceLanceChimeNotes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.02);

      env.gain.setValueAtTime(0.001, now + i * 0.02);
      env.gain.linearRampToValueAtTime(0.13, now + i * 0.02 + 0.01);
      env.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.28,
      );

      osc.connect(env);
      env.connect(sfxGain);
      osc.start(now + i * 0.02);
      osc.stop(now + 0.3);
    });

    if (this.noiseBuffer) {
      const hiss = ctx.createBufferSource();
      hiss.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4200;

      const hEnv = ctx.createGain();
      hEnv.gain.setValueAtTime(0.12, now);
      hEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.16,
      );

      hiss.connect(hp);
      hp.connect(hEnv);
      hEnv.connect(sfxGain);
      hiss.start(now);
      hiss.stop(now + 0.18);
    }
  }

  /**
   * Sustained harmonic beam hum during Twin Glacial Laser sweeps.
   */
  public playGlacialLaser(
    duration: number = AUDIO_CONFIG.defaultLaserDurationSec,
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (this.activeLaserNodes) return; // Prevent double-stacking for twin beams

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.linearRampToValueAtTime(260, now + duration * 0.5);
    osc1.frequency.linearRampToValueAtTime(195, now + duration);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(443, now);
    osc2.frequency.linearRampToValueAtTime(522, now + duration * 0.5);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(980, now);
    filter.Q.value = 2.8;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);
    env.gain.linearRampToValueAtTime(0.24, now + 0.08);
    env.gain.setValueAtTime(0.22, now + Math.max(0.1, duration - 0.18));
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      now + duration,
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.04);
    osc2.stop(now + duration + 0.04);

    this.activeLaserNodes = { osc1, osc2, env };
    osc1.onended = () => {
      if (this.activeLaserNodes && this.activeLaserNodes.osc1 === osc1) {
        this.activeLaserNodes = null;
      }
    };
  }

  public stopLaserLoop(): void {
    if (!this.ctx || !this.activeLaserNodes) return;
    try {
      const now = this.ctx.currentTime;
      const { osc1, osc2, env } = this.activeLaserNodes;
      env.gain.cancelScheduledValues(now);
      env.gain.setTargetAtTime(AUDIO_CONFIG.minGainFloor, now, 0.03);
      osc1.stop(now + 0.12);
      osc2.stop(now + 0.12);
    } catch {
      // Oscillator may already be stopped
    }
    this.activeLaserNodes = null;
  }

  /**
   * Multi-grain high-frequency crystalline shatter (Void Bolt hits, clone shatters, stagger break).
   */
  public playIceShatter(
    intensity: number = AUDIO_CONFIG.defaultShatterIntensity,
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const grainCount = Math.max(4, Math.round(4 + intensity * 4));

    for (let i = 0; i < grainCount; i++) {
      const offset = i * 0.018 + Math.random() * 0.015;
      const freq = 2200 + Math.random() * 3400;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(
        freq * 0.72,
        now + offset + 0.11,
      );

      env.gain.setValueAtTime(0.001, now + offset);
      env.gain.linearRampToValueAtTime(0.11 * intensity, now + offset + 0.006);
      env.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + offset + 0.13,
      );

      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    }

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3600;

      const nEnv = this.ctx.createGain();
      nEnv.gain.setValueAtTime(0.18 * intensity, now);
      nEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.18,
      );

      src.connect(hp);
      hp.connect(nEnv);
      nEnv.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.2);
    }
  }

  /**
   * Heavy frost impact thud when the Dark Mage takes damage.
   */
  public playPlayerHit(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.24);

    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.42, now + 0.01);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      now + 0.28,
    );

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);

    if (this.noiseBuffer) {
      const crack = this.ctx.createBufferSource();
      crack.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;

      const cEnv = this.ctx.createGain();
      cEnv.gain.setValueAtTime(0.24, now);
      cEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.14,
      );

      crack.connect(bp);
      bp.connect(cEnv);
      cEnv.connect(this.sfxGain);
      crack.start(now);
      crack.stop(now + 0.16);
    }
  }

  /**
   * Bright crystalline *PING!* harmonic bell chime for [F] Tiara-Flick taunt.
   */
  public playTiaraPing(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;

    [2637.02, 3951.07].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.015);
      osc.frequency.exponentialRampToValueAtTime(
        freq * 1.012,
        now + idx * 0.015 + 0.36,
      );

      env.gain.setValueAtTime(0.001, now + idx * 0.015);
      env.gain.linearRampToValueAtTime(0.18 - idx * 0.06, now + idx * 0.015 + 0.006);
      env.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + 0.42,
      );

      osc.connect(env);
      env.connect(sfxGain);
      osc.start(now + idx * 0.015);
      osc.stop(now + 0.45);
    });
  }

  /**
   * Radiant arcane usurpation climax shimmer + sub-bass swell at 100% drain.
   */
  public playVictoryClimax(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;

    const sub = ctx.createOscillator();
    const subEnv = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.65);

    subEnv.gain.setValueAtTime(0.001, now);
    subEnv.gain.linearRampToValueAtTime(0.36, now + 0.04);
    subEnv.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      now + 0.72,
    );
    sub.connect(subEnv);
    subEnv.connect(sfxGain);
    sub.start(now);
    sub.stop(now + 0.75);

    AUDIO_CONFIG.victoryChord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.065;
      osc.frequency.setValueAtTime(freq * 2.0, t);

      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.14, t + 0.02);
      env.gain.exponentialRampToValueAtTime(AUDIO_CONFIG.minGainFloor, t + 1.4);

      osc.connect(env);
      env.connect(sfxGain);
      osc.start(t);
      osc.stop(t + 1.45);
    });
  }

  /**
   * Stops the sequencer timer, ambient wind bed, and releases the Web Audio context.
   */
  public dispose(): void {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.stopLaserLoop();

    try {
      this.windSource?.stop();
      this.windLfo?.stop();
      this.windFilter?.disconnect();
    } catch {
      // Nodes may already be stopped
    }
    this.windSource = null;
    this.windLfo = null;
    this.windFilter = null;
    this.windGain = null;

    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this._isUnlocked = false;
  }
}
