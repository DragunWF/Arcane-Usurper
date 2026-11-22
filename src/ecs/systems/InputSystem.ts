import {
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  FIRST_PERSON_GAZE_CONFIG,
  GAME_STATES,
  SIPHON_BEAM_CONFIG,
  STOLEN_KISS_CONFIG,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { ECSWorld, ISystem } from '../World';

export interface IInputCallbacks {
  getGameState: () => GameState;
  isPaused: () => boolean;
  isPointerLocked: () => boolean;
  requestPointerLock: () => void;
  onStartGame: () => void;
  onTogglePause: () => void;
  onToggleAudioMute: () => void;
  onQuickRetry: () => void;
}

/**
 * Captures keyboard and mouse inputs and translates them into the Player entity's
 * PlayerIntentComponent (SRP & DIP — zero Three.js or React imports).
 */
export class InputSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly domElement: HTMLElement;
  private readonly audio: IAudioTrigger;
  private readonly callbacks: IInputCallbacks;

  private readonly keys = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    KeyE: false,
    Space: false,
  };

  private primaryFireHeld = false;
  private queuedSingleShotFire = false;
  private rightMouseHeld = false;
  private queuedBlink = false;
  private queuedPulse = false;
  private queuedFinisherExecute = false;
  private queuedBeamFinisherExecute = false;
  private queuedStolenKiss = false;
  private queuedPortalInteract = false;
  private queuedTaunt = false;
  private queuedSurgeTap = false;
  private queuedRelease = false;
  private queuedPose: FinisherPoseId | null = null;

  // Hold-[V] First-Person Gaze state & anti-flicker breakout latch
  private isFirstPersonGaze = false;
  private gazeKeyHeld = false;
  private gazeBreakoutLatched = false;

  private readonly handleKeyDown: (e: KeyboardEvent) => void;
  private readonly handleKeyUp: (e: KeyboardEvent) => void;
  private readonly handleBlur: () => void;
  private readonly handleMouseDown: (e: MouseEvent) => void;
  private readonly handleMouseUp: (e: MouseEvent) => void;
  private readonly handleContextMenu: (e: MouseEvent) => void;

  constructor(
    world: ECSWorld,
    domElement: HTMLElement,
    audio: IAudioTrigger,
    callbacks: IInputCallbacks,
  ) {
    this.world = world;
    this.domElement = domElement;
    this.audio = audio;
    this.callbacks = callbacks;

    this.handleKeyDown = (e: KeyboardEvent) => {
      this.audio.unlock();

      if (e.code === 'KeyM') {
        this.callbacks.onToggleAudioMute();
        return;
      }

      const state = this.callbacks.getGameState();

      if (state === GAME_STATES.TITLE) {
        if (e.code === 'Enter' && !e.repeat) {
          this.callbacks.onStartGame();
        }
        return;
      }

      if (
        (e.code === 'KeyP' ||
          (e.code === 'Escape' && state === GAME_STATES.LOBBY)) &&
        !e.repeat
      ) {
        this.callbacks.onTogglePause();
        return;
      }

      if (this.callbacks.isPaused()) {
        return;
      }

      // Hold-[V] First-Person Gaze activation (planted stance, active gameplay states only)
      if (e.code === FIRST_PERSON_GAZE_CONFIG.triggerKey) {
        if (!e.repeat) {
          this.gazeKeyHeld = true;
          if (
            !this.gazeBreakoutLatched &&
            this.isGazeAllowedState(state) &&
            !this.isAnyBreakoutKeyHeld()
          ) {
            this.isFirstPersonGaze = true;
          } else {
            this.gazeBreakoutLatched = true;
          }
        }
        return;
      }

      // Any movement/action key instantly breaks out of gaze and executes normally
      if (
        this.isFirstPersonGaze &&
        (FIRST_PERSON_GAZE_CONFIG.breakoutKeys as readonly string[]).includes(
          e.code,
        )
      ) {
        this.exitGaze(true);
      }

      if (e.code in this.keys) {
        this.keys[e.code as keyof typeof this.keys] = true;
      }

      // Quick Retry ([R]) on Defeat Diorama
      if (e.code === 'KeyR' && state === GAME_STATES.DEFEAT_DIORAMA) {
        this.callbacks.onQuickRetry();
        return;
      }

      // Execute Arcane Siphon Kiss ([E]) or Umbral Siphon Beam ([R]) in STAGGER or LOBBY Siphon Gallery
      if (e.code === 'KeyE' && state === GAME_STATES.STAGGER) {
        this.queuedFinisherExecute = true;
        return;
      }
      if (
        e.code === SIPHON_BEAM_CONFIG.triggerKey &&
        (state === GAME_STATES.STAGGER || state === GAME_STATES.LOBBY)
      ) {
        this.queuedBeamFinisherExecute = true;
        return;
      }
      // Execute Mid-Fight Over-the-Shoulder Stolen Kiss ([E]) in BOSS_COMBAT blindspot window
      if (
        e.code === STOLEN_KISS_CONFIG.triggerKey &&
        state === GAME_STATES.BOSS_COMBAT &&
        !e.repeat
      ) {
        this.queuedStolenKiss = true;
        return;
      }
      if (
        e.code === 'KeyE' &&
        (state === GAME_STATES.CHAMBER_COMBAT || state === GAME_STATES.LOBBY)
      ) {
        this.queuedPortalInteract = true;
        return;
      }

      // Interactive Finisher / Endless Savor / Lobby Siphon pose switching [1-2], [F] Taunt, and Space tap surge boost
      if (
        state === GAME_STATES.SIPHON_FINISHER ||
        state === GAME_STATES.ENDLESS_SAVOR ||
        state === GAME_STATES.LOBBY_SIPHON
      ) {
        if (e.code === 'Digit1')
          this.queuedPose = FINISHER_POSE_IDS.UPRIGHT_EMBRACE;
        else if (e.code === 'Digit2')
          this.queuedPose = FINISHER_POSE_IDS.BALLROOM_DIP;
        else if (e.code === 'KeyF') this.queuedTaunt = true;
        else if (e.code === FINISHER_CONFIG.releaseKey && !e.repeat) {
          this.queuedRelease = true;
        } else if (e.code === 'Space') {
          e.preventDefault();
          if (!e.repeat) this.queuedSurgeTap = true;
        }
        return;
      }

      const isPlayable =
        state === GAME_STATES.LOBBY ||
        state === GAME_STATES.CHAMBER_COMBAT ||
        state === GAME_STATES.BOSS_COMBAT ||
        state === GAME_STATES.STAGGER;
      if (!isPlayable) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.queuedBlink = true;
      } else if (e.code === 'KeyQ') {
        this.queuedPulse = true;
      }
    };

    this.handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === FIRST_PERSON_GAZE_CONFIG.triggerKey) {
        this.gazeKeyHeld = false;
        this.isFirstPersonGaze = false;
        this.gazeBreakoutLatched = false;
        return;
      }
      if (e.code in this.keys) {
        this.keys[e.code as keyof typeof this.keys] = false;
      }
    };

    this.handleBlur = () => {
      this.gazeKeyHeld = false;
      this.isFirstPersonGaze = false;
      this.gazeBreakoutLatched = false;
    };

    this.handleMouseDown = (e: MouseEvent) => {
      this.audio.unlock();
      if (this.callbacks.isPaused()) return;
      const state = this.callbacks.getGameState();

      if (
        this.isFirstPersonGaze &&
        (FIRST_PERSON_GAZE_CONFIG.breakoutMouseButtons as readonly number[]).includes(
          e.button,
        )
      ) {
        this.exitGaze(true);
      }

      if (e.button === 2) {
        this.rightMouseHeld = true;
      }

      const isPlayable =
        state === GAME_STATES.LOBBY ||
        state === GAME_STATES.CHAMBER_COMBAT ||
        state === GAME_STATES.BOSS_COMBAT ||
        state === GAME_STATES.STAGGER;
      if (!isPlayable) return;

      if (e.button === 0) {
        if (
          !this.callbacks.isPointerLocked() &&
          state !== GAME_STATES.STAGGER
        ) {
          this.callbacks.requestPointerLock();
        }
        if (
          state === GAME_STATES.LOBBY ||
          state === GAME_STATES.BOSS_COMBAT ||
          state === GAME_STATES.CHAMBER_COMBAT
        ) {
          this.primaryFireHeld = true;
        }
      } else if (e.button === 2) {
        if (
          state === GAME_STATES.LOBBY ||
          state === GAME_STATES.BOSS_COMBAT ||
          state === GAME_STATES.CHAMBER_COMBAT
        ) {
          this.queuedPulse = true;
        }
      }
    };

    this.handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.primaryFireHeld = false;
      } else if (e.button === 2) {
        this.rightMouseHeld = false;
      }
    };

    this.handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
  }

  public queueBlink(): void {
    this.queuedBlink = true;
  }

  public queuePulse(): void {
    this.queuedPulse = true;
  }

  public queueFinisherExecute(): void {
    this.queuedFinisherExecute = true;
  }

  public queueBeamFinisherExecute(): void {
    this.queuedBeamFinisherExecute = true;
  }

  public queueStolenKiss(): void {
    this.queuedStolenKiss = true;
  }

  public queuePortalInteract(): void {
    this.queuedPortalInteract = true;
  }

  public triggerSingleShotFire(): void {
    this.queuedSingleShotFire = true;
  }

  private isGazeAllowedState(state: GameState): boolean {
    return (
      state === GAME_STATES.LOBBY ||
      state === GAME_STATES.CHAMBER_COMBAT ||
      state === GAME_STATES.BOSS_COMBAT
    );
  }

  private isAnyBreakoutKeyHeld(): boolean {
    return (
      this.keys.KeyW ||
      this.keys.KeyA ||
      this.keys.KeyS ||
      this.keys.KeyD ||
      this.keys.ArrowUp ||
      this.keys.ArrowDown ||
      this.keys.ArrowLeft ||
      this.keys.ArrowRight ||
      this.keys.KeyE ||
      this.keys.Space ||
      this.primaryFireHeld ||
      this.rightMouseHeld
    );
  }

  private exitGaze(latch: boolean): void {
    this.isFirstPersonGaze = false;
    if (latch && this.gazeKeyHeld) {
      this.gazeBreakoutLatched = true;
    }
  }

  public resetTransientInputs(): void {
    this.isFirstPersonGaze = false;
    this.gazeKeyHeld = false;
    this.gazeBreakoutLatched = false;
    this.keys.KeyW = false;
    this.keys.KeyA = false;
    this.keys.KeyS = false;
    this.keys.KeyD = false;
    this.keys.ArrowUp = false;
    this.keys.ArrowDown = false;
    this.keys.ArrowLeft = false;
    this.keys.ArrowRight = false;
    this.keys.KeyE = false;
    this.keys.Space = false;
    this.primaryFireHeld = false;
    this.queuedSingleShotFire = false;
    this.rightMouseHeld = false;
    this.queuedBlink = false;
    this.queuedPulse = false;
    this.queuedFinisherExecute = false;
    this.queuedBeamFinisherExecute = false;
    this.queuedStolenKiss = false;
    this.queuedPortalInteract = false;
    this.queuedTaunt = false;
    this.queuedSurgeTap = false;
    this.queuedRelease = false;
    this.queuedPose = null;
  }

  private resolveDrainThrottle(): DrainThrottleMode {
    if (this.keys.KeyS || this.keys.ArrowDown || this.rightMouseHeld) {
      return DRAIN_THROTTLE_MODES.SAVOR;
    }
    if (
      this.keys.KeyW ||
      this.keys.ArrowUp ||
      this.keys.KeyE ||
      this.keys.Space
    ) {
      return DRAIN_THROTTLE_MODES.SURGE;
    }
    return DRAIN_THROTTLE_MODES.FLOW;
  }

  public update(_dt: number, _elapsed: number): void {
    const player = this.world.queryFirst('playerTag', 'playerIntent');
    if (!player) return;

    const intent = player.playerIntent;

    // Force-exit gaze on any transition out of active gameplay states
    if (
      this.isFirstPersonGaze &&
      !this.isGazeAllowedState(this.callbacks.getGameState())
    ) {
      this.exitGaze(false);
    }

    const forward =
      (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) -
      (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
    const right =
      (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) -
      (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);

    intent.isFirstPersonGaze = this.isFirstPersonGaze;
    intent.moveForward = forward;
    intent.moveRight = right;
    intent.primaryFireHeld = this.primaryFireHeld || this.queuedSingleShotFire;
    intent.blinkRequested = this.queuedBlink;
    intent.pulseRequested = this.queuedPulse;
    intent.finisherExecuteRequested = this.queuedFinisherExecute;
    intent.beamFinisherExecuteRequested = this.queuedBeamFinisherExecute;
    intent.stolenKissRequested = this.queuedStolenKiss;
    intent.portalInteractRequested = this.queuedPortalInteract;
    intent.tauntRequested = this.queuedTaunt;
    intent.surgeTapRequested = this.queuedSurgeTap;
    intent.releaseRequested = this.queuedRelease;
    intent.requestedPose = this.queuedPose;
    intent.drainThrottle = this.resolveDrainThrottle();

    // Clear one-shot triggers after publishing to ECS intent
    this.queuedSingleShotFire = false;
    this.queuedBlink = false;
    this.queuedPulse = false;
    this.queuedFinisherExecute = false;
    this.queuedBeamFinisherExecute = false;
    this.queuedStolenKiss = false;
    this.queuedPortalInteract = false;
    this.queuedTaunt = false;
    this.queuedSurgeTap = false;
    this.queuedRelease = false;
    this.queuedPose = null;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
  }
}
