import * as THREE from 'three';
import {
  BOSS_EXPRESSIONS,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  GAME_STATES,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
import { useGameStore } from '../../state/useGameStore';
import type { ECSWorld, ISystem } from '../World';

export interface IFinisherCallbacks {
  getGameState: () => GameState;
  onSiphonClimax: () => void;
}

/**
 * Governs the interactive Arcane Siphon Kiss (SIPHON_FINISHER) and Endless Savor
 * (ENDLESS_SAVOR): [1-4] dominance poses with Pose [2] zero-air-gap lip alignment,
 * 3-tier drain throttle (SAVOR/FLOW/SURGE), [F] tiara-flick taunt, and 100% climax (SRP & DIP).
 */
export class FinisherSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly mageRig: DarkMageRig;
  private readonly bossRig: BossRigAdapter;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly callbacks: IFinisherCallbacks;

  private uiThrottleOverride: DrainThrottleMode | null = null;
  private particleAccum = 0;
  private spiralRefreshAccum = 0;
  private spiralPhase = 0;
  private currentSeparation: number = FINISHER_CONFIG.defaultRootSeparation;
  private readonly scratchHeadPos = new THREE.Vector3();
  private readonly scratchAccessoryPos = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    mageRig: DarkMageRig,
    bossRig: BossRigAdapter,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    callbacks: IFinisherCallbacks,
  ) {
    this.world = world;
    this.mageRig = mageRig;
    this.bossRig = bossRig;
    this.audio = audio;
    this.vfx = vfx;
    this.callbacks = callbacks;
  }

  public setPose(poseId: FinisherPoseId): void {
    const boss = this.world.queryFirst('siphonableBoss');
    if (boss) {
      boss.siphonableBoss.finisherPose = poseId;
    }
    useGameStore.getState().setFinisherPose(poseId);
  }

  public setUiDrainThrottle(mode: DrainThrottleMode | null): void {
    this.uiThrottleOverride = mode;
    const effective = mode ?? DRAIN_THROTTLE_MODES.FLOW;
    const boss = this.world.queryFirst('siphonableBoss');
    if (boss) {
      boss.siphonableBoss.drainThrottle = effective;
    }
    this.audio.setSiphonThrottle(effective);
    useGameStore.getState().setDrainThrottle(effective);
  }

  public triggerTaunt(): void {
    const state = this.callbacks.getGameState();
    if (
      state !== GAME_STATES.SIPHON_FINISHER &&
      state !== GAME_STATES.ENDLESS_SAVOR
    ) {
      return;
    }
    const boss = this.world.queryFirst('siphonableBoss');
    if (!boss || boss.siphonableBoss.tauntCooldown > 0) return;

    boss.siphonableBoss.tauntCooldown = FINISHER_CONFIG.tauntCooldown;
    boss.siphonableBoss.tauntDizzyTimer = FINISHER_CONFIG.tauntDizzyDuration;

    this.bossRig.triggerAccessoryFlick();
    this.bossRig.setExpression(BOSS_EXPRESSIONS.DRAINED_FAINT, this.spiralPhase);
    this.bossRig.root.updateMatrixWorld(true);
    this.bossRig.headAccessory.getWorldPosition(this.scratchAccessoryPos);
    this.vfx.spawnTiaraFlickSparks(this.scratchAccessoryPos);
    this.audio.playTiaraPing();

    const store = useGameStore.getState();
    store.setBossExpression(BOSS_EXPRESSIONS.DRAINED_FAINT);
    store.triggerTauntPop();
  }

  public resetState(): void {
    this.uiThrottleOverride = null;
    this.particleAccum = 0;
    this.spiralRefreshAccum = 0;
    this.spiralPhase = 0;
    this.currentSeparation = FINISHER_CONFIG.defaultRootSeparation;
    this.audio.setSiphonThrottle(DRAIN_THROTTLE_MODES.FLOW);
  }

  private getTargetSeparationForPose(poseId: FinisherPoseId): number {
    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      return FINISHER_CONFIG.dipRootSeparation;
    }
    if (poseId === FINISHER_POSE_IDS.HAIR_REINS) {
      return FINISHER_CONFIG.reinsRootSeparation;
    }
    if (poseId === FINISHER_POSE_IDS.STAFF_LEAN) {
      return FINISHER_CONFIG.staffLeanRootSeparation;
    }
    return FINISHER_CONFIG.defaultRootSeparation;
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();
    const isFinisher = state === GAME_STATES.SIPHON_FINISHER;
    const isEndlessSavor = state === GAME_STATES.ENDLESS_SAVOR;
    if (!isFinisher && !isEndlessSavor) return;

    const player = this.world.queryFirst('playerTag', 'transform', 'playerIntent');
    const boss = this.world.queryFirst('bossPhase', 'siphonableBoss', 'transform');
    if (!player || !boss) return;

    const sb = boss.siphonableBoss;
    const intent = player.playerIntent;

    // 1. Handle [1-4] Dominance Pose Switching
    if (intent.requestedPose !== null && intent.requestedPose !== sb.finisherPose) {
      this.setPose(intent.requestedPose);
    }

    // 2. Handle [F] Tiara-Flick Taunt
    sb.tauntCooldown = Math.max(0, sb.tauntCooldown - dt);
    if (intent.tauntRequested) {
      this.triggerTaunt();
    }

    // 3. Resolve Active Drain Throttle (Keyboard takes priority over HUD pill when held)
    const throttle: DrainThrottleMode =
      intent.drainThrottle !== DRAIN_THROTTLE_MODES.FLOW
        ? intent.drainThrottle
        : (this.uiThrottleOverride ?? DRAIN_THROTTLE_MODES.FLOW);

    if (sb.drainThrottle !== throttle) {
      sb.drainThrottle = throttle;
      this.audio.setSiphonThrottle(throttle);
      useGameStore.getState().setDrainThrottle(throttle);
    }

    // 4. Advance Siphon Progress (Locked at 1.0 in Endless Savor)
    if (isEndlessSavor) {
      sb.isEndlessSavor = true;
      sb.siphonProgress = FINISHER_CONFIG.endlessSavorLockedProgress;
    } else {
      sb.isEndlessSavor = false;
      const rate = FINISHER_CONFIG.drainRates[throttle];
      sb.siphonProgress = Math.min(1.0, sb.siphonProgress + rate * dt);
    }

    // 5. Taunt Dizzy Eye Spin Override (1.5s @_@ spin before reverting to SIPHON_KISS)
    if (sb.tauntDizzyTimer > 0) {
      sb.tauntDizzyTimer = Math.max(0, sb.tauntDizzyTimer - dt);
      this.spiralPhase += dt * DIORAMA_CONFIG.collapseSpiralSpeed * 1.4;
      this.spiralRefreshAccum += dt;
      if (this.spiralRefreshAccum >= DIORAMA_CONFIG.collapseSpiralRefreshInterval) {
        this.spiralRefreshAccum = 0;
        this.bossRig.setExpression(
          BOSS_EXPRESSIONS.DRAINED_FAINT,
          this.spiralPhase,
        );
      }
      if (sb.tauntDizzyTimer <= 0) {
        this.bossRig.setExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
        useGameStore.getState().setBossExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
      }
    }

    // 6. Enforce Exact Root Separation & Face-to-Face Lip Alignment (Pose [2] ~0.40m)
    const targetSep = this.getTargetSeparationForPose(sb.finisherPose);
    this.currentSeparation +=
      (targetSep - this.currentSeparation) *
      Math.min(1, dt * FINISHER_CONFIG.poseBlendSpeed);

    const bx = boss.transform.position.x;
    const bz = boss.transform.position.z;
    const dirX = Math.sin(boss.transform.rotationY);
    const dirZ = Math.cos(boss.transform.rotationY);

    player.transform.position.x = bx + dirX * this.currentSeparation;
    player.transform.position.y = 0;
    player.transform.position.z = bz + dirZ * this.currentSeparation;
    player.transform.rotationY = Math.atan2(
      bx - player.transform.position.x,
      bz - player.transform.position.z,
    );

    // Apply synchronized poses to both rigs
    this.bossRig.root.position.set(bx, 0, bz);
    this.bossRig.root.rotation.y = boss.transform.rotationY;
    this.bossRig.applyFinisherPose(sb.finisherPose, sb.siphonProgress, elapsed);

    this.mageRig.root.position.set(
      player.transform.position.x,
      0,
      player.transform.position.z,
    );
    this.mageRig.root.rotation.y = player.transform.rotationY;
    this.mageRig.applyFinisherPose(sb.finisherPose, sb.siphonProgress, elapsed);

    // 7. Ambient Finisher Particles (2x heart/snowflake density in SAVOR, lightning arcs in SURGE)
    const baseInterval =
      throttle === DRAIN_THROTTLE_MODES.SAVOR
        ? 0.08
        : throttle === DRAIN_THROTTLE_MODES.SURGE
          ? 0.055
          : 0.16;
    this.particleAccum += dt;
    if (this.particleAccum >= baseInterval) {
      this.particleAccum = 0;
      this.bossRig.root.updateMatrixWorld(true);
      this.bossRig.headAnchor.getWorldPosition(this.scratchHeadPos);
      this.vfx.spawnFinisherParticle(this.scratchHeadPos, throttle);
    }

    // 8. Trigger 100% Siphon Climax -> Victory Floor Collapse Diorama (never fires in Endless Savor)
    if (isFinisher && sb.siphonProgress >= 1.0) {
      this.callbacks.onSiphonClimax();
    }
  }
}
