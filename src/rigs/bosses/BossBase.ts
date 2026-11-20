import * as THREE from 'three';
import {
  PALETTE,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';

/**
 * Standardized Boss Rig contract honored by every sovereign boss (Marina, Miku, Mermaid).
 * Guarantees Liskov Substitution across FinisherSystem, DioramaSystem, and RenderSyncSystem
 * with zero boss-specific branching.
 */
export interface BossRigAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly title: string;
  readonly root: THREE.Group;
  /** World/local lip-contact & camera focus target anchor. */
  readonly headAnchor: THREE.Object3D;
  /** Crown, tiara, hair-clips, or shell ornament target for the [F] flick taunt. */
  readonly headAccessory: THREE.Object3D;
  /** Materials that smoothly bleach to PALETTE.drainedAshSilver (#94A3B8) as drain progresses 0 -> 1. */
  readonly drainableMaterials: THREE.MeshToonMaterial[];
  /** Cached initial material diffuse colors aligned 1:1 with drainableMaterials. */
  readonly originalColors: THREE.Color[];

  setExpression(expression: BossExpression, spiralPhase?: number): void;
  setPhaseVisuals(phase: BossPhase): void;
  setAscendHeight(extraY: number): void;
  triggerHitFlash(): void;
  triggerCastFlourish(): void;
  triggerAccessoryFlick(): void;
  getLeftHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3;
  getRightHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3;
  updateCombatPose(
    dt: number,
    state: GameState,
    elapsed: number,
    staggerProgressOverride?: number | null,
  ): void;
  applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt?: number,
    throttleMode?: DrainThrottleMode,
  ): void;
  applyVictoryCollapsePose(time: number): void;
  applyPuppetMasterPose(time: number): void;
  applyDrainBleach(drainProgress: number): void;
  resetForEncounter(encoreTier: number): void;
  dispose(): void;
}

export interface MaterialBleachMetadata {
  readonly originalEmissive: THREE.Color;
  readonly originalEmissiveIntensity: number;
}

const ASH_SILVER_COLOR = new THREE.Color(PALETTE.drainedAshSilver);
const ZERO_EMISSIVE_COLOR = new THREE.Color(PALETTE.pureBlack);

/**
 * Smoothly bleaches a boss's drainable MeshToonMaterials from their cached original colors
 * to PALETTE.drainedAshSilver (#94A3B8) while damping emissive luminance to 0 at 100% drain.
 */
export function applyMaterialBleach(
  materials: readonly THREE.MeshToonMaterial[],
  originalColors: readonly THREE.Color[],
  bleachMetadata: readonly MaterialBleachMetadata[],
  drainProgress: number,
): void {
  const t = THREE.MathUtils.clamp(drainProgress, 0, 1);

  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    const origColor = originalColors[i];
    const meta = bleachMetadata[i];
    if (!mat || !origColor) continue;

    mat.color.copy(origColor).lerp(ASH_SILVER_COLOR, t);

    if (meta) {
      mat.emissive.copy(meta.originalEmissive).lerp(ZERO_EMISSIVE_COLOR, t);
      mat.emissiveIntensity = meta.originalEmissiveIntensity * (1 - t);
    }
  }
}

/**
 * Restores a boss's drainable materials back to their cached vibrant initial colors & emissives.
 */
export function restoreDrainableMaterials(
  materials: readonly THREE.MeshToonMaterial[],
  originalColors: readonly THREE.Color[],
  bleachMetadata: readonly MaterialBleachMetadata[],
): void {
  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    const origColor = originalColors[i];
    const meta = bleachMetadata[i];
    if (!mat || !origColor) continue;

    mat.color.copy(origColor);
    if (meta) {
      mat.emissive.copy(meta.originalEmissive);
      mat.emissiveIntensity = meta.originalEmissiveIntensity;
    }
  }
}
