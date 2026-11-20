import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_CONFIG,
  GAME_STATES,
  PLAYER_CONFIG,
  SERENA_CONFIG,
  type GameState,
} from '../../config/gameConfig';
import type { SceneManager } from '../../engine/SceneManager';
import type {
  AbyssalWhirlpoolMeshHandles,
  FrostRingMeshHandles,
  IcePillarMeshHandles,
  IVfxSpawner,
  LaserMeshHandles,
  PhaseWaveMeshHandles,
  PulseMeshHandles,
} from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
import { useGameStore } from '../../state/useGameStore';
import type { ECSWorld, ISystem } from '../World';

export interface IRenderSyncCallbacks {
  getGameState: () => GameState;
  isFinisherApproaching: () => boolean;
}

/**
 * Sole system mutating THREE.Object3D transforms from ECS components during combat,
 * driving rig animations, stepping transient VFX & arena atmosphere, and pushing
 * throttled (~20 Hz) telemetry snapshots to the Zustand HUD store (SRP).
 */
export class RenderSyncSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly sceneManager: SceneManager;
  private readonly vfx: IVfxSpawner;
  private readonly mageRig: DarkMageRig;
  private bossRig: BossRigAdapter;
  private readonly callbacks: IRenderSyncCallbacks;

  private hudSyncAccum = 0;
  private readonly scratchTarget = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    sceneManager: SceneManager,
    vfx: IVfxSpawner,
    mageRig: DarkMageRig,
    bossRig: BossRigAdapter,
    callbacks: IRenderSyncCallbacks,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.vfx = vfx;
    this.mageRig = mageRig;
    this.bossRig = bossRig;
    this.callbacks = callbacks;
  }

  public setBossRig(rig: BossRigAdapter): void {
    this.bossRig = rig;
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();

    // 1. Update Glacial Spire atmosphere (snow, aurora ribbons, floor rune rings)
    this.sceneManager.update(dt, elapsed);

    const isDioramaOrFinisher =
      state === GAME_STATES.SIPHON_FINISHER ||
      state === GAME_STATES.LOBBY_SIPHON ||
      state === GAME_STATES.VICTORY_DIORAMA ||
      state === GAME_STATES.ENDLESS_SAVOR ||
      state === GAME_STATES.DEFEAT_DIORAMA;

    // 2. Sync Player Rig Transform & Stride / Staff Animation (yields to Finisher/Diorama poses)
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'playerCombat',
    );
    if (player && !isDioramaOrFinisher) {
      const pPos = player.transform.position;
      this.mageRig.root.position.set(pPos.x, pPos.y, pPos.z);
      this.mageRig.root.rotation.y = player.transform.rotationY;

      const approaching = this.callbacks.isFinisherApproaching();
      const isActiveLocomotion =
        state === GAME_STATES.LOBBY ||
        state === GAME_STATES.BOSS_COMBAT ||
        state === GAME_STATES.CHAMBER_COMBAT ||
        state === GAME_STATES.STAGGER;

      if (approaching) {
        this.mageRig.update(dt, elapsed, 1.0, true);
      } else if (isActiveLocomotion) {
        const horizSpeed = Math.hypot(player.velocity.vx, player.velocity.vz);
        const speedRatio = horizSpeed / PLAYER_CONFIG.moveSpeed;
        const isDashing = player.playerCombat.dashTimer > 0;
        this.mageRig.update(dt, elapsed, speedRatio, isDashing);
      } else {
        this.mageRig.update(dt, elapsed, 0, false);
      }
    }

    // 3. Sync Boss Rig Transform & Procedural Pose (hidden in Title/Lobby/LobbySiphon/Chambers, yields to Finisher/Diorama)
    const isBossHiddenState =
      state === GAME_STATES.TITLE ||
      state === GAME_STATES.LOBBY ||
      state === GAME_STATES.LOBBY_SIPHON ||
      state === GAME_STATES.CHAMBER_COMBAT ||
      state === GAME_STATES.PORTAL_TRANSITION;
    this.bossRig.root.visible = !isBossHiddenState;

    const boss = this.world.queryFirst('bossPhase', 'transform');
    if (boss && !isDioramaOrFinisher && !isBossHiddenState) {
      const bPos = boss.transform.position;
      this.bossRig.root.position.set(bPos.x, bPos.y, bPos.z);
      this.bossRig.root.rotation.y = boss.transform.rotationY;
      this.bossRig.updateCombatPose(dt, state, elapsed, null);
    }

    // 4. Sync Clone Illusion Transforms
    const clones = this.world.query('cloneIllusion', 'transform', 'meshRef');
    for (let i = 0; i < clones.length; i++) {
      const cl = clones[i];
      if (!cl) continue;
      const obj = cl.meshRef.object3D;
      obj.position.set(
        cl.transform.position.x,
        cl.transform.position.y,
        cl.transform.position.z,
      );
      obj.rotation.y = cl.transform.rotationY;
    }

    // 5. Sync Projectile Transforms & Visual Rotations
    const projectiles = this.world.query('projectile', 'transform', 'meshRef');
    const playerPos = player?.transform.position;

    for (let i = 0; i < projectiles.length; i++) {
      const entity = projectiles[i];
      if (!entity) continue;
      const { projectile, transform, meshRef } = entity;
      const obj = meshRef.object3D;
      obj.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );

      if (
        projectile.kind === 'VOID_BOLT' ||
        projectile.kind === 'USURPED_BEAM' ||
        projectile.kind === 'SERVANT_BOLT'
      ) {
        obj.rotateZ(dt * projectile.spinSpeed);
      } else if (projectile.kind === 'ICE_LANCE') {
        if (projectile.state === 'HOVER' && playerPos) {
          this.scratchTarget.set(playerPos.x, 1.15, playerPos.z);
          obj.lookAt(this.scratchTarget);
          obj.rotateZ(dt * BOSS_CONFIG.phase1.lanceHoverSpinSpeed);
        } else {
          obj.rotateZ(dt * projectile.spinSpeed);
        }
      } else if (projectile.kind === 'GLACIAL_CRESCENT') {
        obj.rotation.y = transform.rotationY;
      }
    }

    // 6. Sync Hazard Zones (Umbral Pulse, Frost Ring Nova, Twin Lasers, Ice Pillars, Phase Shockwaves)
    const hazards = this.world.query('hazardZone', 'transform', 'meshRef');
    for (let i = 0; i < hazards.length; i++) {
      const entity = hazards[i];
      if (!entity) continue;
      const { hazardZone: hz, transform, meshRef } = entity;
      const obj = meshRef.object3D;
      obj.position.set(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );

      if (hz.kind === 'UMBRAL_PULSE') {
        const t = THREE.MathUtils.clamp(hz.elapsed / hz.activeDuration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 2.5);
        const scale = THREE.MathUtils.lerp(
          PLAYER_CONFIG.pulseStartScale,
          hz.maxRadius,
          ease,
        );
        obj.scale.set(scale, 1.0, scale);
        obj.rotation.y += dt * PLAYER_CONFIG.pulseSpinSpeed;

        const handles = obj.userData.pulseHandles as
          | PulseMeshHandles
          | undefined;
        if (handles) {
          const fade = Math.pow(1 - t, 1.4);
          handles.ringMat.opacity = fade * 0.92;
          handles.torusMat.opacity = fade * 0.85;
          handles.flashLight.intensity = fade * 12.0;
        }
      } else if (hz.kind === 'PHASE_SHOCKWAVE') {
        const t = THREE.MathUtils.clamp(hz.elapsed / hz.activeDuration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        const scale = 0.8 + ease * hz.maxRadius;
        obj.scale.set(scale, 0.7 + ease * 4.5, scale);

        const handles = obj.userData.phaseWaveHandles as
          | PhaseWaveMeshHandles
          | undefined;
        if (handles) {
          const fade = Math.pow(1 - t, 1.5);
          handles.ringMat.opacity = fade * 0.95;
          handles.domeMat.opacity = fade * 0.45;
          handles.flashLight.intensity = fade * 15.0;
        }
      } else if (hz.kind === 'FROST_RING_NOVA') {
        const t = THREE.MathUtils.clamp(hz.elapsed / hz.activeDuration, 0, 1);
        obj.scale.set(hz.currentRadius, 1.0, hz.currentRadius);
        obj.rotation.y -= dt * BOSS_CONFIG.phase1.novaSpinSpeed;

        const handles = obj.userData.frostRingHandles as
          | FrostRingMeshHandles
          | undefined;
        if (handles) {
          const fade = Math.pow(1 - t, 1.25);
          handles.ringMat.opacity = fade * 0.95;
          handles.wallMat.opacity = fade * 0.78;
        }
      } else if (hz.kind === 'GLACIAL_LASER') {
        obj.rotation.y = hz.angle;
        const handles = obj.userData.laserHandles as
          | LaserMeshHandles
          | undefined;
        if (handles) {
          if (hz.elapsed < hz.telegraphDuration) {
            const p = hz.elapsed / Math.max(0.001, hz.telegraphDuration);
            handles.telegraphMat.opacity = 0.45 + 0.5 * Math.sin(p * Math.PI * 6);
          } else {
            handles.telegraphMesh.visible = false;
            handles.coreMesh.visible = true;
            handles.outerMesh.visible = true;
            handles.muzzleMesh.visible = true;

            const t = THREE.MathUtils.clamp(
              (hz.elapsed - hz.telegraphDuration) /
                Math.max(0.001, hz.activeDuration),
              0,
              1,
            );
            const tailFade =
              t > BOSS_CONFIG.phase2.laserTailFadeStart
                ? (1 - t) / (1 - BOSS_CONFIG.phase2.laserTailFadeStart)
                : 1.0;
            const pulse = 0.92 + 0.14 * Math.sin(hz.elapsed * 32);
            handles.coreMesh.scale.set(pulse * tailFade, pulse * tailFade, 1);
            handles.outerMesh.scale.set(pulse * tailFade, pulse * tailFade, 1);
            handles.coreMat.opacity = 0.96 * tailFade;
            handles.outerMat.opacity = 0.56 * tailFade;
          }
        }
      } else if (hz.kind === 'ICE_PILLAR') {
        const handles = obj.userData.pillarHandles as
          | IcePillarMeshHandles
          | undefined;
        if (handles && hz.elapsed >= 0) {
          if (hz.elapsed < hz.telegraphDuration) {
            const p = hz.elapsed / Math.max(0.001, hz.telegraphDuration);
            handles.fillDisc.scale.setScalar(0.06 + p * 0.94);
            handles.runeRing.rotation.z += dt * (1.8 + p * 3.2);
            handles.runeMat.opacity = 0.65 + 0.35 * Math.sin(p * Math.PI * 5);
            handles.fillMat.opacity = 0.22 + p * 0.36;
          } else {
            handles.spireGroup.visible = true;
            handles.fillDisc.visible = false;
            const et = THREE.MathUtils.clamp(
              (hz.elapsed - hz.telegraphDuration) /
                Math.max(0.001, hz.activeDuration),
              0,
              1,
            );
            const rise = Math.min(1, et / 0.22);
            const easeRise = 1 - Math.pow(1 - rise, 3);
            handles.spireGroup.scale.set(1, Math.max(0.05, easeRise), 1);

            if (et > 0.65) {
              const fade = (1 - et) / 0.35;
              handles.spireMat.opacity = 0.78 * fade;
              handles.coreMat.opacity = 0.62 * fade;
              handles.runeMat.opacity = 0.85 * fade;
            }
          }
        }
      } else if (hz.kind === 'ABYSSAL_WHIRLPOOL') {
        const handles = obj.userData.whirlpoolHandles as
          | AbyssalWhirlpoolMeshHandles
          | undefined;
        if (handles) {
          const t = THREE.MathUtils.clamp(
            hz.elapsed / Math.max(0.001, hz.activeDuration),
            0,
            1,
          );
          const fadeIn = Math.min(1, t / 0.14);
          const fadeOut = t > 0.82 ? (1 - t) / 0.18 : 1;
          const env = fadeIn * fadeOut;

          const spin = SERENA_CONFIG.abyssalUndertow.whirlpoolSpinSpeed;
          handles.outerRing.rotation.z -= dt * spin;
          handles.midRing.rotation.z += dt * spin * 1.45;
          handles.innerRing.rotation.z -= dt * spin * 2.1;

          const pulse = 0.92 + 0.12 * Math.sin(hz.elapsed * 6.5);
          handles.outerMat.opacity = 0.55 * env * pulse;
          handles.midMat.opacity = 0.48 * env;
          handles.innerMat.opacity = 0.72 * env * pulse;
          handles.vortexLight.intensity = 10.5 * env * pulse;
        }
      }
    }

    // 7. Update Transient Sparks, Frost Shards, Afterimages, and Floor Telegraphs
    this.vfx.updateTransientVfx(dt);

    // 8. Push Throttled (~20 Hz) Snapshot to Zustand Store for React HUD
    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= ARENA_CONFIG.hudSyncIntervalSec) {
      this.hudSyncAccum = 0;
      this.flushHudSnapshot();
    }
  }

  public flushHudSnapshot(): void {
    const player = this.world.queryFirst(
      'playerTag',
      'health',
      'stamina',
      'playerCombat',
    );
    const boss = this.world.queryFirst('bossPhase', 'health', 'siphonableBoss');

    useGameStore.getState().syncCombatSnapshot({
      playerHp: player?.health.current,
      playerMaxHp: player?.health.max,
      playerStamina: player?.stamina.current,
      playerMaxStamina: player?.stamina.max,
      dashCooldown: player?.playerCombat.dashCooldown,
      pulseCooldown: player?.playerCombat.pulseCooldown,
      bossHp: boss?.health.current,
      bossMaxHp: boss?.health.max,
      siphonProgress: boss?.siphonableBoss.siphonProgress,
      tauntDizzyTimer: boss?.siphonableBoss.tauntDizzyTimer,
    });
  }
}
