import * as THREE from 'three';
import { PALETTE, SHARRAN_CRYPT_CONFIG } from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import type { ChamberCollider } from './IcePalaceLevel';

interface ShadowMistDrift {
  readonly baseAngle: number;
  readonly radius: number;
  readonly baseY: number;
  readonly angularSpeed: number;
  readonly bobSpeed: number;
  readonly bobAmp: number;
  readonly phase: number;
}

interface BrazierFlameHandle {
  readonly outerCone: THREE.Mesh;
  readonly innerCone: THREE.Mesh;
  readonly light: THREE.PointLight | null;
  readonly phase: number;
}

/**
 * Self-contained procedural 3D Special Scenario boss arena: **Sharran Crypt Dungeon Arena** (`sharran_crypt`).
 *
 * - Subterranean vaulted obsidian crypt with `1.5x` standard arena radius (`27.0m`) for spacious 1v4 combat
 * - Dark polished obsidian floor inlaid with glowing royal-violet (`#8B5CF6`) and silver lunar concentric rings
 * - Bordered by 12 gothic obsidian crypt arches, overhead vaulted ribs, and 8 flickering magenta-violet brazier sconces
 * - Rear Sharran lunar altar dais anchoring Shadowheart (`z = -17.5m`)
 * - 4 symmetrical weathered obsidian tactical pillars at `0.52 * arenaRadius` (`14.04m`) providing smooth cylinder
 *   push-out for both player & bosses and line-of-sight projectile blocking without snagging the third-person camera
 * - Pooled drifting shadow mist particle field with zero per-frame allocations.
 */
export class SharranCryptLevel {
  public readonly root = new THREE.Group();

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  private readonly mistDrifts: ShadowMistDrift[] = [];
  private readonly braziers: BrazierFlameHandle[] = [];
  private readonly lunarRuneMats: THREE.MeshBasicMaterial[] = [];
  private mistPoints: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;
  private innerLunarRing: THREE.Mesh | null = null;
  private outerLunarRing: THREE.Mesh | null = null;

  public get pillarColliders(): readonly ChamberCollider[] {
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    return this._pillarMeshes;
  }

  /**
   * Intentionally excludes the 4 inner tactical obsidian cover pillars so the third-person
   * combat camera glides smoothly around cover without snapping; outer vaulted wall bounds
   * are enforced analytically by `CameraRig` for `SHARRAN_CRYPT`.
   */
  public get cameraColliders(): readonly THREE.Object3D[] {
    return this._cameraColliders;
  }

  constructor() {
    this.root.name = 'SharranCryptLevel';
    this.buildObsidianLunarFloor();
    this.buildRearLunarAltarDais();
    this.buildFourTacticalObsidianPillars();
    this.buildVaultedGothicCryptPerimeter();
    this.buildBrazierSconces();
    this.buildDriftingShadowMistPool();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private trackTex<T extends THREE.Texture>(tex: T): T {
    this.ownedTextures.push(tex);
    return tex;
  }

  /**
   * Dark polished obsidian stone floor (`radius = 27.0m`) inlaid with glowing royal-violet
   * (`#8B5CF6`) and silver lunar (`#E2E8F0`) concentric rings and Sharran crescent geometry.
   */
  private buildObsidianLunarFloor(): void {
    const R = SHARRAN_CRYPT_CONFIG.arenaRadius;
    const size = SHARRAN_CRYPT_CONFIG.floorTextureSize;
    const c = size * 0.5;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d');

    const emisCanvas = document.createElement('canvas');
    emisCanvas.width = size;
    emisCanvas.height = size;
    const eCtx = emisCanvas.getContext('2d');

    if (dCtx && eCtx) {
      // Polished obsidian stone radial gradient
      const floorGrad = dCtx.createRadialGradient(c, c, 28, c, c, c);
      floorGrad.addColorStop(0.0, PALETTE.hex.sharranCryptStone);
      floorGrad.addColorStop(0.58, PALETTE.hex.sharranObsidianFloor);
      floorGrad.addColorStop(1.0, PALETTE.hex.abyssalCloak);
      dCtx.fillStyle = floorGrad;
      dCtx.fillRect(0, 0, size, size);

      // Subtle concentric obsidian stone slab seams & radial masonry joints
      dCtx.save();
      dCtx.translate(c, c);
      dCtx.strokeStyle = 'rgba(2, 6, 23, 0.78)';
      dCtx.lineWidth = 3;
      const slabRings = [96, 184, 276, 368, 456];
      for (let i = 0; i < slabRings.length; i++) {
        dCtx.beginPath();
        dCtx.arc(0, 0, slabRings[i]!, 0, Math.PI * 2);
        dCtx.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        dCtx.beginPath();
        dCtx.moveTo(Math.cos(ang) * 96, Math.sin(ang) * 96);
        dCtx.lineTo(Math.cos(ang) * c, Math.sin(ang) * c);
        dCtx.stroke();
      }
      dCtx.restore();

      eCtx.fillStyle = PALETTE.hex.pureBlack;
      eCtx.fillRect(0, 0, size, size);

      // Glowing Royal-Violet (#8B5CF6) & Silver Lunar (#E2E8F0) Concentric Rings & Sharran Disc
      const drawLunarInlay = (
        ctx: CanvasRenderingContext2D,
        emissive: boolean,
      ) => {
        ctx.save();
        ctx.translate(c, c);

        const violet = emissive
          ? 'rgba(139, 92, 246, 0.92)'
          : 'rgba(139, 92, 246, 0.56)';
        const silver = emissive
          ? 'rgba(226, 232, 240, 0.88)'
          : 'rgba(226, 232, 240, 0.48)';
        const softGlow = emissive
          ? 'rgba(168, 85, 247, 0.32)'
          : 'rgba(139, 92, 246, 0.22)';

        // Central Sharran dark-sun / eclipsed lunar ring motif
        ctx.beginPath();
        ctx.arc(0, 0, 108, 0, Math.PI * 2);
        ctx.strokeStyle = softGlow;
        ctx.lineWidth = 18;
        ctx.stroke();

        const rings = [
          { r: 88, color: violet, w: 5 },
          { r: 112, color: silver, w: 3 },
          { r: 212, color: violet, w: 4.5 },
          { r: 266, color: silver, w: 2.8 },
          { r: 356, color: violet, w: 5.5 },
          { r: 382, color: silver, w: 2.5 },
          { r: 462, color: violet, w: 4 },
        ];
        for (let i = 0; i < rings.length; i++) {
          const ring = rings[i]!;
          ctx.beginPath();
          ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
          ctx.strokeStyle = ring.color;
          ctx.lineWidth = ring.w;
          ctx.stroke();
        }

        // 8 Lunar phase crescents & compass rays linking inner and outer rings
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.save();
          ctx.rotate(a);
          ctx.strokeStyle = i % 2 === 0 ? violet : silver;
          ctx.lineWidth = i % 2 === 0 ? 4 : 2.6;
          ctx.beginPath();
          ctx.moveTo(0, 112);
          ctx.lineTo(0, 356);
          ctx.stroke();

          // Small silver lunar medallion between mid rings
          ctx.beginPath();
          ctx.arc(0, 239, 13, 0, Math.PI * 2);
          ctx.strokeStyle = silver;
          ctx.lineWidth = 2.4;
          ctx.stroke();
          ctx.restore();
        }

        // Subtle north-south processional inlay leading to the rear altar dais
        ctx.strokeStyle = violet;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-26, -112);
        ctx.lineTo(-26, -462);
        ctx.moveTo(26, -112);
        ctx.lineTo(26, -462);
        ctx.stroke();

        ctx.restore();
      };

      drawLunarInlay(dCtx, false);
      drawLunarInlay(eCtx, true);
    }

    const diffuseMap = this.trackTex(new THREE.CanvasTexture(diffCanvas));
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.anisotropy = 4;

    const emissiveMap = this.trackTex(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.anisotropy = 4;

    const floorGeo = this.trackGeo(
      new THREE.CylinderGeometry(R + 0.6, R + 0.8, 1.0, 64),
    );
    const floorTopMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.amethystTrim),
        emissiveMap,
        emissiveIntensity: 0.82,
        roughness: 0.28,
        metalness: 0.34,
      }),
    );
    const floorSideMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.sharranCryptStone),
    );

    const floorMesh = new THREE.Mesh(floorGeo, [
      floorSideMat,
      floorTopMat,
      floorSideMat,
    ]);
    floorMesh.position.y = -0.5;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Subtle slowly rotating additive royal-violet & silver lunar ground halos
    const innerRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.innerLunarRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(5.6, 5.88, 56)),
      innerRingMat,
    );
    this.innerLunarRing.rotation.x = -Math.PI / 2;
    this.innerLunarRing.position.y = 0.025;
    this.root.add(this.innerLunarRing);

    const outerRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sharranLunarSilver,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.outerLunarRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(18.6, 18.88, 64)),
      outerRingMat,
    );
    this.outerLunarRing.rotation.x = -Math.PI / 2;
    this.outerLunarRing.position.y = 0.022;
    this.root.add(this.outerLunarRing);
  }

  /**
   * Elevated Sharran lunar altar dais at the northern rear of the crypt (`z = -17.5m`)
   * anchoring Shadowheart's starting sanctuary position.
   */
  private buildRearLunarAltarDais(): void {
    const cfg = SHARRAN_CRYPT_CONFIG;
    const altarGroup = new THREE.Group();
    altarGroup.position.set(0, 0, cfg.altarPosZ);

    const daisStoneMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.sharranArchSlate, {
        emissive: PALETTE.sharranShadowMist,
        emissiveIntensity: 0.16,
      }),
    );
    const silverTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sharranLunarSilver,
        transparent: true,
        opacity: 0.72,
      }),
    );
    const violetSigilMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.lunarRuneMats.push(violetSigilMat);

    // Lower octagonal stepped dais
    const tier1 = new THREE.Mesh(
      this.trackGeo(
        new THREE.CylinderGeometry(
          cfg.altarRadius,
          cfg.altarRadius + 0.55,
          cfg.altarHeight * 0.55,
          8,
        ),
      ),
      daisStoneMat,
    );
    tier1.position.y = cfg.altarHeight * 0.275;
    tier1.receiveShadow = true;
    altarGroup.add(tier1);

    const tier2 = new THREE.Mesh(
      this.trackGeo(
        new THREE.CylinderGeometry(
          cfg.altarRadius - 0.65,
          cfg.altarRadius - 0.3,
          cfg.altarHeight * 0.45,
          8,
        ),
      ),
      daisStoneMat,
    );
    tier2.position.y = cfg.altarHeight * 0.775;
    tier2.receiveShadow = true;
    altarGroup.add(tier2);

    // Glowing Sharran lunar ring embedded atop the altar dais
    const altarRing = new THREE.Mesh(
      this.trackGeo(
        new THREE.RingGeometry(
          cfg.altarRadius - 1.15,
          cfg.altarRadius - 0.9,
          40,
        ),
      ),
      violetSigilMat,
    );
    altarRing.rotation.x = -Math.PI / 2;
    altarRing.position.y = cfg.altarHeight + 0.02;
    altarGroup.add(altarRing);

    // Sculpted dark-moon obsidian monument rising behind the altar (outside playable clamp)
    const monumentGroup = new THREE.Group();
    monumentGroup.position.set(0, 0, -5.6);

    const monolithBody = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(3.8, 7.6, 0.75)),
      daisStoneMat,
    );
    monolithBody.position.y = 3.8;
    monolithBody.castShadow = true;
    monumentGroup.add(monolithBody);

    // Eclipsed Sharran Dark Disc framed by luminous silver-violet halo
    const darkDisc = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(1.45, 1.45, 0.26, 28)),
      this.trackMat(
        ToonAssets.createThreeStepToonMaterial(PALETTE.abyssalCloak),
      ),
    );
    darkDisc.rotation.x = Math.PI / 2;
    darkDisc.position.set(0, 5.1, 0.42);
    monumentGroup.add(darkDisc);

    const lunarHalo = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(1.56, 0.085, 10, 36)),
      silverTrimMat,
    );
    lunarHalo.position.set(0, 5.1, 0.46);
    monumentGroup.add(lunarHalo);

    altarGroup.add(monumentGroup);
    this.root.add(altarGroup);
  }

  /**
   * 4 symmetrical weathered obsidian cover pillars in an outer ring (`radius = 0.52 * arenaRadius`).
   * Provides smooth cylinder collision push-out for both player & bosses and line-of-sight
   * projectile blocking, while intentionally omitting them from `cameraColliders` so the
   * third-person camera never snags around tactical cover.
   */
  private buildFourTacticalObsidianPillars(): void {
    const cfg = SHARRAN_CRYPT_CONFIG;
    const ringR = cfg.arenaRadius * cfg.innerPillarRingRatio;
    const baseR = cfg.innerPillarBaseRadius;
    const totalH = cfg.innerPillarHeight;

    const obsidianShaftMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.sharranCryptStone, {
        emissive: PALETTE.sharranShadowMist,
        emissiveIntensity: 0.22,
      }),
    );
    const weatheredCapMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.sharranArchSlate, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.14,
      }),
    );
    const violetBandMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.84,
      }),
    );
    const silverBandMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sharranLunarSilver,
        transparent: true,
        opacity: 0.74,
      }),
    );
    this.lunarRuneMats.push(violetBandMat);

    const baseGeo = this.trackGeo(
      new THREE.CylinderGeometry(baseR * 1.06, baseR * 1.24, 0.78, 8),
    );
    const plinthGeo = this.trackGeo(
      new THREE.CylinderGeometry(baseR * 0.92, baseR * 1.04, 0.58, 8),
    );
    const shaftH = totalH - 2.6;
    const shaftGeo = this.trackGeo(
      new THREE.CylinderGeometry(baseR * 0.78, baseR * 0.88, shaftH, 8),
    );
    const collarGeo = this.trackGeo(
      new THREE.CylinderGeometry(baseR * 0.94, baseR * 0.94, 0.16, 8),
    );
    const silverCollarGeo = this.trackGeo(
      new THREE.CylinderGeometry(baseR * 0.86, baseR * 0.86, 0.12, 8),
    );
    const capitalGeo = this.trackGeo(
      new THREE.CylinderGeometry(baseR * 1.22, baseR * 0.84, 1.25, 8),
    );
    const buttressGeo = this.trackGeo(
      new THREE.BoxGeometry(0.26, shaftH * 0.84, 0.42),
    );

    for (let i = 0; i < cfg.innerPillarCount; i++) {
      const ang =
        cfg.innerPillarAngleOffsetRad +
        (i / cfg.innerPillarCount) * Math.PI * 2;
      const px = Math.cos(ang) * ringR;
      const pz = Math.sin(ang) * ringR;

      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(px, 0, pz);
      pillarGroup.lookAt(0, 0, 0);

      const baseMesh = new THREE.Mesh(baseGeo, weatheredCapMat);
      baseMesh.position.y = 0.39;
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      pillarGroup.add(baseMesh);

      const plinthMesh = new THREE.Mesh(plinthGeo, weatheredCapMat);
      plinthMesh.position.y = 1.06;
      plinthMesh.castShadow = true;
      plinthMesh.receiveShadow = true;
      pillarGroup.add(plinthMesh);

      const lowerVioletCollar = new THREE.Mesh(collarGeo, violetBandMat);
      lowerVioletCollar.position.y = 1.42;
      pillarGroup.add(lowerVioletCollar);

      const { group: shaftObj, mainMesh: shaftMesh } =
        ToonAssets.createOutlinedMesh(
          shaftGeo,
          obsidianShaftMat,
          { x: 1.04, y: 1.005, z: 1.04 },
          true,
        );
      shaftObj.position.y = 1.42 + shaftH * 0.5;
      pillarGroup.add(shaftObj);

      // 4 carved weathered gothic fluting ribs around each obsidian pillar
      for (let r = 0; r < 4; r++) {
        const ribAng = (r / 4) * Math.PI * 2;
        const rib = new THREE.Mesh(buttressGeo, weatheredCapMat);
        rib.position.set(
          Math.sin(ribAng) * (baseR * 0.82),
          1.42 + shaftH * 0.48,
          Math.cos(ribAng) * (baseR * 0.82),
        );
        rib.rotation.y = ribAng;
        rib.castShadow = true;
        pillarGroup.add(rib);
      }

      const midSilverBand = new THREE.Mesh(silverCollarGeo, silverBandMat);
      midSilverBand.position.y = 1.42 + shaftH * 0.52;
      pillarGroup.add(midSilverBand);

      const upperVioletCollar = new THREE.Mesh(collarGeo, violetBandMat);
      upperVioletCollar.position.y = 1.42 + shaftH - 0.12;
      pillarGroup.add(upperVioletCollar);

      const capital = new THREE.Mesh(capitalGeo, weatheredCapMat);
      capital.position.y = 1.42 + shaftH + 0.62;
      capital.castShadow = true;
      pillarGroup.add(capital);

      this.root.add(pillarGroup);

      // Smooth cylinder push-out collider (used by player, bosses, and ranged projectile blocking)
      this._pillarColliders.push({
        x: px,
        z: pz,
        radius: cfg.innerPillarCollisionRadius,
        height: totalH,
      });
      // Reticle raycast mesh (NOT added to _cameraColliders so camera never snags!)
      this._pillarMeshes.push(shaftMesh, baseMesh);
    }
  }

  /**
   * 12 gothic obsidian crypt arches ringing the perimeter (`r = 27.4m`) joined by
   * vaulted stone ribs converging overhead into a subterranean dark dome.
   */
  private buildVaultedGothicCryptPerimeter(): void {
    const cfg = SHARRAN_CRYPT_CONFIG;
    const count = cfg.archCount;
    const wallR = cfg.wallRadius;
    const wallH = cfg.wallHeight;

    const wallMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.sharranObsidianFloor, {
        emissive: PALETTE.sharranShadowMist,
        emissiveIntensity: 0.14,
      }),
    );
    const archMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.sharranArchSlate, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.15,
      }),
    );
    const trimVioletMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.65,
      }),
    );

    // Subterranean cylindrical enclosure wall
    const enclosureWall = new THREE.Mesh(
      this.trackGeo(
        new THREE.CylinderGeometry(wallR + 0.8, wallR + 0.8, wallH + 4, 36, 1, true),
      ),
      this.trackMat(
        new THREE.MeshStandardMaterial({
          color: PALETTE.sharranObsidianFloor,
          emissive: new THREE.Color(PALETTE.sharranShadowMist),
          emissiveIntensity: 0.18,
          roughness: 0.78,
          metalness: 0.16,
          side: THREE.BackSide,
        }),
      ),
    );
    enclosureWall.position.y = wallH * 0.5;
    this.root.add(enclosureWall);

    // Overhead vaulted subterranean obsidian dome cap
    const vaultDome = new THREE.Mesh(
      this.trackGeo(
        new THREE.SphereGeometry(
          wallR + 1.2,
          28,
          14,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.48,
        ),
      ),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: PALETTE.abyssalCloak,
          side: THREE.BackSide,
        }),
      ),
    );
    vaultDome.scale.set(1, 0.55, 1);
    vaultDome.position.y = wallH - 3.0;
    this.root.add(vaultDome);

    // Central high Sharran ceiling oculus ring
    const oculusRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(4.8, 0.24, 10, 32)),
      trimVioletMat,
    );
    oculusRing.rotation.x = Math.PI / 2;
    oculusRing.position.y = cfg.vaultApexY - 0.4;
    this.root.add(oculusRing);

    const pierGeo = this.trackGeo(new THREE.BoxGeometry(1.75, wallH, 1.55));
    const archSpanGeo = this.trackGeo(
      new THREE.TorusGeometry(
        (Math.PI * wallR) / count,
        0.42,
        8,
        16,
        Math.PI,
      ),
    );
    const ribLen = Math.hypot(wallR - 4.8, cfg.vaultApexY - wallH + 2.0);
    const vaultRibGeo = this.trackGeo(new THREE.BoxGeometry(0.65, 0.75, ribLen));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const nextAng = ((i + 1) / count) * Math.PI * 2;
      const midAng = (ang + nextAng) * 0.5;

      const px = Math.cos(ang) * wallR;
      const pz = Math.sin(ang) * wallR;

      // Perimeter gothic arch pier
      const pier = new THREE.Mesh(pierGeo, archMat);
      pier.position.set(px, wallH * 0.5, pz);
      pier.lookAt(0, wallH * 0.5, 0);
      pier.receiveShadow = true;
      this.root.add(pier);

      // Glowing vertical Sharran flute strip along each perimeter pier
      const flute = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.14, wallH * 0.65, 0.08)),
        trimVioletMat,
      );
      flute.position.set(
        Math.cos(ang) * (wallR - 0.84),
        wallH * 0.48,
        Math.sin(ang) * (wallR - 0.84),
      );
      flute.lookAt(0, wallH * 0.48, 0);
      this.root.add(flute);

      // Gothic arch lintel bridging adjacent perimeter piers
      const archX = Math.cos(midAng) * (wallR - 0.25);
      const archZ = Math.sin(midAng) * (wallR - 0.25);
      const archMesh = new THREE.Mesh(archSpanGeo, wallMat);
      archMesh.position.set(archX, wallH - 4.4, archZ);
      archMesh.lookAt(0, wallH - 4.4, 0);
      this.root.add(archMesh);

      // Overhead vaulted rib sweeping from pier capital up to ceiling oculus
      const rib = new THREE.Mesh(vaultRibGeo, archMat);
      const midR = (wallR + 4.8) * 0.5;
      const midY = (wallH - 1.2 + cfg.vaultApexY) * 0.5;
      rib.position.set(Math.cos(ang) * midR, midY, Math.sin(ang) * midR);
      rib.lookAt(0, cfg.vaultApexY, 0);
      this.root.add(rib);
    }
  }

  /**
   * 8 flickering magenta-violet brazier sconces illuminating the crypt perimeter.
   */
  private buildBrazierSconces(): void {
    const cfg = SHARRAN_CRYPT_CONFIG;
    const count = cfg.brazierCount;
    const ringR = cfg.brazierRingRadius;

    const ironMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.obsidianTrim),
    );
    const outerFlameMatBase = new THREE.MeshBasicMaterial({
      color: PALETTE.sharranBrazierMagenta,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerFlameMatBase = new THREE.MeshBasicMaterial({
      color: PALETTE.voidCoreFuchsia,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trackMat(outerFlameMatBase);
    this.trackMat(innerFlameMatBase);

    const standGeo = this.trackGeo(new THREE.CylinderGeometry(0.22, 0.38, 1.9, 6));
    const bowlGeo = this.trackGeo(new THREE.CylinderGeometry(0.68, 0.28, 0.58, 8));
    const outerConeGeo = this.trackGeo(new THREE.ConeGeometry(0.46, 1.35, 7));
    const innerConeGeo = this.trackGeo(new THREE.ConeGeometry(0.24, 0.92, 6));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.PI / count;
      const bx = Math.cos(ang) * ringR;
      const bz = Math.sin(ang) * ringR;

      const group = new THREE.Group();
      group.position.set(bx, 0, bz);

      const stand = new THREE.Mesh(standGeo, ironMat);
      stand.position.y = 0.95;
      stand.castShadow = true;
      group.add(stand);

      const bowl = new THREE.Mesh(bowlGeo, ironMat);
      bowl.position.y = cfg.brazierSconceY - 0.18;
      group.add(bowl);

      const outerCone = new THREE.Mesh(outerConeGeo, outerFlameMatBase);
      outerCone.position.y = cfg.brazierSconceY + 0.56;
      group.add(outerCone);

      const innerCone = new THREE.Mesh(innerConeGeo, innerFlameMatBase);
      innerCone.position.y = cfg.brazierSconceY + 0.42;
      group.add(innerCone);

      // Attach calibrated PointLight on every alternate brazier (4 dynamic lights total for 60 FPS)
      let light: THREE.PointLight | null = null;
      if (i % 2 === 0) {
        light = new THREE.PointLight(
          PALETTE.sharranBrazierMagenta,
          cfg.brazierLightIntensity,
          cfg.brazierLightDistance,
          1.7,
        );
        light.position.y = cfg.brazierSconceY + 0.95;
        group.add(light);
      }

      this.braziers.push({
        outerCone,
        innerCone,
        light,
        phase: i * 1.37,
      });
      this.root.add(group);
    }
  }

  /**
   * Pooled drifting low-lying shadow mist particles swirling across the obsidian crypt floor.
   */
  private buildDriftingShadowMistPool(): void {
    const cfg = SHARRAN_CRYPT_CONFIG;
    const count = cfg.shadowMistCount;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * cfg.shadowMistAreaRadius;
      const baseAngle = Math.random() * Math.PI * 2;
      const baseY =
        cfg.shadowMistMinY +
        Math.random() * (cfg.shadowMistMaxY - cfg.shadowMistMinY);

      positions[i * 3 + 0] = Math.cos(baseAngle) * r;
      positions[i * 3 + 1] = baseY;
      positions[i * 3 + 2] = Math.sin(baseAngle) * r;

      this.mistDrifts.push({
        baseAngle,
        radius: r,
        baseY,
        angularSpeed:
          (0.04 + Math.random() * 0.08) * (i % 2 === 0 ? 1 : -1) * cfg.shadowMistDriftSpeed,
        bobSpeed: 0.55 + Math.random() * 0.85,
        bobAmp: 0.16 + Math.random() * 0.28,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.amethystTrim,
        size: 1.15,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.mistPoints = new THREE.Points(geo, mat);
    this.root.add(this.mistPoints);
  }

  public update(_dt: number, elapsed: number): void {
    if (this.innerLunarRing) {
      this.innerLunarRing.rotation.z = elapsed * 0.11;
    }
    if (this.outerLunarRing) {
      this.outerLunarRing.rotation.z = -elapsed * 0.06;
    }

    for (let i = 0; i < this.lunarRuneMats.length; i++) {
      const m = this.lunarRuneMats[i];
      if (!m) continue;
      m.opacity = 0.68 + 0.24 * Math.sin(elapsed * 2.1 + i * 0.9);
    }

    // Flicker magenta-violet brazier flames & lights
    const baseLight = SHARRAN_CRYPT_CONFIG.brazierLightIntensity;
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      if (!b) continue;
      const flicker =
        0.88 +
        0.14 * Math.sin(elapsed * 7.2 + b.phase) +
        0.08 * Math.sin(elapsed * 13.5 + b.phase * 1.7);
      b.outerCone.scale.set(0.92 + flicker * 0.1, flicker, 0.92 + flicker * 0.1);
      b.innerCone.scale.set(0.9 + flicker * 0.12, flicker * 1.04, 0.9 + flicker * 0.12);
      if (b.light) {
        b.light.intensity = baseLight * flicker;
      }
    }

    // Zero-allocation shadow mist swirl update
    if (this.mistPoints) {
      const posAttr = this.mistPoints.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      for (let i = 0; i < this.mistDrifts.length; i++) {
        const d = this.mistDrifts[i];
        if (!d) continue;
        const ang = d.baseAngle + elapsed * d.angularSpeed;
        const x = Math.cos(ang) * d.radius;
        const z = Math.sin(ang) * d.radius;
        const y = d.baseY + Math.sin(elapsed * d.bobSpeed + d.phase) * d.bobAmp;
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i]?.dispose();
    }
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]?.dispose();
    }
    for (let i = 0; i < this.ownedTextures.length; i++) {
      this.ownedTextures[i]?.dispose();
    }
  }
}
