import * as THREE from 'three';
import {
  ARENA_CONFIG,
  PALETTE,
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  type ServantAnimState,
  type ServantArchetype,
} from '../../config/gameConfig';
import {
  ToonAssets,
  type OutlineScale,
  type OutlinedMeshResult,
  type ToonMaterialOptions,
} from '../../engine/ToonAssets';

export {
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  type ServantAnimState,
  type ServantArchetype,
};

/**
 * Standardized Servant Rig contract honored by every chamber enemy archetype
 * (Glacial Vanguard, Cryo Acolyte, Rime Hound, Frostbite Warden) for strict LSP.
 */
export interface ServantRigAdapter {
  readonly archetype: ServantArchetype;
  readonly root: THREE.Group;
  setAnimState(state: ServantAnimState, phaseTime: number, dt: number): void;
  triggerHitFlash(): void;
  setShieldVisual(active: boolean): void;
  setSpawnProgress(t: number): void;
  dispose(): void;
}

interface FlashMaterialRecord {
  readonly mat: THREE.MeshToonMaterial;
  readonly baseEmissive: THREE.Color;
  readonly baseEmissiveIntensity: number;
}

const HIT_FLASH_WHITE_CYAN = new THREE.Color(PALETTE.iceHighlights);
const HIT_FLASH_CYAN_CORE = new THREE.Color(PALETTE.frostRunes);

/**
 * Shared cel-shaded rig foundation providing uniform MeshToonMaterial + ink-black
 * BackSide outline construction, instant white/cyan hit-flash decay, spawn emergence
 * interpolation, and deterministic geometry/material disposal (SRP & DRY).
 */
export abstract class BaseServantRig implements ServantRigAdapter {
  public abstract readonly archetype: ServantArchetype;
  public readonly root = new THREE.Group();
  protected readonly visualRoot = new THREE.Group();

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly flashRecords: FlashMaterialRecord[] = [];

  private hitFlashTimer = 0;
  protected spawnProgress = 1;
  protected shieldActive = true;

  constructor(uniformScale = 1.0) {
    this.root.add(this.visualRoot);
    if (uniformScale !== 1.0) {
      this.visualRoot.scale.setScalar(uniformScale);
    }
  }

  protected trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  protected trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  /**
   * Creates a tracked cel-shaded MeshToonMaterial registered for instant white/cyan hit-flash.
   */
  protected createToonMat(
    color: number,
    options: ToonMaterialOptions = {},
    registerHitFlash = true,
  ): THREE.MeshToonMaterial {
    const mat = this.trackMat(ToonAssets.createToonMaterial(color, options));
    if (registerHitFlash) {
      this.flashRecords.push({
        mat,
        baseEmissive: mat.emissive.clone(),
        baseEmissiveIntensity: mat.emissiveIntensity,
      });
    }
    return mat;
  }

  /**
   * Creates a tracked MeshBasicMaterial for glowing eyes, runes, and translucent frost accents.
   */
  protected createGlowMat(
    color: number,
    options: {
      transparent?: boolean;
      opacity?: number;
      side?: THREE.Side;
      additive?: boolean;
    } = {},
  ): THREE.MeshBasicMaterial {
    return this.trackMat(
      new THREE.MeshBasicMaterial({
        color,
        transparent: Boolean(options.transparent),
        opacity: options.opacity !== undefined ? options.opacity : 1.0,
        side: options.side !== undefined ? options.side : THREE.FrontSide,
        blending: options.additive
          ? THREE.AdditiveBlending
          : THREE.NormalBlending,
        depthWrite: !options.additive && !options.transparent,
      }),
    );
  }

  /**
   * Creates a cel-shaded mesh paired with a uniform ink-black BackSide outline and tracks geometry.
   */
  protected createOutlined(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    outlineScale: OutlineScale = ARENA_CONFIG.defaultOutlineScale,
    castShadow = true,
  ): OutlinedMeshResult {
    this.trackGeo(geometry);
    return ToonAssets.createOutlinedMesh(
      geometry,
      material,
      outlineScale,
      castShadow,
    );
  }

  protected lerpFactor(
    dt: number,
    speed: number = SERVANT_CONFIG.rigPoseLerpSpeed,
  ): number {
    return 1 - Math.exp(-Math.max(0, dt) * speed);
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = SERVANT_CONFIG.hitFlashDuration;
    this.applyHitFlashVisual(1.0);
  }

  protected updateHitFlash(dt: number): void {
    if (this.hitFlashTimer <= 0) return;
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    const ratio = this.hitFlashTimer / Math.max(0.001, SERVANT_CONFIG.hitFlashDuration);
    this.applyHitFlashVisual(ratio);
  }

  private applyHitFlashVisual(intensityRatio: number): void {
    const t = THREE.MathUtils.clamp(intensityRatio, 0, 1);
    for (let i = 0; i < this.flashRecords.length; i++) {
      const rec = this.flashRecords[i];
      if (!rec) continue;
      if (t <= 0.001) {
        rec.mat.emissive.copy(rec.baseEmissive);
        rec.mat.emissiveIntensity = rec.baseEmissiveIntensity;
      } else {
        rec.mat.emissive
          .copy(HIT_FLASH_CYAN_CORE)
          .lerp(HIT_FLASH_WHITE_CYAN, t);
        rec.mat.emissiveIntensity = THREE.MathUtils.lerp(
          rec.baseEmissiveIntensity,
          SERVANT_CONFIG.hitFlashEmissiveIntensity,
          t,
        );
      }
    }
  }

  /**
   * Smoothly scales and raises the servant from its summoning glyph (`t` in `[0, 1]`).
   */
  public setSpawnProgress(t: number): void {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    this.spawnProgress = clamped;
    const ease = 1 - Math.pow(1 - clamped, 3);
    const baseScale = this.getBaseScale();
    const s = THREE.MathUtils.lerp(
      SERVANT_CONFIG.spawnScaleMin,
      1.0,
      ease,
    );
    this.visualRoot.scale.set(
      baseScale * s,
      baseScale * THREE.MathUtils.lerp(0.25, 1.0, ease),
      baseScale * s,
    );
    this.visualRoot.position.y = -(1 - ease) * SERVANT_CONFIG.spawnRiseOffset;
  }

  public setShieldVisual(active: boolean): void {
    this.shieldActive = active;
    this.onShieldVisualChanged(active);
  }

  protected getBaseScale(): number {
    return 1.0;
  }

  protected onShieldVisualChanged(_active: boolean): void {
    // Default no-op for non-shielded archetypes; overridden by shielded rigs
  }

  public setAnimState(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    this.updateHitFlash(dt);
    this.updateArchetypeAnim(state, phaseTime, dt);
  }

  protected abstract updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void;

  public dispose(): void {
    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i]?.dispose();
    }
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]?.dispose();
    }
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.flashRecords.length = 0;
  }
}
