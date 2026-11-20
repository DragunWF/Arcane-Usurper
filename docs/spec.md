# Arcane Usurper — Technical & Gameplay Specification (`SPEC.md`)

## 1. High-Level Vision & Core Premise

**Arcane Usurper** is a 3D third-person cel-shaded anime action boss-rush and chamber-crawler game built with **TypeScript, Vite, Imperative Three.js, Zustand, React, and Tailwind CSS**.

The player controls the **Obsidian Siphon Mage**—a shadowed, dark-robed spellcaster invading elemental, cybernetic, and oceanic realms to defeat powerful sovereigns and drain their signature magic directly into his arcane core via an interactive **Arcane Siphon Kiss** finisher.

### Multi-Realm Progression Roadmap

1. **Realm I — The Glacial Spire (Active Priority):**
   - _Chambers (Planned):_ Royal Ice Chambers guarded by Frost Knights leading to an activated Astral Portal.
   - _Boss Arena:_ Summit of the Glacial Spire against **Marina, the Glacial Empress** (ethereal ice-princess prodigy with cascading silver-white hair, crystalline ice tiara, and multi-phase frost magic).
2. **Realm II — Subterranean Cyber-Cathedral (Planned):**
   - _Chambers:_ Neon server catacombs guarded by Cyber-Drones.
   - _Boss Arena:_ Equalizer Amphitheater against **Miku, the Cyber-Siren** (harmonic twin-tailed cyber-idol).
3. **Realm III — The Abyssal Coral Palace (Planned):**
   - _Chambers:_ Sunken marble halls guarded by Tide Sentinels.
   - _Boss Arena:_ Hydro-Throne Sanctum against the **Mermaid Princess** (bioluminescent oceanic sovereign).

---

## 2. System Architecture & Decoupling Boundaries

### Strict Engine / UI Separation

- **3D Engine (`src/engine/`, `src/entities/`, `src/systems/`, `src/levels/`):** Pure, framework-agnostic TypeScript owning the `THREE.WebGLRenderer`, `THREE.Scene`, `requestAnimationFrame` loop, procedural rigs, `512x512` `CanvasTexture` generators, collision math, and Web Audio synthesizer. **Zero React imports allowed.**
- **UI Overlay (`src/ui/`):** Lightweight React + Tailwind CSS components mounted over the full-screen `<canvas>` (`pointer-events-none` on containers, `pointer-events-auto` on interactive buttons/pills).
- **State Bridge (`src/state/useGameStore.ts`):** A **Zustand** store acting as the sole communication bridge between the 60 FPS Three.js loop and React HUD components. Throttled state snapshots prevent React re-render overhead during combat.

### Directory Blueprint

```text
arcane-usurper/
├── SPEC.md
├── AGENTS.md
├── vite.config.ts              # Must include `base: './'` for itch.io HTML5 iframe builds
├── src/
│   ├── main.tsx                # Mounts WebGL canvas + React HUD root
│   ├── config/
│   │   └── gameConfig.ts       # All numeric constants, drain rates, camera bounds, color palettes
│   ├── state/
│   │   └── useGameStore.ts     # Zustand store (gameState, HP, phase, siphonProgress, pose, audioMuted)
│   ├── engine/
│   │   ├── SceneManager.ts     # Renderer, lighting, fog, arena props, particle pools, resize handler
│   │   ├── CameraRig.ts        # 3rd-person PointerLock follow + 360° spherical Finisher/Diorama orbit
│   │   └── SoundEngine.ts      # Procedural Web Audio API SFX & dynamic multi-phase music sequencer
│   ├── entities/
│   │   ├── PlayerMage.ts       # Proportioned humanoid Dark Mage rig, stride anim, Blink, Void Bolts
│   │   ├── ChamberServant.ts   # Reusable chamber enemy archetype (melee/ranged minions)
│   │   └── bosses/
│   │       ├── BossBase.ts     # Standardized BossRigAdapter contract for all sovereign bosses
│   │       ├── MarinaBoss.ts   # Glacial Empress rig, 512x512 face canvas, 3-phase frost AI
│   │       ├── MikuBoss.ts     # [Future] Cyber-Siren boss module
│   │       └── MermaidBoss.ts  # [Future] Mermaid Princess boss module
│   ├── systems/
│   │   ├── CombatSystem.ts     # Bidirectional projectile & AoE hitboxes, i-frames, stagger checks
│   │   ├── LevelProgression.ts # Royal Chambers wave state -> Portal activation -> Boss Arena load
│   │   ├── FinisherSystem.ts   # Interactive Siphon Kiss, [1-4] poses, [F] taunt, 3-tier drain throttle
│   │   └── DioramaSystem.ts    # Victory collapse, Endless Savor, Encore NG+, Defeat Puppet diorama
│   ├── levels/
│   │   └── IcePalaceLevel.ts   # Realm I arena & chamber definitions
│   └── ui/
│       ├── CombatHUD.tsx       # Player/Boss HP bars, phase badge, control legend, audio toggle
│       ├── FinisherHUD.tsx     # Drain gauge, Savor/Flow/Surge pills, [1-4] pose buttons, [F] Taunt
│       └── DioramaHUD.tsx      # Victory ("Pull Her Up & Keep Kissing" / "Encore NG+") & Defeat overlays
```

---

## 3. Core Data Contracts (`BossBase.ts`)

Every boss (`MarinaBoss`, `MikuBoss`, `MermaidBoss`) must implement `BossBase` so `FinisherSystem` and `DioramaSystem` operate identically across all realms without boss-specific branching:

```typescript
export type BossExpression =
  | "COMBAT"
  | "STAGGER"
  | "SIPHON_KISS"
  | "DRAINED_FAINT";
export type FinisherPoseId = 1 | 2 | 3 | 4;
export type DrainThrottleMode = "SAVOR" | "FLOW" | "SURGE";

export interface BossRigAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly title: string;
  readonly root: THREE.Group;
  readonly headAnchor: THREE.Object3D; // World/local lip-contact & camera focus target
  readonly headAccessory: THREE.Object3D; // Tiara / hair-clips / shell crown for [F] flick taunt
  readonly drainableMaterials: THREE.MeshToonMaterial[]; // Bleaches smoothly to #94A3B8 (0% -> 100%)
  readonly originalColors: THREE.Color[]; // Cached initial material colors for NG+ / reset

  setExpression(expression: BossExpression): void;
  updateAI(dt: number, playerPos: THREE.Vector3, combat: CombatSystem): void;
  applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
  ): void;
  applyVictoryCollapsePose(time: number): void;
  applyPuppetMasterPose(time: number): void;
  resetForEncounter(encoreTier: number): void;
}
```

---

## 4. Gameplay State Machine & Feature Specifications

### State Flow

`TITLE` $\rightarrow$ `CHAMBER_COMBAT` _(Phase 3 expansion)_ $\rightarrow$ `PORTAL_TRANSITION` $\rightarrow$ `BOSS_COMBAT` $\rightarrow$ `STAGGER` $\rightarrow$ `SIPHON_FINISHER` $\rightarrow$ `VICTORY_DIORAMA` $\leftrightarrow$ `ENDLESS_SAVOR` $\rightarrow$ `ENCORE_NG_PLUS`
_(Branching from `CHAMBER_COMBAT` or `BOSS_COMBAT` on `playerHP <= 0` $\rightarrow$ `DEFEAT_DIORAMA`)_

### A. Player Kit (`PlayerMage.ts`)

- **Rig:** Cel-shaded (`MeshToonMaterial` + ink-black `BackSide` outlines) proportioned humanoid with recessed shadowed head, glowing violet eyes (`#A855F7`), backward-draped dark hood (`#09090B`), amethyst-trimmed shoulder mantle (`#8B5CF6`), split robes, and levitating amethyst crystal staff.
- **Controls:**
  - `W-A-S-D`: Camera-relative 8-directional movement with stride animation.
  - `Spacebar`: **Shadow Blink Dash** with invulnerability frames (`i-frames`) and fading dark-violet afterimages.
  - `Left-Click`: **Abyssal Void Bolts** (upgrades to piercing **Usurped Elemental Beams** in Encore NG+).
  - `Right-Click` / `Q`: **Umbral Pulse** radial knockback/projectile-clear burst.

### B. Marina — Glacial Empress (`MarinaBoss.ts`)

- **Phase I (`100% -> 55%` HP — Serene Sovereign):** Crystalline Ice Lance fans, Glacial Crescent waves, and expanding Frost Ring Novas.
- **Phase II (`55% -> 20%` HP — Blizzard Tempest):** Holographic Frost Clone illusions mirroring lance volleys and twin sweeping Glacial Lasers.
- **Phase III (`20% -> 8%` HP — Absolute Zero Awakening):** 6-arm spiral snowflake bullet-hell curtains and telegraphed floor ice-pillar eruptions.
- **Breathless Stagger (`<= 8%` HP):** Clears all active hazards, glides Marina to `(0, 0)` kneeling on the ice (`setExpression('STAGGER')`), releases PointerLock, and displays **`[E] EXECUTE ARCANE SIPHON KISS`** within `8.5m`.

### C. Interactive Arcane Siphon Kiss (`FinisherSystem.ts`)

- **360° Orbit & Zoom Camera (`CameraRig.ts`):** `camera.near = 0.02`, mouse/touch drag for `360°` azimuth and `0.08–1.25 rad` elevation, scroll-wheel zoom (`0.85m` close-up to `3.2m`).
- **Three-Tier Drain Throttle (`0% -> 100%`):**
  - `SAVOR` (`1.5%/s` — Hold `S`, `DownArrow`, `Right-Click`, or HUD pill): Near-pause inspection, 2x heart/snowflake particles, warm low-pass synth hum.
  - `FLOW` (`6.5%/s` — Default): ~15s baseline drain.
  - `SURGE` (`45.0%/s` — Hold `W`, `UpArrow`, `E`, tap `Space`, or HUD pill): High-speed overdrive with lightning arcs and rising synth pitch.
- **Four Switchable Dominance Poses (`[1]`–`[4]` Keys & HUD Pills):**
  - `[1]` **Chin-Lift Tilt (Default):** Mage stands tilting kneeling Marina's chin upward; staff planted in the ice.
  - `[2]` **Glacial Ballroom Dip:** Close root separation (`~0.40m`), Marina dipped backward at ~45°, Dark Mage torso/head pitched deeply forward (`+0.32 rad`) so **lips remain locked in direct contact with zero air gap**, staff raised aloft absorbing arcing frost ribbons.
  - `[3]` **Silver-Hair Reins:** Lock of Marina's long silver hair looped around Mage's forearm as he leans into the kiss.
  - `[4]` **Staff-Prop Lean:** Mage leans casually with one elbow against his upright planted staff while draining the kneeling boss.
- **Progressive Limpness & `[F]` Taunt:** Past `50%` drain, Marina's arms hang limp and posture slumps. Pressing `[F]` flicks her crystalline tiara (`*PING!*` chime, frost sparks, `*MANA DEPLETED*` pop-up, `1.5s` `@_@` dizzy eye spin).

### D. Victory Diorama, Endless Savor & Defeat Puppet (`DioramaSystem.ts`)

- **Victory Floor Collapse (`100%` Drain):** Marina collapses onto the reflective ice floor bleached to ash-silver (`#94A3B8`) with spinning `@_@` dizzy eyes and rising vapor wisps.
  - **`[PULL HER UP & KEEP KISSING]` (Endless Savor):** Lifts drained Marina back into the kiss stance locked at `100%` depleted (`CORE DEPLETED — ENDLESS SAVOR`), keeping `[1-4]` poses, `[F]` taunt, and `360°` orbit active indefinitely until the player clicks **`[STOP & LAY HER BACK DOWN]`** or **`[ENTER ENCORE STAGE (NG+)]`**.
  - **`[ENTER ENCORE STAGE (NG+)]`:** Equips the Dark Mage with stolen frost-wing aura and piercing Glacial Spear-Beams for a harder Encore cycle.
- **Defeat Diorama (`playerHP <= 0` — "Forced Frost Puppet"):** Interactive `360°` orbit diorama where Marina stands serenely triumphant controlling shimmering ice-blue marionette strings attached to the dazed, blushing Dark Mage sitting on the ice beside his dimmed staff—forcing him to wave glowing frost-crystals to a music-box loop until clicking **`[SHATTER THE FROST / RETRY STAGE]`**.

---

## 5. Phased Implementation Roadmap

1. **Phase 1 — Modular Extraction (Zero Regression):** Decompose the existing 7,340-line Building Block 3 HTML monolith into `gameConfig.ts`, `SoundEngine.ts`, `CameraRig.ts`, `PlayerMage.ts`, `MarinaBoss.ts`, `CombatSystem.ts`, and React HUD components. Verify Phases 1–3 and Stagger work identically.
2. **Phase 2 — Finisher & Dioramas (Blocks 4 & 5):** Implement `FinisherSystem.ts` (including the Pose `[2]` lip-alignment fix) and `DioramaSystem.ts` (`Endless Savor`, `Encore NG+`, and `Forced Frost Puppet` defeat).
3. **Phase 3 — Royal Chambers & Portal:** Implement `ChamberServant.ts` and `LevelProgression.ts` so the player clears Marina's ice guards and enters an astral portal before reaching the spire summit.
4. **Phase 4 — Multi-Realm Expansion:** Add `MikuBoss.ts` (Cyber-Cathedral) and `MermaidBoss.ts` (Abyssal Palace) using the `BossRigAdapter` contract.
