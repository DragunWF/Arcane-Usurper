import {
  DRAIN_THROTTLE_MODES,
  FINISHER_POSE_IDS,
  GAME_STATES,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { ECSWorld, ISystem } from '../World';

export interface IInputCallbacks {
  getGameState: () => GameState;
  isPointerLocked: () => boolean;
  requestPointerLock: () => void;
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
  private queuedTaunt = false;
  private queuedSurgeTap = false;
  private queuedPose: FinisherPoseId | null = null;

  private readonly handleKeyDown: (e: KeyboardEvent) => void;
  private readonly handleKeyUp: (e: KeyboardEvent) => void;
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

      if (e.code in this.keys) {
        this.keys[e.code as keyof typeof this.keys] = true;
      }

      const state = this.callbacks.getGameState();

      // Quick Retry ([R]) on Defeat Diorama
      if (e.code === 'KeyR' && state === GAME_STATES.DEFEAT_DIORAMA) {
        this.callbacks.onQuickRetry();
        return;
      }

      // Execute Arcane Siphon Kiss ([E]) in STAGGER
      if (e.code === 'KeyE' && state === GAME_STATES.STAGGER) {
        this.queuedFinisherExecute = true;
        return;
      }

      // Interactive Finisher / Endless Savor pose switching [1-4], [F] Taunt, and Space tap surge boost
      if (
        state === GAME_STATES.SIPHON_FINISHER ||
        state === GAME_STATES.ENDLESS_SAVOR
      ) {
        if (e.code === 'Digit1') this.queuedPose = FINISHER_POSE_IDS.CHIN_LIFT;
        else if (e.code === 'Digit2')
          this.queuedPose = FINISHER_POSE_IDS.BALLROOM_DIP;
        else if (e.code === 'Digit3')
          this.queuedPose = FINISHER_POSE_IDS.HAIR_REINS;
        else if (e.code === 'Digit4')
          this.queuedPose = FINISHER_POSE_IDS.STAFF_LEAN;
        else if (e.code === 'KeyF') this.queuedTaunt = true;
        else if (e.code === 'Space') {
          e.preventDefault();
          if (!e.repeat) this.queuedSurgeTap = true;
        }
        return;
      }

      const isPlayable =
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
      if (e.code in this.keys) {
        this.keys[e.code as keyof typeof this.keys] = false;
      }
    };

    this.handleMouseDown = (e: MouseEvent) => {
      this.audio.unlock();
      const state = this.callbacks.getGameState();

      if (e.button === 2) {
        this.rightMouseHeld = true;
      }

      const isPlayable =
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
          state === GAME_STATES.BOSS_COMBAT ||
          state === GAME_STATES.CHAMBER_COMBAT
        ) {
          this.primaryFireHeld = true;
        }
      } else if (e.button === 2) {
        if (
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

  public triggerSingleShotFire(): void {
    this.queuedSingleShotFire = true;
  }

  public resetTransientInputs(): void {
    this.primaryFireHeld = false;
    this.queuedSingleShotFire = false;
    this.rightMouseHeld = false;
    this.queuedBlink = false;
    this.queuedPulse = false;
    this.queuedFinisherExecute = false;
    this.queuedTaunt = false;
    this.queuedSurgeTap = false;
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
    const forward =
      (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) -
      (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
    const right =
      (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) -
      (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);

    intent.moveForward = forward;
    intent.moveRight = right;
    intent.primaryFireHeld = this.primaryFireHeld || this.queuedSingleShotFire;
    intent.blinkRequested = this.queuedBlink;
    intent.pulseRequested = this.queuedPulse;
    intent.finisherExecuteRequested = this.queuedFinisherExecute;
    intent.tauntRequested = this.queuedTaunt;
    intent.surgeTapRequested = this.queuedSurgeTap;
    intent.requestedPose = this.queuedPose;
    intent.drainThrottle = this.resolveDrainThrottle();

    // Clear one-shot triggers after publishing to ECS intent
    this.queuedSingleShotFire = false;
    this.queuedBlink = false;
    this.queuedPulse = false;
    this.queuedFinisherExecute = false;
    this.queuedTaunt = false;
    this.queuedSurgeTap = false;
    this.queuedPose = null;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
  }
}
