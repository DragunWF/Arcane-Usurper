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
  /** Smooth asymmetric press-and-ease pulse in [0, 1] (1 = lingering press peak, 0 = ease gap). */
  readonly pulse: number;
  /** Target separation along Marina's world-space face normal (0 at peak press, kissEaseGap at ease). */
  readonly lipSeparationGap: number;
  /** Marina's local +Z head shift along her face normal (eager press 0->50%, passive yield 50->100%). */
  readonly bossFaceNormalOffset: number;
  /** Complementary side-to-side head tilt alternating gently across consecutive presses. */
  readonly roll: number;
  /** Dark Mage forward pitch nod into each press. */
  readonly magePitchNod: number;
  /** Marina complementary pitch response (eager forward nod 0->50%, soft backward yield 50->100%). */
  readonly bossPitchResponse: number;
  /** Gentle synchronized horizontal nuzzle sway. */
  readonly yawSway: number;
  /** Overwhelmed neck tremor on Boss during 0%->50% drain (fades to 0 past 50%). */
  readonly bossTremor: number;
  /** Passive neck relaxation multiplier past 50% drain (1.0 -> passiveNeckYieldMult). */
  readonly bossYieldScale: number;
}

/**
 * Computes synchronized asymmetric -> <- press-and-ease kiss choreography scaled by
 * active drain throttle (SAVOR / FLOW / SURGE) and drain progress (0% -> 100%).
 */
export function computeFinisherHeadChoreography(
  time: number,
  drainProgress: number,
  throttleMode: DrainThrottleMode,
): FinisherHeadChoreography {
  const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;
  const isSavor = throttleMode === DRAIN_THROTTLE_MODES.SAVOR;

  // Throttle-scaled kiss press-and-ease cycle frequency (Hz)
  const pulseHz = isSurge
    ? FINISHER_CONFIG.surgePulseHz
    : isSavor
      ? FINISHER_CONFIG.savorPulseHz
      : FINISHER_CONFIG.flowPulseHz;
  const pulsePhase = time * pulseHz * Math.PI * 2;

  // Asymmetric wave in [0, 1]: exponent < 1 lingers gently at peak contact (pulse -> 1)
  // before easing back smoothly to pulse -> 0 (~1.8cm gap)
  const rawCos = 0.5 - 0.5 * Math.cos(pulsePhase);
  const pulse = Math.pow(
    THREE.MathUtils.clamp(rawCos, 0, 1),
    FINISHER_CONFIG.kissAsymmetryExponent,
  );

  // Drain-state agency:
  // 0%->50%: both lean into the -> <- press together (~65% Mage / ~35% Marina)
  // 50%->100% & ENDLESS_SAVOR: Marina relaxes completely; Mage drives 100% forward while
  // Marina yields softly backward under each press and drifts passively forward on ease
  const half = FINISHER_CONFIG.limpThreshold;
  const earlyResistance = 1 - THREE.MathUtils.clamp(drainProgress / half, 0, 1);
  const limpness = THREE.MathUtils.clamp(
    (drainProgress - half) / (1 - half),
    0,
    1,
  );

  const activeBossOffset = THREE.MathUtils.lerp(
    -FINISHER_CONFIG.kissEaseGap * FINISHER_CONFIG.kissEarlyBossShare,
    FINISHER_CONFIG.kissPressDepth * FINISHER_CONFIG.kissEarlyBossShare,
    pulse,
  );
  const passiveBossOffset = -FINISHER_CONFIG.kissPassiveYieldDepth * pulse;
  const bossFaceNormalOffset = THREE.MathUtils.lerp(
    activeBossOffset,
    passiveBossOffset,
    limpness,
  );

  // Target world-space separation along Marina's face normal: 0 at peak press, kissEaseGap at ease
  const lipSeparationGap = (1 - pulse) * FINISHER_CONFIG.kissEaseGap;

  // Subtle alternating head-tilt roll (±kissRollAmp) across consecutive presses + gentle yaw nuzzle
  const alternatingRoll =
    Math.sin(pulsePhase * FINISHER_CONFIG.kissAlternatingRollRatio) *
    FINISHER_CONFIG.kissRollAmp;
  const subtleRollHarmonic =
    Math.sin(pulsePhase * 0.21 + 0.8) * (FINISHER_CONFIG.kissRollAmp * 0.35);
  const roll = alternatingRoll + subtleRollHarmonic;

  const yawAmp = isSurge
    ? FINISHER_CONFIG.headYawAmpSurge
    : isSavor
      ? FINISHER_CONFIG.headYawAmpSavor
      : FINISHER_CONFIG.headYawAmpFlow;
  const yawSway =
    Math.sin(pulsePhase * FINISHER_CONFIG.kissAlternatingRollRatio * 1.15 + 1.1) *
    yawAmp *
    0.55;

  // Complementary pitch nod: Mage nods smoothly into press; Marina meets early presses, yields late
  const magePitchNod =
    (pulse - 0.35) *
    FINISHER_CONFIG.kissPitchNod *
    THREE.MathUtils.lerp(
      FINISHER_CONFIG.kissEarlyMageShare + 0.25,
      1.15,
      limpness,
    );
  const bossPitchResponse = THREE.MathUtils.lerp(
    (pulse - 0.4) *
      FINISHER_CONFIG.kissPitchNod *
      FINISHER_CONFIG.kissEarlyBossShare *
      1.2,
    -pulse * FINISHER_CONFIG.kissPitchNod * 0.9,
    limpness,
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
    pulse,
    lipSeparationGap,
    bossFaceNormalOffset,
    roll,
    magePitchNod,
    bossPitchResponse,
    yawSway,
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
