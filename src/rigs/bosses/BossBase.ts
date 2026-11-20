import * as THREE from 'three';
import {
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  PALETTE,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';

/**
 * Shared coupled lip-pivot head choreography state computed once per frame so
 * the Dark Mage and any sovereign BossRigAdapter move in exact phase-locked harmony.
 */
export interface FinisherHeadChoreography {
  /** Complementary side-to-side head tilt (same local sign tilts facing heads to opposite world sides). */
  readonly roll: number;
  /** Rhythmic deepening kiss press/nod (+ presses Mage forward, - yields Boss slightly). */
  readonly pitchPress: number;
  /** Gentle synchronized horizontal nuzzle sway. */
  readonly yawSway: number;
  /** Overwhelmed neck tremor on Boss during 0%->50% drain (fades to 0 past 50%). */
  readonly bossTremor: number;
  /** Passive neck relaxation multiplier past 50% drain (1.0 -> passiveNeckYieldMult). */
  readonly bossYieldScale: number;
}

/**
 * Computes synchronized multi-frequency lip-pivot head choreography scaled by
 * active drain throttle (SAVOR / FLOW / SURGE) and drain progress (0% -> 100%).
 */
export function computeFinisherHeadChoreography(
  time: number,
  drainProgress: number,
  throttleMode: DrainThrottleMode,
): FinisherHeadChoreography {
  const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;
  const isSavor = throttleMode === DRAIN_THROTTLE_MODES.SAVOR;

  const freq = isSurge
    ? FINISHER_CONFIG.headSwayFreqSurge
    : isSavor
      ? FINISHER_CONFIG.headSwayFreqSavor
      : FINISHER_CONFIG.headSwayFreqFlow;
  const rollAmp = isSurge
    ? FINISHER_CONFIG.headRollAmpSurge
    : isSavor
      ? FINISHER_CONFIG.headRollAmpSavor
      : FINISHER_CONFIG.headRollAmpFlow;
  const pitchAmp = isSurge
    ? FINISHER_CONFIG.headPitchAmpSurge
    : isSavor
      ? FINISHER_CONFIG.headPitchAmpSavor
      : FINISHER_CONFIG.headPitchAmpFlow;
  const yawAmp = isSurge
    ? FINISHER_CONFIG.headYawAmpSurge
    : isSavor
      ? FINISHER_CONFIG.headYawAmpSavor
      : FINISHER_CONFIG.headYawAmpFlow;

  const rollWave =
    0.72 * Math.sin(time * freq) +
    0.28 * Math.sin(time * freq * FINISHER_CONFIG.headHarmonicRatio + 0.9);
  const pitchWave =
    0.68 * Math.sin(time * freq * FINISHER_CONFIG.headPitchFreqRatio + 0.4) +
    0.32 * Math.cos(time * freq * 2.1);
  const yawWave = Math.sin(time * freq * FINISHER_CONFIG.headYawFreqRatio + 1.4);

  const half = FINISHER_CONFIG.limpThreshold;
  const earlyResistance = 1 - THREE.MathUtils.clamp(drainProgress / half, 0, 1);
  const limpness = THREE.MathUtils.clamp(
    (drainProgress - half) / (1 - half),
    0,
    1,
  );

  const tremorScale = isSurge
    ? FINISHER_CONFIG.surgeShudderMultiplier * 0.75
    : isSavor
      ? FINISHER_CONFIG.savorSwayMultiplier
      : 1.0;
  const bossTremor =
    Math.sin(time * FINISHER_CONFIG.headTremorFreq) *
    FINISHER_CONFIG.headTremorAmp *
    (0.35 + earlyResistance * 0.65) *
    (1 - limpness) *
    tremorScale;

  const bossYieldScale = THREE.MathUtils.lerp(
    1.0,
    FINISHER_CONFIG.passiveNeckYieldMult,
    limpness,
  );

  return {
    roll: rollWave * rollAmp,
    pitchPress: pitchWave * pitchAmp,
    yawSway: yawWave * yawAmp,
    bossTremor,
    bossYieldScale,
  };
}

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
    headChoreography?: FinisherHeadChoreography,
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
