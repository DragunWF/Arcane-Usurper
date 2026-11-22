import * as THREE from 'three';
import {
  ARENA_BOUNDS_KINDS,
  BOSS_CONFIG,
  BOSS_PHASES,
  FINISHER_CONFIG,
  FINISHER_MODES,
  FIRST_PERSON_GAZE_CONFIG,
  GAME_STATES,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  SIPHON_BEAM_CONFIG,
  SPECIAL_SCENARIO_CONFIG,
  STOLEN_KISS_CONFIG,
  WOLF_AND_RAVEN_CONFIG,
  type FinisherMode,
  type GameState,
} from '../../config/gameConfig';
import {
  clampPointToCompositeLobby,
  type IArenaGeometry,
} from '../../engine/SceneManager';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { EntityId } from '../components';
import type { ECSWorld, ISystem } from '../World';

export interface IMovementCallbacks {
  getGameState: () => GameState;
  getCameraForwardXZ: (outVec: THREE.Vector3) => THREE.Vector3;
  addCameraShake: (amount: number) => void;
  exitPointerLock: () => void;
  onStaggerProximityChange: (inRange: boolean) => void;
  onFinisherApproachComplete: (
    mode: FinisherMode,
    targetBossEntityId?: EntityId,
  ) => void;
  isBossBlindspotExposed?: (bossEntityId?: EntityId) => boolean;
}

interface FinisherApproachState {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  elapsed: number;
  duration: number;
  afterimageTimer: number;
  mode: FinisherMode;
  targetBossEntityId: EntityId;
}

/**
 * Integrates Player, Boss, Clone, and Projectile velocities, Shadow Blink i-frames,
 * perimeter pillar & arena boundary clamping, and the Stagger approach blink (SRP).
 */
export class MovementSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly arena: IArenaGeometry;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly mageRig: DarkMageRig;
  private readonly callbacks: IMovementCallbacks;

  private finisherApproach: FinisherApproachState | null = null;
  private releasedLockForStagger = false;

  // Reusable scratch vectors (zero per-frame GC churn)
  private readonly vForward = new THREE.Vector3();
  private readonly vRight = new THREE.Vector3();
  private readonly vMove = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);

  public get isFinisherApproaching(): boolean {
    return this.finisherApproach !== null;
  }

  constructor(
    world: ECSWorld,
    arena: IArenaGeometry,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    mageRig: DarkMageRig,
    callbacks: IMovementCallbacks,
  ) {
    this.world = world;
    this.arena = arena;
    this.audio = audio;
    this.vfx = vfx;
    this.mageRig = mageRig;
    this.callbacks = callbacks;
  }

  public resetTransientState(): void {
    this.finisherApproach = null;
    this.releasedLockForStagger = false;
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();

    if (
      state === GAME_STATES.LOBBY ||
      state === GAME_STATES.BOSS_COMBAT ||
      state === GAME_STATES.CHAMBER_COMBAT
    ) {
      this.updatePlayerMovement(dt, state);
      if (state === GAME_STATES.BOSS_COMBAT) {
        this.updateBossMovement(dt, state);
      } else if (state === GAME_STATES.CHAMBER_COMBAT) {
        this.updateServantsMovement(dt);
      }
    } else if (state === GAME_STATES.STAGGER) {
      if (this.finisherApproach) {
        this.updateFinisherApproach(dt);
      } else {
        this.updatePlayerMovement(dt, state);
        this.updateStaggerProximity();
      }
      this.updateBossMovement(dt, state);
    }

    this.updateProjectilesMovement(dt);
    this.updateClonesMovement(dt, elapsed);
  }

  private computeInputMoveDirection(
    forwardInput: number,
    rightInput: number,
    outVec: THREE.Vector3,
  ): THREE.Vector3 {
    outVec.set(0, 0, 0);
    if (forwardInput === 0 && rightInput === 0) return outVec;

    this.callbacks.getCameraForwardXZ(this.vForward);
    this.vRight.crossVectors(this.vForward, this.upAxis).normalize();

    outVec.addScaledVector(this.vForward, forwardInput);
    outVec.addScaledVector(this.vRight, rightInput);
    if (outVec.lengthSq() > 0.0001) {
      outVec.normalize();
    }
    return outVec;
  }

  private updatePlayerMovement(dt: number, state: GameState): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerIntent',
      'playerCombat',
    );
    if (!player) return;

    const { transform, velocity, health, stamina, playerIntent, playerCombat } =
      player;

    // Tick timers & stamina regeneration
    playerCombat.dashCooldown = Math.max(0, playerCombat.dashCooldown - dt);
    playerCombat.boltCooldown = Math.max(0, playerCombat.boltCooldown - dt);
    playerCombat.pulseCooldown = Math.max(0, playerCombat.pulseCooldown - dt);
    playerCombat.aimFaceTimer = Math.max(0, playerCombat.aimFaceTimer - dt);
    health.invulnTimer = Math.max(0, health.invulnTimer - dt);

    if (playerCombat.dashTimer <= 0) {
      stamina.current = Math.min(
        stamina.max,
        stamina.current + stamina.regenRate * dt,
      );
    }

    // Attempt Shadow Blink Dash
    if (
      playerIntent.blinkRequested &&
      playerCombat.dashCooldown <= 0 &&
      playerCombat.dashTimer <= 0 &&
      stamina.current >= PLAYER_CONFIG.dashStaminaCost
    ) {
      stamina.current -= PLAYER_CONFIG.dashStaminaCost;
      playerCombat.dashTimer = PLAYER_CONFIG.dashDuration;
      playerCombat.dashCooldown = PLAYER_CONFIG.dashCooldown;
      playerCombat.afterimageTimer = 0;
      health.invulnTimer = Math.max(
        health.invulnTimer,
        PLAYER_CONFIG.dashInvulnDuration,
      );

      this.computeInputMoveDirection(
        playerIntent.moveForward,
        playerIntent.moveRight,
        this.vMove,
      );
      if (this.vMove.lengthSq() > 0.01) {
        playerCombat.dashDirX = this.vMove.x;
        playerCombat.dashDirZ = this.vMove.z;
      } else {
        // Space-Blink targeting: if a siphonable boss is exposed in BOSS_COMBAT, dash directly toward her
        let aimedExposed = false;
        if (state === GAME_STATES.BOSS_COMBAT) {
          const bosses = this.world.query('bossPhase', 'transform');
          let bestDist = Infinity;
          let targetBx = 0;
          let targetBz = 0;
          for (let i = 0; i < bosses.length; i++) {
            const b = bosses[i];
            if (
              !b ||
              !b.bossPhase.canBeSiphoned ||
              b.bossPhase.isDefeated ||
              b.bossPhase.isStaggered
            ) {
              continue;
            }
            if (this.callbacks.isBossBlindspotExposed?.(b.id)) {
              const d = Math.hypot(
                b.transform.position.x - transform.position.x,
                b.transform.position.z - transform.position.z,
              );
              if (d > 0.35 && d < bestDist) {
                bestDist = d;
                targetBx = b.transform.position.x;
                targetBz = b.transform.position.z;
                aimedExposed = true;
              }
            }
          }
          if (aimedExposed) {
            const dx = targetBx - transform.position.x;
            const dz = targetBz - transform.position.z;
            const len = Math.hypot(dx, dz) || 1;
            playerCombat.dashDirX = dx / len;
            playerCombat.dashDirZ = dz / len;
          }
        }
        if (!aimedExposed) {
          this.callbacks.getCameraForwardXZ(this.vForward);
          playerCombat.dashDirX = this.vForward.x;
          playerCombat.dashDirZ = this.vForward.z;
        }
      }

      transform.rotationY = Math.atan2(
        playerCombat.dashDirX,
        playerCombat.dashDirZ,
      );
      this.mageRig.triggerInvulnFlash(PLAYER_CONFIG.dashInvulnDuration);
      this.vfx.spawnAfterimage(this.mageRig);
      this.audio.playShadowBlink();
      this.callbacks.addCameraShake(PLAYER_CONFIG.dashCameraShake);
    }

    const isDashing = playerCombat.dashTimer > 0;
    health.isInvulnerable = isDashing || health.invulnTimer > 0;

    if (isDashing) {
      playerCombat.dashTimer = Math.max(0, playerCombat.dashTimer - dt);
      velocity.vx = playerCombat.dashDirX * PLAYER_CONFIG.dashSpeed;
      velocity.vz = playerCombat.dashDirZ * PLAYER_CONFIG.dashSpeed;

      playerCombat.afterimageTimer -= dt;
      if (playerCombat.afterimageTimer <= 0) {
        playerCombat.afterimageTimer = PLAYER_CONFIG.afterimageInterval;
        this.vfx.spawnAfterimage(this.mageRig);
      }
    } else if (playerIntent.isFirstPersonGaze) {
      // Planted first-person stance: zero translation, smoothly turn rig to horizontal gaze yaw
      velocity.vx = 0;
      velocity.vz = 0;
      this.callbacks.getCameraForwardXZ(this.vForward);
      const gazeYaw = Math.atan2(this.vForward.x, this.vForward.z);
      let gazeDiff = gazeYaw - transform.rotationY;
      while (gazeDiff > Math.PI) gazeDiff -= Math.PI * 2;
      while (gazeDiff < -Math.PI) gazeDiff += Math.PI * 2;
      transform.rotationY +=
        gazeDiff *
        Math.min(1, dt * FIRST_PERSON_GAZE_CONFIG.transitionLerpSpeed);
    } else {
      this.computeInputMoveDirection(
        playerIntent.moveForward,
        playerIntent.moveRight,
        this.vMove,
      );
      playerCombat.yrdenSlowTimer = Math.max(
        0,
        playerCombat.yrdenSlowTimer - dt,
      );
      const yrdenMult =
        playerCombat.yrdenSlowTimer > 0
          ? WOLF_AND_RAVEN_CONFIG.yrdenSlowFactor
          : 1.0;
      const effectiveWalkSpeed = PLAYER_CONFIG.moveSpeed * yrdenMult;
      const targetVx = this.vMove.x * effectiveWalkSpeed;
      const targetVz = this.vMove.z * effectiveWalkSpeed;
      const accel = Math.min(1, dt * PLAYER_CONFIG.accelLerp);
      velocity.vx += (targetVx - velocity.vx) * accel;
      velocity.vz += (targetVz - velocity.vz) * accel;

      if (this.vMove.lengthSq() > 0.01 && playerCombat.aimFaceTimer <= 0) {
        const targetYaw = Math.atan2(this.vMove.x, this.vMove.z);
        let diff = targetYaw - transform.rotationY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        transform.rotationY +=
          diff * Math.min(1, dt * PLAYER_CONFIG.turnSpeed);
      }
    }

    // Integrate horizontal displacement
    const pos = transform.position;
    pos.x += velocity.vx * dt;
    pos.z += velocity.vz * dt;

    // Resolve collisions against Perimeter Pillars
    const pillars = this.arena.pillarColliders;
    for (let i = 0; i < pillars.length; i++) {
      const pil = pillars[i];
      if (!pil) continue;
      const dx = pos.x - pil.x;
      const dz = pos.z - pil.z;
      const minR = pil.radius + PLAYER_CONFIG.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minR * minR && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        pos.x = pil.x + (dx / dist) * minR;
        pos.z = pil.z + (dz / dist) * minR;
      }
    }

    // Soft body separation from all living Bosses (summit combat & stagger only)
    if (
      state !== GAME_STATES.CHAMBER_COMBAT &&
      state !== GAME_STATES.LOBBY
    ) {
      const bosses = this.world.query('bossPhase', 'transform', 'hurtbox');
      for (let i = 0; i < bosses.length; i++) {
        const boss = bosses[i];
        if (
          !boss ||
          boss.bossPhase.isDefeated ||
          boss.bossPhase.dissolveTimer >= 0
        ) {
          continue;
        }
        const bx = boss.transform.position.x;
        const bz = boss.transform.position.z;
        const dx = pos.x - bx;
        const dz = pos.z - bz;
        const minSep =
          PLAYER_CONFIG.radius +
          boss.hurtbox.radius * BOSS_CONFIG.bodySeparationFactor;
        const distSq = dx * dx + dz * dz;
        if (distSq < minSep * minSep && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          pos.x = bx + (dx / dist) * minSep;
          pos.z = bz + (dz / dist) * minSep;
        }
      }
    }

    // Clamp strictly within active ArenaBounds (rectangular chambers or circular summit)
    this.clampPositionToArenaBounds(pos);
  }

  private clampPositionToArenaBounds(pos: { x: number; z: number }): void {
    const bounds = this.arena.getArenaBounds();
    if (bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR) {
      pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX, bounds.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ, bounds.maxZ);
    } else if (bounds.kind === ARENA_BOUNDS_KINDS.COMPOSITE_LOBBY) {
      clampPointToCompositeLobby(pos, bounds, 0);
    } else {
      const radial = Math.hypot(pos.x, pos.z);
      if (radial > bounds.clampRadius) {
        pos.x = (pos.x / radial) * bounds.clampRadius;
        pos.z = (pos.z / radial) * bounds.clampRadius;
      }
    }
  }

  /**
   * Integrates Chamber Servant velocities, resolves pillar collisions, separates overlapping
   * servants, and clamps every servant inside `SceneManager.getArenaBounds()`.
   */
  private updateServantsMovement(dt: number): void {
    const servants = this.world.query(
      'servantAI',
      'transform',
      'velocity',
      'hurtbox',
    );
    const pillars = this.arena.pillarColliders;

    for (let i = 0; i < servants.length; i++) {
      const entity = servants[i];
      if (!entity) continue;
      const { transform, velocity, hurtbox } = entity;
      const pos = transform.position;

      pos.x += velocity.vx * dt;
      pos.z += velocity.vz * dt;

      // Colonnade pillar & statue repulsion
      for (let j = 0; j < pillars.length; j++) {
        const pil = pillars[j];
        if (!pil) continue;
        const dx = pos.x - pil.x;
        const dz = pos.z - pil.z;
        const minR = pil.radius + hurtbox.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minR * minR && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          pos.x = pil.x + (dx / dist) * minR;
          pos.z = pil.z + (dz / dist) * minR;
        }
      }

      // Soft separation between neighboring servants
      for (let k = i + 1; k < servants.length; k++) {
        const other = servants[k];
        if (!other) continue;
        const dx = pos.x - other.transform.position.x;
        const dz = pos.z - other.transform.position.z;
        const minSep = hurtbox.radius + other.hurtbox.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minSep * minSep && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const push = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          pos.x += nx * push;
          pos.z += nz * push;
          other.transform.position.x -= nx * push;
          other.transform.position.z -= nz * push;
        }
      }

      this.clampPositionToArenaBounds(pos);
    }
  }

  private updateStaggerProximity(): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'playerIntent',
    );
    const bosses = this.world.query('bossPhase', 'siphonableBoss', 'transform');
    if (!player || bosses.length === 0) return;

    // Pick the closest staggered siphonable boss
    let boss = bosses.find(
      (b) =>
        b.bossPhase.canBeSiphoned &&
        b.bossPhase.isStaggered &&
        !b.bossPhase.isDefeated,
    );
    if (!boss) {
      boss = bosses.find(
        (b) => b.bossPhase.canBeSiphoned && !b.bossPhase.isDefeated,
      );
    }
    if (!boss) return;

    const pPos = player.transform.position;
    const bPos = boss.transform.position;
    const dist = Math.hypot(pPos.x - bPos.x, pPos.z - bPos.z);
    const inRange = dist <= boss.siphonableBoss.finisherRange;

    this.callbacks.onStaggerProximityChange(inRange);

    if (inRange && !this.releasedLockForStagger) {
      this.releasedLockForStagger = true;
      this.callbacks.exitPointerLock();
    }

    const wantsBeam = player.playerIntent.beamFinisherExecuteRequested;
    const wantsKiss = player.playerIntent.finisherExecuteRequested;
    if (inRange && (wantsKiss || wantsBeam)) {
      const mode: FinisherMode = wantsBeam
        ? FINISHER_MODES.BEAM
        : FINISHER_MODES.KISS;
      const arrivalDist =
        mode === FINISHER_MODES.BEAM
          ? SIPHON_BEAM_CONFIG.standoffDistance
          : FINISHER_CONFIG.approachArrivalDistance;
      const dirX = dist > 0.05 ? (pPos.x - bPos.x) / dist : 0;
      const dirZ = dist > 0.05 ? (pPos.z - bPos.z) / dist : 1;
      const destPos = {
        x: bPos.x + dirX * arrivalDist,
        z: bPos.z + dirZ * arrivalDist,
      };
      this.clampPositionToArenaBounds(destPos);

      this.callbacks.onStaggerProximityChange(false);
      this.mageRig.triggerInvulnFlash(FINISHER_CONFIG.approachInvulnDuration);
      this.vfx.spawnAfterimage(this.mageRig);

      this.finisherApproach = {
        startX: pPos.x,
        startZ: pPos.z,
        endX: destPos.x,
        endZ: destPos.z,
        elapsed: 0,
        duration: FINISHER_CONFIG.approachDashDuration,
        afterimageTimer: 0.05,
        mode,
        targetBossEntityId: boss.id,
      };
    }
  }

  private updateFinisherApproach(dt: number): void {
    const fd = this.finisherApproach;
    const player = this.world.queryFirst('playerTag', 'transform');
    const boss = fd
      ? this.world.getEntity(fd.targetBossEntityId)
      : this.world.queryFirst('bossPhase', 'transform');
    if (!fd || !player || !boss || !boss.transform) {
      this.finisherApproach = null;
      return;
    }

    fd.elapsed += dt;
    const t = Math.min(1, fd.elapsed / fd.duration);
    const ease = 1 - Math.pow(1 - t, 3);

    player.transform.position.x = THREE.MathUtils.lerp(
      fd.startX,
      fd.endX,
      ease,
    );
    player.transform.position.z = THREE.MathUtils.lerp(
      fd.startZ,
      fd.endZ,
      ease,
    );
    player.transform.rotationY = Math.atan2(
      boss.transform.position.x - player.transform.position.x,
      boss.transform.position.z - player.transform.position.z,
    );

    fd.afterimageTimer -= dt;
    if (fd.afterimageTimer <= 0) {
      fd.afterimageTimer = FINISHER_CONFIG.approachAfterimageInterval;
      this.vfx.spawnAfterimage(this.mageRig);
    }

    if (t >= 1) {
      this.finisherApproach = null;
      // Orient Mage and Boss facing each other intimately
      player.transform.rotationY = Math.atan2(
        boss.transform.position.x - player.transform.position.x,
        boss.transform.position.z - player.transform.position.z,
      );
      boss.transform.rotationY = Math.atan2(
        player.transform.position.x - boss.transform.position.x,
        player.transform.position.z - boss.transform.position.z,
      );
      this.callbacks.onFinisherApproachComplete(fd.mode, fd.targetBossEntityId);
    }
  }

  private updateBossMovement(dt: number, state: GameState): void {
    const bosses = this.world.query('bossPhase', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');
    if (bosses.length === 0 || !player) return;

    const playerPos = player.transform.position;
    const playerCombat = this.world.queryFirst('playerTag', 'playerCombat')
      ?.playerCombat;
    const encoreTier = playerCombat ? playerCombat.encoreTier : 0;
    const encoreSpeedMult = Math.pow(
      NG_PLUS_CONFIG.bossSpeedMultiplierPerTier,
      encoreTier,
    );

    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i];
      if (!boss) continue;
      const { bossPhase, transform } = boss;
      if (bossPhase.isDefeated || bossPhase.dissolveTimer >= 0) continue;

      const bossPos = transform.position;

      // Smoothly face Dark Mage unless locked in Twin Glacial Laser or Miku Crescendo Spotlights
      const lockRotation =
        bossPhase.activePatternId === 'TWIN_GLACIAL_LASER' ||
        bossPhase.activePatternId === 'MIKU_CRESCENDO_OVERDRIVE' ||
        bossPhase.activePatternId === 'YENNEFER_OBSIDIAN_LASERS';
      if (!lockRotation) {
        const dx = playerPos.x - bossPos.x;
        const dz = playerPos.z - bossPos.z;
        if (dx * dx + dz * dz > 0.04) {
          const targetYaw = Math.atan2(dx, dz);
          let diff = targetYaw - transform.rotationY;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const baseTurnSpeed = bossPhase.isStaggered
            ? BOSS_CONFIG.turnSpeedStagger
            : BOSS_CONFIG.turnSpeedCombat;
          const turnSpeed =
            !bossPhase.isStaggered &&
            bossPhase.canBeSiphoned &&
            this.callbacks.isBossBlindspotExposed?.(boss.id)
              ? baseTurnSpeed * STOLEN_KISS_CONFIG.exposedBossTurnScale
              : baseTurnSpeed;
          transform.rotationY += diff * Math.min(1, dt * turnSpeed);
        }
      }

      if (state === GAME_STATES.STAGGER && bossPhase.isStaggered) {
        const lerpFactor = Math.min(1, dt * BOSS_CONFIG.staggerCenterLerp);
        bossPos.x += (0 - bossPos.x) * lerpFactor;
        bossPos.z += (0 - bossPos.z) * lerpFactor;
        continue;
      }

      if (state !== GAME_STATES.BOSS_COMBAT || bossPhase.isStaggered) continue;

      // Sideways / lunge dash burst impulse
      if (bossPhase.dashTimer > 0) {
        bossPhase.dashTimer = Math.max(0, bossPhase.dashTimer - dt);
        bossPos.x += bossPhase.dashVelX * dt;
        bossPos.z += bossPhase.dashVelZ * dt;
        const radial = Math.hypot(bossPos.x, bossPos.z);
        if (radial > BOSS_CONFIG.innerTerraceLimit) {
          bossPos.x = (bossPos.x / radial) * BOSS_CONFIG.innerTerraceLimit;
          bossPos.z = (bossPos.z / radial) * BOSS_CONFIG.innerTerraceLimit;
        }
        continue;
      }

      // Hold steady gracefully during sweeping beam, curtain, or channeled storm patterns
      if (
        bossPhase.activePatternId === 'TWIN_GLACIAL_LASER' ||
        bossPhase.activePatternId === 'SNOWFLAKE_CURTAIN' ||
        bossPhase.activePatternId === 'MIKU_CRESCENDO_OVERDRIVE' ||
        bossPhase.activePatternId === 'YENNEFER_OBSIDIAN_LASERS' ||
        bossPhase.activePatternId === 'YENNEFER_CHAOS_MAELSTROM' ||
        bossPhase.activePatternId === 'GERALT_IGNI_ARC'
      ) {
        continue;
      }

      bossPhase.orbitSwitchTimer -= dt;
      if (bossPhase.orbitSwitchTimer <= 0) {
        const base =
          bossPhase.phase >= BOSS_PHASES.PHASE_2
            ? BOSS_CONFIG.phase2.orbitSwitchBase
            : BOSS_CONFIG.phase1.orbitSwitchBase;
        bossPhase.orbitSwitchTimer =
          base + Math.random() * BOSS_CONFIG.phase1.orbitSwitchJitter;
        bossPhase.orbitDir = bossPhase.orbitDir === 1 ? -1 : 1;
      }

      const speedMult =
        bossPhase.phase === BOSS_PHASES.PHASE_3
          ? BOSS_CONFIG.phase3.moveSpeedMultiplier
          : bossPhase.phase === BOSS_PHASES.PHASE_2
            ? BOSS_CONFIG.phase2.moveSpeedMultiplier
            : 1.0;
      const roleSpeedMult =
        bossPhase.bossId === SPECIAL_SCENARIO_CONFIG.geraltId
          ? WOLF_AND_RAVEN_CONFIG.geraltMoveSpeedMult
          : bossPhase.isSoloEnraged
            ? WOLF_AND_RAVEN_CONFIG.soloEnrageSpeedMult
            : 1.0;
      const effectiveSpeed =
        BOSS_CONFIG.moveSpeed * speedMult * roleSpeedMult * encoreSpeedMult;

      // Geralt closes distance aggressively as Vanguard; Yennefer zones at range
      const isGeralt = bossPhase.bossId === SPECIAL_SCENARIO_CONFIG.geraltId;
      const isYennefer = bossPhase.bossId === SPECIAL_SCENARIO_CONFIG.yenneferId;

      const orbitR = isGeralt
        ? WOLF_AND_RAVEN_CONFIG.geraltVanguardOrbitRadius
        : isYennefer
          ? WOLF_AND_RAVEN_CONFIG.yenneferZoneOrbitRadius
          : !bossPhase.canBeSiphoned
            ? BOSS_CONFIG.orbitRadius * 0.62
            : BOSS_CONFIG.orbitRadius;
      const angularRate =
        (effectiveSpeed / orbitR) * BOSS_CONFIG.orbitAngularFactor;
      bossPhase.orbitAngle += bossPhase.orbitDir * angularRate * dt;

      // Geralt anchors his Vanguard orbit directly around the Dark Mage to apply melee pressure
      const orbitCenterX = isGeralt ? playerPos.x : 0;
      const orbitCenterZ = isGeralt ? playerPos.z : 0;
      const desiredX = orbitCenterX + Math.sin(bossPhase.orbitAngle) * orbitR;
      const desiredZ = orbitCenterZ + Math.cos(bossPhase.orbitAngle) * orbitR;

      const toBossX = bossPos.x - playerPos.x;
      const toBossZ = bossPos.z - playerPos.z;
      const distToPlayer = Math.hypot(toBossX, toBossZ) || 1;
      let pushX = 0;
      let pushZ = 0;
      const personalSpace = isGeralt
        ? WOLF_AND_RAVEN_CONFIG.geraltVanguardPersonalSpace
        : isYennefer
          ? WOLF_AND_RAVEN_CONFIG.yenneferZonePersonalSpace
          : !bossPhase.canBeSiphoned
            ? BOSS_CONFIG.personalSpaceRadius * 0.52
            : BOSS_CONFIG.personalSpaceRadius;
      if (distToPlayer < personalSpace) {
        pushX = (toBossX / distToPlayer) * BOSS_CONFIG.personalSpacePush;
        pushZ = (toBossZ / distToPlayer) * BOSS_CONFIG.personalSpacePush;
      }

      const stepX = desiredX + pushX - bossPos.x;
      const stepZ = desiredZ + pushZ - bossPos.z;
      const stepLen = Math.hypot(stepX, stepZ);
      if (stepLen > 0.05) {
        const moveDist = Math.min(stepLen, effectiveSpeed * dt);
        bossPos.x += (stepX / stepLen) * moveDist;
        bossPos.z += (stepZ / stepLen) * moveDist;
      }

      const radial = Math.hypot(bossPos.x, bossPos.z);
      if (radial > BOSS_CONFIG.innerTerraceLimit) {
        bossPos.x = (bossPos.x / radial) * BOSS_CONFIG.innerTerraceLimit;
        bossPos.z = (bossPos.z / radial) * BOSS_CONFIG.innerTerraceLimit;
      }
    }

    // Soft Boss-to-Boss separation for multi-boss encounters (2 to 4+ simultaneous bosses)
    if (bosses.length > 1) {
      const minSep = SPECIAL_SCENARIO_CONFIG.bossToBossMinSeparation;
      for (let i = 0; i < bosses.length; i++) {
        const a = bosses[i];
        if (!a || a.bossPhase.isDefeated || a.bossPhase.dissolveTimer >= 0) continue;
        for (let j = i + 1; j < bosses.length; j++) {
          const b = bosses[j];
          if (!b || b.bossPhase.isDefeated || b.bossPhase.dissolveTimer >= 0) continue;
          const dx = a.transform.position.x - b.transform.position.x;
          const dz = a.transform.position.z - b.transform.position.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < minSep * minSep && dSq > 0.0001) {
            const d = Math.sqrt(dSq);
            const push = (minSep - d) * 0.5;
            const nx = dx / d;
            const nz = dz / d;
            a.transform.position.x += nx * push;
            a.transform.position.z += nz * push;
            b.transform.position.x -= nx * push;
            b.transform.position.z -= nz * push;
          }
        }
      }
    }
  }

  private updateProjectilesMovement(dt: number): void {
    const projectiles = this.world.query('projectile', 'transform', 'velocity');
    const player = this.world.queryFirst('playerTag', 'transform');
    const boss = this.world.queryFirst('bossPhase');
    const bossPhaseLevel = boss ? boss.bossPhase.phase : BOSS_PHASES.PHASE_1;

    for (let i = 0; i < projectiles.length; i++) {
      const entity = projectiles[i];
      if (!entity) continue;
      const { projectile, transform, velocity } = entity;

      if (projectile.state === 'HOVER') {
        projectile.fireDelay -= dt;

        const owner =
          projectile.ownerEntityId !== null
            ? this.world.getEntity(projectile.ownerEntityId)
            : undefined;
        if (owner && owner.transform) {
          const oPos = owner.transform.position;
          const oYaw = owner.transform.rotationY;
          const rightX = Math.cos(oYaw);
          const rightZ = -Math.sin(oYaw);
          const backX = -Math.sin(oYaw);
          const backZ = -Math.cos(oYaw);

          const spreadX =
            Math.sin(projectile.fanAngle) *
            BOSS_CONFIG.phase1.lanceSpreadRadius;
          const spreadY =
            projectile.baseHeight +
            Math.cos(projectile.fanAngle) *
              BOSS_CONFIG.phase1.lanceArcHeightBoost;

          transform.position.x =
            oPos.x +
            rightX * spreadX +
            backX * BOSS_CONFIG.phase1.lanceBackOffset;
          transform.position.y = spreadY;
          transform.position.z =
            oPos.z +
            rightZ * spreadX +
            backZ * BOSS_CONFIG.phase1.lanceBackOffset;
        }

        if (projectile.fireDelay <= 0) {
          projectile.state = 'FLY';
          const speed =
            bossPhaseLevel >= BOSS_PHASES.PHASE_2
              ? BOSS_CONFIG.phase1.lanceSpeedP2Plus
              : BOSS_CONFIG.phase1.lanceSpeedP1;
          const tx = player ? player.transform.position.x : 0;
          const ty = 1.15;
          const tz = player ? player.transform.position.z : 0;
          const dx = tx - transform.position.x;
          const dy = ty - transform.position.y;
          const dz = tz - transform.position.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          velocity.vx = (dx / len) * speed;
          velocity.vy = (dy / len) * speed;
          velocity.vz = (dz / len) * speed;
          velocity.maxSpeed = speed;
        }
      } else {
        projectile.life -= dt;
        transform.position.x += velocity.vx * dt;
        transform.position.y += velocity.vy * dt;
        transform.position.z += velocity.vz * dt;
      }
    }
  }

  private updateClonesMovement(_dt: number, elapsed: number): void {
    const clones = this.world.query('cloneIllusion', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');
    if (!player) return;

    const pPos = player.transform.position;
    for (let i = 0; i < clones.length; i++) {
      const cl = clones[i];
      if (!cl) continue;
      cl.transform.position.y =
        Math.sin(elapsed * 3.4 + cl.cloneIllusion.side) * 0.08;
      const dx = pPos.x - cl.transform.position.x;
      const dz = pPos.z - cl.transform.position.z;
      if (dx * dx + dz * dz > 0.04) {
        cl.transform.rotationY = Math.atan2(dx, dz);
      }
    }
  }
}
