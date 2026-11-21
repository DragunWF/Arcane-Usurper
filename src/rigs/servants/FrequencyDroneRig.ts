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
 * **Frequency Drone** — Twin-winged cyber spotlight/patrol drone with glowing cyan optics
 * and an articulated trailing holographic light ribbon.
 *
 * - `MOVE`: Banks steeply while circling in pairs with rippling light ribbon.
 * - `TELEGRAPH` / `ATTACK`: Pulls back and snaps forward in fast diagonal beam-swoops.
 */
export class FrequencyDroneRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.FREQUENCY_DRONE;

  private readonly bodyPivot = new THREE.Group();
  private readonly leftWingPivot = new THREE.Group();
  private readonly rightWingPivot = new THREE.Group();
  private readonly ribbonPivots: THREE.Group[] = [];
  private readonly beamConeGroup = new THREE.Group();

  private matChassis!: THREE.MeshToonMaterial;
  private matChrome!: THREE.MeshToonMaterial;
  private matCyanOptic!: THREE.MeshBasicMaterial;
  private matEmeraldTrim!: THREE.MeshBasicMaterial;
  private matMagentaGlow!: THREE.MeshBasicMaterial;
  private matBeamCone!: THREE.MeshBasicMaterial;
  private matRibbonCyan!: THREE.MeshBasicMaterial;
  private matRibbonMagenta!: THREE.MeshBasicMaterial;

  private readonly baseHoverY = HARMONIC_SERVANT_CONFIG.droneBaseHoverY;

  constructor() {
    super(HARMONIC_SERVANT_CONFIG.FREQUENCY_DRONE.scale);
    this.root.name = 'FrequencyDroneRig';
    this.bodyPivot.position.y = this.baseHoverY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildSpotlightChassis();
    this.buildTwinWings();
    this.buildHolographicLightRibbon();
  }

  protected override getBaseScale(): number {
    return HARMONIC_SERVANT_CONFIG.FREQUENCY_DRONE.scale;
  }

  private buildMaterials(): void {
    this.matChassis = this.createToonMat(PALETTE.cyberObsidian, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.22,
    });
    this.matChrome = this.createToonMat(PALETTE.trussChrome, {
      emissive: PALETTE.mikuCyan,
      emissiveIntensity: 0.22,
    });
    this.matCyanOptic = this.createGlowMat(PALETTE.mikuCyan);
    this.matEmeraldTrim = this.createGlowMat(PALETTE.harmonicEmerald);
    this.matMagentaGlow = this.createGlowMat(PALETTE.harmonicMagenta);
    this.matBeamCone = this.createGlowMat(PALETTE.mikuCyan, {
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      additive: true,
    });
    this.matRibbonCyan = this.createGlowMat(PALETTE.mikuCyan, {
      transparent: true,
      opacity: 0.56,
      side: THREE.DoubleSide,
      additive: true,
    });
    this.matRibbonMagenta = this.createGlowMat(PALETTE.harmonicMagenta, {
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      additive: true,
    });
  }

  private buildSpotlightChassis(): void {
    // Sleek Faceted Patrol Drone Core
    const { group: hull } = this.createOutlined(
      new THREE.OctahedronGeometry(0.36, 1),
      this.matChassis,
      1.05,
    );
    hull.scale.set(1.05, 0.68, 1.38);
    this.bodyPivot.add(hull);

    // Brushed-Chrome Dorsal Stabilizer Fin
    const { group: dorsalFin } = this.createOutlined(
      new THREE.BoxGeometry(0.06, 0.22, 0.56),
      this.matChrome,
      1.06,
    );
    dorsalFin.position.set(0, 0.24, -0.06);
    this.bodyPivot.add(dorsalFin);

    // Front Glowing Cyan Spotlight Optic Lens + Outer Bezel
    const { group: bezel } = this.createOutlined(
      new THREE.TorusGeometry(0.18, 0.036, 8, 16),
      this.matChrome,
      1.06,
    );
    bezel.position.set(0, -0.01, 0.44);
    this.bodyPivot.add(bezel);

    const opticLens = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.155, 12, 10)),
      this.matCyanOptic,
    );
    opticLens.scale.set(1.0, 1.0, 0.45);
    opticLens.position.set(0, -0.01, 0.43);
    this.bodyPivot.add(opticLens);

    // Forward Volumetric Spotlight Beam Cone
    this.beamConeGroup.position.set(0, -0.01, 0.46);
    this.bodyPivot.add(this.beamConeGroup);

    const coneGeo = this.trackGeo(
      new THREE.ConeGeometry(0.46, 1.85, 12, 1, true),
    );
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, 0.925);
    const beamCone = new THREE.Mesh(coneGeo, this.matBeamCone);
    this.beamConeGroup.add(beamCone);
  }

  private buildTwinWings(): void {
    const buildWing = (side: -1 | 1, pivot: THREE.Group): void => {
      pivot.position.set(side * 0.34, 0.02, 0.04);
      this.bodyPivot.add(pivot);

      const { group: mainBlade } = this.createOutlined(
        new THREE.BoxGeometry(0.86, 0.065, 0.42),
        this.matChassis,
        1.05,
      );
      mainBlade.position.set(side * 0.43, 0, -0.08);
      mainBlade.rotation.y = side * 0.26;
      pivot.add(mainBlade);

      // Emerald Leading-Edge Frequency Strip
      const leadStrip = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.84, 0.028, 0.05)),
        this.matEmeraldTrim,
      );
      leadStrip.position.set(side * 0.43, 0.02, 0.13);
      leadStrip.rotation.y = side * 0.26;
      pivot.add(leadStrip);

      // Magenta Wingtip Thruster Pod
      const { group: tipPod } = this.createOutlined(
        new THREE.CylinderGeometry(0.055, 0.045, 0.38, 8),
        this.matChrome,
        1.07,
      );
      tipPod.rotation.x = Math.PI / 2;
      tipPod.position.set(side * 0.86, 0, -0.18);
      pivot.add(tipPod);

      const thrusterGlow = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.052, 8, 8)),
        this.matMagentaGlow,
      );
      thrusterGlow.position.set(side * 0.86, 0, -0.38);
      pivot.add(thrusterGlow);
    };

    buildWing(-1, this.leftWingPivot);
    buildWing(1, this.rightWingPivot);
  }

  private buildHolographicLightRibbon(): void {
    const segCount = HARMONIC_SERVANT_CONFIG.droneRibbonSegments;
    const segLen = 0.36;
    let parent: THREE.Object3D = this.bodyPivot;
    let offsetZ = -0.5;

    for (let i = 0; i < segCount; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, offsetZ);
      parent.add(pivot);

      const width = 0.34 * (1 - i * 0.16);
      const ribbonStrip = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(width, segLen)),
        i % 2 === 0 ? this.matRibbonCyan : this.matRibbonMagenta,
      );
      ribbonStrip.rotation.x = -Math.PI / 2;
      ribbonStrip.position.z = -segLen * 0.5;
      pivot.add(ribbonStrip);

      const verticalRibbon = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(segLen, width * 0.65)),
        i % 2 === 0 ? this.matRibbonMagenta : this.matRibbonCyan,
      );
      verticalRibbon.rotation.y = Math.PI / 2;
      verticalRibbon.position.z = -segLen * 0.5;
      pivot.add(verticalRibbon);

      this.ribbonPivots.push(pivot);
      parent = pivot;
      offsetZ = -segLen;
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
        0.18,
        d,
      );
      this.bodyPivot.rotation.z = THREE.MathUtils.lerp(
        this.bodyPivot.rotation.z,
        Math.PI * 1.1,
        d,
      );
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.65));
      return;
    }

    let targetHoverY = this.baseHoverY + Math.sin(phaseTime * 3.4) * 0.11;
    let targetPosZ = 0;
    let targetPitch = 0;
    let targetRoll = 0;
    let targetWingSweepY = 0;
    let targetWingDihedralZ = 0.08;
    let targetBeamScale = 1.0;
    let targetBeamOpacity = 0.2;
    let ribbonAmp = 0.22;

    if (state === SERVANT_ANIM_STATES.MOVE) {
      // Steep banking lean while circling the Dark Mage in pairs
      targetRoll = Math.sin(phaseTime * 2.1) * HARMONIC_SERVANT_CONFIG.droneBankAmp;
      targetPitch = 0.1;
      targetWingDihedralZ = 0.12 + Math.sin(phaseTime * 5.2) * 0.08;
      targetBeamOpacity = 0.26;
      ribbonAmp = 0.3;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Coils back and charges its cyan spotlight optic for a diagonal swoop
      targetHoverY = this.baseHoverY + 0.18;
      targetPosZ = -0.26;
      targetPitch = -0.26;
      targetRoll = 0.42;
      targetWingSweepY = 0.24;
      targetWingDihedralZ = 0.24;
      targetBeamScale = 1.25;
      targetBeamOpacity = 0.35 + 0.25 * Math.sin(phaseTime * 24);
      ribbonAmp = 0.36;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Snaps forward in a steep diagonal beam-swoop
      targetHoverY = this.baseHoverY - 0.18;
      targetPosZ = SERVANT_CONFIG.houndPounceForwardZ;
      targetPitch = 0.34;
      targetRoll = HARMONIC_SERVANT_CONFIG.droneSwoopRoll;
      targetWingSweepY = 0.38;
      targetWingDihedralZ = -0.14;
      targetBeamScale = 1.55;
      targetBeamOpacity = 0.68;
      ribbonAmp = 0.52;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(
      this.bodyPivot.position.y,
      targetHoverY,
      a,
    );
    this.bodyPivot.position.z = THREE.MathUtils.lerp(
      this.bodyPivot.position.z,
      targetPosZ,
      a,
    );
    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(
      this.bodyPivot.rotation.x,
      targetPitch,
      a,
    );
    this.bodyPivot.rotation.z = THREE.MathUtils.lerp(
      this.bodyPivot.rotation.z,
      targetRoll,
      a,
    );

    this.leftWingPivot.rotation.y = THREE.MathUtils.lerp(
      this.leftWingPivot.rotation.y,
      targetWingSweepY,
      a,
    );
    this.rightWingPivot.rotation.y = THREE.MathUtils.lerp(
      this.rightWingPivot.rotation.y,
      -targetWingSweepY,
      a,
    );
    this.leftWingPivot.rotation.z = THREE.MathUtils.lerp(
      this.leftWingPivot.rotation.z,
      targetWingDihedralZ,
      a,
    );
    this.rightWingPivot.rotation.z = THREE.MathUtils.lerp(
      this.rightWingPivot.rotation.z,
      -targetWingDihedralZ,
      a,
    );

    const nextBeam = THREE.MathUtils.lerp(
      this.beamConeGroup.scale.z,
      targetBeamScale,
      a,
    );
    this.beamConeGroup.scale.set(
      1 + (nextBeam - 1) * 0.45,
      1 + (nextBeam - 1) * 0.45,
      nextBeam,
    );
    this.matBeamCone.opacity = targetBeamOpacity;

    const waveSpeed = HARMONIC_SERVANT_CONFIG.droneRibbonWaveSpeed;
    for (let i = 0; i < this.ribbonPivots.length; i++) {
      const seg = this.ribbonPivots[i];
      if (!seg) continue;
      seg.rotation.y = Math.sin(phaseTime * waveSpeed - i * 0.85) * ribbonAmp;
      seg.rotation.x =
        Math.cos(phaseTime * (waveSpeed * 0.7) - i * 0.65) * ribbonAmp * 0.45;
    }
  }
}
