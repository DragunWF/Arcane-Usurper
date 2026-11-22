import * as THREE from 'three';
import {
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  FINISHER_RESISTANCE_CONFIG,
  PALETTE,
  SIPHON_BEAM_CONFIG,
  STOLEN_KISS_CONFIG,
  VICTORY_DIORAMA_CONFIG,
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
 * Shared 3-stage finisher resistance-to-limp kinematics computed on `BossBase`
 * so Marina, Serena, and Miku share identical progressive fatigue physics (DRY & LSP).
 */
export interface FinisherResistanceState {
  /** Active bracing push strength: 1.0 (Stage 1) -> 0.0 (Stage 3 / taunt-stunned). */
  readonly pushStrength: number;
  /** Downward hand/elbow slide along the Dark Mage's chest/ribs: 0.0 (Stage 1) -> 1.0 (Stage 3). */
  readonly slideFactor: number;
  /** Limp surrender factor: 0.0 (Stage 1) -> 1.0 (Stage 3 / ENDLESS_SAVOR / taunt-stunned). */
  readonly limpFactor: number;
  /** High-frequency strain tremor in Stage 1 -> weak intermittent shoves in Stage 2 -> 0 in Stage 3 / stunned. */
  readonly tremorOffset: number;
  /** Out-of-phase secondary tremor for asymmetric left/right arm strain. */
  readonly tremorSecondaryOffset: number;
  /** Passive pendulum shoulder sway in Stage 3 / ENDLESS_SAVOR synced to Dark Mage's -> <- cadence. */
  readonly limpSwayOffset: number;
  /** Phase-lagged passive pendulum elbow sway for dead-weight forearm follow-through. */
  readonly limpElbowSwayOffset: number;
  /** Gentle lateral cross-sway for passive shoulder/wrist drift in Stage 3. */
  readonly limpCrossSwayOffset: number;
  /** Upper-spine resistance pitch offset (backward arch in Stage 1 -> soften in Stage 2/3). */
  readonly spineResistanceOffset: number;
  /** Smoothed taunt-stun slack factor in [0, 1]. */
  readonly tauntSlack: number;
  /** Full-body backward torso/hip pull-back factor (1.0 -> 0.0 across Stage 1 into Stage 2, 0 when taunt-stunned). */
  readonly torsoPullBack: number;
  /** Decaying periodic shove impulse [0, 1] firing every 1.1-1.5s in Stage 1 + SURGE rising-edge spike. */
  readonly shoveImpulse: number;
  /** True on the exact frame a periodic shove or SURGE-edge resistance spike fires. */
  readonly shoveTriggered: boolean;
  /** Damped strained forward-axis head roll oscillation (±maxHeadStruggleRollRad in Stage 1 -> 0 in Stage 3 / stunned). */
  readonly headRollOffset: number;
}

/**
 * Pose-adapted target joint angles for a sovereign's arms across Stages 1–3.
 */
export interface FinisherArmTargets {
  readonly leftShoulderX: number;
  readonly leftShoulderZ: number;
  readonly rightShoulderX: number;
  readonly rightShoulderZ: number;
  readonly leftElbowX: number;
  readonly leftElbowZ: number;
  readonly rightElbowX: number;
  readonly rightElbowZ: number;
}

/**
 * Shared kneeling-shield-to-slump posture computed on `BossBase` for the
 * ranged Umbral Siphon Beam ([R]) finisher across Marina, Serena, and Miku.
 */
export interface BossBeamShieldPose {
  readonly drain: number;
  readonly slump: number;
  readonly tremor: number;
  readonly bodyY: number;
  readonly torsoX: number;
  readonly torsoZ: number;
  readonly headX: number;
  readonly headY: number;
  readonly headZ: number;
  readonly leftShoulderX: number;
  readonly leftShoulderZ: number;
  readonly leftElbowX: number;
  readonly leftElbowZ: number;
  readonly rightShoulderX: number;
  readonly rightShoulderZ: number;
  readonly rightElbowX: number;
}

/**
 * Shared 3-beat Over-the-Shoulder Stolen Kiss posture computed on `BossBase`
 * across Marina, Serena, and Miku (DRY & LSP).
 */
export interface BossStolenKissPose {
  readonly bodyY: number;
  readonly torsoX: number;
  readonly torsoZ: number;
  readonly headX: number;
  readonly headY: number;
  readonly headZ: number;
  readonly headFaceNormalOffset: number;
  readonly leftShoulderX: number;
  readonly leftShoulderZ: number;
  readonly leftElbowX: number;
  readonly leftElbowZ: number;
  readonly rightShoulderX: number;
  readonly rightShoulderZ: number;
  readonly rightElbowX: number;
  readonly rightElbowZ: number;
  readonly flareFactor: number;
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
  /** Optional waist wrap radius so DarkMageRig hugs each sovereign's silhouette cleanly. */
  readonly waistWrapRadius?: number;
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
    isTauntStunned?: boolean,
    headChoreography?: FinisherHeadChoreography,
  ): void;
  applyBeamFinisherPose(drainProgress: number, time: number): void;
  readonly blindspotExposureTimer: number;
  readonly stolenKissCooldownTimer: number;
  triggerBlindspotExposure(): void;
  consumeBlindspotAndStartCooldown(): void;
  tickBlindspotState(dt: number, elapsed: number, allowExposure: boolean): void;
  resetBlindspotState(): void;
  applyStolenKissPose(beat: 1 | 2 | 3, beatProgress: number, time: number): void;
  getLastResistanceState(): FinisherResistanceState | null;
  applyVictoryCollapsePose(time: number): void;
  applyVictoryDioramaPose(time: number): void;
  applyPuppetMasterPose(time: number): void;
  applyDrainBleach(drainProgress: number): void;
  resetForEncounter(encoreTier: number): void;
  dispose(): void;
}

/**
 * Abstract base class for sovereign boss rigs providing shared DRY finisher resistance
 * curves, clip-free pose-adapted arm targets, and spine-decoupled headAnchor stabilization.
 */
export abstract class BossBase implements BossRigAdapter {
  public abstract readonly id: string;
  public abstract readonly displayName: string;
  public abstract readonly title: string;
  public abstract readonly root: THREE.Group;
  public abstract readonly headAnchor: THREE.Object3D;
  public abstract readonly headAccessory: THREE.Object3D;
  public readonly waistWrapRadius?: number;
  public abstract readonly drainableMaterials: THREE.MeshToonMaterial[];
  public abstract readonly originalColors: THREE.Color[];

  private tauntSlackBlend = 0;
  private shoveCooldownTimer = 0.65;
  private shoveImpulseValue = 0;
  private wasSurgeActive = false;
  private lastResistanceState: FinisherResistanceState | null = null;

  // Mid-Fight Over-the-Shoulder Stolen Kiss exposure & pooled blindspot diamond glint
  private _blindspotExposureTimer = 0;
  private _stolenKissCooldownTimer = 0;
  private blindspotGlintGroup: THREE.Group | null = null;
  private blindspotCoreMesh: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private blindspotHaloMesh: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private blindspotParticleGeo: THREE.OctahedronGeometry | null = null;
  private readonly blindspotParticles: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >[] = [];

  public get blindspotExposureTimer(): number {
    return this._blindspotExposureTimer;
  }

  public get stolenKissCooldownTimer(): number {
    return this._stolenKissCooldownTimer;
  }

  public abstract setExpression(
    expression: BossExpression,
    spiralPhase?: number,
  ): void;
  public abstract setPhaseVisuals(phase: BossPhase): void;
  public abstract setAscendHeight(extraY: number): void;
  public abstract triggerHitFlash(): void;
  public abstract triggerCastFlourish(): void;
  public abstract triggerAccessoryFlick(): void;
  public abstract getLeftHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3;
  public abstract getRightHandWorldPosition(
    outVec: THREE.Vector3,
  ): THREE.Vector3;
  public abstract updateCombatPose(
    dt: number,
    state: GameState,
    elapsed: number,
    staggerProgressOverride?: number | null,
  ): void;
  public abstract applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt?: number,
    throttleMode?: DrainThrottleMode,
    isTauntStunned?: boolean,
    headChoreography?: FinisherHeadChoreography,
  ): void;
  public abstract applyBeamFinisherPose(
    drainProgress: number,
    time: number,
  ): void;
  public abstract applyStolenKissPose(
    beat: 1 | 2 | 3,
    beatProgress: number,
    time: number,
  ): void;
  public abstract applyVictoryCollapsePose(time: number): void;
  public applyVictoryDioramaPose(time: number): void {
    this.applyVictoryCollapsePose(time);
  }
  public abstract applyPuppetMasterPose(time: number): void;
  public abstract applyDrainBleach(drainProgress: number): void;
  public abstract resetForEncounter(encoreTier: number): void;
  public abstract dispose(): void;

  public getLastResistanceState(): FinisherResistanceState | null {
    return this.lastResistanceState;
  }

  /**
   * Resets transient finisher resistance smoothing when leaving finisher states.
   */
  protected resetResistanceState(): void {
    this.tauntSlackBlend = 0;
    this.shoveCooldownTimer = 0.65;
    this.shoveImpulseValue = 0;
    this.wasSurgeActive = false;
    this.lastResistanceState = null;
  }

  /**
   * Computes 3-stage resistance-to-limp curves across drain progress (0.0 -> 1.0),
   * active drain throttle (SAVOR / FLOW / SURGE), and [F] taunt-stun state.
   */
  protected computeResistanceState(
    drainProgress: number,
    time: number,
    throttle: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW,
    isTauntStunned = false,
    dt = 1 / 60,
  ): FinisherResistanceState {
    const cfg = FINISHER_RESISTANCE_CONFIG;
    const d = THREE.MathUtils.clamp(drainProgress, 0, 1);
    const safeDt = Math.max(0.001, Math.min(dt, 0.05));

    // Smoothly collapse resistance to 0 during [F] taunt stun, then recover smoothly if still draining
    const targetSlack = isTauntStunned ? 1.0 : 0.0;
    const slackAlpha =
      1 - Math.exp(-safeDt * cfg.tauntStunSlackBlendRate);
    this.tauntSlackBlend = THREE.MathUtils.lerp(
      this.tauntSlackBlend,
      targetSlack,
      slackAlpha,
    );
    const slack = this.tauntSlackBlend;

    // 3-Stage Piecewise Curves:
    // Stage 1 (0% -> 35%): Active Push
    // Stage 2 (35% -> 75%): Fading Grip & Downward Slide
    // Stage 3 (75% -> 100% & ENDLESS_SAVOR): Limp Surrender
    let rawPush = 1.0;
    let rawSlide = 0.0;
    let rawLimp = 0.0;

    if (d <= cfg.stage1End) {
      const t1 = THREE.MathUtils.smoothstep(d, 0, cfg.stage1End);
      rawPush = THREE.MathUtils.lerp(1.0, cfg.stage1PushEnd, t1);
      rawSlide = THREE.MathUtils.lerp(0.0, cfg.stage1SlideEnd, t1);
      rawLimp = 0.0;
    } else if (d <= cfg.stage2End) {
      const t2 = THREE.MathUtils.smoothstep(d, cfg.stage1End, cfg.stage2End);
      rawPush = THREE.MathUtils.lerp(cfg.stage1PushEnd, cfg.stage2PushEnd, t2);
      rawSlide = THREE.MathUtils.lerp(cfg.stage1SlideEnd, cfg.stage2SlideEnd, t2);
      rawLimp = THREE.MathUtils.lerp(0.0, cfg.stage2LimpEnd, t2 * t2);
    } else {
      const t3 = THREE.MathUtils.smoothstep(d, cfg.stage2End, 1.0);
      rawPush = THREE.MathUtils.lerp(cfg.stage2PushEnd, 0.0, t3);
      rawSlide = THREE.MathUtils.lerp(cfg.stage2SlideEnd, 1.0, t3);
      rawLimp = THREE.MathUtils.lerp(cfg.stage2LimpEnd, 1.0, t3);
    }

    const pushStrength = rawPush * (1 - slack);
    const slideFactor = THREE.MathUtils.lerp(rawSlide, 1.0, slack * 0.85);
    const limpFactor = Math.max(rawLimp, slack);

    // Throttle-modulated struggle tremors (Stage 1 high-freq strain -> Stage 2 intermittent shoves -> Stage 3 zero)
    const isSurge = throttle === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = throttle === DRAIN_THROTTLE_MODES.SAVOR;
    const throttleMult = isSurge
      ? cfg.surgeTremorAmpMultiplier
      : isSavor
        ? cfg.savorTremorAmpMultiplier
        : 1.0;

    const stage1Weight =
      1 - THREE.MathUtils.smoothstep(d, cfg.stage1End * 0.75, cfg.stage1End + 0.12);
    const stage2Weight =
      THREE.MathUtils.smoothstep(d, cfg.stage1End * 0.7, cfg.stage1End + 0.05) *
      (1 - THREE.MathUtils.smoothstep(d, cfg.stage2End - 0.08, cfg.stage2End + 0.04));
    const stage3ZeroGate =
      1 - THREE.MathUtils.smoothstep(d, cfg.stage2End - 0.04, cfg.stage2End + 0.04);

    const hf1 = Math.sin(time * cfg.baseTremorFreqHz * Math.PI * 2);
    const hf2 = Math.sin(time * cfg.secondaryTremorFreqHz * Math.PI * 2 + 1.35);

    // Intermittent weak shoves in Stage 2 (cubed positive sine pulses)
    const shoveWave1 = Math.pow(
      Math.max(0, Math.sin(time * cfg.stage2ShoveFreqHz * Math.PI * 2)),
      3,
    );
    const shoveWave2 = Math.pow(
      Math.max(0, Math.sin(time * cfg.stage2ShoveFreqHz * Math.PI * 2 + 0.55)),
      3,
    );
    const shove1 =
      shoveWave1 * (0.65 + 0.35 * Math.sin(time * cfg.baseTremorFreqHz * Math.PI));
    const shove2 =
      shoveWave2 *
      (0.65 + 0.35 * Math.sin(time * cfg.secondaryTremorFreqHz * Math.PI + 0.9));

    const tremorAmp =
      cfg.baseTremorAmpRad * throttleMult * (1 - slack) * stage3ZeroGate;
    const tremorOffset =
      (hf1 * stage1Weight + shove1 * cfg.stage2ShoveScale * stage2Weight) *
      tremorAmp;
    const tremorSecondaryOffset =
      (hf2 * stage1Weight + shove2 * cfg.stage2ShoveScale * stage2Weight) *
      tremorAmp;

    // Passive pendulum arm sway in Stage 3 / ENDLESS_SAVOR synced to Dark Mage's -> <- kiss cadence
    const cadenceHz = isSurge
      ? FINISHER_CONFIG.surgePulseHz
      : isSavor
        ? FINISHER_CONFIG.savorPulseHz
        : cfg.limpPendulumFreqHz;
    const cadencePhase = time * cadenceHz * Math.PI * 2;
    const limpSwayOffset =
      Math.sin(cadencePhase - cfg.limpPendulumPhaseLagRad) *
      cfg.limpPendulumAmpRad *
      limpFactor;
    const limpElbowSwayOffset =
      Math.sin(cadencePhase - cfg.limpPendulumElbowPhaseLagRad) *
      cfg.limpPendulumAmpRad *
      cfg.limpPendulumElbowRatio *
      limpFactor;
    const limpCrossSwayOffset =
      Math.cos(cadencePhase * 0.5) * cfg.limpPendulumCrossAmpRad * limpFactor;

    // Upper spine resistance: subtle backward arch in Stage 1 -> softens forward into embrace in Stage 2/3
    const spineMid = THREE.MathUtils.lerp(
      cfg.stage1SpineArchRad,
      cfg.stage2SpineSoftenRad,
      THREE.MathUtils.clamp(slideFactor / Math.max(0.01, cfg.stage2SlideEnd), 0, 1),
    );
    const spineResistanceOffset = THREE.MathUtils.lerp(
      spineMid,
      cfg.stage3SpineSlumpRad,
      limpFactor,
    );

    // Full-body early-stage torso/hip pull-back (1.0 -> 0.0 across Stage 1 into Stage 2; drops immediately on [F] taunt stun)
    const rawTorsoPullBack =
      1 - THREE.MathUtils.smoothstep(d, cfg.stage1End * 0.55, cfg.stage2End * 0.85);
    const torsoPullBack = rawTorsoPullBack * (1 - slack);

    // Periodic shove impulses (1.1-1.5s in Stage 1 / early Stage 2) + immediate SURGE rising-edge spike
    this.shoveImpulseValue *= Math.exp(-safeDt * cfg.shovePulseDecayRate);
    if (this.shoveImpulseValue < 0.002) {
      this.shoveImpulseValue = 0;
    }
    const surgeRisingEdge = isSurge && !this.wasSurgeActive;
    this.wasSurgeActive = isSurge;

    let shoveTriggered = false;
    if (isTauntStunned) {
      this.shoveImpulseValue *= Math.exp(-safeDt * cfg.tauntStunSlackBlendRate);
    } else if (d < cfg.sparkCutoffDrain) {
      const rateScale = isSurge ? 1.35 : isSavor ? 0.65 : 1.0;
      this.shoveCooldownTimer -= safeDt * rateScale;
      if (this.shoveCooldownTimer <= 0) {
        const span = cfg.shoveIntervalMaxSec - cfg.shoveIntervalMinSec;
        this.shoveCooldownTimer = cfg.shoveIntervalMinSec + Math.random() * span;
        const peak = THREE.MathUtils.clamp(
          0.45 + 0.55 * (1 - d / Math.max(0.01, cfg.sparkCutoffDrain)),
          0.35,
          1.0,
        );
        this.shoveImpulseValue = Math.min(
          1.0,
          Math.max(this.shoveImpulseValue, peak),
        );
        shoveTriggered = true;
      }
      if (surgeRisingEdge) {
        this.shoveImpulseValue = Math.min(
          1.0,
          this.shoveImpulseValue + cfg.surgeSpikeBoost,
        );
        shoveTriggered = true;
      }
    }
    const shoveImpulse = this.shoveImpulseValue * (1 - slack);

    // Strained forward-axis head roll oscillation (±maxHeadStruggleRollRad in Stage 1, slowing in Stage 2, 0 in Stage 3 / stunned)
    const rollFreq = THREE.MathUtils.lerp(
      cfg.headRollFreqHz,
      cfg.headRollFreqHz * 0.52,
      THREE.MathUtils.smoothstep(d, cfg.stage1End, cfg.stage2End),
    );
    const rollEnv =
      (1 - THREE.MathUtils.smoothstep(d, cfg.stage1End * 0.85, cfg.stage2End)) *
      (1 - slack);
    const headRollOffset =
      Math.sin(time * rollFreq * Math.PI * 2) *
      cfg.maxHeadStruggleRollRad *
      rollEnv *
      (1 + shoveImpulse * 0.35);

    const state: FinisherResistanceState = {
      pushStrength,
      slideFactor,
      limpFactor,
      tremorOffset,
      tremorSecondaryOffset,
      limpSwayOffset,
      limpElbowSwayOffset,
      limpCrossSwayOffset,
      spineResistanceOffset,
      tauntSlack: slack,
      torsoPullBack,
      shoveImpulse,
      shoveTriggered,
      headRollOffset,
    };
    this.lastResistanceState = state;
    return state;
  }

  /**
   * Resolves clip-free, pose-adapted 3-stage arm targets for Poses [1-4] using
   * `FINISHER_RESISTANCE_CONFIG.chestPushSurfaceOffset` so palms brace cleanly on the
   * outer surface of the Dark Mage's chest/shoulders before sliding down to hang limp.
   */
  protected computeResistanceArmTargets(
    poseId: FinisherPoseId,
    resistance: FinisherResistanceState,
  ): FinisherArmTargets {
    const cfg = FINISHER_RESISTANCE_CONFIG;
    const clearanceBias =
      (cfg.chestPushSurfaceOffset - cfg.chestPushReferenceOffset) *
      cfg.chestPushClearancePitchGain;
    const t12 = THREE.MathUtils.clamp(
      resistance.slideFactor / Math.max(0.01, cfg.stage2SlideEnd),
      0,
      1,
    );
    const t3 = resistance.limpFactor;

    const blend3 = (s1: number, s2: number, s3: number): number =>
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(s1, s2, t12), s3, t3);

    const shoveFlare = resistance.shoveImpulse * cfg.shoveElbowFlareRad;

    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      // Pose [2]: Inner (Right) hand braces against Dark Mage's shoulder;
      // Outer (Left) arm reaches back for balance; both droop limp toward the floor at 100%.
      return {
        leftShoulderX:
          blend3(
            cfg.dipOuterStage1ShoulderX,
            cfg.dipOuterStage2ShoulderX,
            cfg.dipOuterStage3ShoulderX,
          ) -
          shoveFlare * 0.35,
        leftShoulderZ:
          blend3(
            cfg.dipOuterStage1ShoulderZ,
            cfg.dipOuterStage2ShoulderZ,
            cfg.dipOuterStage3ShoulderZ,
          ) -
          shoveFlare * 0.4,
        rightShoulderX:
          blend3(
            cfg.dipInnerStage1ShoulderX + clearanceBias,
            cfg.dipInnerStage2ShoulderX,
            cfg.dipInnerStage3ShoulderX,
          ) -
          shoveFlare * 0.45,
        rightShoulderZ:
          blend3(
            cfg.dipInnerStage1ShoulderZ,
            cfg.dipInnerStage2ShoulderZ,
            cfg.dipInnerStage3ShoulderZ,
          ) +
          shoveFlare * 0.55,
        leftElbowX: blend3(
          cfg.dipOuterStage1ElbowX,
          cfg.dipOuterStage2ElbowX,
          cfg.dipOuterStage3ElbowX,
        ),
        leftElbowZ: blend3(
          cfg.dipOuterStage1ElbowZ,
          cfg.dipOuterStage2ElbowZ,
          cfg.dipOuterStage3ElbowZ,
        ),
        rightElbowX:
          blend3(
            cfg.dipInnerStage1ElbowX,
            cfg.dipInnerStage2ElbowX,
            cfg.dipInnerStage3ElbowX,
          ) +
          shoveFlare * 0.72,
        rightElbowZ:
          blend3(
            cfg.dipInnerStage1ElbowZ,
            cfg.dipInnerStage2ElbowZ,
            cfg.dipInnerStage3ElbowZ,
          ) -
          shoveFlare * 0.35,
      };
    }

    // Pose [1] Upright Embrace:
    // Both elbows flare outward while palms brace against Dark Mage's upper chest/shoulders,
    // pulsing wider on each shoveImpulse before dropping inward as hands slide down to hang limp.
    const shX =
      blend3(
        cfg.uprightStage1ShoulderX + clearanceBias,
        cfg.uprightStage2ShoulderX,
        cfg.uprightStage3ShoulderX,
      ) -
      shoveFlare * 0.32;
    const shZ =
      blend3(
        cfg.uprightStage1ShoulderZ,
        cfg.uprightStage2ShoulderZ,
        cfg.uprightStage3ShoulderZ,
      ) +
      shoveFlare * 0.72;
    const elX =
      blend3(
        cfg.uprightStage1ElbowX,
        cfg.uprightStage2ElbowX,
        cfg.uprightStage3ElbowX,
      ) +
      shoveFlare * 0.85;
    const elZ =
      blend3(
        cfg.uprightStage1ElbowZ,
        cfg.uprightStage2ElbowZ,
        cfg.uprightStage3ElbowZ,
      ) +
      shoveFlare * 0.52;

    return {
      leftShoulderX: shX,
      leftShoulderZ: -shZ,
      rightShoulderX: shX,
      rightShoulderZ: shZ,
      leftElbowX: elX,
      leftElbowZ: elZ,
      rightElbowX: elX,
      rightElbowZ: -elZ,
    };
  }

  /**
   * Positions and orients `headGroup` inside `torsoGroup` while mathematically cancelling
   * `spineDeltaX` so `headAnchor` stays 100% decoupled from spine/arm resistance offsets
   * (preserving exact zero-gap lip-to-lip contact across all 4 poses).
   */
  protected applyDecoupledHeadTransform(
    headGroup: THREE.Group,
    baseHeadPitch: number,
    spineDeltaX: number,
    headYaw: number,
    headRoll: number,
    faceNormalOffset: number,
  ): void {
    const baseY = FINISHER_RESISTANCE_CONFIG.spineResistanceHeadBaseY;
    const baseZ = FINISHER_RESISTANCE_CONFIG.spineResistanceHeadBaseZ;
    const cosD = Math.cos(spineDeltaX);
    const sinD = Math.sin(spineDeltaX);

    // Rotate (0, baseY, baseZ) by -spineDeltaX around X to keep world head pivot invariant
    const compY = baseY * cosD + baseZ * sinD;
    const compZ = -baseY * sinD + baseZ * cosD;
    const compPitch = baseHeadPitch - spineDeltaX;

    headGroup.rotation.set(compPitch, headYaw, headRoll);
    headGroup.position.set(
      0,
      compY - Math.sin(compPitch) * faceNormalOffset,
      compZ + Math.cos(compPitch) * faceNormalOffset,
    );
  }

  /**
   * Computes shared one-knee shielding-to-slump kinematics for the ranged Umbral
   * Siphon Beam ([R]) finisher so every sovereign rig shields her face against the
   * blinding violet beam, trembles under the current, and slumps forward toward 100%.
   */
  protected computeBeamShieldPose(
    drainProgress: number,
    time: number,
  ): BossBeamShieldPose {
    const cfg = SIPHON_BEAM_CONFIG;
    const drain = THREE.MathUtils.clamp(drainProgress, 0, 1);
    const slump = THREE.MathUtils.smoothstep(drain, 0.52, 1.0);
    const tremorStrength = (1 - slump * 0.72) * (0.45 + 0.55 * Math.sin(drain * Math.PI));
    const tremor =
      Math.sin(time * cfg.bossTremorFreqHz) * cfg.bossTremorAmpRad * tremorStrength;
    const secondary =
      Math.cos(time * (cfg.bossTremorFreqHz * 0.78)) *
      cfg.bossTremorAmpRad *
      0.6 *
      tremorStrength;

    return {
      drain,
      slump,
      tremor,
      bodyY: cfg.bossKneelBodyY - slump * 0.055 + secondary * 0.15,
      torsoX:
        THREE.MathUtils.lerp(
          cfg.bossShieldTorsoStartX,
          cfg.bossShieldTorsoSlumpX,
          slump,
        ) +
        tremor * 0.45,
      torsoZ: secondary * 0.65,
      headX:
        THREE.MathUtils.lerp(
          cfg.bossShieldHeadStartX,
          cfg.bossShieldHeadSlumpX,
          slump,
        ) -
        tremor * 0.35,
      headY: cfg.bossShieldHeadTurnY * (1 - slump * 0.55) + secondary * 0.4,
      headZ: -0.14 * (1 - slump * 0.4) + tremor * 0.5,
      // Left arm raised across her face to shield from the blinding violet beam -> drops limp
      leftShoulderX:
        THREE.MathUtils.lerp(cfg.bossShieldArmStartX, cfg.bossSlumpArmX, slump) +
        tremor * 0.7,
      leftShoulderZ: THREE.MathUtils.lerp(
        cfg.bossShieldArmStartZ,
        -cfg.bossSlumpArmZ,
        slump,
      ),
      leftElbowX:
        THREE.MathUtils.lerp(
          cfg.bossShieldElbowStartX,
          cfg.bossSlumpElbowX,
          slump,
        ) + tremor,
      leftElbowZ: THREE.MathUtils.lerp(cfg.bossShieldElbowStartZ, 0, slump),
      // Right arm braced downward for balance -> collapses limp
      rightShoulderX:
        THREE.MathUtils.lerp(cfg.bossBraceArmStartX, cfg.bossSlumpArmX, slump) -
        tremor * 0.5,
      rightShoulderZ: THREE.MathUtils.lerp(
        cfg.bossBraceArmStartZ,
        cfg.bossSlumpArmZ,
        slump,
      ),
      rightElbowX:
        THREE.MathUtils.lerp(
          cfg.bossBraceElbowStartX,
          cfg.bossSlumpElbowX,
          slump,
        ) - tremor * 0.7,
    };
  }

  /**
   * Shared supine arm-rest helper for VICTORY_DIORAMA (DRY & LSP):
   * 1. Explicitly zeroes all prior x/y/z rotations on shoulders, elbows, and optional wrists
   *    so no forward-reaching or inward-pushing combat/finisher rotations leak into the diorama.
   * 2. Splays both arms cleanly OUTWARD away from the torso centerline along local Z
   *    (leftShoulder is at -X, so -Z rotates (0,-L,0) outward toward -X;
   *     rightShoulder is at +X, so +Z rotates (0,-L,0) outward toward +X).
   * 3. Applies subtle floor-plane lift and relaxed anatomical elbow bend/roll so both arms
   *    rest naturally beside her body parallel to the arena floor with zero clipping.
   */
  protected applySubjugatedDioramaArms(
    leftShoulder: THREE.Object3D,
    rightShoulder: THREE.Object3D,
    leftElbow: THREE.Object3D,
    rightElbow: THREE.Object3D,
    extraAbductionRad = 0,
    leftWrist?: THREE.Object3D,
    rightWrist?: THREE.Object3D,
  ): void {
    leftShoulder.rotation.set(0, 0, 0);
    rightShoulder.rotation.set(0, 0, 0);
    leftElbow.rotation.set(0, 0, 0);
    rightElbow.rotation.set(0, 0, 0);
    leftWrist?.rotation.set(0, 0, 0);
    rightWrist?.rotation.set(0, 0, 0);

    const cfg = VICTORY_DIORAMA_CONFIG;
    const totalAbduction = cfg.baseShoulderAbductionRad + extraAbductionRad;

    leftShoulder.rotation.set(
      cfg.shoulderFloorLiftRad,
      -cfg.relaxedWristRollRad,
      -totalAbduction,
    );
    rightShoulder.rotation.set(
      cfg.shoulderFloorLiftRad,
      cfg.relaxedWristRollRad,
      totalAbduction,
    );

    leftElbow.rotation.set(
      -cfg.relaxedElbowBendRad,
      -cfg.relaxedWristRollRad,
      0,
    );
    rightElbow.rotation.set(
      -cfg.relaxedElbowBendRad,
      cfg.relaxedWristRollRad,
      0,
    );

    if (leftWrist) {
      leftWrist.rotation.set(0, -cfg.relaxedWristRollRad, 0);
    }
    if (rightWrist) {
      rightWrist.rotation.set(0, cfg.relaxedWristRollRad, 0);
    }
  }

  /**
   * Attaches a pooled, zero-allocation royal-violet (#8B5CF6) diamond blindspot glint
   * and 6 rising violet motes behind the Sovereign's upper shoulder blades.
   */
  protected attachBlindspotGlint(torsoGroup: THREE.Group): void {
    const cfg = STOLEN_KISS_CONFIG;
    const grp = new THREE.Group();
    grp.position.set(0, cfg.blindspotLocalY, cfg.blindspotLocalZ);
    grp.visible = false;

    const coreGeo = new THREE.OctahedronGeometry(cfg.blindspotDiamondRadius, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.amethystTrim,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.scale.set(0.65, 1.35, 0.65);
    grp.add(coreMesh);

    const haloGeo = new THREE.OctahedronGeometry(
      cfg.blindspotDiamondRadius * 1.48,
      0,
    );
    const haloMat = new THREE.MeshBasicMaterial({
      color: PALETTE.glowViolet,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.scale.set(0.75, 1.45, 0.75);
    grp.add(haloMesh);

    const pGeo = new THREE.OctahedronGeometry(
      cfg.blindspotDiamondRadius * 0.24,
      0,
    );
    this.blindspotParticleGeo = pGeo;
    for (let i = 0; i < cfg.blindspotParticleCount; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? PALETTE.amethystTrim : PALETTE.pulseLavender,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.frustumCulled = false;
      grp.add(pMesh);
      this.blindspotParticles.push(pMesh);
    }

    torsoGroup.add(grp);
    this.blindspotGlintGroup = grp;
    this.blindspotCoreMesh = coreMesh;
    this.blindspotHaloMesh = haloMesh;
  }

  protected disposeBlindspotGlint(): void {
    if (this.blindspotGlintGroup && this.blindspotGlintGroup.parent) {
      this.blindspotGlintGroup.parent.remove(this.blindspotGlintGroup);
    }
    this.blindspotCoreMesh?.geometry.dispose();
    this.blindspotCoreMesh?.material.dispose();
    this.blindspotHaloMesh?.geometry.dispose();
    this.blindspotHaloMesh?.material.dispose();
    this.blindspotParticleGeo?.dispose();
    for (let i = 0; i < this.blindspotParticles.length; i++) {
      const p = this.blindspotParticles[i];
      if (p) p.material.dispose();
    }
    this.blindspotParticles.length = 0;
    this.blindspotGlintGroup = null;
    this.blindspotCoreMesh = null;
    this.blindspotHaloMesh = null;
    this.blindspotParticleGeo = null;
  }

  public triggerBlindspotExposure(): void {
    if (this._stolenKissCooldownTimer > 0) return;
    this._blindspotExposureTimer = STOLEN_KISS_CONFIG.exposureDurationSec;
  }

  public consumeBlindspotAndStartCooldown(): void {
    this._blindspotExposureTimer = 0;
    this._stolenKissCooldownTimer = STOLEN_KISS_CONFIG.cooldownSec;
    if (this.blindspotGlintGroup) {
      this.blindspotGlintGroup.visible = false;
    }
  }

  public resetBlindspotState(): void {
    this._blindspotExposureTimer = 0;
    this._stolenKissCooldownTimer = 0;
    if (this.blindspotGlintGroup) {
      this.blindspotGlintGroup.visible = false;
    }
  }

  public tickBlindspotState(
    dt: number,
    elapsed: number,
    allowExposure: boolean,
  ): void {
    const safeDt = Math.max(0, Math.min(dt, 0.05));
    if (this._stolenKissCooldownTimer > 0) {
      this._stolenKissCooldownTimer = Math.max(
        0,
        this._stolenKissCooldownTimer - safeDt,
      );
    }

    if (!allowExposure) {
      this._blindspotExposureTimer = 0;
    } else if (this._blindspotExposureTimer > 0) {
      this._blindspotExposureTimer = Math.max(
        0,
        this._blindspotExposureTimer - safeDt,
      );
    }

    const grp = this.blindspotGlintGroup;
    if (!grp) return;

    const visible = allowExposure && this._blindspotExposureTimer > 0;
    grp.visible = visible;
    if (!visible) return;

    const cfg = STOLEN_KISS_CONFIG;
    const remRatio = THREE.MathUtils.clamp(
      this._blindspotExposureTimer / Math.max(0.01, cfg.exposureDurationSec),
      0,
      1,
    );
    const fadeEnv = Math.min(1, remRatio * 3.5);
    const pulse =
      0.86 + 0.28 * Math.sin(elapsed * cfg.blindspotPulseFreqHz * Math.PI * 2);

    if (this.blindspotCoreMesh) {
      this.blindspotCoreMesh.rotation.y = elapsed * 4.2;
      this.blindspotCoreMesh.scale.set(
        0.65 * pulse,
        1.35 * pulse,
        0.65 * pulse,
      );
      this.blindspotCoreMesh.material.opacity = 0.92 * fadeEnv;
    }
    if (this.blindspotHaloMesh) {
      this.blindspotHaloMesh.rotation.y = -elapsed * 2.8;
      this.blindspotHaloMesh.scale.set(
        0.75 * (1.05 + (pulse - 0.86) * 1.1),
        1.45 * (1.05 + (pulse - 0.86) * 1.1),
        0.75 * (1.05 + (pulse - 0.86) * 1.1),
      );
      this.blindspotHaloMesh.material.opacity = 0.45 * fadeEnv;
    }

    const count = this.blindspotParticles.length;
    for (let i = 0; i < count; i++) {
      const p = this.blindspotParticles[i];
      if (!p) continue;
      const u = (elapsed * 1.45 + i / count) % 1;
      const ang = i * ((Math.PI * 2) / Math.max(1, count)) + elapsed * 2.4;
      const rad = 0.14 + Math.sin(u * Math.PI) * 0.08;
      p.position.set(
        Math.cos(ang) * rad,
        -0.08 + u * 0.46,
        Math.sin(ang) * rad * 0.55 - 0.04,
      );
      p.rotation.y = elapsed * 6.0 + i;
      const s = Math.sin(u * Math.PI) * 1.15;
      p.scale.setScalar(Math.max(0.01, s));
      p.material.opacity = Math.sin(u * Math.PI) * 0.85 * fadeEnv;
    }
  }

  /**
   * Computes shared 3-beat Over-the-Shoulder Stolen Kiss posture for any Sovereign rig:
   * - Beat 1 (Wrap & Chin Tilt): spine arches back, head tilts back & over right shoulder,
   *   hands lift in startled reflex to grip the Dark Mage's waist-wrap forearm without clipping.
   * - Beat 2 (Over-the-Shoulder Siphon): holds arch & tilted chin with gentle kissPulseAmp cadence.
   * - Beat 3 (Startled Breakaway Pulse): snaps upright spreading arms wide outward in a flare.
   */
  protected computeStolenKissBossPose(
    beat: 1 | 2 | 3,
    beatProgress: number,
    time: number,
  ): BossStolenKissPose {
    const cfg = STOLEN_KISS_CONFIG;
    const p = THREE.MathUtils.clamp(beatProgress, 0, 1);
    const ease = p * p * (3 - 2 * p);
    const pulse = Math.sin(time * cfg.kissPulseFreqHz * Math.PI * 2);
    const tremor = Math.sin(time * 24.0) * 0.025;

    // Beat 1 & 2 held arch/tilt targets
    const archTorsoX = cfg.targetSpineArchRad;
    const tiltHeadX = cfg.targetHeadPitchRad;
    const tiltHeadY = cfg.targetHeadYawRad;
    // Startled reflex hands gripping his waist-wrap forearm cleanly in front of midriff
    const gripLShX = -0.52;
    const gripLShZ = -0.22;
    const gripLElX = -1.22;
    const gripLElZ = -0.34;
    const gripRShX = -0.48;
    const gripRShZ = 0.24;
    const gripRElX = -1.18;
    const gripRElZ = 0.36;

    if (beat === 1) {
      return {
        bodyY: cfg.bossStandingBodyY,
        torsoX: THREE.MathUtils.lerp(0.04, archTorsoX, ease),
        torsoZ: THREE.MathUtils.lerp(0, -0.05, ease),
        headX: THREE.MathUtils.lerp(0.02, tiltHeadX, ease),
        headY: THREE.MathUtils.lerp(0, tiltHeadY, ease),
        headZ: THREE.MathUtils.lerp(0, -0.14, ease),
        headFaceNormalOffset: 0,
        leftShoulderX: THREE.MathUtils.lerp(-0.18, gripLShX, ease),
        leftShoulderZ: THREE.MathUtils.lerp(-0.14, gripLShZ, ease),
        leftElbowX: THREE.MathUtils.lerp(-0.34, gripLElX, ease),
        leftElbowZ: THREE.MathUtils.lerp(0, gripLElZ, ease),
        rightShoulderX: THREE.MathUtils.lerp(-0.18, gripRShX, ease),
        rightShoulderZ: THREE.MathUtils.lerp(0.14, gripRShZ, ease),
        rightElbowX: THREE.MathUtils.lerp(-0.34, gripRElX, ease),
        rightElbowZ: THREE.MathUtils.lerp(0, gripRElZ, ease),
        flareFactor: 0,
      };
    }

    if (beat === 2) {
      return {
        bodyY: cfg.bossStandingBodyY + pulse * 0.008,
        torsoX: archTorsoX + pulse * 0.025,
        torsoZ: -0.05 + tremor * 0.4,
        headX: tiltHeadX + pulse * 0.03,
        headY: tiltHeadY + tremor * 0.5,
        headZ: -0.14 + pulse * 0.025,
        headFaceNormalOffset: pulse * cfg.kissPulseAmp * 0.5,
        leftShoulderX: gripLShX + tremor,
        leftShoulderZ: gripLShZ - tremor * 0.6,
        leftElbowX: gripLElX + tremor * 1.4,
        leftElbowZ: gripLElZ,
        rightShoulderX: gripRShX - tremor,
        rightShoulderZ: gripRShZ + tremor * 0.6,
        rightElbowX: gripRElX - tremor * 1.4,
        rightElbowZ: gripRElZ,
        flareFactor: 0,
      };
    }

    // Beat 3: Startled upright defensive elemental flare pushing the Dark Mage away
    return {
      bodyY: THREE.MathUtils.lerp(
        cfg.bossStandingBodyY,
        cfg.bossStandingBodyY + 0.14,
        ease,
      ),
      torsoX: THREE.MathUtils.lerp(archTorsoX, -0.08, ease),
      torsoZ: THREE.MathUtils.lerp(-0.05, 0, ease),
      headX: THREE.MathUtils.lerp(tiltHeadX, 0.06, ease),
      headY: THREE.MathUtils.lerp(tiltHeadY, 0, ease),
      headZ: THREE.MathUtils.lerp(-0.14, 0, ease),
      headFaceNormalOffset: 0,
      leftShoulderX: THREE.MathUtils.lerp(gripLShX, -0.35, ease),
      leftShoulderZ: THREE.MathUtils.lerp(gripLShZ, -1.18, ease),
      leftElbowX: THREE.MathUtils.lerp(gripLElX, -0.22, ease),
      leftElbowZ: THREE.MathUtils.lerp(gripLElZ, 0, ease),
      rightShoulderX: THREE.MathUtils.lerp(gripRShX, -0.35, ease),
      rightShoulderZ: THREE.MathUtils.lerp(gripRShZ, 1.18, ease),
      rightElbowX: THREE.MathUtils.lerp(gripRElX, -0.22, ease),
      rightElbowZ: THREE.MathUtils.lerp(gripRElZ, 0, ease),
      flareFactor: ease,
    };
  }
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
