import * as THREE from 'three';
import {
  ARENA_CONFIG,
  PALETTE,
  SERENA_CONFIG,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import type { ChamberCollider } from './IcePalaceLevel';

interface SeaAnemoneRecord {
  readonly tentacles: THREE.Object3D[];
  readonly phase: number;
}

interface TridentBrazierRecord {
  readonly flame: THREE.Mesh;
  readonly light: THREE.PointLight;
  readonly phase: number;
}

interface BubbleCurtainVelocity {
  readonly vy: number;
  readonly swaySpeed: number;
  readonly phase: number;
}

/**
 * Self-contained procedural 3D boss arena for Realm II: **The Pearl Amphitheater**.
 *
 * Built with cel-shaded MeshToonMaterial + ink-black BackSide outlines:
 * - Open circular sunken amphitheater (radius 18m matching Summit arena scale) paved
 *   with a glowing Atlantean gold-and-pearl mosaic floor
 * - Ringed by 12 ruined fluted aqueduct arches & weathered stone piers
 * - 8 giant glowing coral-and-cyan sea anemones undulating softly in the current
 * - 6 bronze trident braziers burning with bioluminescent underwater flames
 * - Rising abyssal bubble curtain & glowing overhead caustic halo rings.
 */
export class PearlAmphitheaterLevel {
  public readonly root = new THREE.Group();

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];
  private readonly anemones: SeaAnemoneRecord[] = [];
  private readonly braziers: TridentBrazierRecord[] = [];
  private readonly floatingHaloRings: { mesh: THREE.Mesh; speed: number }[] = [];
  private readonly bubbleVelocities: BubbleCurtainVelocity[] = [];

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  private bubbleCurtain: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;

  public get pillarColliders(): readonly ChamberCollider[] {
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    return this._pillarMeshes;
  }

  public get cameraColliders(): readonly THREE.Object3D[] {
    return this._cameraColliders;
  }

  constructor() {
    this.root.name = 'PearlAmphitheaterLevel';
    this.buildMosaicTerraceFloor();
    this.buildRuinedAqueductRing();
    this.buildGiantSeaAnemones();
    this.buildBronzeTridentBraziers();
    this.buildAbyssalBubbleCurtain();
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
   * Procedural 1024x1024 glowing gold-and-pearl mosaic floor textures.
   */
  private createGoldPearlMosaicTextures(): {
    diffuseMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = SERENA_CONFIG.mosaicTextureSize;
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
      // Deep sea-stone & iridescent pearl radial tile field
      const bgGrad = dCtx.createRadialGradient(c, c, 32, c, c, c);
      bgGrad.addColorStop(0, PALETTE.hex.seaStoneMid);
      bgGrad.addColorStop(0.65, PALETTE.hex.seaStoneDark);
      bgGrad.addColorStop(1, PALETTE.hex.abyssalTeal);
      dCtx.fillStyle = bgGrad;
      dCtx.fillRect(0, 0, size, size);

      eCtx.fillStyle = PALETTE.hex.pureBlack;
      eCtx.fillRect(0, 0, size, size);

      const drawMosaic = (
        ctx: CanvasRenderingContext2D,
        isEmissive: boolean,
      ): void => {
        ctx.save();
        ctx.translate(c, c);

        const goldStroke = isEmissive
          ? PALETTE.rgba.atlanteanGoldBright
          : PALETTE.rgba.atlanteanGoldSoft;
        const pearlStroke = PALETTE.rgba.pearlMosaicGlow;
        const cyanStroke = PALETTE.rgba.causticCyanGlow;

        // Concentric Atlantean gold & cyan mosaic rings
        const ringRadii = [86, 152, 236, 336, 424, 468];
        ringRadii.forEach((r, idx) => {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = idx % 2 === 0 ? goldStroke : cyanStroke;
          ctx.lineWidth = idx % 2 === 0 ? 5.5 : 8;
          ctx.stroke();
        });

        // 16-point Atlantean gold & pearl compass rose star
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          ctx.save();
          ctx.rotate(ang);
          ctx.strokeStyle = i % 2 === 0 ? goldStroke : pearlStroke;
          ctx.lineWidth = i % 2 === 0 ? 4 : 2.2;
          ctx.beginPath();
          ctx.moveTo(0, 86);
          ctx.lineTo(0, 468);
          ctx.stroke();

          // Scalloped pearl petal inlay between rings
          if (i % 2 === 0) {
            ctx.strokeStyle = pearlStroke;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-22, 152);
            ctx.quadraticCurveTo(0, 224, 22, 152);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Central luminous pearl medallion
        ctx.beginPath();
        ctx.arc(0, 0, 58, 0, Math.PI * 2);
        ctx.strokeStyle = pearlStroke;
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.restore();
      };

      drawMosaic(dCtx, false);
      drawMosaic(eCtx, true);
    }

    const diffuseMap = this.trackTex(new THREE.CanvasTexture(diffCanvas));
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.anisotropy = 4;

    const emissiveMap = this.trackTex(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.anisotropy = 4;

    return { diffuseMap, emissiveMap };
  }

  private buildMosaicTerraceFloor(): void {
    const R = SERENA_CONFIG.arenaRadius;
    const { diffuseMap, emissiveMap } = this.createGoldPearlMosaicTextures();

    const floorGeo = this.trackGeo(
      new THREE.CylinderGeometry(R, R + 0.45, 0.9, 64),
    );
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.atlanteanGold),
        emissiveMap,
        emissiveIntensity: 0.72,
        roughness: 0.2,
        metalness: 0.38,
      }),
    );
    const sideMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.abyssalTeal,
        roughness: 0.55,
        metalness: 0.24,
      }),
    );

    const floorMesh = new THREE.Mesh(floorGeo, [sideMat, floorMat, sideMat]);
    floorMesh.position.y = -0.45;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Carved Atlantean gold outer rim molding
    const rimMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.25,
      }),
    );
    const rimMesh = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(R + 0.06, 0.26, 10, 64)),
      rimMat,
    );
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.05;
    this.root.add(rimMesh);

    // Subtle floating bioluminescent water-caustic halo rings just above the mosaic
    const ringSpecs = [
      { inner: 6.4, outer: 6.62, color: PALETTE.biolumCyan, speed: 0.08 },
      { inner: 13.2, outer: 13.44, color: PALETTE.atlanteanGold, speed: -0.05 },
    ];
    ringSpecs.forEach((spec) => {
      const mesh = new THREE.Mesh(
        this.trackGeo(new THREE.RingGeometry(spec.inner, spec.outer, 64)),
        this.trackMat(
          new THREE.MeshBasicMaterial({
            color: spec.color,
            transparent: true,
            opacity: 0.38,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.025;
      this.floatingHaloRings.push({ mesh, speed: spec.speed });
      this.root.add(mesh);
    });

    // Submerged pedestal rock underside descending into the oceanic trench
    const underside = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(R + 0.4, 24, 24)),
      sideMat,
    );
    underside.rotation.x = Math.PI;
    underside.position.y = -12.9;
    this.root.add(underside);
  }

  /**
   * Ring of 12 fluted Atlantean aqueduct columns & partially ruined semicircular stone arches.
   */
  private buildRuinedAqueductRing(): void {
    const count = SERENA_CONFIG.aqueductArchCount;
    const ringR = SERENA_CONFIG.aqueductRingRadius;
    const baseH = SERENA_CONFIG.aqueductPillarHeight;

    const stoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneMid, {
        emissive: PALETTE.abyssalTeal,
        emissiveIntensity: 0.16,
      }),
    );
    const goldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.28,
      }),
    );
    const cyanBandMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.biolumCyan }),
    );

    const plinthGeo = this.trackGeo(new THREE.CylinderGeometry(0.95, 1.12, 0.65, 10));
    const capGeo = this.trackGeo(new THREE.CylinderGeometry(0.96, 0.72, 0.62, 10));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const px = Math.cos(ang) * ringR;
      const pz = Math.sin(ang) * ringR;
      const isRuined = i % 3 === 1;
      const colH = isRuined ? baseH * 0.68 : baseH;

      const pGroup = new THREE.Group();
      pGroup.position.set(px, 0, pz);
      pGroup.lookAt(0, 0, 0);

      const { group: plinthObj, mainMesh: plinthMesh } =
        ToonAssets.createOutlinedMesh(plinthGeo, stoneMat, 1.04, true);
      plinthObj.position.y = 0.325;
      pGroup.add(plinthObj);

      const shaftH = colH - 1.25;
      const shaftGeo = this.trackGeo(
        new THREE.CylinderGeometry(
          SERENA_CONFIG.aqueductPillarRadius * 0.88,
          SERENA_CONFIG.aqueductPillarRadius,
          shaftH,
          12,
        ),
      );
      const { group: shaftObj, mainMesh: shaftMesh } =
        ToonAssets.createOutlinedMesh(
          shaftGeo,
          stoneMat,
          { x: 1.06, y: 1.01, z: 1.06 },
          true,
        );
      shaftObj.position.y = 0.65 + shaftH * 0.5;
      pGroup.add(shaftObj);

      const glowBand = new THREE.Mesh(
        this.trackGeo(new THREE.CylinderGeometry(0.76, 0.76, 0.14, 12)),
        cyanBandMat,
      );
      glowBand.position.y = 0.72;
      pGroup.add(glowBand);

      if (!isRuined) {
        const { group: capObj } = ToonAssets.createOutlinedMesh(
          capGeo,
          goldMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        capObj.position.y = colH - 0.31;
        pGroup.add(capObj);
      }

      this.root.add(pGroup);

      this._pillarColliders.push({
        x: px,
        z: pz,
        radius: SERENA_CONFIG.aqueductPillarCollisionRadius,
        height: colH,
      });
      this._pillarMeshes.push(shaftMesh, plinthMesh);
      this._cameraColliders.push(shaftMesh, plinthMesh);

      // Connect adjacent intact columns with soaring semicircular Atlantean aqueduct arches
      const nextIdx = (i + 1) % count;
      const nextIsRuined = nextIdx % 3 === 1;
      if (!isRuined && !nextIsRuined) {
        const nextAng = (nextIdx / count) * Math.PI * 2;
        const nx = Math.cos(nextAng) * ringR;
        const nz = Math.sin(nextAng) * ringR;
        const midX = (px + nx) * 0.5;
        const midZ = (pz + nz) * 0.5;

        const archCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, baseH - 0.2, pz),
          new THREE.Vector3(
            THREE.MathUtils.lerp(px, midX, 0.6),
            baseH + 1.85,
            THREE.MathUtils.lerp(pz, midZ, 0.6),
          ),
          new THREE.Vector3(midX, baseH + 2.45, midZ),
          new THREE.Vector3(
            THREE.MathUtils.lerp(nx, midX, 0.6),
            baseH + 1.85,
            THREE.MathUtils.lerp(nz, midZ, 0.6),
          ),
          new THREE.Vector3(nx, baseH - 0.2, nz),
        ]);
        const archGeo = this.trackGeo(
          new THREE.TubeGeometry(archCurve, 18, 0.34, 8, false),
        );
        const { group: archObj } = ToonAssets.createOutlinedMesh(
          archGeo,
          stoneMat,
          1.06,
          false,
        );
        this.root.add(archObj);
      }
    }
  }

  /**
   * Builds 8 giant glowing coral-and-cyan sea anemones around the outer amphitheater perimeter.
   */
  private buildGiantSeaAnemones(): void {
    const count = SERENA_CONFIG.anemoneCount;
    const ringR = SERENA_CONFIG.anemoneRingRadius;

    const baseMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.coralRose, {
        emissive: PALETTE.coralRose,
        emissiveIntensity: 0.22,
      }),
    );
    const tentacleMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.coralRose, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.38,
      }),
    );
    const tipMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.biolumCyan }),
    );

    const bulbGeo = this.trackGeo(new THREE.SphereGeometry(0.75, 12, 10));
    const tentacleGeo = this.trackGeo(new THREE.CylinderGeometry(0.05, 0.14, 1.45, 6));
    tentacleGeo.translate(0, 0.725, 0);
    const tipGeo = this.trackGeo(new THREE.SphereGeometry(0.095, 8, 8));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.PI / count;
      const ax = Math.cos(ang) * ringR;
      const az = Math.sin(ang) * ringR;

      const group = new THREE.Group();
      group.position.set(ax, 0, az);

      const { group: bulb } = ToonAssets.createOutlinedMesh(
        bulbGeo,
        baseMat,
        1.05,
        true,
      );
      bulb.scale.set(1.15, 0.58, 1.15);
      bulb.position.y = 0.25;
      group.add(bulb);

      const tentacles: THREE.Object3D[] = [];
      for (let t = 0; t < 7; t++) {
        const ta = (t / 7) * Math.PI * 2;
        const pivot = new THREE.Group();
        pivot.position.set(Math.cos(ta) * 0.35, 0.42, Math.sin(ta) * 0.35);
        pivot.rotation.y = ta;
        pivot.rotation.z = 0.36;

        const { group: stalk } = ToonAssets.createOutlinedMesh(
          tentacleGeo,
          tentacleMat,
          1.08,
          false,
        );
        pivot.add(stalk);

        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.y = 1.48;
        pivot.add(tip);

        group.add(pivot);
        tentacles.push(pivot);
      }

      if (i % 2 === 0) {
        const glow = new THREE.PointLight(
          PALETTE.coralRose,
          SERENA_CONFIG.lighting.anemoneLightIntensity,
          SERENA_CONFIG.lighting.anemoneLightDistance,
          1.8,
        );
        glow.position.y = 1.3;
        group.add(glow);
      }

      this.root.add(group);
      this.anemones.push({ tentacles, phase: i * 1.15 });
    }
  }

  /**
   * Builds 6 tall bronze trident braziers burning with bioluminescent cyan-gold flames.
   */
  private buildBronzeTridentBraziers(): void {
    const count = SERENA_CONFIG.brazierCount;
    const ringR = SERENA_CONFIG.brazierRingRadius;

    const bronzeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.bronzeTrident, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.22,
      }),
    );
    const goldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.42,
      }),
    );
    const flameMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.biolumCyan,
        transparent: true,
        opacity: 0.92,
      }),
    );

    const shaftGeo = this.trackGeo(new THREE.CylinderGeometry(0.14, 0.28, 2.35, 8));
    const crossbarGeo = this.trackGeo(new THREE.BoxGeometry(1.05, 0.16, 0.18));
    const prongGeo = this.trackGeo(new THREE.ConeGeometry(0.1, 0.92, 5));
    const flameGeo = this.trackGeo(new THREE.OctahedronGeometry(0.32, 0));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const bx = Math.cos(ang) * ringR;
      const bz = Math.sin(ang) * ringR;

      const bg = new THREE.Group();
      bg.position.set(bx, 0, bz);
      bg.lookAt(0, 0, 0);

      const { group: shaft } = ToonAssets.createOutlinedMesh(
        shaftGeo,
        bronzeMat,
        1.05,
        true,
      );
      shaft.position.y = 1.175;
      bg.add(shaft);

      const { group: cross } = ToonAssets.createOutlinedMesh(
        crossbarGeo,
        goldMat,
        1.05,
        true,
      );
      cross.position.y = 2.38;
      bg.add(cross);

      for (const px of [-0.42, 0, 0.42] as const) {
        const prong = new THREE.Mesh(prongGeo, goldMat);
        prong.position.set(px, px === 0 ? 2.95 : 2.82, 0);
        bg.add(prong);
      }

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.scale.set(0.88, 1.65, 0.88);
      flame.position.y = 3.05;
      bg.add(flame);

      const light = new THREE.PointLight(
        PALETTE.biolumCyan,
        SERENA_CONFIG.lighting.brazierLightIntensity,
        SERENA_CONFIG.lighting.brazierLightDistance,
        SERENA_CONFIG.lighting.brazierLightDecay,
      );
      light.position.y = 3.35;
      bg.add(light);

      this.root.add(bg);
      this.braziers.push({ flame, light, phase: i * 1.25 });
    }
  }

  /**
   * Builds a rising bioluminescent abyssal bubble curtain framing the open amphitheater.
   */
  private buildAbyssalBubbleCurtain(): void {
    const count = SERENA_CONFIG.bubbleCurtainCount;
    const maxR = SERENA_CONFIG.bubbleCurtainRadius;
    const maxH = SERENA_CONFIG.bubbleCurtainMaxHeight;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * maxR;
      const ang = Math.random() * Math.PI * 2;
      positions[i * 3 + 0] = Math.cos(ang) * r;
      positions[i * 3 + 1] = Math.random() * maxH;
      positions[i * 3 + 2] = Math.sin(ang) * r;

      this.bubbleVelocities.push({
        vy: 0.65 + Math.random() * 0.95,
        swaySpeed: 0.7 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.pearlWhite,
        size: 0.26,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bubbleCurtain = new THREE.Points(geo, mat);
    this.root.add(this.bubbleCurtain);
  }

  public update(dt: number, elapsed: number): void {
    // 1. Rotate glowing caustic floor halo rings
    for (let i = 0; i < this.floatingHaloRings.length; i++) {
      const r = this.floatingHaloRings[i];
      if (r) r.mesh.rotation.z += r.speed * dt;
    }

    // 2. Undulate giant glowing sea anemone tentacles
    for (let i = 0; i < this.anemones.length; i++) {
      const a = this.anemones[i];
      if (!a) continue;
      for (let t = 0; t < a.tentacles.length; t++) {
        const tentacle = a.tentacles[t];
        if (!tentacle) continue;
        tentacle.rotation.z =
          0.36 + Math.sin(elapsed * 2.1 + a.phase + t * 0.8) * 0.16;
      }
    }

    // 3. Flicker bronze trident braziers
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      if (!b) continue;
      const pulse = 1 + Math.sin(elapsed * 7.2 + b.phase) * 0.15;
      b.flame.scale.set(0.88, 1.65 * pulse, 0.88);
      b.flame.rotation.y = elapsed * 1.5 + b.phase;
      b.light.intensity =
        SERENA_CONFIG.lighting.brazierLightIntensity * (0.9 + 0.12 * pulse);
    }

    // 4. Rise abyssal bubble curtain
    if (this.bubbleCurtain) {
      const posAttr = this.bubbleCurtain.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const maxR = SERENA_CONFIG.bubbleCurtainRadius;
      const maxH = SERENA_CONFIG.bubbleCurtainMaxHeight;

      for (let i = 0; i < this.bubbleVelocities.length; i++) {
        const vel = this.bubbleVelocities[i];
        if (!vel) continue;
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x += Math.sin(elapsed * vel.swaySpeed + vel.phase) * 0.35 * dt;
        z += Math.cos(elapsed * vel.swaySpeed * 0.8 + vel.phase) * 0.35 * dt;
        if (y > maxH) {
          const r = Math.sqrt(Math.random()) * maxR;
          const ang = Math.random() * Math.PI * 2;
          x = Math.cos(ang) * r;
          y = 0.2;
          z = Math.sin(ang) * r;
        }
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
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.ownedTextures.length = 0;
  }
}
