import * as THREE from 'three';
import {
  BOSS_EXPRESSIONS,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  GAME_STATES,
  MIKU_CONFIG,
  PALETTE,
  SERENA_CONFIG,
  SIPHON_GALLERY_CONFIG,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import {
  computeFinisherHeadChoreography,
  type BossRigAdapter,
} from '../../rigs/bosses/BossBase';
import { useGameStore } from '../../state/useGameStore';
import type { ECSWorld, ISystem } from '../World';

export interface LobbySiphonAnchorConfig {
  readonly targetId: 'marina' | 'serena' | 'miku';
  readonly daisPos: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly daisHeight: number;
  readonly facingYaw: number;
}

export interface IFinisherCallbacks {
  getGameState: () => GameState;
  onSiphonClimax: () => void;
  onLobbySiphonTick?: (
    charge: number,
    elapsed: number,
    targetId: 'marina' | 'serena' | 'miku',
  ) => void;
}

interface DynamicRibbon {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: Float32Array;
}

/**
 * Governs the interactive Arcane Siphon Kiss (SIPHON_FINISHER) and Endless Savor
 * (ENDLESS_SAVOR): [1-4] dominance poses with Pose [2] zero-air-gap lip alignment,
 * lip-to-lip & staff-aloft energy ribbons, Pose [3] silver-hair rein strand,
 * 3-tier drain throttle (SAVOR/FLOW/SURGE + Space tap boost), [F] tiara-flick taunt,
 * and 100% climax transition to DioramaSystem (SRP & DIP).
 */
export class FinisherSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly scene: THREE.Scene;
  private readonly mageRig: DarkMageRig;
  private bossRig: BossRigAdapter;
  private lobbyBossRig: BossRigAdapter | null = null;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly callbacks: IFinisherCallbacks;

  private uiThrottleOverride: DrainThrottleMode | null = null;
  private particleAccum = 0;
  private spiralRefreshAccum = 0;
  private spiralPhase = 0;
  private currentSeparation: number = FINISHER_CONFIG.defaultRootSeparation;
  private lobbyCharge: number = SIPHON_GALLERY_CONFIG.defaultCoreCharge;
  private lobbyDepleted = false;
  private lobbyChargeSyncAccum = 0;
  private lobbyAnchor: LobbySiphonAnchorConfig = {
    targetId: 'marina',
    daisPos: SIPHON_GALLERY_CONFIG.marinaDaisPos,
    daisHeight: SIPHON_GALLERY_CONFIG.daisHeight,
    facingYaw: SIPHON_GALLERY_CONFIG.marinaFacingYaw,
  };

  // Live 3D Finisher Energy Ribbons
  private readonly fxGroup = new THREE.Group();
  private readonly voidRibbon: DynamicRibbon;
  private readonly frostRibbon: DynamicRibbon;
  private readonly staffAloftRibbon: DynamicRibbon;

  // Reusable scratch vectors & quaternions (zero per-frame GC allocations)
  private readonly scratchBossHead = new THREE.Vector3();
  private readonly scratchBossHeadQuat = new THREE.Quaternion();
  private readonly scratchBossFaceNormal = new THREE.Vector3();
  private readonly scratchMageMouth = new THREE.Vector3();
  private readonly scratchMageCrystal = new THREE.Vector3();
  private readonly scratchMageAnchor = new THREE.Vector3();
  private readonly scratchAccessoryPos = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    scene: THREE.Scene,
    mageRig: DarkMageRig,
    bossRig: BossRigAdapter,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    callbacks: IFinisherCallbacks,
  ) {
    this.world = world;
    this.scene = scene;
    this.mageRig = mageRig;
    this.bossRig = bossRig;
    this.audio = audio;
    this.vfx = vfx;
    this.callbacks = callbacks;

    this.fxGroup.visible = false;
    this.scene.add(this.fxGroup);

    const segs = FINISHER_CONFIG.ribbonSegments;
    this.voidRibbon = this.createRibbon(PALETTE.voidRibbon, 0.9, segs);
    this.frostRibbon = this.createRibbon(PALETTE.frostRibbon, 0.9, segs);
    this.staffAloftRibbon = this.createRibbon(PALETTE.frostRibbon, 0.85, segs);
  }

  private createRibbon(
    color: number,
    opacity: number,
    segments: number,
  ): DynamicRibbon {
    const positions = new Float32Array((segments + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.fxGroup.add(line);
    return { line, positions };
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
    useGameStore.getState().setThrottleMode(effective);
  }

  public setBossRig(rig: BossRigAdapter): void {
    this.bossRig = rig;
  }

  public setLobbyBossRig(rig: BossRigAdapter | null): void {
    this.lobbyBossRig = rig;
  }

  public getLobbyCharge(): number {
    return this.lobbyCharge;
  }

  public beginLobbySiphonSession(
    initialCharge: number,
    anchor?: LobbySiphonAnchorConfig,
  ): void {
    this.resetState();
    if (anchor) {
      this.lobbyAnchor = anchor;
    } else {
      this.lobbyAnchor = {
        targetId: 'marina',
        daisPos: SIPHON_GALLERY_CONFIG.marinaDaisPos,
        daisHeight: SIPHON_GALLERY_CONFIG.daisHeight,
        facingYaw: SIPHON_GALLERY_CONFIG.marinaFacingYaw,
      };
    }
    const clamped = THREE.MathUtils.clamp(initialCharge, 0, 1);
    if (clamped <= SIPHON_GALLERY_CONFIG.minDrainableCharge) {
      this.lobbyCharge = 0;
      this.lobbyDepleted = true;
    } else {
      this.lobbyCharge = clamped;
      this.lobbyDepleted = false;
    }
    this.lobbyChargeSyncAccum = 0;
  }

  private getActiveBossRig(state: GameState): BossRigAdapter {
    if (state === GAME_STATES.LOBBY_SIPHON && this.lobbyBossRig) {
      return this.lobbyBossRig;
    }
    return this.bossRig;
  }

  public triggerTaunt(): void {
    const state = this.callbacks.getGameState();
    if (
      state !== GAME_STATES.SIPHON_FINISHER &&
      state !== GAME_STATES.ENDLESS_SAVOR &&
      state !== GAME_STATES.LOBBY_SIPHON
    ) {
      return;
    }
    const boss = this.world.queryFirst('siphonableBoss');
    if (!boss || boss.siphonableBoss.tauntCooldown > 0) return;

    const activeRig = this.getActiveBossRig(state);
    boss.siphonableBoss.tauntCooldown = FINISHER_CONFIG.tauntCooldown;
    boss.siphonableBoss.tauntDizzyTimer = FINISHER_CONFIG.tauntDizzyDuration;

    activeRig.triggerAccessoryFlick();
    activeRig.setExpression(BOSS_EXPRESSIONS.DRAINED_FAINT, this.spiralPhase);
    activeRig.root.updateMatrixWorld(true);
    activeRig.headAccessory.getWorldPosition(this.scratchAccessoryPos);
    if (activeRig.id === MIKU_CONFIG.id) {
      this.vfx.spawnTiaraFlickSparks(
        this.scratchAccessoryPos,
        PALETTE.harmonicEmerald,
        PALETTE.harmonicMagenta,
      );
    } else {
      this.vfx.spawnTiaraFlickSparks(this.scratchAccessoryPos);
    }
    this.audio.playTiaraPing();

    const store = useGameStore.getState();
    store.setBossExpression(BOSS_EXPRESSIONS.DRAINED_FAINT);
    store.triggerTauntPop();
  }

  public hideVisuals(): void {
    this.fxGroup.visible = false;
    this.mageRig.setStaffPlanted(false);
  }

  public resetState(): void {
    this.uiThrottleOverride = null;
    this.particleAccum = 0;
    this.spiralRefreshAccum = 0;
    this.spiralPhase = 0;
    this.currentSeparation = FINISHER_CONFIG.defaultRootSeparation;
    this.fxGroup.visible = false;
    this.mageRig.setStaffPlanted(false);
    this.audio.setSiphonThrottle(DRAIN_THROTTLE_MODES.FLOW);
  }

  private getTargetSeparationForPose(poseId: FinisherPoseId): number {
    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      return FINISHER_CONFIG.dipRootSeparation;
    }
    return FINISHER_CONFIG.defaultRootSeparation;
  }

  private getDrainRateForThrottle(mode: DrainThrottleMode): number {
    if (mode === DRAIN_THROTTLE_MODES.SAVOR) {
      return FINISHER_CONFIG.savorRatePerSec;
    }
    if (mode === DRAIN_THROTTLE_MODES.SURGE) {
      return FINISHER_CONFIG.surgeRatePerSec;
    }
    return FINISHER_CONFIG.standardRatePerSec;
  }

  private updateCurvedRibbon(
    ribbon: DynamicRibbon,
    from: THREE.Vector3,
    to: THREE.Vector3,
    time: number,
    phaseOffset: number,
    waveAmp: number,
    archY: number,
  ): void {
    const segs = FINISHER_CONFIG.ribbonSegments;
    const pos = ribbon.positions;

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const env = Math.sin(t * Math.PI);
      const spiral =
        t * Math.PI * 3.0 - time * FINISHER_CONFIG.ribbonPulseSpeed + phaseOffset;

      const x =
        THREE.MathUtils.lerp(from.x, to.x, t) + Math.cos(spiral) * waveAmp * env;
      const y =
        THREE.MathUtils.lerp(from.y, to.y, t) +
        archY * env +
        Math.sin(spiral * 1.2) * waveAmp * 0.65 * env;
      const z =
        THREE.MathUtils.lerp(from.z, to.z, t) + Math.sin(spiral) * waveAmp * env;

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }

    const attr = ribbon.line.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();
    const isFinisher = state === GAME_STATES.SIPHON_FINISHER;
    const isEndlessSavor = state === GAME_STATES.ENDLESS_SAVOR;
    const isLobbySiphon = state === GAME_STATES.LOBBY_SIPHON;
    if (!isFinisher && !isEndlessSavor && !isLobbySiphon) {
      this.fxGroup.visible = false;
      return;
    }

    const player = this.world.queryFirst('playerTag', 'transform', 'playerIntent');
    const boss = this.world.queryFirst('bossPhase', 'siphonableBoss', 'transform');
    if (!player || !boss) return;

    const activeRig = this.getActiveBossRig(state);
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

    // 3. Resolve Active Drain Throttle (Keyboard hold takes priority over HUD pill)
    const throttle: DrainThrottleMode =
      intent.drainThrottle !== DRAIN_THROTTLE_MODES.FLOW
        ? intent.drainThrottle
        : (this.uiThrottleOverride ?? DRAIN_THROTTLE_MODES.FLOW);

    if (sb.drainThrottle !== throttle) {
      sb.drainThrottle = throttle;
      this.audio.setSiphonThrottle(throttle);
      useGameStore.getState().setThrottleMode(throttle);
    }

    // 4. Advance Siphon Progress (Boss Finisher: 0->1; Lobby Siphon: Charge X%->0% then Endless Savor)
    if (isEndlessSavor) {
      sb.isEndlessSavor = true;
      sb.siphonProgress = FINISHER_CONFIG.endlessSavorLockedProgress;
    } else if (isLobbySiphon) {
      if (!this.lobbyDepleted) {
        const rate = this.getDrainRateForThrottle(throttle);
        const tapBoost = intent.surgeTapRequested
          ? FINISHER_CONFIG.surgeTapBoost
          : 0;
        this.lobbyCharge = Math.max(0, this.lobbyCharge - (rate * dt + tapBoost));

        if (tapBoost > 0) {
          activeRig.root.updateMatrixWorld(true);
          activeRig.headAnchor.getWorldPosition(this.scratchBossHead);
          this.vfx.spawnImpactBurst(this.scratchBossHead, 10);
        }

        if (this.lobbyCharge <= 0) {
          this.lobbyCharge = 0;
          this.lobbyDepleted = true;
          const store = useGameStore.getState();
          if (this.lobbyAnchor.targetId === 'miku') {
            store.setMikuCoreCharge(0);
          } else if (this.lobbyAnchor.targetId === 'serena') {
            store.setSerenaCoreCharge(0);
          } else {
            store.setMarinaCoreCharge(0);
          }
          store.setEndlessSavor(true);
        } else {
          this.lobbyChargeSyncAccum += dt;
          if (
            this.lobbyChargeSyncAccum >=
              SIPHON_GALLERY_CONFIG.chargeStoreSyncIntervalSec * 0.5 ||
            tapBoost > 0
          ) {
            this.lobbyChargeSyncAccum = 0;
            const store = useGameStore.getState();
            if (this.lobbyAnchor.targetId === 'miku') {
              store.setMikuCoreCharge(this.lobbyCharge);
            } else if (this.lobbyAnchor.targetId === 'serena') {
              store.setSerenaCoreCharge(this.lobbyCharge);
            } else {
              store.setMarinaCoreCharge(this.lobbyCharge);
            }
          }
        }
      }

      sb.isEndlessSavor = this.lobbyDepleted;
      sb.siphonProgress = this.lobbyDepleted
        ? FINISHER_CONFIG.endlessSavorLockedProgress
        : 1.0 - this.lobbyCharge;
    } else {
      sb.isEndlessSavor = false;
      const rate = this.getDrainRateForThrottle(throttle);
      const tapBoost = intent.surgeTapRequested
        ? FINISHER_CONFIG.surgeTapBoost
        : 0;
      sb.siphonProgress = Math.min(1.0, sb.siphonProgress + rate * dt + tapBoost);
      if (tapBoost > 0) {
        activeRig.root.updateMatrixWorld(true);
        activeRig.headAnchor.getWorldPosition(this.scratchBossHead);
        this.vfx.spawnImpactBurst(this.scratchBossHead, 10);
      }
    }

    // 5. Taunt Dizzy Eye Spin Override (1.5s @_@ spin before reverting to SIPHON_KISS)
    if (sb.tauntDizzyTimer > 0) {
      sb.tauntDizzyTimer = Math.max(0, sb.tauntDizzyTimer - dt);
      this.spiralPhase += dt * DIORAMA_CONFIG.collapseSpiralSpeed * 1.4;
      this.spiralRefreshAccum += dt;
      if (this.spiralRefreshAccum >= DIORAMA_CONFIG.collapseSpiralRefreshInterval) {
        this.spiralRefreshAccum = 0;
        activeRig.setExpression(
          BOSS_EXPRESSIONS.DRAINED_FAINT,
          this.spiralPhase,
        );
      }
      if (sb.tauntDizzyTimer <= 0) {
        activeRig.setExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
        useGameStore.getState().setBossExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
      }
    }

    // 6. Compute shared lip-pivot head choreography & pose Boss FIRST so headAnchor reflects live motion
    const headChoreography = computeFinisherHeadChoreography(
      elapsed,
      sb.siphonProgress,
      throttle,
    );

    let bx = boss.transform.position.x;
    let by = 0;
    let bz = boss.transform.position.z;
    let bossYaw = boss.transform.rotationY;

    if (isLobbySiphon) {
      bx = this.lobbyAnchor.daisPos.x;
      by = this.lobbyAnchor.daisHeight;
      bz = this.lobbyAnchor.daisPos.z;
      bossYaw = this.lobbyAnchor.facingYaw;
      // Captive sovereign stays mounted on her dais local origin (0, daisHeight, 0)
      activeRig.root.position.set(0, by, 0);
      activeRig.root.rotation.set(0, bossYaw, 0);
    } else {
      activeRig.root.position.set(bx, 0, bz);
      activeRig.root.rotation.y = bossYaw;
    }

    const dirX = Math.sin(bossYaw);
    const dirZ = Math.cos(bossYaw);

    const isTauntStunned = sb.tauntDizzyTimer > 0;
    activeRig.applyFinisherPose(
      sb.finisherPose,
      sb.siphonProgress,
      elapsed,
      dt,
      throttle,
      isTauntStunned,
      headChoreography,
    );
    activeRig.root.updateMatrixWorld(true);
    activeRig.headAnchor.getWorldPosition(this.scratchBossHead);
    // Extract Marina's live world-space face-outward normal (+Z of headAnchor),
    // automatically following her dipped head angle in Pose [2] and tilted chin in [1/3/4]
    activeRig.headAnchor.getWorldQuaternion(this.scratchBossHeadQuat);
    this.scratchBossFaceNormal
      .set(0, 0, 1)
      .applyQuaternion(this.scratchBossHeadQuat)
      .normalize();

    // Update Siphon Gallery wrist tether strands, reservoir crystal, and dais rune ring live
    if (isLobbySiphon && this.callbacks.onLobbySiphonTick) {
      this.callbacks.onLobbySiphonTick(
        this.lobbyCharge,
        elapsed,
        this.lobbyAnchor.targetId,
      );
    }

    // Compute exact world-space root placement relative to Boss root (and dipped headAnchor in Pose [2])
    const targetSep = this.getTargetSeparationForPose(sb.finisherPose);
    const sepLerpAlpha =
      1 -
      Math.exp(
        -Math.max(0.001, dt) /
          (FINISHER_CONFIG.poseTransitionDurationSec * 0.35),
      );
    this.currentSeparation = THREE.MathUtils.lerp(
      this.currentSeparation,
      targetSep,
      sepLerpAlpha,
    );

    // In Pose [2], Marina's dipped head translates backward along -dir; shift Mage root closer along dir
    // so his deeply pitched torso/head aligns flush with her tilted mouth with zero air gap
    const headForwardProj =
      (this.scratchBossHead.x - bx) * dirX +
      (this.scratchBossHead.z - bz) * dirZ;
    const dipShift =
      sb.finisherPose === FINISHER_POSE_IDS.BALLROOM_DIP
        ? Math.min(0, headForwardProj) * 0.45
        : 0;
    const effectiveSep = Math.max(0.28, this.currentSeparation + dipShift);

    player.transform.position.x = bx + dirX * effectiveSep;
    player.transform.position.y = by;
    player.transform.position.z = bz + dirZ * effectiveSep;
    player.transform.rotationY = Math.atan2(
      bx - player.transform.position.x,
      bz - player.transform.position.z,
    );

    // Plant the Obsidian Siphon Staff upright beside the Dark Mage so both hands are free
    this.scratchMageAnchor.set(
      player.transform.position.x,
      by,
      player.transform.position.z,
    );
    this.mageRig.setStaffPlanted(
      true,
      this.scratchMageAnchor,
      player.transform.rotationY,
    );

    // Pose Dark Mage with synchronized -> <- press-and-ease motion along sovereign's world face normal
    this.mageRig.root.position.set(
      player.transform.position.x,
      by,
      player.transform.position.z,
    );
    this.mageRig.root.rotation.y = player.transform.rotationY;
    this.mageRig.applyFinisherPose(
      sb.finisherPose,
      sb.siphonProgress,
      elapsed,
      dt,
      throttle,
      this.scratchBossHead,
      headChoreography,
      this.scratchBossFaceNormal,
      activeRig.waistWrapRadius,
    );

    // 7. Update Lip-to-Lip Energy Ribbons & Pose [2] Planted Staff Channeling Ribbon
    const isMikuRig = activeRig.id === MIKU_CONFIG.id;
    const isSerenaRig = activeRig.id === SERENA_CONFIG.id;
    this.frostRibbon.line.material.color.setHex(
      isMikuRig
        ? PALETTE.harmonicEmerald
        : isSerenaRig
          ? PALETTE.biolumCyan
          : PALETTE.frostRibbon,
    );
    this.staffAloftRibbon.line.material.color.setHex(
      isMikuRig
        ? PALETTE.harmonicMagenta
        : isSerenaRig
          ? PALETTE.serenaHairTips
          : PALETTE.frostRibbon,
    );

    this.fxGroup.visible = true;
    this.mageRig.getMouthWorldPosition(this.scratchMageMouth);
    this.mageRig.getStaffCrystalWorldPosition(this.scratchMageCrystal);

    const waveAmp =
      throttle === DRAIN_THROTTLE_MODES.SURGE
        ? FINISHER_CONFIG.ribbonSurgeWaveAmp
        : FINISHER_CONFIG.ribbonNormalWaveAmp;

    this.updateCurvedRibbon(
      this.voidRibbon,
      this.scratchBossHead,
      this.scratchMageMouth,
      elapsed,
      0,
      waveAmp,
      0.04,
    );
    this.updateCurvedRibbon(
      this.frostRibbon,
      this.scratchBossHead,
      this.scratchMageMouth,
      elapsed,
      Math.PI,
      waveAmp,
      -0.03,
    );

    // Pose [2]: Arcing energy ribbon from sovereign into the planted staff's pulsing crystal
    const isDip = sb.finisherPose === FINISHER_POSE_IDS.BALLROOM_DIP;
    this.staffAloftRibbon.line.visible = isDip;
    if (isDip) {
      this.updateCurvedRibbon(
        this.staffAloftRibbon,
        this.scratchBossHead,
        this.scratchMageCrystal,
        elapsed,
        1.2,
        waveAmp * 1.1,
        0.22,
      );
    }

    // 8. Ambient Finisher Particles (2x heart/snowflake density in SAVOR, lightning arcs in SURGE)
    const baseInterval =
      throttle === DRAIN_THROTTLE_MODES.SAVOR
        ? 0.16 / FINISHER_CONFIG.savorParticleMultiplier
        : throttle === DRAIN_THROTTLE_MODES.SURGE
          ? 0.055
          : 0.16;
    this.particleAccum += dt;
    if (this.particleAccum >= baseInterval) {
      this.particleAccum = 0;
      this.vfx.spawnFinisherParticle(this.scratchBossHead, throttle);
    }

    // 9. Trigger 100% Siphon Climax -> Victory Floor Collapse Diorama (never fires in Endless Savor or Lobby Siphon)
    if (isFinisher && sb.siphonProgress >= 1.0) {
      this.fxGroup.visible = false;
      this.mageRig.setStaffPlanted(false);
      this.callbacks.onSiphonClimax();
    }
  }

  public dispose(): void {
    this.mageRig.setStaffPlanted(false);
    this.scene.remove(this.fxGroup);
    [this.voidRibbon, this.frostRibbon, this.staffAloftRibbon].forEach((r) => {
      r.line.geometry.dispose();
      r.line.material.dispose();
    });
  }
}
