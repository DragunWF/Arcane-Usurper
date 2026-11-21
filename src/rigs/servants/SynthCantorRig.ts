import * as THREE from 'three';
import {
  HARMONIC_SERVANT_CONFIG,
  PALETTE,
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  type ServantAnimState,
  type ServantArchetype,
} from '../../config/gameConfig';
import { BaseServantRig } from './ServantBase';

/**
 * **Synth Cantor** — Floating cyber-chorister construct orbited by spinning emerald
 * and magenta equalizer rings studded with animated frequency bars.
 *
 * - `TELEGRAPH` / `ATTACK`: Flares both equalizer rings outward and gestures wide while
 *   launching rhythmic harmonic orb spreads.
 */
export class SynthCantorRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.SYNTH_CANTOR;

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly outerEqRingGroup = new THREE.Group();
  private readonly innerEqRingGroup = new THREE.Group();
  private readonly eqBarMeshes: THREE.Mesh[] = [];
  private readonly coatPanels: THREE.Group[] = [];

  private matObsidian!: THREE.MeshToonMaterial;
  private matChrome!: THREE.MeshToonMaterial;
  private matSheerHolo!: THREE.MeshToonMaterial;
  private matEmeraldGlow!: THREE.MeshBasicMaterial;
  private matMagentaGlow!: THREE.MeshBasicMaterial;
  private matCyanOptic!: THREE.MeshBasicMaterial;

  private readonly baseFloatY = 0.88 + SERVANT_CONFIG.acolyteFloatHeight;

  constructor() {
    super(HARMONIC_SERVANT_CONFIG.SYNTH_CANTOR.scale);
    this.root.name = 'SynthCantorRig';
    this.bodyPivot.position.y = this.baseFloatY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildChoristerChassis();
    this.buildAcousticHead();
    this.buildConductorArms();
    this.buildEqualizerRings();
  }

  protected override getBaseScale(): number {
    return HARMONIC_SERVANT_CONFIG.SYNTH_CANTOR.scale;
  }

  private buildMaterials(): void {
    this.matObsidian = this.createToonMat(PALETTE.cyberObsidian, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.2,
      side: THREE.DoubleSide,
    });
    this.matChrome = this.createToonMat(PALETTE.trussChrome, {
      emissive: PALETTE.mikuCyan,
      emissiveIntensity: 0.22,
    });
    this.matSheerHolo = this.createToonMat(PALETTE.harmonicEmerald, {
      emissive: PALETTE.harmonicEmerald,
      emissiveIntensity: 0.36,
      transparent: true,
      opacity: 0.56,
      side: THREE.DoubleSide,
    });
    this.matEmeraldGlow = this.createGlowMat(PALETTE.harmonicEmerald, {
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      additive: true,
    });
    this.matMagentaGlow = this.createGlowMat(PALETTE.harmonicMagenta, {
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      additive: true,
    });
    this.matCyanOptic = this.createGlowMat(PALETTE.mikuCyan);
  }

  private buildChoristerChassis(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: bodice } = this.createOutlined(
      new THREE.CylinderGeometry(0.185, 0.13, 0.46, 8),
      this.matObsidian,
      1.05,
    );
    bodice.position.y = 0.23;
    this.torsoGroup.add(bodice);

    // Holographic Equalizer Core on Chest
    const chestCore = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.082, 0)),
      this.matMagentaGlow,
    );
    chestCore.position.set(0, 0.28, 0.17);
    this.torsoGroup.add(chestCore);

    const { group: waistRing } = this.createOutlined(
      new THREE.CylinderGeometry(0.155, 0.165, 0.085, 8),
      this.matChrome,
      1.05,
    );
    waistRing.position.y = 0.02;
    this.torsoGroup.add(waistRing);

    // Floating Translucent Holo-Choir Mantle Skirt
    const { group: lowerMantle } = this.createOutlined(
      new THREE.CylinderGeometry(0.15, 0.36, 0.9, 10, 1, true),
      this.matSheerHolo,
      1.03,
      true,
    );
    lowerMantle.position.y = -0.43;
    this.torsoGroup.add(lowerMantle);

    const panelGeo = this.trackGeo(new THREE.BoxGeometry(0.15, 0.74, 0.02));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(ang) * 0.165, -0.02, Math.cos(ang) * 0.165);
      pivot.rotation.y = ang;

      const panel = new THREE.Mesh(
        panelGeo,
        i % 2 === 0 ? this.matObsidian : this.matSheerHolo,
      );
      panel.position.set(0, -0.37, 0.075);
      panel.rotation.x = -0.22;
      pivot.add(panel);

      this.torsoGroup.add(pivot);
      this.coatPanels.push(pivot);
    }
  }

  private buildAcousticHead(): void {
    this.headGroup.position.set(0, 0.5, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: head } = this.createOutlined(
      new THREE.SphereGeometry(0.134, 14, 12),
      this.matObsidian,
      1.05,
    );
    head.position.y = 0.18;
    this.headGroup.add(head);

    // Smooth Cyan Audio-Wave Faceplate Band
    const visor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.18, 0.044, 0.06)),
      this.matCyanOptic,
    );
    visor.position.set(0, 0.185, 0.112);
    this.headGroup.add(visor);

    // Dual Cyber-Acoustic Headphone Pods
    for (const side of [-1, 1] as const) {
      const { group: pod } = this.createOutlined(
        new THREE.CylinderGeometry(0.078, 0.078, 0.055, 10),
        this.matChrome,
        1.07,
      );
      pod.rotation.z = Math.PI / 2;
      pod.position.set(side * 0.155, 0.19, 0);
      this.headGroup.add(pod);

      const podRing = new THREE.Mesh(
        this.trackGeo(new THREE.TorusGeometry(0.062, 0.012, 6, 14)),
        side === -1 ? this.matEmeraldGlow : this.matMagentaGlow,
      );
      podRing.rotation.y = Math.PI / 2;
      podRing.position.set(side * 0.184, 0.19, 0);
      this.headGroup.add(podRing);
    }

    // Floating Acoustic Crown Arch
    const crown = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.165, 0.015, 6, 18, Math.PI)),
      this.matChrome,
    );
    crown.position.set(0, 0.21, 0);
    this.headGroup.add(crown);
  }

  private buildConductorArms(): void {
    const buildArm = (side: -1 | 1, pivot: THREE.Group): void => {
      pivot.position.set(side * 0.25, 0.39, 0);
      this.torsoGroup.add(pivot);

      const { group: upper } = this.createOutlined(
        new THREE.CylinderGeometry(0.046, 0.038, 0.34, 8),
        this.matChrome,
        1.07,
      );
      upper.position.y = -0.17;
      pivot.add(upper);

      const emitterRing = new THREE.Mesh(
        this.trackGeo(new THREE.TorusGeometry(0.072, 0.014, 6, 14)),
        side === -1 ? this.matEmeraldGlow : this.matMagentaGlow,
      );
      emitterRing.rotation.x = Math.PI / 2;
      emitterRing.position.y = -0.36;
      pivot.add(emitterRing);

      const emitterOrb = new THREE.Mesh(
        this.trackGeo(new THREE.OctahedronGeometry(0.056, 0)),
        this.matCyanOptic,
      );
      emitterOrb.position.y = -0.46;
      pivot.add(emitterOrb);
    };

    buildArm(-1, this.leftArmPivot);
    buildArm(1, this.rightArmPivot);
  }

  private buildEqualizerRings(): void {
    this.outerEqRingGroup.position.set(0, 0.3, -0.16);
    this.torsoGroup.add(this.outerEqRingGroup);

    this.innerEqRingGroup.position.set(0, 0.3, -0.14);
    this.torsoGroup.add(this.innerEqRingGroup);

    // Outer Emerald Equalizer Ring + Radial Spectrum Bars
    const outerTorus = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.76, 0.028, 8, 32)),
      this.matEmeraldGlow,
    );
    this.outerEqRingGroup.add(outerTorus);

    const barCount = HARMONIC_SERVANT_CONFIG.cantorEqBarCount;
    const barGeo = this.trackGeo(new THREE.BoxGeometry(0.046, 0.22, 0.024));
    for (let i = 0; i < barCount; i++) {
      const ang = (i / barCount) * Math.PI * 2;
      const barHolder = new THREE.Group();
      barHolder.rotation.z = ang;
      const bar = new THREE.Mesh(
        barGeo,
        i % 2 === 0 ? this.matEmeraldGlow : this.matMagentaGlow,
      );
      bar.position.y = 0.88;
      barHolder.add(bar);
      this.outerEqRingGroup.add(barHolder);
      this.eqBarMeshes.push(bar);
    }

    // Inner Counter-Rotating Magenta Equalizer Ring + Chrome Nodes
    const innerTorus = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.54, 0.024, 8, 28)),
      this.matMagentaGlow,
    );
    this.innerEqRingGroup.add(innerTorus);

    const nodeGeo = this.trackGeo(new THREE.OctahedronGeometry(0.058, 0));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const { group: node } = this.createOutlined(
        nodeGeo,
        this.matChrome,
        1.08,
        false,
      );
      node.position.set(Math.cos(ang) * 0.54, Math.sin(ang) * 0.54, 0);
      this.innerEqRingGroup.add(node);
    }
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const a = this.lerpFactor(dt);
    if (state === SERVANT_ANIM_STATES.DEAD) {
      const d = this.lerpFactor(dt, SERVANT_CONFIG.deadCollapseSpeed);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(
        this.bodyPivot.position.y,
        0.24,
        d,
      );
      this.bodyPivot.rotation.z = THREE.MathUtils.lerp(
        this.bodyPivot.rotation.z,
        0.68,
        d,
      );
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.6));
      return;
    }

    const hoverY =
      this.baseFloatY +
      Math.sin(phaseTime * SERVANT_CONFIG.acolyteHoverSpeed) *
        SERVANT_CONFIG.acolyteHoverAmp;
    let targetTorsoX = 0;
    let targetArmX = -0.25;
    let targetArmZ = 0.28;
    let targetOuterScale = 1.0;
    let targetInnerScale = 1.0;
    let spinMult = 1.0;
    let eqAmp = 0.45;

    if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      targetTorsoX = -0.14;
      targetArmX = -1.25;
      targetArmZ = 0.72;
      targetOuterScale = HARMONIC_SERVANT_CONFIG.cantorRingFlareScale;
      targetInnerScale = HARMONIC_SERVANT_CONFIG.cantorRingFlareScale * 0.94;
      spinMult = SERVANT_CONFIG.acolyteSigilFlareSpinMult;
      eqAmp = 0.95;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Flings arms wide and flares both emerald & magenta equalizer rings outward
      targetTorsoX = 0.16;
      targetArmX = -1.48;
      targetArmZ = 1.12;
      targetOuterScale = HARMONIC_SERVANT_CONFIG.cantorRingFlareScale * 1.16;
      targetInnerScale = HARMONIC_SERVANT_CONFIG.cantorRingFlareScale * 1.1;
      spinMult = SERVANT_CONFIG.acolyteSigilFlareSpinMult * 1.35;
      eqAmp = 1.35;
    } else if (state === SERVANT_ANIM_STATES.MOVE) {
      targetTorsoX = 0.15;
      targetArmX = -0.14;
      targetArmZ = 0.38;
      eqAmp = 0.6;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(
      this.bodyPivot.position.y,
      hoverY,
      a,
    );
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      this.torsoGroup.rotation.x,
      targetTorsoX,
      a,
    );
    this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(
      this.leftArmPivot.rotation.x,
      targetArmX,
      a,
    );
    this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(
      this.leftArmPivot.rotation.z,
      targetArmZ,
      a,
    );
    this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
      this.rightArmPivot.rotation.x,
      targetArmX,
      a,
    );
    this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(
      this.rightArmPivot.rotation.z,
      -targetArmZ,
      a,
    );

    const spinStep = dt * HARMONIC_SERVANT_CONFIG.cantorRingSpinSpeed * spinMult;
    this.outerEqRingGroup.rotation.z += spinStep;
    this.innerEqRingGroup.rotation.z -= spinStep * 1.4;
    this.innerEqRingGroup.rotation.y = Math.sin(phaseTime * 2.2) * 0.24;

    const nextOuter = THREE.MathUtils.lerp(
      this.outerEqRingGroup.scale.x,
      targetOuterScale,
      a,
    );
    const nextInner = THREE.MathUtils.lerp(
      this.innerEqRingGroup.scale.x,
      targetInnerScale,
      a,
    );
    this.outerEqRingGroup.scale.setScalar(nextOuter);
    this.innerEqRingGroup.scale.setScalar(nextInner);

    for (let i = 0; i < this.eqBarMeshes.length; i++) {
      const bar = this.eqBarMeshes[i];
      if (!bar) continue;
      const level = 0.55 + eqAmp * (0.5 + 0.5 * Math.sin(phaseTime * 9.5 + i * 0.9));
      bar.scale.y = level;
    }

    for (let i = 0; i < this.coatPanels.length; i++) {
      const panel = this.coatPanels[i];
      if (!panel) continue;
      panel.rotation.x = Math.sin(phaseTime * 2.8 + i * 1.05) * 0.12;
    }
  }
}
