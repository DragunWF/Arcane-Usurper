import {
  AUDIO_CONFIG,
  AUDIO_MODES,
  CHAMBER_CONFIG,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  SIPHON_AUDIO_CONFIG,
  SIPHON_BEAM_CONFIG,
  type AudioMode,
  type DrainThrottleMode,
} from '../config/gameConfig';

export type SiphonRealmId = 1 | 2 | 3;

export interface SiphonAudioUpdateState {
  readonly drainProgress: number;
  readonly throttle: DrainThrottleMode;
  readonly kissPressPhase: number;
  readonly isEndlessSavor: boolean;
  readonly isTauntStunned: boolean;
  readonly dt: number;
}

/**
 * Narrow service interface exposed to ECS systems (ISP & DIP).
 * Systems depend on IAudioTrigger rather than instantiating SoundEngine directly.
 */
export interface IAudioTrigger {
  readonly isMuted: boolean;
  readonly isUnlocked: boolean;
  readonly mode: AudioMode;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  unlock(): boolean;
  toggleMute(): boolean;
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  setMode(mode: AudioMode): void;
  setSiphonThrottle(mode: DrainThrottleMode): void;
  startSiphonLoop(realm: SiphonRealmId): void;
  updateSiphonLoop(state: SiphonAudioUpdateState): void;
  playSiphonMicroChime(realm: SiphonRealmId, drainProgress: number): void;
  playSiphonClimax(realm: SiphonRealmId): void;
  stopSiphonLoop(): void;
  startBeamSiphonLoop(realm: SiphonRealmId): void;
  updateBeamSiphonLoop(drainProgress: number, dt: number): void;
  stopBeamSiphonLoop(): void;
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
  playPreviewChime(): void;
  playUrnShatter(): void;
  playShieldClang(): void;
  playGuardBreak(): void;
  playSummonGlyphChime(): void;
  playPortalIgnite(): void;
  playPortalWarp(): void;
  playSunkenWardChime(): void;
  playHarmonicWardPulse(): void;
  playDummyCrystalHit(): void;
  playTrophyToggle(): void;
  playTidalWave(): void;
  playBubblePop(): void;
  playGeyserErupt(): void;
  playCoralShatter(): void;
  playLaserSlash(): void;
  playChordBurst(): void;
  playBassDrop(): void;
  playCapacitorShatter(): void;
  dispose(): void;
}

interface ActiveLaserNodes {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  env: GainNode;
}

interface ActiveSiphonNodes {
  realm: SiphonRealmId;
  masterGain: GainNode;
  droneOsc1: OscillatorNode;
  droneOsc2: OscillatorNode;
  overtoneGain: GainNode;
  etherFilter: BiquadFilterNode;
  etherGain: GainNode;
  noiseSource: AudioBufferSourceNode | null;
  shimmerFilter: BiquadFilterNode | null;
  shimmerGain: GainNode | null;
  breathFilter: BiquadFilterNode | null;
  breathGain: GainNode | null;
  prevKissPressPhase: number;
  contactArmed: boolean;
  partingArmed: boolean;
  heartbeatTimer: number;
  chimeStepIdx: number;
}

interface ActiveBeamSiphonNodes {
  realm: SiphonRealmId;
  masterGain: GainNode;
  coreOsc: OscillatorNode;
  overtoneOsc: OscillatorNode;
  subOsc: OscillatorNode;
  overtoneGain: GainNode;
  subGain: GainNode;
  filter: BiquadFilterNode;
  noiseSource: AudioBufferSourceNode | null;
  noiseFilter: BiquadFilterNode | null;
  noiseGain: GainNode | null;
  crackleAccum: number;
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
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  // Ambient Wintry Wind Nodes
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windLfo: OscillatorNode | null = null;

  // Active Continuous SFX Loops
  private activeLaserNodes: ActiveLaserNodes | null = null;
  private activeSiphonNodes: ActiveSiphonNodes | null = null;
  private activeBeamSiphonNodes: ActiveBeamSiphonNodes | null = null;

  // Dynamic Sequencer & Split Channel Gain State
  private _mode: AudioMode = AUDIO_MODES.SILENT;
  private siphonThrottle: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW;
  private _isMuted = false;
  private _isUnlocked = false;
  private _musicVolume: number = AUDIO_CONFIG.defaultMusicVolume;
  private _sfxVolume: number = AUDIO_CONFIG.defaultSfxVolume;
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

  public get musicVolume(): number {
    return this._musicVolume;
  }

  public get sfxVolume(): number {
    return this._sfxVolume;
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

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this._musicVolume;

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this._sfxVolume;

        this.musicGain.connect(compressor);
        this.sfxGain.connect(compressor);
        compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.buildNoiseBuffer();
        this.buildPinkNoiseBuffer();
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

  /**
   * Generates a warm, non-harsh looping pink-noise buffer via Paul Kellet's 7-stage filter
   * for intimate breath envelopes and filtered ether-siphon shimmer.
   */
  private buildPinkNoiseBuffer(): void {
    if (!this.ctx) return;
    const length = this.ctx.sampleRate * SIPHON_AUDIO_CONFIG.pinkNoiseDurationSec;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    this.pinkNoiseBuffer = buffer;
  }

  private startWintryWindBed(): void {
    if (!this.ctx || !this.noiseBuffer || !this.musicGain) return;
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
    gain.connect(this.musicGain);
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
   * Smoothly adjusts dedicated music channel gain without clicks or pops.
   */
  public setMusicVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this._musicVolume = clamped;
    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(
        clamped,
        now,
        AUDIO_CONFIG.gainRampTime,
      );
    }
  }

  /**
   * Smoothly adjusts dedicated SFX channel gain without clicks or pops.
   */
  public setSfxVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this._sfxVolume = clamped;
    if (this.ctx && this.sfxGain) {
      const now = this.ctx.currentTime;
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.setTargetAtTime(
        clamped,
        now,
        AUDIO_CONFIG.gainRampTime,
      );
    }
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
    if (this._mode === AUDIO_MODES.CHAMBER) {
      return (60 / AUDIO_CONFIG.chamberTempo) * 0.25;
    }
    if (this._mode === AUDIO_MODES.SUNKEN_CHAMBER) {
      return (60 / AUDIO_CONFIG.sunkenChamberTempo) * 0.25;
    }
    if (this._mode === AUDIO_MODES.SUNKEN_BOSS) {
      return (60 / AUDIO_CONFIG.sunkenBossTempo) * 0.5;
    }
    if (this._mode === AUDIO_MODES.HARMONIC_CHAMBER) {
      return (60 / AUDIO_CONFIG.harmonicChamberTempo) * 0.25;
    }
    if (this._mode === AUDIO_MODES.HARMONIC_BOSS) {
      return (60 / AUDIO_CONFIG.harmonicBossTempo) * 0.25;
    }
    if (this._mode === AUDIO_MODES.LOBBY) {
      return (60 / AUDIO_CONFIG.lobbyTempo) * 0.5;
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
    } else if (this._mode === AUDIO_MODES.CHAMBER) {
      // Tense regal harpsichord ostinato + crystalline accents building toward the summit theme
      const arp = AUDIO_CONFIG.chamberArp;
      const noteFreq = arp[step % arp.length];
      if (noteFreq !== undefined) {
        const accent = step % 4 === 0 ? 1.25 : 1.0;
        this.synthHarpsichord(
          time,
          noteFreq,
          AUDIO_CONFIG.chamberHarpsichordGain * accent,
          AUDIO_CONFIG.chamberHarpsichordDuration,
        );
      }

      if (step % 8 === 0) {
        const bassFreq =
          AUDIO_CONFIG.chamberBass[
            Math.floor(step / 8) % AUDIO_CONFIG.chamberBass.length
          ];
        if (bassFreq !== undefined) {
          this.synthDarkBass(
            time,
            bassFreq,
            AUDIO_CONFIG.chamberBassGain,
            AUDIO_CONFIG.chamberBassDuration,
          );
        }
      }

      // Crystalline bell foreshadowing Marina's summit arpeggio every bar
      if (step % 16 === 12) {
        const bellFreq =
          AUDIO_CONFIG.arpP1[
            Math.floor(step / 16) % AUDIO_CONFIG.arpP1.length
          ];
        if (bellFreq !== undefined) {
          this.synthCathedralBell(
            time,
            bellFreq,
            AUDIO_CONFIG.chamberAccentBellGain,
            1.1,
          );
        }
      }

      if (step % 4 === 2) this.synthIceTick(time, 0.03);
    } else if (this._mode === AUDIO_MODES.LOBBY) {
      // Serene dark-fantasy music box & warm low cello-pad progression for Obsidian Spire Sanctum
      const boxNotes = AUDIO_CONFIG.lobbyMusicBoxNotes;
      const noteFreq = boxNotes[step % boxNotes.length];
      if (noteFreq !== undefined) {
        this.synthCathedralBell(
          time,
          noteFreq,
          AUDIO_CONFIG.lobbyMusicBoxGain,
          AUDIO_CONFIG.lobbyMusicBoxDuration,
        );
      }

      if (step % 4 === 0) {
        const celloNotes = AUDIO_CONFIG.lobbyCelloNotes;
        const celloFreq =
          celloNotes[Math.floor(step / 4) % celloNotes.length];
        if (celloFreq !== undefined) {
          this.synthWarmCelloPad(
            time,
            celloFreq,
            AUDIO_CONFIG.lobbyCelloGain,
            AUDIO_CONFIG.lobbyCelloDuration,
          );
        }
      }
    } else if (this._mode === AUDIO_MODES.SUNKEN_CHAMBER) {
      // Flowing Atlantean harp arpeggios + resonant glass-bell pulse (routed through musicGain)
      const harpNotes = AUDIO_CONFIG.sunkenHarpArp;
      const harpFreq = harpNotes[step % harpNotes.length];
      if (harpFreq !== undefined) {
        const accent = step % 4 === 0 ? 1.2 : 0.92;
        this.synthAtlanteanHarp(
          time,
          harpFreq,
          AUDIO_CONFIG.sunkenHarpGain * accent,
          AUDIO_CONFIG.sunkenHarpDuration,
        );
      }

      if (step % 8 === 0 || step % 8 === 5) {
        const bells = AUDIO_CONFIG.sunkenGlassBellNotes;
        const bellFreq = bells[Math.floor(step / 8) % bells.length];
        if (bellFreq !== undefined) {
          this.synthGlassBell(
            time,
            bellFreq,
            AUDIO_CONFIG.sunkenGlassBellGain,
            AUDIO_CONFIG.sunkenGlassBellDuration,
          );
        }
      }

      if (step % 16 === 0) {
        const bassRoot = AUDIO_CONFIG.sunkenBossSwellChords[
          Math.floor(step / 16) % AUDIO_CONFIG.sunkenBossSwellChords.length
        ];
        if (bassRoot !== undefined) {
          this.synthOceanicSwell(time, bassRoot * 0.5, 0.085, 1.8);
        }
      }
    } else if (this._mode === AUDIO_MODES.SUNKEN_BOSS) {
      // Dramatic orchestral synth swells + sub-bass oceanic percussion (routed through musicGain)
      if (step % 4 === 0) {
        const chords = AUDIO_CONFIG.sunkenBossSwellChords;
        const root = chords[Math.floor(step / 4) % chords.length];
        if (root !== undefined) {
          this.synthOceanicSwell(
            time,
            root,
            AUDIO_CONFIG.sunkenBossSwellGain,
            AUDIO_CONFIG.sunkenBossSwellDuration,
          );
          this.synthOceanicSwell(
            time,
            root * 1.5,
            AUDIO_CONFIG.sunkenBossSwellGain * 0.55,
            AUDIO_CONFIG.sunkenBossSwellDuration,
          );
        }
      }

      if (step % 2 === 0) {
        this.synthOceanicPercussion(
          time,
          step % 4 === 0
            ? AUDIO_CONFIG.sunkenBossPercGain
            : AUDIO_CONFIG.sunkenBossPercGain * 0.65,
          step % 4 === 0 ? 74 : 58,
        );
      }

      const mel = AUDIO_CONFIG.sunkenBossMelody;
      const melFreq = mel[step % mel.length];
      if (melFreq !== undefined) {
        this.synthGlassBell(
          time,
          melFreq,
          AUDIO_CONFIG.sunkenBossMelodyGain,
          0.52,
        );
      }
    } else if (this._mode === AUDIO_MODES.HARMONIC_CHAMBER) {
      // Driving synth-bass pulse + crystalline bell arpeggios (routed through musicGain)
      const bassTable = AUDIO_CONFIG.harmonicSynthBass;
      const bassFreq =
        bassTable[Math.floor(step / 2) % bassTable.length];
      if (bassFreq !== undefined) {
        const isOffbeat = step % 2 === 1;
        this.synthCyberBass(
          time,
          isOffbeat ? bassFreq * 2.0 : bassFreq,
          isOffbeat
            ? AUDIO_CONFIG.harmonicBassGain * 0.72
            : AUDIO_CONFIG.harmonicBassGain,
          AUDIO_CONFIG.harmonicBassDuration,
        );
      }

      const arp = AUDIO_CONFIG.harmonicBellArp;
      const arpFreq = arp[step % arp.length];
      if (arpFreq !== undefined) {
        const accent = step % 4 === 0 ? 1.2 : 0.9;
        this.synthCathedralBell(
          time,
          arpFreq,
          AUDIO_CONFIG.harmonicBellGain * accent,
          AUDIO_CONFIG.harmonicBellDuration,
        );
      }

      if (step % 4 === 0) {
        this.synthOceanicPercussion(time, 0.16, 76);
      }
      if (step % 2 === 1) {
        this.synthIceTick(time, 0.038);
      }
    } else if (this._mode === AUDIO_MODES.HARMONIC_BOSS) {
      // High-energy cyber-opera synth lead + rhythmic electronic percussion (routed through musicGain)
      const lead = AUDIO_CONFIG.harmonicBossLead;
      const leadFreq = lead[step % lead.length];
      if (leadFreq !== undefined) {
        const accent = step % 4 === 0 ? 1.22 : 0.92;
        this.synthCyberOperaLead(
          time,
          leadFreq,
          AUDIO_CONFIG.harmonicBossLeadGain * accent,
          AUDIO_CONFIG.harmonicBossLeadDuration,
        );
      }

      const bassTable = AUDIO_CONFIG.harmonicBossBass;
      const bassFreq =
        bassTable[Math.floor(step / 2) % bassTable.length];
      if (bassFreq !== undefined) {
        const octaveMult = step % 2 === 1 ? 2.0 : 1.0;
        this.synthCyberBass(
          time,
          bassFreq * octaveMult,
          AUDIO_CONFIG.harmonicBossBassGain * (step % 2 === 1 ? 0.78 : 1.0),
          0.22,
        );
      }

      // Four-on-the-floor electronic kick, crisp cyber snare on backbeats, & 16th hi-hats
      if (step % 4 === 0) {
        this.synthOceanicPercussion(
          time,
          AUDIO_CONFIG.harmonicBossKickGain,
          88,
        );
      }
      if (step % 8 === 4) {
        this.synthCyberSnare(time, AUDIO_CONFIG.harmonicBossSnareGain);
      }
      if (step % 2 === 1) {
        this.synthIceTick(time, 0.048);
      }
    }
  }

  /**
   * Punchy resonant low-pass sawtooth/square synth-bass pulse routed through musicGain.
   */
  private synthCyberBass(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const saw = this.ctx.createOscillator();
    const sq = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(freq, time);
    sq.type = 'square';
    sq.frequency.setValueAtTime(freq * 0.5, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1450, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + duration);
    filter.Q.value = 3.2;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.006);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.55;

    saw.connect(filter);
    sq.connect(subGain);
    subGain.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    saw.start(time);
    sq.start(time);
    saw.stop(time + duration + 0.02);
    sq.stop(time + duration + 0.02);
  }

  /**
   * Bright detuned dual-oscillator cyber-opera synth lead routed through musicGain.
   */
  private synthCyberOperaLead(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);
    osc1.detune.setValueAtTime(-9, time);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(9, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3800, time);
    filter.frequency.exponentialRampToValueAtTime(920, time + duration);
    filter.Q.value = 2.1;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.01);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.03);
    osc2.stop(time + duration + 0.03);
  }

  /**
   * Crisp electronic snare burst routed through musicGain for Miku's boss sequencer.
   */
  private synthCyberSnare(time: number, peakGain: number): void {
    if (!this.ctx || !this.musicGain) return;
    const body = this.ctx.createOscillator();
    const bodyEnv = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, time);
    body.frequency.exponentialRampToValueAtTime(95, time + 0.11);

    bodyEnv.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    bodyEnv.gain.linearRampToValueAtTime(peakGain * 0.8, time + 0.004);
    bodyEnv.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + 0.13,
    );
    body.connect(bodyEnv);
    bodyEnv.connect(this.musicGain);
    body.start(time);
    body.stop(time + 0.14);

    if (this.noiseBuffer) {
      const snap = this.ctx.createBufferSource();
      snap.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.setValueAtTime(1800, time);
      const nEnv = this.ctx.createGain();
      nEnv.gain.setValueAtTime(peakGain, time);
      nEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        time + 0.16,
      );
      snap.connect(bp);
      bp.connect(nEnv);
      nEnv.connect(this.musicGain);
      snap.start(time);
      snap.stop(time + 0.18);
    }
  }

  /**
   * Flowing plucked harp voice routed through musicGain for the Sunken Aqueduct.
   */
  private synthAtlanteanHarp(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const tri = this.ctx.createOscillator();
    const sine = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    tri.type = 'triangle';
    tri.frequency.setValueAtTime(freq, time);
    sine.type = 'sine';
    sine.frequency.setValueAtTime(freq * 2.0, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, time);
    filter.frequency.exponentialRampToValueAtTime(520, time + duration);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.008);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    const overtoneGain = this.ctx.createGain();
    overtoneGain.gain.value = 0.28;

    tri.connect(filter);
    sine.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    tri.start(time);
    sine.start(time);
    tri.stop(time + duration + 0.03);
    sine.stop(time + duration + 0.03);
  }

  /**
   * Resonant aquatic glass-bell voice routed through musicGain.
   */
  private synthGlassBell(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.756, time);

    const harmonicGain = this.ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.26, time);
    harmonicGain.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.45);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.014);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    osc1.connect(env);
    osc2.connect(harmonicGain);
    harmonicGain.connect(env);
    env.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.04);
    osc2.stop(time + duration + 0.04);
  }

  /**
   * Dramatic detuned orchestral synth swell routed through musicGain for Serena's boss theme.
   */
  private synthOceanicSwell(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);
    osc1.detune.setValueAtTime(-7, time);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(7, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, time);
    filter.frequency.exponentialRampToValueAtTime(1150, time + duration * 0.42);
    filter.frequency.exponentialRampToValueAtTime(260, time + duration);
    filter.Q.value = 1.6;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + duration * 0.34);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.05);
    osc2.stop(time + duration + 0.05);
  }

  /**
   * Deep sub-bass oceanic war-drum percussion routed through musicGain.
   */
  private synthOceanicPercussion(
    time: number,
    peakGain: number,
    startFreq: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.24);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.01);
    env.gain.exponentialRampToValueAtTime(AUDIO_CONFIG.minGainFloor, time + 0.3);

    osc.connect(env);
    env.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  /**
   * Warm low cello-pad voice routed through musicGain for the Obsidian Spire Sanctum.
   */
  private synthWarmCelloPad(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 0.5, time);
    osc1.detune.setValueAtTime(4, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(AUDIO_CONFIG.lobbyCelloCutoff, time);
    filter.Q.value = 1.2;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.24);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.04);
    osc2.stop(time + duration + 0.04);
  }

  /**
   * Plucked regal harpsichord voice (bright sawtooth + square pair through a decaying lowpass).
   */
  private synthHarpsichord(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const saw = this.ctx.createOscillator();
    const sq = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(freq, time);
    sq.type = 'square';
    sq.frequency.setValueAtTime(freq * 2.0, time);
    sq.detune.setValueAtTime(6, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(AUDIO_CONFIG.chamberHarpsichordCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(
      AUDIO_CONFIG.chamberHarpsichordCutoff * 0.18,
      time + duration,
    );
    filter.Q.value = 1.6;

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.004);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    const sqGain = this.ctx.createGain();
    sqGain.gain.value = 0.35;

    saw.connect(filter);
    sq.connect(sqGain);
    sqGain.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    saw.start(time);
    sq.start(time);
    saw.stop(time + duration + 0.02);
    sq.stop(time + duration + 0.02);
  }

  private synthCathedralBell(
    time: number,
    freq: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.musicGain) return;
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
    env.connect(this.musicGain);

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
    if (!this.ctx || !this.musicGain) return;
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
    env.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private synthHeartbeatThump(
    time: number,
    peakGain: number,
    startFreq = 58,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.16);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.014);
    env.gain.exponentialRampToValueAtTime(AUDIO_CONFIG.minGainFloor, time + 0.22);

    osc.connect(env);
    env.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  private synthIceTick(time: number, peakGain: number): void {
    if (!this.ctx || !this.noiseBuffer || !this.musicGain) return;
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
    env.connect(this.musicGain);
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
   * Soft crystalline preview chime routed through sfxGain on SFX volume slider release.
   */
  public playPreviewChime(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;

    AUDIO_CONFIG.previewChimeNotes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const start = now + idx * AUDIO_CONFIG.previewChimeStepSec;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, start);
      env.gain.linearRampToValueAtTime(
        AUDIO_CONFIG.previewChimeGain * (1 - idx * 0.25),
        start + 0.01,
      );
      env.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        start + AUDIO_CONFIG.previewChimeDurationSec,
      );

      osc.connect(env);
      env.connect(sfxGain);
      osc.start(start);
      osc.stop(start + AUDIO_CONFIG.previewChimeDurationSec + 0.02);
    });
  }

  // =========================================================================
  // ROYAL ICE CHAMBERS SOUND EFFECTS (routed through sfxGain)
  // =========================================================================

  private canPlaySfx(): boolean {
    return Boolean(this.ctx && this.sfxGain && this.ctx.state === 'running');
  }

  private playNoiseBurst(
    time: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    peakGain: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(startFreq, time);
    filter.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
    filter.Q.value = q;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + 0.008);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    src.start(time);
    src.stop(time + duration + 0.02);
  }

  private playTone(
    time: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    peakGain: number,
    attack: number,
    duration: number,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(peakGain, time + attack);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + duration,
    );

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  /**
   * Brittle porcelain-ice crack + scattering crystalline grains when a Frost Urn shatters.
   */
  public playUrnShatter(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(now, 'bandpass', 2600, 900, 1.4, 0.22, 0.16);
    this.playTone(now, 'sine', 240, 90, 0.16, 0.006, 0.14);
    for (let i = 0; i < AUDIO_CONFIG.urnShatterGrainCount; i++) {
      const offset = 0.012 + i * 0.022 + Math.random() * 0.012;
      const freq =
        AUDIO_CONFIG.urnShatterBaseFreq +
        Math.random() * AUDIO_CONFIG.urnShatterFreqSpread;
      this.playTone(now + offset, 'triangle', freq, freq * 0.78, 0.07, 0.004, 0.11);
    }
  }

  /**
   * Metallic ice-steel clang when a Void Bolt glances off a Glacial Vanguard shield.
   */
  public playShieldClang(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.shieldClangFreqs.forEach((freq, i) => {
      this.playTone(now, i === 0 ? 'square' : 'sine', freq, freq * 0.985, 0.1 - i * 0.022, 0.003, 0.42 - i * 0.08);
    });
    this.playNoiseBurst(now, 'highpass', 5200, 3800, 0.8, 0.12, 0.07);
  }

  /**
   * Heavy descending crunch + glassy fracture when a shield guard is broken.
   */
  public playGuardBreak(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.guardBreakFreqs.forEach((freq, i) => {
      this.playTone(now + i * 0.055, 'sawtooth', freq, freq * 0.62, 0.12, 0.006, 0.3);
    });
    this.playNoiseBurst(now, 'bandpass', 1800, 320, 1.2, 0.26, 0.34);
    this.playIceShatter(1.1);
  }

  /**
   * Shimmering ascending glyph chime as a summoning circle materializes a servant.
   */
  public playSummonGlyphChime(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.summonGlyphFreqs.forEach((freq, i) => {
      this.playTone(now + i * 0.06, 'sine', freq, freq * 1.01, 0.075, 0.01, 0.62);
    });
    this.playNoiseBurst(now, 'bandpass', 900, 4200, 2.4, 0.06, 0.5);
  }

  /**
   * Swelling regal chord + sub-bass bloom when the Astral Portal ignites.
   */
  public playPortalIgnite(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 'sine', 70, 42, 0.32, 0.08, 1.1);
    AUDIO_CONFIG.portalIgniteFreqs.forEach((freq, i) => {
      this.playTone(now + i * 0.07, 'triangle', freq, freq * 1.004, 0.075, 0.12, 1.6);
    });
    this.playNoiseBurst(now, 'bandpass', 400, 3600, 1.8, 0.1, 1.2);
  }

  /**
   * Rising astral whoosh + crystalline sweep as the Dark Mage warps to the summit.
   */
  public playPortalWarp(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = CHAMBER_CONFIG.portalWarpDuration;
    this.playTone(
      now,
      'sawtooth',
      AUDIO_CONFIG.portalWarpStartFreq,
      AUDIO_CONFIG.portalWarpEndFreq,
      0.12,
      0.2,
      dur,
    );
    this.playNoiseBurst(now, 'bandpass', 300, 6400, 3.0, 0.24, dur);
    this.playTone(now + dur * 0.85, 'sine', 1760, 2637.02, 0.1, 0.01, 0.5);
  }

  // =========================================================================
  // OBSIDIAN SPIRE SANCTUM ('LOBBY') SOUND EFFECTS (routed through sfxGain)
  // =========================================================================

  /**
   * Resonant underwater bell + aqueous ripple for Realm II (The Sunken Sanctuary) ward gate.
   */
  public playSunkenWardChime(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.sunkenWardFreqs.forEach((freq, i) => {
      this.playTone(
        now + i * 0.08,
        'sine',
        freq,
        freq * 0.96,
        0.11 - i * 0.02,
        0.015,
        0.75,
      );
    });
    this.playNoiseBurst(now, 'bandpass', 620, 240, 4.2, 0.09, 0.55);
  }

  /**
   * Crystalline synth chord pulse for Realm III (The Harmonic Citadel) ward gate.
   */
  public playHarmonicWardPulse(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.harmonicWardFreqs.forEach((freq, i) => {
      this.playTone(
        now + i * 0.045,
        i % 2 === 0 ? 'triangle' : 'sine',
        freq,
        freq * 1.008,
        0.085,
        0.01,
        0.65,
      );
    });
  }

  /**
   * Arcana glass chime when striking the Abyssal Target Crystal in the Sanctum.
   */
  public playDummyCrystalHit(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.dummyHitFreqs.forEach((freq, i) => {
      this.playTone(
        now + i * 0.018,
        'sine',
        freq,
        freq * 0.99,
        0.12 - i * 0.025,
        0.004,
        0.38,
      );
    });
    this.playNoiseBurst(now, 'highpass', 4800, 2400, 1.4, 0.08, 0.09);
  }

  /**
   * Frost-crown crystalline resonance when interacting with the Stolen Trophy Pedestal.
   */
  public playTrophyToggle(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.trophyToggleFreqs.forEach((freq, i) => {
      this.playTone(
        now + i * 0.055,
        'sine',
        freq,
        freq * 1.01,
        0.09,
        0.008,
        0.68,
      );
    });
  }

  // =========================================================================
  // REALM II — SUNKEN SANCTUARY OCEANIC SOUND EFFECTS (routed through sfxGain)
  // =========================================================================

  /**
   * Sweeping hydro-crest roar + deep rolling oceanic surge for Tidal Sweep attacks.
   */
  public playTidalWave(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(now, 'bandpass', 260, 1450, 1.5, 0.24, 0.72);
    this.playNoiseBurst(now + 0.14, 'lowpass', 1100, 220, 1.1, 0.2, 0.65);
    this.playTone(now, 'sine', 120, 48, 0.22, 0.06, 0.58);
  }

  /**
   * Crisp upward-chirping aquatic bubble pops for Siren Weaver orbs & Pearl Urns.
   */
  public playBubblePop(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.bubblePopFreqs.forEach((freq, i) => {
      this.playTone(
        now + i * 0.035,
        'sine',
        freq * 0.68,
        freq * 1.45,
        0.13 - i * 0.025,
        0.004,
        0.09,
      );
    });
  }

  /**
   * Pressurized hydro-jet eruption + boiling spray hiss for Coral Bastion & Abyssal Undertow geysers.
   */
  public playGeyserErupt(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 'sine', 96, 36, 0.34, 0.01, 0.42);
    this.playNoiseBurst(now, 'bandpass', 380, 3400, 1.8, 0.28, 0.58);
    this.playNoiseBurst(now + 0.08, 'highpass', 2400, 4800, 0.9, 0.14, 0.44);
  }

  /**
   * Calcified stony-ceramic fracture crunch when shattering Luminous Pearl Urns or Coral shields.
   */
  public playCoralShatter(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(now, 'bandpass', 2100, 680, 1.6, 0.22, 0.2);
    this.playTone(now, 'triangle', 320, 115, 0.16, 0.004, 0.15);
    for (let i = 0; i < AUDIO_CONFIG.coralShatterGrainCount; i++) {
      const offset = 0.015 + i * 0.024 + Math.random() * 0.01;
      const freq =
        AUDIO_CONFIG.coralShatterBaseFreq +
        Math.random() * AUDIO_CONFIG.coralShatterFreqSpread;
      this.playTone(
        now + offset,
        'triangle',
        freq,
        freq * 0.72,
        0.08,
        0.003,
        0.1,
      );
    }
    this.playBubblePop();
  }

  // =========================================================================
  // REALM III — HARMONIC CITADEL CYBER-OPERA SOUND EFFECTS (routed through sfxGain)
  // =========================================================================

  /**
   * Sharp cyber-laser frequency whip for Pulse Striker & Frequency Drone slashes.
   */
  public playLaserSlash(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 'sawtooth', 1850, 240, 0.18, 0.005, 0.19);
    this.playTone(now + 0.01, 'square', 2400, 360, 0.11, 0.004, 0.16);
    this.playNoiseBurst(now, 'bandpass', 3600, 920, 2.2, 0.18, 0.17);
  }

  /**
   * Shimmering 4-voice synthesizer chord burst for Synth Cantor & Miku Chord Barrage volleys.
   */
  public playChordBurst(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    AUDIO_CONFIG.chordBurstFreqs.forEach((freq, i) => {
      this.playTone(
        now + i * 0.022,
        i % 2 === 0 ? 'triangle' : 'sawtooth',
        freq,
        freq * 1.015,
        0.1 - i * 0.012,
        0.008,
        0.42,
      );
    });
    this.playNoiseBurst(now, 'highpass', 4200, 6200, 1.4, 0.08, 0.18);
  }

  /**
   * Heavy sub-bass speaker drop impact for Aegis Monolith & Crescendo Overdrive shockwaves.
   */
  public playBassDrop(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 'sine', 142, 26, 0.38, 0.01, 0.56);
    this.playTone(now, 'sawtooth', 98, 32, 0.22, 0.008, 0.44);
    this.playNoiseBurst(now, 'lowpass', 920, 68, 2.6, 0.26, 0.48);
  }

  /**
   * High-voltage glass & plasma discharge when shattering an Acoustic Capacitor Canister.
   */
  public playCapacitorShatter(): void {
    if (!this.canPlaySfx() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(now, 'bandpass', 3200, 1100, 1.8, 0.22, 0.18);
    this.playTone(now, 'sawtooth', 640, 140, 0.15, 0.004, 0.16);
    for (let i = 0; i < AUDIO_CONFIG.capacitorShatterGrainCount; i++) {
      const offset = 0.01 + i * 0.02 + Math.random() * 0.01;
      const freq =
        AUDIO_CONFIG.capacitorShatterBaseFreq +
        Math.random() * AUDIO_CONFIG.capacitorShatterFreqSpread;
      this.playTone(
        now + offset,
        i % 2 === 0 ? 'sine' : 'square',
        freq,
        freq * 0.82,
        0.075,
        0.003,
        0.11,
      );
    }
  }

  // =========================================================================
  // DYNAMIC PROCEDURAL SIPHON & KISS-CADENCE SYNTHESIZER (routed through sfxGain)
  // =========================================================================

  /**
   * Starts the continuous procedural ether-siphon loop for the active sovereign realm,
   * cleaning up any prior siphon loop and playing a soft lip-contact entry seal.
   */
  public startSiphonLoop(realm: SiphonRealmId): void {
    this.stopSiphonLoop();
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;

    const ctx = this.ctx;
    const sfxGain = this.sfxGain;
    const cfg = SIPHON_AUDIO_CONFIG;
    const now = ctx.currentTime;

    // 1. Entry Lip-Contact Seal (soft bandpass breath swell + gentle harmonic chime)
    if (this.pinkNoiseBuffer) {
      const sealSrc = ctx.createBufferSource();
      sealSrc.buffer = this.pinkNoiseBuffer;
      const sealFilter = ctx.createBiquadFilter();
      sealFilter.type = 'bandpass';
      sealFilter.frequency.setValueAtTime(cfg.sealWhooshStartHz, now);
      sealFilter.frequency.exponentialRampToValueAtTime(
        cfg.sealWhooshEndHz,
        now + cfg.sealWhooshDurationSec,
      );
      sealFilter.Q.value = cfg.sealWhooshQ;

      const sealEnv = ctx.createGain();
      sealEnv.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);
      sealEnv.gain.linearRampToValueAtTime(
        cfg.sealWhooshGain,
        now + cfg.sealWhooshDurationSec * 0.35,
      );
      sealEnv.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + cfg.sealWhooshDurationSec,
      );

      sealSrc.connect(sealFilter);
      sealFilter.connect(sealEnv);
      sealEnv.connect(sfxGain);
      sealSrc.start(now);
      sealSrc.stop(now + cfg.sealWhooshDurationSec + 0.03);
    }

    cfg.sealChimeFreqsHz.forEach((freq, idx) => {
      const start = now + idx * cfg.sealChimeStepSec;
      this.playTone(
        start,
        'sine',
        freq,
        freq * 1.006,
        cfg.sealChimeGain * (1 - idx * 0.16),
        0.012,
        cfg.sealChimeDurationSec,
      );
    });

    // 2. Continuous Dual-Oscillator Ether Drone + Split Pink-Noise Shimmer & Breath Branches
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);
    masterGain.gain.setTargetAtTime(1.0, now, cfg.rampTimeConstantSec);
    masterGain.connect(sfxGain);

    const droneOsc1 = ctx.createOscillator();
    droneOsc1.type = 'triangle';
    droneOsc1.frequency.setValueAtTime(cfg.baseDroneHz, now);

    const droneOsc2 = ctx.createOscillator();
    droneOsc2.type = 'sine';
    droneOsc2.frequency.setValueAtTime(
      cfg.baseDroneHz * cfg.harmonicOvertoneRatio,
      now,
    );

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(cfg.droneOvertoneGainScale, now);

    const etherFilter = ctx.createBiquadFilter();
    etherFilter.type = 'lowpass';
    etherFilter.frequency.setValueAtTime(cfg.flowFilterHz, now);
    etherFilter.Q.value = cfg.etherFilterQ;

    const etherGain = ctx.createGain();
    etherGain.gain.setValueAtTime(cfg.flowGain, now);

    droneOsc1.connect(etherFilter);
    droneOsc2.connect(overtoneGain);
    overtoneGain.connect(etherFilter);
    etherFilter.connect(etherGain);
    etherGain.connect(masterGain);

    droneOsc1.start(now);
    droneOsc2.start(now);

    let noiseSource: AudioBufferSourceNode | null = null;
    let shimmerFilter: BiquadFilterNode | null = null;
    let shimmerGain: GainNode | null = null;
    let breathFilter: BiquadFilterNode | null = null;
    let breathGain: GainNode | null = null;

    if (this.pinkNoiseBuffer) {
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.pinkNoiseBuffer;
      noiseSource.loop = true;

      // Branch A: Filtered Ether Shimmer
      shimmerFilter = ctx.createBiquadFilter();
      shimmerFilter.type = 'bandpass';
      shimmerFilter.frequency.setValueAtTime(
        cfg.flowFilterHz * cfg.etherShimmerFreqRatio,
        now,
      );
      shimmerFilter.Q.value = cfg.etherShimmerQ;

      shimmerGain = ctx.createGain();
      shimmerGain.gain.setValueAtTime(
        cfg.flowGain * cfg.etherShimmerGainScale,
        now,
      );

      noiseSource.connect(shimmerFilter);
      shimmerFilter.connect(shimmerGain);
      shimmerGain.connect(masterGain);

      // Branch B: Subtle Intimate Bandpass Breath
      breathFilter = ctx.createBiquadFilter();
      breathFilter.type = 'bandpass';
      breathFilter.frequency.setValueAtTime(cfg.breathCenterHz, now);
      breathFilter.Q.value = cfg.breathQ;

      breathGain = ctx.createGain();
      breathGain.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);

      noiseSource.connect(breathFilter);
      breathFilter.connect(breathGain);
      breathGain.connect(masterGain);

      noiseSource.start(now);
    }

    this.activeSiphonNodes = {
      realm,
      masterGain,
      droneOsc1,
      droneOsc2,
      overtoneGain,
      etherFilter,
      etherGain,
      noiseSource,
      shimmerFilter,
      shimmerGain,
      breathFilter,
      breathGain,
      prevKissPressPhase: 0,
      contactArmed: true,
      partingArmed: false,
      heartbeatTimer: 0,
      chimeStepIdx: 0,
    };
  }

  /**
   * Modulates the continuous ether stream, kiss-cadence breath/contact/parting transients,
   * and fading Stage 1 & 2 resistance heartbeat at 60 FPS with click-free exponential ramping.
   */
  public updateSiphonLoop(state: SiphonAudioUpdateState): void {
    if (
      !this.canPlaySfx() ||
      !this.ctx ||
      !this.sfxGain ||
      !this.activeSiphonNodes
    ) {
      return;
    }

    const ctx = this.ctx;
    const nodes = this.activeSiphonNodes;
    const cfg = SIPHON_AUDIO_CONFIG;
    const now = ctx.currentTime;
    const drain = Math.max(0, Math.min(1, state.drainProgress));
    const phase = Math.max(0, Math.min(1, state.kissPressPhase));
    const safeDt = Math.max(0.001, Math.min(state.dt, 0.05));

    const isSurge = state.throttle === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = state.throttle === DRAIN_THROTTLE_MODES.SAVOR;

    // 1. Continuous Ether Drone Pitch Bend, Filter Cutoff & Gain Ramp
    const semitones = state.isEndlessSavor
      ? cfg.endlessSavorPitchShiftSemitones
      : drain * cfg.maxDrainPitchShiftSemitones;
    const pitchMult = Math.pow(2, semitones / 12);
    const targetDroneHz = cfg.baseDroneHz * pitchMult;

    const targetFilterHz = state.isEndlessSavor
      ? cfg.endlessSavorFilterHz
      : isSurge
        ? cfg.surgeFilterHz
        : isSavor
          ? cfg.savorFilterHz
          : cfg.flowFilterHz;

    const baseTargetGain = state.isEndlessSavor
      ? cfg.endlessSavorGain
      : isSurge
        ? cfg.surgeGain
        : isSavor
          ? cfg.savorGain
          : cfg.flowGain;
    const targetEtherGain = state.isTauntStunned
      ? baseTargetGain * cfg.tauntStunGainScale
      : baseTargetGain;

    nodes.droneOsc1.frequency.setTargetAtTime(
      targetDroneHz,
      now,
      cfg.rampTimeConstantSec,
    );
    nodes.droneOsc2.frequency.setTargetAtTime(
      targetDroneHz * cfg.harmonicOvertoneRatio,
      now,
      cfg.rampTimeConstantSec,
    );
    nodes.etherFilter.frequency.setTargetAtTime(
      targetFilterHz,
      now,
      cfg.rampTimeConstantSec,
    );
    nodes.etherGain.gain.setTargetAtTime(
      Math.max(AUDIO_CONFIG.minGainFloor, targetEtherGain),
      now,
      cfg.rampTimeConstantSec,
    );

    if (nodes.shimmerFilter && nodes.shimmerGain) {
      nodes.shimmerFilter.frequency.setTargetAtTime(
        targetFilterHz * cfg.etherShimmerFreqRatio,
        now,
        cfg.rampTimeConstantSec,
      );
      nodes.shimmerGain.gain.setTargetAtTime(
        Math.max(
          AUDIO_CONFIG.minGainFloor,
          targetEtherGain * cfg.etherShimmerGainScale,
        ),
        now,
        cfg.rampTimeConstantSec,
      );
    }

    // 2. Soft Intimate Breath Envelope Synced to -> <- Kiss Cadence
    if (nodes.breathGain) {
      const breathThrottleScale = state.isEndlessSavor
        ? cfg.breathEndlessSavorScale
        : isSurge
          ? cfg.breathSurgeScale
          : isSavor
            ? cfg.breathSavorScale
            : 1.0;
      const breathEnvelope = Math.sin(phase * Math.PI);
      const targetBreathGain = Math.max(
        AUDIO_CONFIG.minGainFloor,
        breathEnvelope * cfg.breathMaxGain * breathThrottleScale,
      );
      nodes.breathGain.gain.setTargetAtTime(
        targetBreathGain,
        now,
        cfg.rampTimeConstantSec * 0.7,
      );
    }

    // 3. Muted 65Hz -> 42Hz Contact Sub-Pulse at Peak Press & Subtle 15ms Parting Tick on Ease
    if (nodes.contactArmed && phase >= cfg.contactPeakTriggerThreshold) {
      nodes.contactArmed = false;
      nodes.partingArmed = true;
      const pulseGain =
        cfg.contactPulseGain *
        (state.isEndlessSavor ? cfg.contactPulseEndlessScale : 1.0);
      this.playTone(
        now,
        'sine',
        cfg.contactPulseStartHz,
        cfg.contactPulseEndHz,
        pulseGain,
        0.012,
        cfg.contactPulseDurationSec,
      );
    } else if (phase < cfg.contactRearmThreshold) {
      nodes.contactArmed = true;
    }

    if (
      nodes.partingArmed &&
      phase < nodes.prevKissPressPhase &&
      phase <= cfg.partingTriggerThreshold
    ) {
      nodes.partingArmed = false;
      this.playSiphonPartingTick(now);
    }
    nodes.prevKissPressPhase = phase;

    // 4. Fading Double-Pulse Resistance Heartbeat (Stages 1 & 2 Only; silent >= 75% or taunt-stunned)
    if (
      !state.isEndlessSavor &&
      !state.isTauntStunned &&
      drain < cfg.heartbeatCutoffDrain
    ) {
      const progressRatio = drain / Math.max(0.01, cfg.heartbeatCutoffDrain);
      const interval =
        cfg.heartbeatStage1IntervalSec +
        (cfg.heartbeatStage2IntervalSec - cfg.heartbeatStage1IntervalSec) *
          progressRatio;
      const fadeGain = cfg.heartbeatGain * (1 - progressRatio);

      nodes.heartbeatTimer += safeDt;
      if (nodes.heartbeatTimer >= interval && fadeGain > AUDIO_CONFIG.minGainFloor) {
        nodes.heartbeatTimer = 0;
        this.playSiphonHeartbeatDoublePulse(now, fadeGain);
      }
    } else {
      nodes.heartbeatTimer = 0;
    }
  }

  private playSiphonPartingTick(time: number): void {
    if (!this.ctx || !this.sfxGain || !this.pinkNoiseBuffer) return;
    const cfg = SIPHON_AUDIO_CONFIG;
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cfg.partingTickHz, time);
    filter.Q.value = cfg.partingTickQ;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, time);
    env.gain.linearRampToValueAtTime(cfg.partingTickGain, time + 0.003);
    env.gain.exponentialRampToValueAtTime(
      AUDIO_CONFIG.minGainFloor,
      time + cfg.partingTickDurationSec,
    );

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    src.start(time);
    src.stop(time + cfg.partingTickDurationSec + 0.01);
  }

  private playSiphonHeartbeatDoublePulse(time: number, peakGain: number): void {
    const cfg = SIPHON_AUDIO_CONFIG;
    this.playTone(
      time,
      'sine',
      cfg.heartbeatFirstFreqStartHz,
      cfg.heartbeatFirstFreqEndHz,
      peakGain,
      0.012,
      cfg.heartbeatPulseDurationSec,
    );
    this.playTone(
      time + cfg.heartbeatSecondBeatDelaySec,
      'sine',
      cfg.heartbeatSecondFreqStartHz,
      cfg.heartbeatSecondFreqEndHz,
      peakGain * cfg.heartbeatSecondBeatGainScale,
      0.012,
      cfg.heartbeatPulseDurationSec,
    );
  }

  /**
   * Plays a boss-specific elemental micro-chime every ~4.5% core drained:
   * - Realm 1 (Marina): delicate glass/ice-crystal bell pings
   * - Realm 2 (Serena): resonant upward water-droplet sweep
   * - Realm 3 (Miku): dual-oscillator synth fifth/ninth with depletion pitch-droop
   */
  public playSiphonMicroChime(realm: SiphonRealmId, drainProgress: number): void {
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const sfxGain = this.sfxGain;
    const cfg = SIPHON_AUDIO_CONFIG;
    const now = ctx.currentTime;
    const drain = Math.max(0, Math.min(1, drainProgress));
    const stepIdx = this.activeSiphonNodes
      ? this.activeSiphonNodes.chimeStepIdx++
      : Math.floor(drain / cfg.chimeStepPercent);

    if (realm === 1) {
      // Marina — Cryo Core glass/ice-crystal bell ping
      const freqs = cfg.marinaChimeFreqsHz;
      const baseFreq = freqs[stepIdx % freqs.length] ?? freqs[0];
      const pitchShift = 1 + drain * 0.08;
      this.playTone(
        now,
        'sine',
        baseFreq * pitchShift,
        baseFreq * pitchShift * 1.004,
        cfg.marinaChimeGain,
        0.005,
        cfg.marinaChimeDurationSec,
      );
      this.playTone(
        now + 0.01,
        'triangle',
        baseFreq * pitchShift * 1.5,
        baseFreq * pitchShift * 1.5,
        cfg.marinaChimeGain * 0.28,
        0.005,
        cfg.marinaChimeDurationSec * 0.65,
      );
      return;
    }

    if (realm === 2) {
      // Serena — Tidal Core resonant upward water-droplet blip
      const pitchShift = 0.92 + drain * 0.22;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(cfg.serenaDropletStartHz * pitchShift, now);
      osc.frequency.exponentialRampToValueAtTime(
        cfg.serenaDropletEndHz * pitchShift,
        now + cfg.serenaDropletDurationSec,
      );

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(
        cfg.serenaDropletStartHz * pitchShift * 1.3,
        now,
      );
      filter.frequency.exponentialRampToValueAtTime(
        cfg.serenaDropletEndHz * pitchShift,
        now + cfg.serenaDropletDurationSec,
      );
      filter.Q.value = cfg.serenaDropletQ;

      env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);
      env.gain.linearRampToValueAtTime(cfg.serenaDropletGain, now + 0.008);
      env.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + cfg.serenaDropletDurationSec,
      );

      osc.connect(filter);
      filter.connect(env);
      env.connect(sfxGain);
      osc.start(now);
      osc.stop(now + cfg.serenaDropletDurationSec + 0.02);
      return;
    }

    // Realm 3 (Miku) — Harmonic Core dual-oscillator synth fifth/ninth with depletion droop
    const chord = cfg.mikuChordFreqsHz;
    const f1 = chord[stepIdx % chord.length] ?? chord[0];
    const f2 = chord[(stepIdx + 1) % chord.length] ?? chord[1];
    const droopCents = drain * cfg.mikuMaxDepletionDroopCents;

    [f1, f2].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(droopCents * 0.4, now);
      osc.detune.linearRampToValueAtTime(
        droopCents,
        now + cfg.mikuChimeDurationSec,
      );

      env.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);
      env.gain.linearRampToValueAtTime(
        cfg.mikuChimeGain * (idx === 0 ? 1.0 : 0.72),
        now + 0.01,
      );
      env.gain.exponentialRampToValueAtTime(
        AUDIO_CONFIG.minGainFloor,
        now + cfg.mikuChimeDurationSec,
      );

      osc.connect(env);
      env.connect(sfxGain);
      osc.start(now);
      osc.stop(now + cfg.mikuChimeDurationSec + 0.02);
    });
  }

  /**
   * Plays the warm 100% core-depletion climax: deep sub-drop + descending crystalline chord swell.
   */
  public playSiphonClimax(realm: SiphonRealmId): void {
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const cfg = SIPHON_AUDIO_CONFIG;
    const now = this.ctx.currentTime;

    this.playTone(
      now,
      'sine',
      cfg.climaxSubDropStartHz,
      cfg.climaxSubDropEndHz,
      cfg.climaxSubDropGain,
      0.025,
      cfg.climaxChordDurationSec,
    );

    const chord =
      realm === 3
        ? cfg.climaxChordMikuHz
        : realm === 2
          ? cfg.climaxChordSerenaHz
          : cfg.climaxChordMarinaHz;

    chord.forEach((freq, idx) => {
      const start = now + idx * cfg.climaxChordStepSec;
      this.playTone(
        start,
        idx % 2 === 0 ? 'triangle' : 'sine',
        freq,
        freq * 0.992,
        cfg.climaxChordGain * (1 - idx * 0.14),
        0.02,
        cfg.climaxChordDurationSec,
      );
    });
  }

  /**
   * Smoothly ramps down and disconnects all active siphon loop oscillators & noise nodes
   * so zero audio leaks persist after leaving the finisher.
   */
  public stopSiphonLoop(): void {
    const nodes = this.activeSiphonNodes;
    if (!nodes) return;
    this.activeSiphonNodes = null;

    const cfg = SIPHON_AUDIO_CONFIG;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      nodes.masterGain.gain.cancelScheduledValues(now);
      nodes.masterGain.gain.setTargetAtTime(
        AUDIO_CONFIG.minGainFloor,
        now,
        cfg.stopFadeOutSec * 0.35,
      );
      const stopAt = now + cfg.stopCleanupDelaySec;
      nodes.droneOsc1.onended = () => {
        try {
          nodes.droneOsc1.disconnect();
          nodes.droneOsc2.disconnect();
          nodes.overtoneGain.disconnect();
          nodes.etherFilter.disconnect();
          nodes.etherGain.disconnect();
          nodes.noiseSource?.disconnect();
          nodes.shimmerFilter?.disconnect();
          nodes.shimmerGain?.disconnect();
          nodes.breathFilter?.disconnect();
          nodes.breathGain?.disconnect();
          nodes.masterGain.disconnect();
        } catch {
          // Nodes may already be disconnected
        }
      };
      nodes.droneOsc1.stop(stopAt);
      nodes.droneOsc2.stop(stopAt);
      nodes.noiseSource?.stop(stopAt);
    } catch {
      try {
        nodes.masterGain.disconnect();
      } catch {
        // Ignore already-disconnected graph
      }
    }
  }

  /**
   * Starts the high-voltage Umbral Siphon Beam ([R]) roaring arcane laser hum
   * routed strictly through sfxGain.
   */
  public startBeamSiphonLoop(realm: SiphonRealmId): void {
    this.stopSiphonLoop();
    this.stopBeamSiphonLoop();
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;

    const ctx = this.ctx;
    const sfxGain = this.sfxGain;
    const cfg = SIPHON_BEAM_CONFIG;
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(AUDIO_CONFIG.minGainFloor, now);
    masterGain.gain.setTargetAtTime(
      cfg.audioGain,
      now,
      cfg.audioRampTimeConstantSec,
    );
    masterGain.connect(sfxGain);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cfg.audioFilterStartHz, now);
    filter.Q.value = cfg.audioFilterQ;
    filter.connect(masterGain);

    const coreOsc = ctx.createOscillator();
    coreOsc.type = 'sawtooth';
    coreOsc.frequency.setValueAtTime(cfg.audioBaseHz, now);
    coreOsc.connect(filter);

    const overtoneOsc = ctx.createOscillator();
    overtoneOsc.type = 'triangle';
    overtoneOsc.frequency.setValueAtTime(
      cfg.audioBaseHz * cfg.audioOvertoneRatio,
      now,
    );
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(cfg.audioOvertoneGainScale, now);
    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(filter);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(cfg.audioBaseHz * cfg.audioSubRatio, now);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(cfg.audioSubGainScale, now);
    subOsc.connect(subGain);
    subGain.connect(masterGain);

    coreOsc.start(now);
    overtoneOsc.start(now);
    subOsc.start(now);

    let noiseSource: AudioBufferSourceNode | null = null;
    let noiseFilter: BiquadFilterNode | null = null;
    let noiseGain: GainNode | null = null;
    const roarBuf = this.pinkNoiseBuffer ?? this.noiseBuffer;
    if (roarBuf) {
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = roarBuf;
      noiseSource.loop = true;

      noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(cfg.audioFilterStartHz * 1.4, now);
      noiseFilter.Q.value = 1.6;

      noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(cfg.audioNoiseRoarGainScale, now);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noiseSource.start(now);
    }

    this.activeBeamSiphonNodes = {
      realm,
      masterGain,
      coreOsc,
      overtoneOsc,
      subOsc,
      overtoneGain,
      subGain,
      filter,
      noiseSource,
      noiseFilter,
      noiseGain,
      crackleAccum: 0,
    };
  }

  /**
   * Climbs the roaring beam hum from audioBaseHz -> audioPeakHz and fires
   * filtered electric discharge crackles at crackleRateHz as the boss core empties.
   */
  public updateBeamSiphonLoop(drainProgress: number, dt: number): void {
    if (
      !this.canPlaySfx() ||
      !this.ctx ||
      !this.sfxGain ||
      !this.activeBeamSiphonNodes
    ) {
      return;
    }

    const ctx = this.ctx;
    const nodes = this.activeBeamSiphonNodes;
    const cfg = SIPHON_BEAM_CONFIG;
    const now = ctx.currentTime;
    const drain = Math.max(0, Math.min(1, drainProgress));
    const safeDt = Math.max(0.001, Math.min(dt, 0.05));

    const targetHz = cfg.audioBaseHz + (cfg.audioPeakHz - cfg.audioBaseHz) * drain;
    const targetFilterHz =
      cfg.audioFilterStartHz +
      (cfg.audioFilterPeakHz - cfg.audioFilterStartHz) * drain;

    nodes.coreOsc.frequency.setTargetAtTime(
      targetHz,
      now,
      cfg.audioRampTimeConstantSec,
    );
    nodes.overtoneOsc.frequency.setTargetAtTime(
      targetHz * cfg.audioOvertoneRatio,
      now,
      cfg.audioRampTimeConstantSec,
    );
    nodes.subOsc.frequency.setTargetAtTime(
      targetHz * cfg.audioSubRatio,
      now,
      cfg.audioRampTimeConstantSec,
    );
    nodes.filter.frequency.setTargetAtTime(
      targetFilterHz,
      now,
      cfg.audioRampTimeConstantSec,
    );
    if (nodes.noiseFilter) {
      nodes.noiseFilter.frequency.setTargetAtTime(
        targetFilterHz * 1.25,
        now,
        cfg.audioRampTimeConstantSec,
      );
    }

    // Filtered electric discharge crackles at crackleRateHz
    const crackleInterval = 1 / Math.max(1, cfg.crackleRateHz);
    nodes.crackleAccum += safeDt;
    if (nodes.crackleAccum >= crackleInterval) {
      nodes.crackleAccum = 0;
      const crackleFreq = cfg.audioCrackleCenterHz * (0.75 + Math.random() * 0.55);
      const crackleGain = cfg.audioCrackleGain * (0.65 + drain * 0.6);
      this.playNoiseBurst(
        now,
        'bandpass',
        crackleFreq,
        crackleFreq * 0.72,
        cfg.audioCrackleQ,
        crackleGain,
        cfg.audioCrackleDurationSec,
      );
    }
  }

  /**
   * Smoothly fades out and disconnects all high-voltage Umbral Siphon Beam nodes.
   */
  public stopBeamSiphonLoop(): void {
    const nodes = this.activeBeamSiphonNodes;
    if (!nodes) return;
    this.activeBeamSiphonNodes = null;

    const cfg = SIPHON_BEAM_CONFIG;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      nodes.masterGain.gain.cancelScheduledValues(now);
      nodes.masterGain.gain.setTargetAtTime(
        AUDIO_CONFIG.minGainFloor,
        now,
        cfg.audioStopFadeOutSec * 0.35,
      );
      const stopAt = now + cfg.audioStopCleanupDelaySec;
      nodes.coreOsc.onended = () => {
        try {
          nodes.coreOsc.disconnect();
          nodes.overtoneOsc.disconnect();
          nodes.subOsc.disconnect();
          nodes.overtoneGain.disconnect();
          nodes.subGain.disconnect();
          nodes.filter.disconnect();
          nodes.noiseSource?.disconnect();
          nodes.noiseFilter?.disconnect();
          nodes.noiseGain?.disconnect();
          nodes.masterGain.disconnect();
        } catch {
          // Nodes may already be disconnected
        }
      };
      nodes.coreOsc.stop(stopAt);
      nodes.overtoneOsc.stop(stopAt);
      nodes.subOsc.stop(stopAt);
      nodes.noiseSource?.stop(stopAt);
    } catch {
      try {
        nodes.masterGain.disconnect();
      } catch {
        // Ignore already-disconnected graph
      }
    }
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
    this.stopSiphonLoop();
    this.stopBeamSiphonLoop();

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
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.pinkNoiseBuffer = null;
    this._isUnlocked = false;
  }
}
