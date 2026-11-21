import * as THREE from 'three';
import {
  BOSS_EXPRESSIONS,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_MODES,
  FINISHER_POSE_IDS,
  GAME_STATES,
  MIKU_CONFIG,
  PALETTE,
  SERENA_CONFIG,
  SIPHON_AUDIO_CONFIG,
  SIPHON_BEAM_CONFIG,
  SIPHON_GALLERY_CONFIG,
  type DrainThrottleMode,
  type FinisherMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger, SiphonRealmId } from '../../engine/SoundEngine';
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
  onLobbyBeamComplete?: () => void;
  onLobbyRelease?: () => void;
  onEndlessSavorRelease?: () => void;
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
  private siphonAudioActive = false;
  private beamAudioActive = false;
  private siphonAudioRealm: SiphonRealmId = 1;
  private lastChimeDrainProgress = 0;
  private climaxAudioFired = false;
  private lobbyAnchor: LobbySiphonAnchorConfig = {
    targetId: 'marina',
    daisPos: SIPHON_GALLERY_CONFIG.marinaDaisPos,
    daisHeight: SIPHON_GALLERY_CONFIG.daisHeight,
    facingYaw: SIPHON_GALLERY_CONFIG.marinaFacingYaw,
  };

  // Live 3D Finisher Energy Ribbons (Kiss mode)
  private readonly fxGroup = new THREE.Group();
  private readonly voidRibbon: DynamicRibbon;
  private readonly frostRibbon: DynamicRibbon;
  private readonly staffAloftRibbon: DynamicRibbon;

  // Pooled 3D Umbral Siphon Beam Tether & Elemental Essence Orbs ([R] Beam mode)
  private readonly beamFxGroup = new THREE.Group();
  private readonly beamCoreMesh: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly beamOuterMesh: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly beamObsidianShell: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly beamImpactFlare: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly beamOrbGeo: THREE.SphereGeometry;
  private readonly beamEssenceOrbs: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >[] = [];

  // Reusable scratch vectors & quaternions (zero per-frame GC allocations)
  private readonly scratchBossHead = new THREE.Vector3();
  private readonly scratchBossHeadQuat = new THREE.Quaternion();
  private readonly scratchBossFaceNormal = new THREE.Vector3();
  private readonly scratchMageMouth = new THREE.Vector3();
  private readonly scratchMageCrystal = new THREE.Vector3();
  private readonly scratchMageAnchor = new THREE.Vector3();
  private readonly scratchAccessoryPos = new THREE.Vector3();
  private readonly scratchBossChest = new THREE.Vector3();
  private readonly scratchBeamVec = new THREE.Vector3();
  private readonly scratchBeamDir = new THREE.Vector3();
  private readonly scratchBeamMid = new THREE.Vector3();
  private readonly scratchBeamSide = new THREE.Vector3();
  private readonly scratchBeamOrtho = new THREE.Vector3();
  private readonly scratchBeamQuat = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);

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

    // Build pooled Umbral Siphon Beam tether & 10 elemental essence orbs
    this.beamFxGroup.visible = false;
    this.scene.add(this.beamFxGroup);

    this.beamCoreMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        SIPHON_BEAM_CONFIG.beamCoreRadius,
        SIPHON_BEAM_CONFIG.beamCoreRadius,
        1,
        12,
        1,
        true,
      ),
      new THREE.MeshBasicMaterial({
        color: PALETTE.pulseLavender,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.beamCoreMesh.frustumCulled = false;

    this.beamOuterMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        SIPHON_BEAM_CONFIG.beamOuterRadius,
        SIPHON_BEAM_CONFIG.beamOuterRadius,
        1,
        16,
        1,
        true,
      ),
      new THREE.MeshBasicMaterial({
        color: PALETTE.glowViolet,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.beamOuterMesh.frustumCulled = false;

    this.beamObsidianShell = new THREE.Mesh(
      new THREE.CylinderGeometry(
        SIPHON_BEAM_CONFIG.beamOuterRadius * 1.24,
        SIPHON_BEAM_CONFIG.beamOuterRadius * 1.24,
        1,
        12,
        1,
        true,
      ),
      new THREE.MeshBasicMaterial({
        color: PALETTE.obsidianTrim,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.beamObsidianShell.frustumCulled = false;

    this.beamImpactFlare = new THREE.Mesh(
      new THREE.SphereGeometry(
        SIPHON_BEAM_CONFIG.beamImpactFlareRadius,
        14,
        12,
      ),
      new THREE.MeshBasicMaterial({
        color: PALETTE.glowViolet,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.beamImpactFlare.frustumCulled = false;

    this.beamFxGroup.add(
      this.beamObsidianShell,
      this.beamOuterMesh,
      this.beamCoreMesh,
      this.beamImpactFlare,
    );

    this.beamOrbGeo = new THREE.SphereGeometry(
      SIPHON_BEAM_CONFIG.essenceOrbRadius,
      10,
      8,
    );
    for (let i = 0; i < SIPHON_BEAM_CONFIG.essenceOrbCount; i++) {
      const orbMat = new THREE.MeshBasicMaterial({
        color: PALETTE.frostRunes,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const orb = new THREE.Mesh(this.beamOrbGeo, orbMat);
      orb.frustumCulled = false;
      this.beamFxGroup.add(orb);
      this.beamEssenceOrbs.push(orb);
    }
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
    mode: FinisherMode = FINISHER_MODES.KISS,
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
    const isBeam = mode === FINISHER_MODES.BEAM;
    if (isBeam) {
      this.lobbyCharge = clamped;
      this.lobbyDepleted = clamped <= 0;
    } else if (clamped <= SIPHON_GALLERY_CONFIG.minDrainableCharge) {
      this.lobbyCharge = 0;
      this.lobbyDepleted = true;
    } else {
      this.lobbyCharge = clamped;
      this.lobbyDepleted = false;
    }
    this.lobbyChargeSyncAccum = 0;
    const realm: SiphonRealmId =
      this.lobbyAnchor.targetId === 'miku'
        ? 3
        : this.lobbyAnchor.targetId === 'serena'
          ? 2
          : 1;
    if (isBeam) {
      this.startBeamSiphonAudio(realm);
    } else {
      this.startSiphonAudio(
        realm,
        this.lobbyDepleted ? 1.0 : 1.0 - this.lobbyCharge,
      );
    }
  }

  public startSiphonAudio(
    realm: SiphonRealmId,
    initialDrainProgress = 0,
  ): void {
    const clampedDrain = THREE.MathUtils.clamp(initialDrainProgress, 0, 1);
    this.beamAudioActive = false;
    this.audio.stopBeamSiphonLoop();
    this.siphonAudioActive = true;
    this.siphonAudioRealm = realm;
    this.lastChimeDrainProgress = clampedDrain;
    this.climaxAudioFired = clampedDrain >= 1.0;
    this.audio.startSiphonLoop(realm);
  }

  public startBeamSiphonAudio(realm: SiphonRealmId): void {
    this.siphonAudioActive = false;
    this.audio.stopSiphonLoop();
    this.beamAudioActive = true;
    this.siphonAudioRealm = realm;
    this.climaxAudioFired = false;
    this.audio.startBeamSiphonLoop(realm);
  }

  public stopSiphonAudio(): void {
    this.siphonAudioActive = false;
    this.beamAudioActive = false;
    this.audio.stopSiphonLoop();
    this.audio.stopBeamSiphonLoop();
  }

  private resolveActiveRealm(
    state: GameState,
    activeRig: BossRigAdapter,
  ): SiphonRealmId {
    if (state === GAME_STATES.LOBBY_SIPHON) {
      if (this.lobbyAnchor.targetId === 'miku') return 3;
      if (this.lobbyAnchor.targetId === 'serena') return 2;
      return 1;
    }
    if (activeRig.id === MIKU_CONFIG.id) return 3;
    if (activeRig.id === SERENA_CONFIG.id) return 2;
    return 1;
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
    if (
      !boss ||
      boss.siphonableBoss.tauntCooldown > 0 ||
      ((state === GAME_STATES.SIPHON_FINISHER ||
        state === GAME_STATES.LOBBY_SIPHON) &&
        boss.siphonableBoss.finisherMode === FINISHER_MODES.BEAM)
    ) {
      return;
    }

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
    this.beamFxGroup.visible = false;
    this.mageRig.setStaffPlanted(false);
    this.stopSiphonAudio();
  }

  public resetState(): void {
    this.uiThrottleOverride = null;
    this.particleAccum = 0;
    this.spiralRefreshAccum = 0;
    this.spiralPhase = 0;
    this.currentSeparation = FINISHER_CONFIG.defaultRootSeparation;
    this.lastChimeDrainProgress = 0;
    this.climaxAudioFired = false;
    this.fxGroup.visible = false;
    this.beamFxGroup.visible = false;
    this.mageRig.setStaffPlanted(false);
    this.stopSiphonAudio();
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
      this.beamFxGroup.visible = false;
      if (this.siphonAudioActive || this.beamAudioActive) {
        this.stopSiphonAudio();
      }
      if (state === GAME_STATES.VICTORY_DIORAMA) {
        this.bossRig.applyVictoryDioramaPose(elapsed);
      }
      return;
    }

    const player = this.world.queryFirst('playerTag', 'transform', 'playerIntent');
    const boss = this.world.queryFirst('bossPhase', 'siphonableBoss', 'transform');
    if (!player || !boss) return;

    const activeRig = this.getActiveBossRig(state);
    const activeRealm = this.resolveActiveRealm(state, activeRig);
    const sb = boss.siphonableBoss;
    const intent = player.playerIntent;

    // 0. Handle Finisher Release ([X]) for Siphon Gallery (LOBBY_SIPHON) & Arena (ENDLESS_SAVOR / completed SIPHON_FINISHER)
    if (intent.releaseRequested) {
      if (isLobbySiphon) {
        this.hideVisuals();
        this.callbacks.onLobbyRelease?.();
        return;
      }
      if (isEndlessSavor || (isFinisher && sb.siphonProgress >= 1.0)) {
        this.hideVisuals();
        this.callbacks.onEndlessSavorRelease?.();
        return;
      }
    }

    // Ranged Umbral Siphon Beam ([R]) branch — staggered arena bosses & Siphon Gallery alcoves
    if ((isFinisher || isLobbySiphon) && sb.finisherMode === FINISHER_MODES.BEAM) {
      this.updateBeamFinisher(
        dt,
        elapsed,
        isLobbySiphon,
        player.transform,
        boss.transform,
        sb,
        activeRig,
        activeRealm,
      );
      return;
    }

    this.beamFxGroup.visible = false;

    if (!this.siphonAudioActive || this.siphonAudioRealm !== activeRealm) {
      const startDrain = isEndlessSavor
        ? 1.0
        : isLobbySiphon
          ? this.lobbyDepleted
            ? 1.0
            : 1.0 - this.lobbyCharge
          : sb.siphonProgress;
      this.startSiphonAudio(activeRealm, startDrain);
    }

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
          if (!this.climaxAudioFired) {
            this.climaxAudioFired = true;
            this.audio.playSiphonClimax(activeRealm);
          }
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
    const isTauntStunned = sb.tauntDizzyTimer > 0;

    // Sync procedural siphon audio stream, kiss-cadence breath/contact/parting, & elemental micro-chimes
    this.audio.updateSiphonLoop({
      drainProgress: sb.siphonProgress,
      throttle,
      kissPressPhase: headChoreography.pulse,
      isEndlessSavor: sb.isEndlessSavor,
      isTauntStunned,
      dt,
    });
    if (
      !sb.isEndlessSavor &&
      sb.siphonProgress - this.lastChimeDrainProgress >=
        SIPHON_AUDIO_CONFIG.chimeStepPercent
    ) {
      const stepsAdvanced = Math.floor(
        (sb.siphonProgress - this.lastChimeDrainProgress) /
          SIPHON_AUDIO_CONFIG.chimeStepPercent,
      );
      this.lastChimeDrainProgress +=
        stepsAdvanced * SIPHON_AUDIO_CONFIG.chimeStepPercent;
      this.audio.playSiphonMicroChime(activeRealm, sb.siphonProgress);
    }

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
      if (!this.climaxAudioFired) {
        this.climaxAudioFired = true;
        this.audio.playSiphonClimax(activeRealm);
      }
      this.fxGroup.visible = false;
      this.mageRig.setStaffPlanted(false);
      this.stopSiphonAudio();
      this.callbacks.onSiphonClimax();
    }
  }

  /**
   * Executes the ranged Umbral Siphon Beam ([R]) finisher on a staggered arena boss
   * or a captive Siphon Gallery sovereign:
   * - Dark Mage stands off at `standoffDistance` (arena) or `lobbyStandoffDistance` (gallery)
   *   channeling a pulsing royal-violet/obsidian tether with his staff in hand
   * - Sovereign kneels shielding her face while trembling & bleaching 0% -> 100%
   * - 10 pooled realm-colored essence orbs stream back along the beam into the staff crystal
   * - High-voltage pitch-climbing audio climaxes at completion and transitions cleanly
   *   (Victory Diorama in arenas; bound alcove release back to LOBBY in Siphon Gallery)
   */
  private updateBeamFinisher(
    dt: number,
    elapsed: number,
    isLobbySiphon: boolean,
    playerTransform: { position: { x: number; y: number; z: number }; rotationY: number },
    bossTransform: { position: { x: number; y: number; z: number }; rotationY: number },
    sb: { siphonProgress: number; isEndlessSavor: boolean },
    activeRig: BossRigAdapter,
    activeRealm: SiphonRealmId,
  ): void {
    this.fxGroup.visible = false;
    sb.isEndlessSavor = false;

    if (!this.beamAudioActive || this.siphonAudioRealm !== activeRealm) {
      this.startBeamSiphonAudio(activeRealm);
    }

    const drainStep = dt / SIPHON_BEAM_CONFIG.drainDurationSec;
    if (isLobbySiphon) {
      this.lobbyCharge = Math.max(0, this.lobbyCharge - drainStep);
      sb.siphonProgress = 1.0 - this.lobbyCharge;

      this.lobbyChargeSyncAccum += dt;
      if (
        this.lobbyCharge <= 0 ||
        this.lobbyChargeSyncAccum >=
          SIPHON_GALLERY_CONFIG.chargeStoreSyncIntervalSec * 0.5
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
    } else {
      // Advance arena beam drain smoothly over 3.5s
      sb.siphonProgress = Math.min(1.0, sb.siphonProgress + drainStep);
    }

    let bx = bossTransform.position.x;
    let by = 0;
    let bz = bossTransform.position.z;
    let bossYaw = bossTransform.rotationY;

    if (isLobbySiphon) {
      bx = this.lobbyAnchor.daisPos.x;
      by = this.lobbyAnchor.daisHeight;
      bz = this.lobbyAnchor.daisPos.z;
      bossYaw = this.lobbyAnchor.facingYaw;
      // Captive sovereign stays mounted on her alcove dais local origin (0, daisHeight, 0)
      activeRig.root.position.set(0, by, 0);
      activeRig.root.rotation.set(0, bossYaw, 0);
    } else {
      activeRig.root.position.set(bx, 0, bz);
      activeRig.root.rotation.set(0, bossYaw, 0);
    }

    const dirX = Math.sin(bossYaw);
    const dirZ = Math.cos(bossYaw);

    activeRig.applyBeamFinisherPose(sb.siphonProgress, elapsed);
    activeRig.root.updateMatrixWorld(true);

    if (isLobbySiphon && this.callbacks.onLobbySiphonTick) {
      this.callbacks.onLobbySiphonTick(
        this.lobbyCharge,
        elapsed,
        this.lobbyAnchor.targetId,
      );
    }

    // Position Dark Mage at exact standoff distance along outward facing axis
    const standoff = isLobbySiphon
      ? SIPHON_BEAM_CONFIG.lobbyStandoffDistance
      : SIPHON_BEAM_CONFIG.standoffDistance;
    const mageX = bx + dirX * standoff;
    const mageZ = bz + dirZ * standoff;
    const mageYaw = Math.atan2(bx - mageX, bz - mageZ);
    playerTransform.position.x = mageX;
    playerTransform.position.y = 0;
    playerTransform.position.z = mageZ;
    playerTransform.rotationY = mageYaw;

    this.mageRig.root.position.set(mageX, 0, mageZ);
    this.mageRig.root.rotation.set(0, mageYaw, 0);
    this.mageRig.applyBeamFinisherPose(elapsed);
    this.mageRig.root.updateMatrixWorld(true);

    // Resolve world endpoints: Dark Mage's staff tip crystal -> Boss's chest center
    this.mageRig.getStaffCrystalWorldPosition(this.scratchMageCrystal);
    this.scratchBossChest.set(
      bx,
      by +
        SIPHON_BEAM_CONFIG.bossChestTargetOffsetY *
          (1 - sb.siphonProgress * 0.14),
      bz,
    );

    this.scratchBeamVec.subVectors(
      this.scratchBossChest,
      this.scratchMageCrystal,
    );
    const beamLen = Math.max(0.25, this.scratchBeamVec.length());
    this.scratchBeamDir.copy(this.scratchBeamVec).divideScalar(beamLen);
    this.scratchBeamMid
      .addVectors(this.scratchMageCrystal, this.scratchBossChest)
      .multiplyScalar(0.5);
    this.scratchBeamQuat.setFromUnitVectors(this.upAxis, this.scratchBeamDir);

    const pulseWave = Math.sin(
      elapsed * Math.PI * 2 * SIPHON_BEAM_CONFIG.beamPulseFreqHz,
    );
    const coreScale =
      1 +
      (pulseWave * SIPHON_BEAM_CONFIG.beamPulseAmp) /
        SIPHON_BEAM_CONFIG.beamCoreRadius;
    const outerScale =
      1 +
      (Math.cos(elapsed * Math.PI * 2 * SIPHON_BEAM_CONFIG.beamPulseFreqHz) *
        SIPHON_BEAM_CONFIG.beamPulseAmp) /
        SIPHON_BEAM_CONFIG.beamOuterRadius;

    this.beamFxGroup.visible = true;

    this.beamCoreMesh.position.copy(this.scratchBeamMid);
    this.beamCoreMesh.quaternion.copy(this.scratchBeamQuat);
    this.beamCoreMesh.scale.set(coreScale, beamLen, coreScale);

    this.beamOuterMesh.position.copy(this.scratchBeamMid);
    this.beamOuterMesh.quaternion.copy(this.scratchBeamQuat);
    this.beamOuterMesh.scale.set(outerScale, beamLen, outerScale);

    this.beamObsidianShell.position.copy(this.scratchBeamMid);
    this.beamObsidianShell.quaternion.copy(this.scratchBeamQuat);
    this.beamObsidianShell.scale.set(outerScale * 1.05, beamLen, outerScale * 1.05);

    this.beamImpactFlare.position.copy(this.scratchBossChest);
    const flareScale = 0.85 + Math.abs(pulseWave) * 0.45 + sb.siphonProgress * 0.35;
    this.beamImpactFlare.scale.setScalar(flareScale);

    // Compute orthonormal basis perpendicular to the beam for helical essence orb streaming
    this.scratchBeamSide
      .crossVectors(this.scratchBeamDir, this.upAxis)
      .normalize();
    if (this.scratchBeamSide.lengthSq() < 0.01) {
      this.scratchBeamSide.set(1, 0, 0);
    }
    this.scratchBeamOrtho
      .crossVectors(this.scratchBeamSide, this.scratchBeamDir)
      .normalize();

    const orbCount = this.beamEssenceOrbs.length;
    const cycleRate = SIPHON_BEAM_CONFIG.essenceOrbSpeed / beamLen;
    const isRealm3 = activeRealm === 3;
    const isRealm2 = activeRealm === 2;

    for (let i = 0; i < orbCount; i++) {
      const orb = this.beamEssenceOrbs[i];
      if (!orb) continue;

      const orbHex = isRealm3
        ? i % 2 === 0
          ? PALETTE.harmonicEmerald
          : PALETTE.harmonicMagenta
        : isRealm2
          ? i % 2 === 0
            ? PALETTE.biolumCyan
            : PALETTE.serenaHairTips
          : i % 2 === 0
            ? PALETTE.frostRunes
            : PALETTE.iceHighlights;
      orb.material.color.setHex(orbHex);

      // Stream from Boss chest (u = 0) BACK into the Dark Mage's staff crystal (u = 1)
      const u = (elapsed * cycleRate + i / orbCount) % 1;
      const env = Math.sin(u * Math.PI);
      const swirlAngle = u * Math.PI * 5.0 + elapsed * 7.0 + i * 1.3;
      const swirlR = SIPHON_BEAM_CONFIG.essenceOrbSpiralRadius * env;

      orb.position
        .lerpVectors(this.scratchBossChest, this.scratchMageCrystal, u)
        .addScaledVector(this.scratchBeamSide, Math.cos(swirlAngle) * swirlR)
        .addScaledVector(this.scratchBeamOrtho, Math.sin(swirlAngle) * swirlR);
      orb.scale.setScalar(0.65 + env * 0.55);
    }

    // Update high-voltage beam audio hum + crackles
    this.audio.updateBeamSiphonLoop(sb.siphonProgress, dt);

    // Emit crackling surge particles at boss chest contact
    this.particleAccum += dt;
    if (this.particleAccum >= SIPHON_BEAM_CONFIG.beamParticleIntervalSec) {
      this.particleAccum = 0;
      this.vfx.spawnFinisherParticle(
        this.scratchBossChest,
        DRAIN_THROTTLE_MODES.SURGE,
      );
    }

    // Complete when fully drained (coreCharge <= 0 in Lobby Siphon, siphonProgress >= 1.0 in Arena)
    const isComplete = isLobbySiphon
      ? this.lobbyCharge <= 0
      : sb.siphonProgress >= 1.0;
    if (isComplete) {
      if (!this.climaxAudioFired) {
        this.climaxAudioFired = true;
        this.audio.playSiphonClimax(activeRealm);
      }
      this.beamFxGroup.visible = false;
      this.stopSiphonAudio();
      if (isLobbySiphon) {
        this.lobbyCharge = 0;
        this.lobbyDepleted = true;
        sb.siphonProgress = 1.0;
        this.callbacks.onLobbyBeamComplete?.();
      } else {
        this.callbacks.onSiphonClimax();
      }
    }
  }

  public dispose(): void {
    this.stopSiphonAudio();
    this.mageRig.setStaffPlanted(false);
    this.scene.remove(this.fxGroup);
    [this.voidRibbon, this.frostRibbon, this.staffAloftRibbon].forEach((r) => {
      r.line.geometry.dispose();
      r.line.material.dispose();
    });

    this.scene.remove(this.beamFxGroup);
    this.beamCoreMesh.geometry.dispose();
    this.beamCoreMesh.material.dispose();
    this.beamOuterMesh.geometry.dispose();
    this.beamOuterMesh.material.dispose();
    this.beamObsidianShell.geometry.dispose();
    this.beamObsidianShell.material.dispose();
    this.beamImpactFlare.geometry.dispose();
    this.beamImpactFlare.material.dispose();
    this.beamOrbGeo.dispose();
    for (let i = 0; i < this.beamEssenceOrbs.length; i++) {
      const orb = this.beamEssenceOrbs[i];
      if (orb) orb.material.dispose();
    }
  }
}
