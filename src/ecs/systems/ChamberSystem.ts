import * as THREE from 'three';
import {
  CHAMBER_CONFIG,
  GAME_STATES,
  HARMONIC_CHAMBER_CONFIG,
  HARMONIC_SERVANT_CONFIG,
  PALETTE,
  PORTAL_STATES,
  SERVANT_AI_STATES,
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  SIPHON_GALLERY_CONFIG,
  SOUL_WISP_KINDS,
  SUNKEN_CHAMBER_CONFIG,
  SUNKEN_SERVANT_CONFIG,
  type ChamberWaveRecipe,
  type GameState,
  type HarmonicChamberWaveRecipe,
  type PortalState,
  type ServantArchetype,
  type ServantArchetypeStats,
  type ServantAnimState,
  type SoulWispKind,
  type SunkenChamberWaveRecipe,
} from '../../config/gameConfig';
import type { IArenaGeometry } from '../../engine/SceneManager';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type {
  FrostUrnSpawnRecord,
  IcePalaceLevel,
} from '../../levels/IcePalaceLevel';

/**
 * Narrow chamber-level contract (ISP & DIP) implemented by both Realm I (`IcePalaceLevel`)
 * and Realm II (`SunkenAqueductLevel`) so `ChamberSystem` operates seamlessly across realms.
 */
export interface IChamberLevel {
  readonly portalPosition: THREE.Vector3;
  readonly urnSpawns: readonly FrostUrnSpawnRecord[];
  resetUrns(): void;
  setPortalCharge(ratio: number, ignited: boolean, time: number): void;
}
import type { ServantRigAdapter } from '../../rigs/servants/ServantBase';
import { createServantRig } from '../../rigs/servants/ServantFactory';
import { useGameStore } from '../../state/useGameStore';
import type { EntityId } from '../components';
import type { ECSWorld, ISystem } from '../World';

export interface IChamberCallbacks {
  getGameState: () => GameState;
  setGameState: (next: GameState) => void;
  getEncoreTier: () => number;
  getActiveRealm: () => 1 | 2 | 3;
  addCameraShake: (amount: number) => void;
  onPlayerDamaged: (amount: number) => void;
  onPlayerHealed: () => void;
  onPortalWarpStarted: () => void;
  onPortalWarpComplete: () => void;
}

interface ServantRuntime {
  readonly rig: ServantRigAdapter;
  readonly archetype: ServantArchetype;
  animTime: number;
  attackCooldown: number;
  lungeDirX: number;
  lungeDirZ: number;
  orbitDir: -1 | 1;
  hasDealtAttackDamage: boolean;
  telegraphMesh: THREE.Group | null;
}

interface SummonGlyphRecord {
  readonly mesh: THREE.Group;
  readonly x: number;
  readonly z: number;
  readonly archetype: ServantArchetype;
}

/**
 * Orchestrates Realm I Royal Ice Chambers gauntlet (SRP & DIP):
 * - Event-driven 2-wave progression (zero artificial wave countdown timers)
 * - Polymorphic servant instantiation via ServantFactory (OCP)
 * - 4 distinct servant AI behaviors & floor telegraphs
 * - Homing Soul Wisps charging the Astral Portal & healing from shattered Frost Urns
 * - Astral Portal ignition and 1.1s PORTAL_TRANSITION warp to Marina's Summit
 */
export class ChamberSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly scene: THREE.Scene;
  private icePalace: IChamberLevel;
  private readonly arena: IArenaGeometry;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly callbacks: IChamberCallbacks;

  private readonly servantRuntimes = new Map<EntityId, ServantRuntime>();
  private readonly activeGlyphs: SummonGlyphRecord[] = [];

  private currentWaveIndex = 0;
  private pendingWaveIndex: number | null = null;
  private waveEscalationTimer = 0;
  private portalState: PortalState = PORTAL_STATES.SEALED;
  private portalCharge = 0;
  private portalTargetCharge = 0;
  private portalWarpElapsed = 0;
  private portalSparkTimer = 0;
  private lastNearPortal = false;
  private currentEncoreTier = 0;
  private activeRealm: 1 | 2 | 3 = 1;
  private readonly chamberLevels = new Map<1 | 2 | 3, IChamberLevel>();

  // Reusable scratch vectors (zero per-frame GC churn)
  private readonly scratchOrigin = new THREE.Vector3();
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchBurst = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    scene: THREE.Scene,
    icePalace: IcePalaceLevel | IChamberLevel,
    arena: IArenaGeometry,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    callbacks: IChamberCallbacks,
    sunkenAqueduct?: IChamberLevel,
    cyberBackstage?: IChamberLevel,
  ) {
    this.world = world;
    this.scene = scene;
    this.icePalace = icePalace;
    this.chamberLevels.set(1, icePalace);
    if (sunkenAqueduct) {
      this.chamberLevels.set(2, sunkenAqueduct);
    }
    if (cyberBackstage) {
      this.chamberLevels.set(3, cyberBackstage);
    }
    this.arena = arena;
    this.audio = audio;
    this.vfx = vfx;
    this.callbacks = callbacks;
  }

  /**
   * Swaps the active chamber environment target (Realm I IcePalaceLevel, Realm II SunkenAqueductLevel, or Realm III CyberBackstageLevel).
   */
  public setActiveLevel(level: IChamberLevel, realm?: 1 | 2 | 3): void {
    this.icePalace = level;
    if (realm) {
      this.activeRealm = realm;
      this.chamberLevels.set(realm, level);
    }
  }

  private getActiveWaves(): readonly (
    | ChamberWaveRecipe
    | SunkenChamberWaveRecipe
    | HarmonicChamberWaveRecipe
  )[] {
    if (this.activeRealm === 3) {
      return HARMONIC_CHAMBER_CONFIG.WAVES;
    }
    return this.activeRealm === 2
      ? SUNKEN_CHAMBER_CONFIG.WAVES
      : CHAMBER_CONFIG.WAVES;
  }

  private getActiveWaveEscalationDelay(): number {
    if (this.activeRealm === 3) {
      return HARMONIC_CHAMBER_CONFIG.waveEscalationDelay;
    }
    return this.activeRealm === 2
      ? SUNKEN_CHAMBER_CONFIG.waveEscalationDelay
      : CHAMBER_CONFIG.waveEscalationDelay;
  }

  private getActivePortalInteractionRadius(): number {
    if (this.activeRealm === 3) {
      return HARMONIC_CHAMBER_CONFIG.portalInteractionRadius;
    }
    return this.activeRealm === 2
      ? SUNKEN_CHAMBER_CONFIG.portalInteractionRadius
      : CHAMBER_CONFIG.portalInteractionRadius;
  }

  private getActivePortalWarpDuration(): number {
    if (this.activeRealm === 3) {
      return HARMONIC_CHAMBER_CONFIG.portalWarpDuration;
    }
    return this.activeRealm === 2
      ? SUNKEN_CHAMBER_CONFIG.portalWarpDuration
      : CHAMBER_CONFIG.portalWarpDuration;
  }

  private getStatsForArchetype(archetype: ServantArchetype): ServantArchetypeStats {
    if (archetype === SERVANT_ARCHETYPES.PULSE_STRIKER) {
      return HARMONIC_SERVANT_CONFIG.PULSE_STRIKER;
    }
    if (archetype === SERVANT_ARCHETYPES.SYNTH_CANTOR) {
      return HARMONIC_SERVANT_CONFIG.SYNTH_CANTOR;
    }
    if (archetype === SERVANT_ARCHETYPES.FREQUENCY_DRONE) {
      return HARMONIC_SERVANT_CONFIG.FREQUENCY_DRONE;
    }
    if (archetype === SERVANT_ARCHETYPES.AEGIS_MONOLITH) {
      return HARMONIC_SERVANT_CONFIG.AEGIS_MONOLITH;
    }
    if (archetype === SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE) {
      return SUNKEN_SERVANT_CONFIG.TIDEGUARD_HOPLITE;
    }
    if (archetype === SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER) {
      return SUNKEN_SERVANT_CONFIG.ABYSSAL_SIREN_WEAVER;
    }
    if (archetype === SERVANT_ARCHETYPES.RAZORFIN_MANTA) {
      return SUNKEN_SERVANT_CONFIG.RAZORFIN_MANTA;
    }
    if (archetype === SERVANT_ARCHETYPES.CORAL_BASTION) {
      return SUNKEN_SERVANT_CONFIG.CORAL_BASTION;
    }
    if (archetype === SERVANT_ARCHETYPES.CRYO_ACOLYTE) {
      return SERVANT_CONFIG.CRYO_ACOLYTE;
    }
    if (archetype === SERVANT_ARCHETYPES.RIME_HOUND) {
      return SERVANT_CONFIG.RIME_HOUND;
    }
    if (archetype === SERVANT_ARCHETYPES.FROSTBITE_WARDEN) {
      return SERVANT_CONFIG.FROSTBITE_WARDEN;
    }
    return SERVANT_CONFIG.GLACIAL_VANGUARD;
  }

  /**
   * Initializes a fresh Chamber gauntlet run (Realm I Royal Ice Chambers, Realm II Sunken Aqueduct, or Realm III Cyber Backstage):
   * registers the 8 destructible Urns/Canisters and spawns Wave 1 immediately via ServantFactory.
   */
  public enterChambers(
    encoreTier: number,
    realm: 1 | 2 | 3 = this.callbacks.getActiveRealm(),
  ): void {
    this.cleanupChambers();
    this.activeRealm = realm;
    const realmLevel = this.chamberLevels.get(realm);
    if (realmLevel) {
      this.icePalace = realmLevel;
    }
    this.currentEncoreTier = encoreTier;
    this.currentWaveIndex = 0;
    this.pendingWaveIndex = null;
    this.waveEscalationTimer = 0;
    this.portalState = PORTAL_STATES.SEALED;
    this.portalCharge = 0;
    this.portalTargetCharge = 0;
    this.portalWarpElapsed = 0;
    this.lastNearPortal = false;

    this.icePalace.resetUrns();
    this.icePalace.setPortalCharge(0, false, 0);

    // Register all 8 Destructible Frost Urns as ECS entities
    const urns = this.icePalace.urnSpawns;
    for (let i = 0; i < urns.length; i++) {
      const urn = urns[i];
      if (!urn) continue;
      urn.mesh.visible = true;
      urn.mesh.userData.managedByLevel = true;
      this.world.createEntity({
        transform: {
          position: { x: urn.x, y: urn.y, z: urn.z },
          rotationY: 0,
          scale: 1,
        },
        hurtbox: {
          radius: urn.hitRadius,
          minY: 0,
          maxY: 1.35,
          faction: 'SERVANT',
        },
        destructibleProp: {
          propType: urn.propType,
          hp: urn.hp,
          healValue: urn.healValue,
        },
        meshRef: { object3D: urn.mesh },
      });
    }

    // Spawn Wave 1 immediately
    this.spawnWave(0);
    const store = useGameStore.getState();
    store.setPortalState(PORTAL_STATES.SEALED);
    store.setNearPortal(false);
    store.setPortalWarpProgress(0);
  }

  /**
   * Tears down all active servants, urn entities, soul wisps, glyphs, and line telegraphs.
   */
  public cleanupChambers(): void {
    this.clearSummonGlyphs();

    this.servantRuntimes.forEach((runtime) => {
      this.clearServantTelegraph(runtime);
      runtime.rig.dispose();
    });
    this.servantRuntimes.clear();

    const servantIds = this.world.query('servantAI').map((e) => e.id);
    servantIds.forEach((id) => this.world.destroyEntity(id));

    const propIds = this.world.query('destructibleProp').map((e) => e.id);
    propIds.forEach((id) => this.world.destroyEntity(id));

    const wispIds = this.world.query('soulWisp').map((e) => e.id);
    wispIds.forEach((id) => this.world.destroyEntity(id));

    this.pendingWaveIndex = null;
    this.waveEscalationTimer = 0;
    this.portalWarpElapsed = 0;
    this.lastNearPortal = false;
  }

  // =========================================================================
  // COMBAT HOOKS (invoked by CombatSystem via narrow DIP callbacks)
  // =========================================================================

  public triggerServantHitFlash(entityId: EntityId): void {
    this.servantRuntimes.get(entityId)?.rig.triggerHitFlash();
  }

  public handleServantGuardBreak(entityId: EntityId): void {
    const entity = this.world.getEntity(entityId);
    const runtime = this.servantRuntimes.get(entityId);
    if (!entity?.servantAI || !runtime) return;

    entity.servantAI.guardBrokenTimer = CHAMBER_CONFIG.wardenGuardBrokenDuration;
    entity.servantAI.state = SERVANT_AI_STATES.GUARD_BROKEN;
    entity.servantAI.stateTimer = CHAMBER_CONFIG.wardenGuardBrokenDuration;
    entity.servantAI.telegraphTimer = 0;

    if (entity.velocity) {
      entity.velocity.vx = 0;
      entity.velocity.vz = 0;
    }

    this.clearServantTelegraph(runtime);
    runtime.rig.setShieldVisual(false);
    runtime.rig.triggerHitFlash();
    this.callbacks.addCameraShake(0.18);
  }

  public handleServantDefeated(entityId: EntityId): void {
    const entity = this.world.getEntity(entityId);
    const runtime = this.servantRuntimes.get(entityId);
    if (!entity?.servantAI || !entity.transform) return;
    if (entity.servantAI.state === SERVANT_AI_STATES.DYING) return;

    entity.servantAI.state = SERVANT_AI_STATES.DYING;
    entity.servantAI.stateTimer = SERVANT_CONFIG.deathDissolveDuration;
    if (entity.velocity) {
      entity.velocity.vx = 0;
      entity.velocity.vz = 0;
    }
    if (runtime) {
      this.clearServantTelegraph(runtime);
    }

    // Launch glowing cyan Soul Wisp arcing into the Astral Portal arch
    const pos = entity.transform.position;
    this.spawnSoulWisp(
      pos.x,
      pos.y + 1.15,
      pos.z,
      this.icePalace.portalPosition.x,
      this.icePalace.portalPosition.y,
      this.icePalace.portalPosition.z,
      SOUL_WISP_KINDS.PORTAL_CHARGE,
      0,
    );

    this.evaluateWaveCompletion();
  }

  public handleUrnShattered(origin: THREE.Vector3, healValue: number): void {
    const player = this.world.queryFirst('playerTag', 'transform');
    const tx = player ? player.transform.position.x : origin.x;
    const ty = player ? player.transform.position.y + 1.2 : origin.y + 1.2;
    const tz = player ? player.transform.position.z : origin.z;

    this.spawnSoulWisp(
      origin.x,
      origin.y + 0.75,
      origin.z,
      tx,
      ty,
      tz,
      SOUL_WISP_KINDS.HEAL_PLAYER,
      healValue,
    );
  }

  // =========================================================================
  // WAVE SPAWNING & EVENT-DRIVEN ESCALATION
  // =========================================================================

  private countLivingServants(): number {
    const servants = this.world.query('servantAI');
    let count = 0;
    for (let i = 0; i < servants.length; i++) {
      const s = servants[i];
      if (s && s.servantAI.state !== SERVANT_AI_STATES.DYING) {
        count++;
      }
    }
    return count;
  }

  private evaluateWaveCompletion(): void {
    const living = this.countLivingServants();
    const waves = this.getActiveWaves();
    const totalWaves = waves.length;
    useGameStore
      .getState()
      .setChamberWaveProgress(this.currentWaveIndex + 1, totalWaves, living);

    if (living > 0 || this.pendingWaveIndex !== null) return;

    const nextWave = this.currentWaveIndex + 1;
    const store = useGameStore.getState();
    const applyRealmRechargeBonus = (): void => {
      if (store.marinaDefeated) {
        store.addMarinaCoreCharge(
          SIPHON_GALLERY_CONFIG.chamberWaveRechargeBonus,
        );
      }
      if (store.serenaDefeated) {
        store.addSerenaCoreCharge(
          SIPHON_GALLERY_CONFIG.chamberWaveRechargeBonus,
        );
      }
    };

    if (nextWave < totalWaves) {
      // Wave 1 cleared -> fill portal to 50%, chime, raise summoning glyphs, & recharge sovereign core
      this.portalTargetCharge = Math.max(
        this.portalTargetCharge,
        (this.currentWaveIndex + 1) / totalWaves,
      );
      this.pendingWaveIndex = nextWave;
      this.waveEscalationTimer = this.getActiveWaveEscalationDelay();
      this.audio.playSummonGlyphChime();
      if (this.activeRealm === 2) {
        this.audio.playBubblePop();
      }
      this.spawnWaveSummonGlyphs(nextWave);
      applyRealmRechargeBonus();
    } else if (this.portalState !== PORTAL_STATES.IGNITED) {
      // Wave 2 cleared -> ignite Astral / Tidal Portal at 100% charge & shatter seal!
      this.portalTargetCharge = 1.0;
      this.portalCharge = 1.0;
      this.portalState = PORTAL_STATES.IGNITED;
      this.audio.playPortalIgnite();
      if (this.activeRealm === 2) {
        this.audio.playTidalWave();
      }
      this.callbacks.addCameraShake(0.24);
      this.vfx.spawnFrostShatterBurst(this.icePalace.portalPosition, 26, 8.5);
      this.icePalace.setPortalCharge(1.0, true, 0);
      store.setPortalState(PORTAL_STATES.IGNITED);
      applyRealmRechargeBonus();
    }
  }

  private spawnWaveSummonGlyphs(waveIndex: number): void {
    this.clearSummonGlyphs();
    const recipe = this.getActiveWaves()[waveIndex];
    if (!recipe) return;

    const spawnPoints = CHAMBER_CONFIG.servantSpawnPoints;
    let slot = 0;
    for (let e = 0; e < recipe.servants.length; e++) {
      const entry = recipe.servants[e];
      if (!entry) continue;
      for (let c = 0; c < entry.count; c++) {
        const pt = spawnPoints[slot % spawnPoints.length] ?? { x: 0, z: -4 };
        const glyph = this.createSummonGlyphMesh(pt.x, pt.z);
        this.scene.add(glyph);
        this.activeGlyphs.push({
          mesh: glyph,
          x: pt.x,
          z: pt.z,
          archetype: entry.archetype,
        });
        slot++;
      }
    }
  }

  private createSummonGlyphMesh(x: number, z: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0.05, z);

    const r = SERVANT_CONFIG.summonGlyphRadius;
    const outerGeo = new THREE.RingGeometry(r - 0.14, r, 6);
    const outerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.rotation.x = -Math.PI / 2;
    group.add(outer);

    const innerGeo = new THREE.RingGeometry(r * 0.45, r * 0.56, 6);
    const innerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.iceHighlights,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    group.add(inner);

    const colGeo = new THREE.CylinderGeometry(r * 0.4, r * 0.65, 3.2, 6, 1, true);
    const colMat = new THREE.MeshBasicMaterial({
      color: PALETTE.coldFlame,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.y = 1.6;
    group.add(col);

    group.userData.ownedGeometries = [outerGeo, innerGeo, colGeo];
    group.userData.ownedMaterials = [outerMat, innerMat, colMat];
    return group;
  }

  private clearSummonGlyphs(): void {
    for (let i = 0; i < this.activeGlyphs.length; i++) {
      const g = this.activeGlyphs[i];
      if (!g) continue;
      this.vfx.detachAndDispose(g.mesh);
    }
    this.activeGlyphs.length = 0;
  }

  private spawnWave(waveIndex: number): void {
    const waves = this.getActiveWaves();
    const recipe = waves[waveIndex];
    if (!recipe) return;

    this.currentWaveIndex = waveIndex;
    const spawnPoints = CHAMBER_CONFIG.servantSpawnPoints;
    let slot = 0;
    let spawned = 0;

    if (this.activeGlyphs.length > 0) {
      for (let i = 0; i < this.activeGlyphs.length; i++) {
        const g = this.activeGlyphs[i];
        if (!g) continue;
        this.spawnServant(g.archetype, g.x, g.z, i);
        spawned++;
      }
      this.clearSummonGlyphs();
    } else {
      for (let e = 0; e < recipe.servants.length; e++) {
        const entry = recipe.servants[e];
        if (!entry) continue;
        for (let c = 0; c < entry.count; c++) {
          const pt = spawnPoints[slot % spawnPoints.length] ?? { x: 0, z: 0 };
          this.spawnServant(entry.archetype, pt.x, pt.z, slot);
          slot++;
          spawned++;
        }
      }
    }

    this.audio.playSummonGlyphChime();
    if (this.activeRealm === 2) {
      this.audio.playBubblePop();
    }
    useGameStore
      .getState()
      .setChamberWaveProgress(waveIndex + 1, waves.length, spawned);
  }

  private spawnServant(
    archetype: ServantArchetype,
    x: number,
    z: number,
    slotIndex: number,
  ): void {
    const stats = this.getStatsForArchetype(archetype);
    const hpScale = Math.pow(
      CHAMBER_CONFIG.encoreServantHpMultiplierPerTier,
      this.currentEncoreTier,
    );
    const speedScale = Math.pow(
      CHAMBER_CONFIG.encoreServantSpeedMultiplierPerTier,
      this.currentEncoreTier,
    );
    const maxHp = Math.round(stats.maxHp * hpScale);

    const rig = createServantRig(archetype);
    rig.root.position.set(x, 0, z);
    rig.root.userData.managedByRig = true;
    rig.setSpawnProgress(0);
    this.scene.add(rig.root);

    const entity = this.world.createEntity({
      transform: {
        position: { x, y: 0, z },
        rotationY: 0,
        scale: 1,
      },
      velocity: {
        vx: 0,
        vy: 0,
        vz: 0,
        maxSpeed: stats.moveSpeed * speedScale,
      },
      health: {
        current: maxHp,
        max: maxHp,
        invulnTimer: 0,
        isInvulnerable: false,
      },
      hurtbox: {
        radius: stats.hitRadius,
        minY: 0,
        maxY: stats.hitHeight,
        faction: 'SERVANT',
      },
      servantAI: {
        archetype,
        state: SERVANT_AI_STATES.SPAWNING,
        stateTimer: stats.spawnDuration,
        telegraphTimer: 0,
        guardBrokenTimer: 0,
        spawnProgress: 0,
      },
      meshRef: { object3D: rig.root },
    });

    this.servantRuntimes.set(entity.id, {
      rig,
      archetype,
      animTime: slotIndex * 0.7,
      attackCooldown: 0.7 + (slotIndex % 3) * 0.45,
      lungeDirX: 0,
      lungeDirZ: 1,
      orbitDir: slotIndex % 2 === 0 ? 1 : -1,
      hasDealtAttackDamage: false,
      telegraphMesh: null,
    });

    this.scratchBurst.set(x, 0.5, z);
    this.vfx.spawnFrostShatterBurst(this.scratchBurst, 10, 5.5);
  }

  private spawnSoulWisp(
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    kind: SoulWispKind,
    healValue: number,
  ): void {
    this.scratchOrigin.set(startX, startY, startZ);
    const mesh = this.vfx.createSoulWispGroup(this.scratchOrigin, kind);
    const duration =
      kind === SOUL_WISP_KINDS.HEAL_PLAYER
        ? CHAMBER_CONFIG.soulWispHealLife
        : CHAMBER_CONFIG.soulWispMaxLife;

    this.world.createEntity({
      transform: {
        position: { x: startX, y: startY, z: startZ },
        rotationY: 0,
        scale: 1,
      },
      soulWisp: {
        startPos: { x: startX, y: startY, z: startZ },
        targetPos: { x: targetX, y: targetY, z: targetZ },
        progress: 0,
        duration,
        healValue,
        kind,
      },
      meshRef: { object3D: mesh },
    });
  }

  // =========================================================================
  // MAIN ECS UPDATE LOOP
  // =========================================================================

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();

    if (state === GAME_STATES.PORTAL_TRANSITION) {
      this.updatePortalWarpTransition(dt, elapsed);
      return;
    }

    if (state !== GAME_STATES.CHAMBER_COMBAT) return;

    // 1. Step Wave Escalation Summoning Glyphs (Wave 1 -> Wave 2)
    if (this.pendingWaveIndex !== null) {
      this.waveEscalationTimer -= dt;
      for (let i = 0; i < this.activeGlyphs.length; i++) {
        const g = this.activeGlyphs[i];
        if (g) {
          g.mesh.rotation.y += dt * 2.4;
          const pulse = 0.92 + 0.14 * Math.sin(elapsed * 8.0 + i);
          g.mesh.scale.set(pulse, 1, pulse);
        }
      }
      if (this.waveEscalationTimer <= 0) {
        const waveToSpawn = this.pendingWaveIndex;
        this.pendingWaveIndex = null;
        this.spawnWave(waveToSpawn);
      }
    }

    // 2. Step Homing Soul Wisps (Portal Charge & Urn Healing)
    this.updateSoulWisps(dt, elapsed);

    // 3. Smoothly update Astral Portal visual charge
    this.portalCharge +=
      (this.portalTargetCharge - this.portalCharge) * Math.min(1, dt * 3.5);
    this.icePalace.setPortalCharge(
      this.portalCharge,
      this.portalState === PORTAL_STATES.IGNITED,
      elapsed,
    );

    // 4. Step 4-Servant AI & Rig Animations
    this.updateServantsAI(dt, elapsed);

    // 5. Check Ignited Astral Portal Proximity & [E] Interaction
    this.updatePortalProximity();
  }

  private updateSoulWisps(dt: number, elapsed: number): void {
    const wisps = this.world.query('soulWisp', 'transform', 'meshRef');
    const player = this.world.queryFirst('playerTag', 'transform', 'health');
    const toDestroy: EntityId[] = [];

    for (let i = 0; i < wisps.length; i++) {
      const entity = wisps[i];
      if (!entity) continue;
      const { soulWisp: wisp, transform, meshRef } = entity;

      // Track live Dark Mage chest position for healing wisps
      if (wisp.kind === SOUL_WISP_KINDS.HEAL_PLAYER && player) {
        wisp.targetPos.x = player.transform.position.x;
        wisp.targetPos.y = player.transform.position.y + 1.2;
        wisp.targetPos.z = player.transform.position.z;
      }

      wisp.progress = Math.min(
        1,
        wisp.progress + dt / Math.max(0.1, wisp.duration),
      );
      const t = wisp.progress;
      const ease = t * t * (3 - 2 * t);
      const arcY = Math.sin(t * Math.PI) * CHAMBER_CONFIG.soulWispArcHeight;

      transform.position.x = THREE.MathUtils.lerp(
        wisp.startPos.x,
        wisp.targetPos.x,
        ease,
      );
      transform.position.y =
        THREE.MathUtils.lerp(wisp.startPos.y, wisp.targetPos.y, ease) + arcY;
      transform.position.z = THREE.MathUtils.lerp(
        wisp.startPos.z,
        wisp.targetPos.z,
        ease,
      );

      meshRef.object3D.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      meshRef.object3D.rotation.y = elapsed * 6.0;
      meshRef.object3D.rotation.x = elapsed * 4.5;

      if (t >= 1) {
        if (wisp.kind === SOUL_WISP_KINDS.HEAL_PLAYER && player) {
          player.health.current = Math.min(
            player.health.max,
            player.health.current + wisp.healValue,
          );
          this.scratchBurst.set(
            player.transform.position.x,
            1.2,
            player.transform.position.z,
          );
          this.vfx.spawnImpactBurst(this.scratchBurst, 8);
          this.callbacks.onPlayerHealed();
        } else if (wisp.kind === SOUL_WISP_KINDS.PORTAL_CHARGE) {
          this.vfx.spawnFrostShatterBurst(this.icePalace.portalPosition, 8, 5.0);
        }
        toDestroy.push(entity.id);
      }
    }

    for (let i = 0; i < toDestroy.length; i++) {
      const id = toDestroy[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }
  }

  private updateServantsAI(dt: number, elapsed: number): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
    );
    if (!player) return;

    const pPos = player.transform.position;
    const playerSpeed = Math.hypot(player.velocity.vx, player.velocity.vz);
    const servants = this.world.query(
      'servantAI',
      'transform',
      'velocity',
      'health',
    );
    const deadToCleanup: EntityId[] = [];

    for (let i = 0; i < servants.length; i++) {
      const entity = servants[i];
      if (!entity) continue;
      const runtime = this.servantRuntimes.get(entity.id);
      if (!runtime) continue;

      const { servantAI: ai, transform, velocity } = entity;
      const stats = this.getStatsForArchetype(ai.archetype);
      runtime.animTime += dt;

      // Dying dissolve phase
      if (ai.state === SERVANT_AI_STATES.DYING) {
        ai.stateTimer -= dt;
        runtime.rig.setAnimState(SERVANT_ANIM_STATES.DEAD, runtime.animTime, dt);
        if (ai.stateTimer <= 0) {
          deadToCleanup.push(entity.id);
        }
        continue;
      }

      // Spawning emergence phase
      if (ai.state === SERVANT_AI_STATES.SPAWNING) {
        ai.stateTimer -= dt;
        ai.spawnProgress = THREE.MathUtils.clamp(
          1 - ai.stateTimer / Math.max(0.05, stats.spawnDuration),
          0,
          1,
        );
        runtime.rig.setSpawnProgress(ai.spawnProgress);
        this.faceTarget(transform, pPos.x, pPos.z, dt, stats.turnSpeed);
        runtime.rig.setAnimState(
          SERVANT_ANIM_STATES.SPAWNING,
          runtime.animTime,
          dt,
        );
        if (ai.stateTimer <= 0) {
          ai.spawnProgress = 1;
          runtime.rig.setSpawnProgress(1);
          ai.state = SERVANT_AI_STATES.CHASE;
        }
        continue;
      }

      // Guard Broken stagger phase (Frostbite Warden exposed after shield shatter)
      if (ai.guardBrokenTimer > 0) {
        ai.guardBrokenTimer = Math.max(0, ai.guardBrokenTimer - dt);
        velocity.vx = 0;
        velocity.vz = 0;
        runtime.rig.setAnimState(
          SERVANT_ANIM_STATES.GUARD_BROKEN,
          runtime.animTime,
          dt,
        );
        if (ai.guardBrokenTimer <= 0) {
          runtime.rig.setShieldVisual(true);
          ai.state = SERVANT_AI_STATES.CHASE;
        }
        continue;
      }

      runtime.attackCooldown = Math.max(0, runtime.attackCooldown - dt);
      const dx = pPos.x - transform.position.x;
      const dz = pPos.z - transform.position.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const dirX = dx / dist;
      const dirZ = dz / dist;

      let animState: ServantAnimState = SERVANT_ANIM_STATES.IDLE;

      if (
        ai.archetype === SERVANT_ARCHETYPES.GLACIAL_VANGUARD ||
        ai.archetype === SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE
      ) {
        animState = this.stepGlacialVanguard(
          entity,
          runtime,
          dx,
          dz,
          dist,
          dirX,
          dirZ,
          pPos.x,
          pPos.z,
          dt,
          elapsed,
        );
      } else if (
        ai.archetype === SERVANT_ARCHETYPES.CRYO_ACOLYTE ||
        ai.archetype === SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER
      ) {
        animState = this.stepCryoAcolyte(
          entity,
          runtime,
          dist,
          dirX,
          dirZ,
          pPos.x,
          pPos.z,
          dt,
        );
      } else if (
        ai.archetype === SERVANT_ARCHETYPES.RIME_HOUND ||
        ai.archetype === SERVANT_ARCHETYPES.RAZORFIN_MANTA
      ) {
        animState = this.stepRimeHound(
          entity,
          runtime,
          dist,
          dirX,
          dirZ,
          pPos.x,
          pPos.z,
          playerSpeed,
          dt,
        );
      } else if (
        ai.archetype === SERVANT_ARCHETYPES.FROSTBITE_WARDEN ||
        ai.archetype === SERVANT_ARCHETYPES.CORAL_BASTION
      ) {
        animState = this.stepFrostbiteWarden(
          entity,
          runtime,
          dist,
          dirX,
          dirZ,
          pPos.x,
          pPos.z,
          dt,
        );
      }

      // Sync servant Three.js root transform & run rig animation
      runtime.rig.root.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      runtime.rig.root.rotation.y = transform.rotationY;
      runtime.rig.setAnimState(animState, runtime.animTime, dt);
    }

    for (let i = 0; i < deadToCleanup.length; i++) {
      const id = deadToCleanup[i];
      if (id === undefined) continue;
      const rt = this.servantRuntimes.get(id);
      if (rt) {
        this.clearServantTelegraph(rt);
        rt.rig.dispose();
        this.servantRuntimes.delete(id);
      }
      this.world.destroyEntity(id);
    }
  }

  private faceTarget(
    transform: { position: { x: number; z: number }; rotationY: number },
    tx: number,
    tz: number,
    dt: number,
    turnSpeed: number,
  ): void {
    const dx = tx - transform.position.x;
    const dz = tz - transform.position.z;
    if (dx * dx + dz * dz < 0.01) return;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - transform.rotationY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    transform.rotationY += diff * Math.min(1, dt * turnSpeed);
  }

  // -------------------------------------------------------------------------
  // 1. GLACIAL VANGUARD: Mid-range advance -> ground line telegraph -> lunging thrust
  // -------------------------------------------------------------------------
  private stepGlacialVanguard(
    entity: {
      servantAI: {
        state: string;
        stateTimer: number;
        telegraphTimer: number;
      };
      transform: { position: { x: number; y: number; z: number }; rotationY: number };
      velocity: { vx: number; vz: number; maxSpeed: number };
    },
    runtime: ServantRuntime,
    dx: number,
    dz: number,
    dist: number,
    dirX: number,
    dirZ: number,
    px: number,
    pz: number,
    dt: number,
    elapsed: number,
  ): ServantAnimState {
    const isHoplite =
      runtime.archetype === SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE;
    const stats = isHoplite
      ? SUNKEN_SERVANT_CONFIG.TIDEGUARD_HOPLITE
      : SERVANT_CONFIG.GLACIAL_VANGUARD;
    const { servantAI: ai, transform, velocity } = entity;

    if (ai.state === SERVANT_AI_STATES.TELEGRAPH) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.telegraphTimer -= dt;
      if (runtime.telegraphMesh) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 22);
        const mat = runtime.telegraphMesh.userData.lineMat as
          | THREE.MeshBasicMaterial
          | undefined;
        if (mat) mat.opacity = 0.45 + pulse * 0.4;
      }
      if (ai.telegraphTimer <= 0) {
        this.clearServantTelegraph(runtime);
        ai.state = SERVANT_AI_STATES.ATTACK;
        ai.stateTimer = CHAMBER_CONFIG.vanguardLungeDuration;
        runtime.hasDealtAttackDamage = false;
        if (isHoplite) {
          this.audio.playTidalWave();
        } else {
          this.audio.playIceLance();
        }
      }
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    if (ai.state === SERVANT_AI_STATES.ATTACK) {
      ai.stateTimer -= dt;
      velocity.vx = runtime.lungeDirX * CHAMBER_CONFIG.vanguardLungeSpeed;
      velocity.vz = runtime.lungeDirZ * CHAMBER_CONFIG.vanguardLungeSpeed;

      if (
        !runtime.hasDealtAttackDamage &&
        dist <= CHAMBER_CONFIG.vanguardHitRadius
      ) {
        runtime.hasDealtAttackDamage = true;
        this.callbacks.onPlayerDamaged(stats.damage);
      }

      if (ai.stateTimer <= 0) {
        velocity.vx = 0;
        velocity.vz = 0;
        ai.state = SERVANT_AI_STATES.RECOVER;
        ai.stateTimer = stats.attackRecovery;
        runtime.attackCooldown = stats.attackCooldown;
      }
      return SERVANT_ANIM_STATES.ATTACK;
    }

    if (ai.state === SERVANT_AI_STATES.RECOVER) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.stateTimer -= dt;
      this.faceTarget(transform, px, pz, dt, stats.turnSpeed * 0.6);
      if (ai.stateTimer <= 0) {
        ai.state = SERVANT_AI_STATES.CHASE;
      }
      return SERVANT_ANIM_STATES.IDLE;
    }

    // CHASE -> stop at mid-range and project glowing rectangular lunge telegraph
    this.faceTarget(transform, px, pz, dt, stats.turnSpeed);
    if (dist <= CHAMBER_CONFIG.vanguardMidRange && runtime.attackCooldown <= 0) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.state = SERVANT_AI_STATES.TELEGRAPH;
      ai.telegraphTimer = stats.attackTelegraph;
      runtime.lungeDirX = dirX;
      runtime.lungeDirZ = dirZ;
      transform.rotationY = Math.atan2(dx, dz);
      this.spawnVanguardLineTelegraph(
        runtime,
        transform.position.x,
        transform.position.z,
        transform.rotationY,
      );
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    if (dist > stats.preferredRange) {
      velocity.vx = dirX * velocity.maxSpeed;
      velocity.vz = dirZ * velocity.maxSpeed;
      return SERVANT_ANIM_STATES.MOVE;
    }

    velocity.vx = 0;
    velocity.vz = 0;
    return SERVANT_ANIM_STATES.IDLE;
  }

  private spawnVanguardLineTelegraph(
    runtime: ServantRuntime,
    x: number,
    z: number,
    yaw: number,
  ): void {
    this.clearServantTelegraph(runtime);
    const len = CHAMBER_CONFIG.vanguardTelegraphLength;
    const width = CHAMBER_CONFIG.vanguardTelegraphWidth;
    const group = new THREE.Group();
    group.position.set(x, 0.06, z);
    group.rotation.y = yaw;

    const fillGeo = new THREE.PlaneGeometry(width, len);
    fillGeo.rotateX(-Math.PI / 2);
    fillGeo.translate(0, 0, len * 0.5);
    const lineMat = new THREE.MeshBasicMaterial({
      color: PALETTE.blushCrimson,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(fillGeo, lineMat));

    const borderGeo = new THREE.PlaneGeometry(width + 0.16, len + 0.12);
    borderGeo.rotateX(-Math.PI / 2);
    borderGeo.translate(0, -0.01, len * 0.5);
    const borderMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(borderGeo, borderMat));

    group.userData.lineMat = lineMat;
    group.userData.ownedGeometries = [fillGeo, borderGeo];
    group.userData.ownedMaterials = [lineMat, borderMat];
    this.scene.add(group);
    runtime.telegraphMesh = group;
  }

  private clearServantTelegraph(runtime: ServantRuntime): void {
    if (!runtime.telegraphMesh) return;
    this.vfx.detachAndDispose(runtime.telegraphMesh);
    runtime.telegraphMesh = null;
  }

  // -------------------------------------------------------------------------
  // 2. CRYO ACOLYTE: Lateral float near pillars -> 3-to-5 needle frost fan
  // -------------------------------------------------------------------------
  private stepCryoAcolyte(
    entity: {
      id: EntityId;
      servantAI: {
        state: string;
        stateTimer: number;
        telegraphTimer: number;
      };
      transform: { position: { x: number; y: number; z: number }; rotationY: number };
      velocity: { vx: number; vz: number; maxSpeed: number };
    },
    runtime: ServantRuntime,
    dist: number,
    dirX: number,
    dirZ: number,
    px: number,
    pz: number,
    dt: number,
  ): ServantAnimState {
    const stats =
      runtime.archetype === SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER
        ? SUNKEN_SERVANT_CONFIG.ABYSSAL_SIREN_WEAVER
        : SERVANT_CONFIG.CRYO_ACOLYTE;
    const { servantAI: ai, transform, velocity } = entity;
    this.faceTarget(transform, px, pz, dt, stats.turnSpeed);

    if (ai.state === SERVANT_AI_STATES.TELEGRAPH) {
      velocity.vx *= Math.max(0, 1 - dt * 6);
      velocity.vz *= Math.max(0, 1 - dt * 6);
      ai.telegraphTimer -= dt;
      if (ai.telegraphTimer <= 0) {
        this.fireAcolyteNeedleFan(
          entity.id,
          transform.position.x,
          transform.position.z,
          px,
          pz,
        );
        ai.state = SERVANT_AI_STATES.ATTACK;
        ai.stateTimer = stats.attackRecovery;
        runtime.attackCooldown = stats.attackCooldown;
      }
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    if (ai.state === SERVANT_AI_STATES.ATTACK) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.stateTimer -= dt;
      if (ai.stateTimer <= 0) {
        ai.state = SERVANT_AI_STATES.CHASE;
        runtime.orbitDir = runtime.orbitDir === 1 ? -1 : 1;
      }
      return SERVANT_ANIM_STATES.ATTACK;
    }

    if (dist <= stats.attackRange && runtime.attackCooldown <= 0) {
      ai.state = SERVANT_AI_STATES.TELEGRAPH;
      ai.telegraphTimer = stats.attackTelegraph;
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    // Float laterally near colonnade while maintaining preferred standoff range
    const perpX = -dirZ * runtime.orbitDir;
    const perpZ = dirX * runtime.orbitDir;
    const radialFactor =
      dist > stats.preferredRange + 1.5
        ? 0.75
        : dist < stats.preferredRange - 2.2
          ? -0.65
          : 0;
    velocity.vx =
      dirX * velocity.maxSpeed * radialFactor +
      perpX * CHAMBER_CONFIG.acolyteStrafeSpeed;
    velocity.vz =
      dirZ * velocity.maxSpeed * radialFactor +
      perpZ * CHAMBER_CONFIG.acolyteStrafeSpeed;
    return SERVANT_ANIM_STATES.MOVE;
  }

  private fireAcolyteNeedleFan(
    ownerId: EntityId,
    ox: number,
    oz: number,
    px: number,
    pz: number,
  ): void {
    const runtime = this.servantRuntimes.get(ownerId);
    const isSirenWeaver =
      runtime?.archetype === SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER;
    const stats = isSirenWeaver
      ? SUNKEN_SERVANT_CONFIG.ABYSSAL_SIREN_WEAVER
      : SERVANT_CONFIG.CRYO_ACOLYTE;
    const count =
      this.currentEncoreTier > 0
        ? CHAMBER_CONFIG.acolyteMaxBolts + (isSirenWeaver ? 1 : 0)
        : isSirenWeaver
          ? 5
          : CHAMBER_CONFIG.acolyteMinBolts + (Math.random() > 0.5 ? 2 : 0);
    const baseYaw = Math.atan2(px - ox, pz - oz);
    const halfSpread =
      (isSirenWeaver ? CHAMBER_CONFIG.acolyteFanSpread * 1.45 : CHAMBER_CONFIG.acolyteFanSpread) *
      0.5;
    const spiralTwist =
      isSirenWeaver && runtime ? Math.sin(runtime.animTime * 2.2) * 0.28 : 0;

    for (let i = 0; i < count; i++) {
      const frac = count > 1 ? i / (count - 1) - 0.5 : 0;
      const angle = baseYaw + frac * halfSpread * 2 + spiralTwist;
      const speed = isSirenWeaver
        ? stats.boltSpeed * (0.86 + Math.abs(frac) * 0.34)
        : stats.boltSpeed;
      const vx = Math.sin(angle) * speed;
      const vz = Math.cos(angle) * speed;

      this.scratchOrigin.set(
        ox + Math.sin(angle) * 0.75,
        stats.boltHeight,
        oz + Math.cos(angle) * 0.75,
      );
      this.scratchDir.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
      const boltMesh = this.vfx.createServantBoltGroup(
        this.scratchOrigin,
        this.scratchDir,
      );

      this.world.createEntity({
        transform: {
          position: {
            x: this.scratchOrigin.x,
            y: this.scratchOrigin.y,
            z: this.scratchOrigin.z,
          },
          rotationY: angle,
          scale: 1,
        },
        velocity: {
          vx,
          vy: 0,
          vz,
          maxSpeed: speed,
        },
        projectile: {
          faction: 'SERVANT',
          kind: 'SERVANT_BOLT',
          damage: stats.damage,
          radius: stats.boltRadius,
          life: stats.boltLife,
          maxLife: stats.boltLife,
          trailTimer: 0,
          spinSpeed: 10,
          pierceRemaining: 0,
          hitEntityIds: [],
          state: 'FLY',
          fireDelay: 0,
          fanAngle: 0,
          baseHeight: stats.boltHeight,
          ownerEntityId: ownerId,
        },
        meshRef: { object3D: boltMesh },
      });
    }

    if (isSirenWeaver) {
      this.audio.playBubblePop();
    } else {
      this.audio.playIceLance();
    }
  }

  // -------------------------------------------------------------------------
  // 3. RIME HOUND: Fast flanking circles -> quick telegraphed airborne pounce
  // -------------------------------------------------------------------------
  private stepRimeHound(
    entity: {
      servantAI: {
        state: string;
        stateTimer: number;
        telegraphTimer: number;
      };
      transform: { position: { x: number; y: number; z: number }; rotationY: number };
      velocity: { vx: number; vz: number; maxSpeed: number };
    },
    runtime: ServantRuntime,
    dist: number,
    dirX: number,
    dirZ: number,
    px: number,
    pz: number,
    playerSpeed: number,
    dt: number,
  ): ServantAnimState {
    const stats =
      runtime.archetype === SERVANT_ARCHETYPES.RAZORFIN_MANTA
        ? SUNKEN_SERVANT_CONFIG.RAZORFIN_MANTA
        : SERVANT_CONFIG.RIME_HOUND;
    const { servantAI: ai, transform, velocity } = entity;

    if (ai.state === SERVANT_AI_STATES.TELEGRAPH) {
      velocity.vx = 0;
      velocity.vz = 0;
      this.faceTarget(transform, px, pz, dt, stats.turnSpeed * 1.4);
      ai.telegraphTimer -= dt;
      if (ai.telegraphTimer <= 0) {
        ai.state = SERVANT_AI_STATES.ATTACK;
        ai.stateTimer = stats.lungeDuration;
        runtime.lungeDirX = dirX;
        runtime.lungeDirZ = dirZ;
        runtime.hasDealtAttackDamage = false;
        this.audio.playShadowBlink();
      }
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    if (ai.state === SERVANT_AI_STATES.ATTACK) {
      ai.stateTimer -= dt;
      velocity.vx = runtime.lungeDirX * stats.lungeSpeed;
      velocity.vz = runtime.lungeDirZ * stats.lungeSpeed;

      if (
        !runtime.hasDealtAttackDamage &&
        dist <= CHAMBER_CONFIG.houndPounceHitRadius
      ) {
        runtime.hasDealtAttackDamage = true;
        this.callbacks.onPlayerDamaged(stats.damage);
      }

      if (ai.stateTimer <= 0) {
        velocity.vx = 0;
        velocity.vz = 0;
        ai.state = SERVANT_AI_STATES.RECOVER;
        ai.stateTimer = stats.attackRecovery;
        runtime.attackCooldown = stats.attackCooldown;
        runtime.orbitDir = runtime.orbitDir === 1 ? -1 : 1;
      }
      return SERVANT_ANIM_STATES.ATTACK;
    }

    if (ai.state === SERVANT_AI_STATES.RECOVER) {
      velocity.vx *= Math.max(0, 1 - dt * 8);
      velocity.vz *= Math.max(0, 1 - dt * 8);
      ai.stateTimer -= dt;
      this.faceTarget(transform, px, pz, dt, stats.turnSpeed);
      if (ai.stateTimer <= 0) {
        ai.state = SERVANT_AI_STATES.CHASE;
      }
      return SERVANT_ANIM_STATES.IDLE;
    }

    // Trigger pounce quickly if player holds still within strike range, or when cooldown expires
    const playerHoldingStill = playerSpeed < CHAMBER_CONFIG.houndStillSpeedThreshold;
    const readyToPounce =
      dist <= stats.attackRange &&
      (runtime.attackCooldown <= 0 ||
        (playerHoldingStill && runtime.attackCooldown <= 0.65));

    if (readyToPounce) {
      ai.state = SERVANT_AI_STATES.TELEGRAPH;
      ai.telegraphTimer = stats.attackTelegraph;
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    // Circle rapidly in flanking arcs
    const perpX = -dirZ * runtime.orbitDir;
    const perpZ = dirX * runtime.orbitDir;
    const approach = dist > stats.preferredRange ? 0.68 : -0.18;
    const vx = (dirX * approach + perpX * 0.85) * velocity.maxSpeed;
    const vz = (dirZ * approach + perpZ * 0.85) * velocity.maxSpeed;
    velocity.vx = vx;
    velocity.vz = vz;

    if (vx * vx + vz * vz > 0.05) {
      this.faceTarget(
        transform,
        transform.position.x + vx,
        transform.position.z + vz,
        dt,
        stats.turnSpeed,
      );
    }
    return SERVANT_ANIM_STATES.MOVE;
  }

  // -------------------------------------------------------------------------
  // 4. FROSTBITE WARDEN: Tower-shield advance -> mace slam spawns floor ice pillar
  // -------------------------------------------------------------------------
  private stepFrostbiteWarden(
    entity: {
      servantAI: {
        state: string;
        stateTimer: number;
        telegraphTimer: number;
      };
      transform: { position: { x: number; y: number; z: number }; rotationY: number };
      velocity: { vx: number; vz: number; maxSpeed: number };
    },
    runtime: ServantRuntime,
    dist: number,
    dirX: number,
    dirZ: number,
    px: number,
    pz: number,
    dt: number,
  ): ServantAnimState {
    const isCoralBastion =
      runtime.archetype === SERVANT_ARCHETYPES.CORAL_BASTION;
    const stats = isCoralBastion
      ? SUNKEN_SERVANT_CONFIG.CORAL_BASTION
      : SERVANT_CONFIG.FROSTBITE_WARDEN;
    const slamRadius = isCoralBastion
      ? SUNKEN_SERVANT_CONFIG.CORAL_BASTION.geyserRadius
      : SERVANT_CONFIG.FROSTBITE_WARDEN.slamRadius;
    const { servantAI: ai, transform, velocity } = entity;
    this.faceTarget(transform, px, pz, dt, stats.turnSpeed);

    if (ai.state === SERVANT_AI_STATES.TELEGRAPH) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.telegraphTimer -= dt;
      if (ai.telegraphTimer <= 0) {
        // Heavy slam -> shake + spawn delayed circular floor ice-pillar / boiling geyser under player
        this.callbacks.addCameraShake(stats.slamCameraShake);
        if (isCoralBastion) {
          this.audio.playGeyserErupt();
        } else {
          this.audio.playUmbralPulse();
        }
        this.spawnWardenFloorPillar(px, pz, stats.damage);
        if (dist <= slamRadius) {
          this.callbacks.onPlayerDamaged(stats.damage);
        }
        ai.state = SERVANT_AI_STATES.ATTACK;
        ai.stateTimer = stats.attackRecovery;
        runtime.attackCooldown = stats.attackCooldown;
      }
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    if (ai.state === SERVANT_AI_STATES.ATTACK) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.stateTimer -= dt;
      if (ai.stateTimer <= 0) {
        ai.state = SERVANT_AI_STATES.CHASE;
      }
      return SERVANT_ANIM_STATES.ATTACK;
    }

    if (dist <= CHAMBER_CONFIG.wardenSlamRange && runtime.attackCooldown <= 0) {
      velocity.vx = 0;
      velocity.vz = 0;
      ai.state = SERVANT_AI_STATES.TELEGRAPH;
      ai.telegraphTimer = stats.attackTelegraph;
      return SERVANT_ANIM_STATES.TELEGRAPH;
    }

    if (dist > stats.preferredRange) {
      velocity.vx = dirX * velocity.maxSpeed;
      velocity.vz = dirZ * velocity.maxSpeed;
      return SERVANT_ANIM_STATES.MOVE;
    }

    velocity.vx = 0;
    velocity.vz = 0;
    return SERVANT_ANIM_STATES.IDLE;
  }

  private spawnWardenFloorPillar(tx: number, tz: number, damage: number): void {
    const bounds = this.arena.getArenaBounds();
    let x = tx;
    let z = tz;
    if (bounds.kind === 'RECTANGULAR') {
      x = THREE.MathUtils.clamp(x, bounds.minX + 1.0, bounds.maxX - 1.0);
      z = THREE.MathUtils.clamp(z, bounds.minZ + 1.0, bounds.maxZ - 1.0);
    }

    const radius = CHAMBER_CONFIG.wardenPillarRadius;
    const origin = new THREE.Vector3(x, 0.05, z);
    const pillarGroup = this.vfx.createIcePillarGroup(origin, radius);

    this.world.createEntity({
      transform: {
        position: { x, y: 0.05, z },
        rotationY: 0,
        scale: 1,
      },
      hazardZone: {
        kind: 'ICE_PILLAR',
        faction: 'SERVANT',
        damage,
        elapsed: 0,
        telegraphDuration: CHAMBER_CONFIG.wardenPillarTelegraph,
        activeDuration: CHAMBER_CONFIG.wardenPillarEruptDuration,
        currentRadius: radius,
        maxRadius: radius,
        hitThickness: 0,
        angle: 0,
        startAngle: 0,
        endAngle: 0,
        beamLength: 0,
        hitCooldown: 0,
        hasHitPlayer: false,
        hasTriggered: false,
      },
      meshRef: { object3D: pillarGroup },
    });
  }

  // =========================================================================
  // ASTRAL PORTAL PROXIMITY & WARP TRANSITION
  // =========================================================================

  private updatePortalProximity(): void {
    if (this.portalState !== PORTAL_STATES.IGNITED) {
      if (this.lastNearPortal) {
        this.lastNearPortal = false;
        useGameStore.getState().setNearPortal(false);
      }
      return;
    }

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'playerIntent',
    );
    if (!player) return;

    const pPos = player.transform.position;
    const dist = Math.hypot(
      pPos.x - this.icePalace.portalPosition.x,
      pPos.z - this.icePalace.portalPosition.z,
    );
    const isNear = dist <= this.getActivePortalInteractionRadius();

    if (isNear !== this.lastNearPortal) {
      this.lastNearPortal = isNear;
      useGameStore.getState().setNearPortal(isNear);
    }

    if (
      dist <= CHAMBER_CONFIG.portalTriggerAutoRadius ||
      (isNear && player.playerIntent.portalInteractRequested)
    ) {
      this.startPortalTransition();
    }
  }

  public startPortalTransition(): void {
    if (
      this.portalState !== PORTAL_STATES.IGNITED ||
      this.callbacks.getGameState() !== GAME_STATES.CHAMBER_COMBAT
    ) {
      return;
    }

    this.portalWarpElapsed = 0;
    this.portalSparkTimer = 0;
    this.audio.playPortalWarp();
    if (this.activeRealm === 2) {
      this.audio.playTidalWave();
    }
    this.callbacks.addCameraShake(0.2);
    this.callbacks.setGameState(GAME_STATES.PORTAL_TRANSITION);
    this.callbacks.onPortalWarpStarted();

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.PORTAL_TRANSITION);
    store.setNearPortal(false);
    store.setPortalWarpProgress(0);
  }

  private updatePortalWarpTransition(dt: number, elapsed: number): void {
    this.portalWarpElapsed += dt;
    const t = THREE.MathUtils.clamp(
      this.portalWarpElapsed / this.getActivePortalWarpDuration(),
      0,
      1,
    );

    this.icePalace.setPortalCharge(1.0, true, elapsed);
    useGameStore.getState().setPortalWarpProgress(t);

    const player = this.world.queryFirst('playerTag', 'transform', 'velocity');
    if (player) {
      player.velocity.vx = 0;
      player.velocity.vz = 0;
      const ease = t * t;
      player.transform.position.x = THREE.MathUtils.lerp(
        player.transform.position.x,
        this.icePalace.portalPosition.x,
        Math.min(1, dt * 5),
      );
      player.transform.position.z = THREE.MathUtils.lerp(
        player.transform.position.z,
        this.icePalace.portalPosition.z + 0.6,
        Math.min(1, dt * 5),
      );
      player.transform.position.y = ease * CHAMBER_CONFIG.portalWarpCameraRise;

      this.portalSparkTimer -= dt;
      if (this.portalSparkTimer <= 0) {
        this.portalSparkTimer = 0.06;
        this.scratchBurst.set(
          player.transform.position.x,
          player.transform.position.y + 1.0,
          player.transform.position.z,
        );
        this.vfx.spawnImpactBurst(this.scratchBurst, 6);
        this.vfx.spawnFrostShatterBurst(this.scratchBurst, 6, 6.0);
      }
    }

    if (this.portalWarpElapsed >= CHAMBER_CONFIG.portalWarpDuration) {
      useGameStore.getState().setPortalWarpProgress(0);
      this.callbacks.onPortalWarpComplete();
    }
  }

  public dispose(): void {
    this.cleanupChambers();
  }
}
