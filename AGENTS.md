# Agent Execution Guidelines (`AGENTS.md`) — Arcane Usurper

## 1. Project Context & Behavioral Baseline

You are architecting, refactoring, and expanding **Arcane Usurper**, a 3D third-person cel-shaded anime action chamber-crawler and boss-rush game built with **Vite, TypeScript, Imperative Three.js, Object ECS, Zustand, React, and Tailwind CSS**.

An existing ~7,340-line single-file prototype (containing the Glacial Spire summit arena, proportioned humanoid Dark Mage, Marina the Glacial Empress with a `512x512` `CanvasTexture` anime face, 3-phase frost combat, `STATE_STAGGER`, and procedural Web Audio synthesizer) serves as the visual, mechanical, and audio baseline.

---

## 2. Architecture: Lightweight Object ECS + Three.js + React HUD

### Why Object ECS (Not `bitECS` and Not React Three Fiber)

- **Object ECS (`Miniplex` or custom typed `ECSWorld`):** Entities are plain typed objects composed of granular data traits (`Transform`, `Velocity`, `Health`, `Hurtbox`, `Projectile`, `MeshRef`, `ServantAI`, `SiphonableBoss`). This handles high-count entities (chamber servant waves, bullet-hell curtains, clones, particle bursts) cleanly while holding direct references to Three.js `Object3D` rigs.
- **Imperative Three.js Engine (`src/ecs/`, `src/engine/`, `src/rigs/`):** Owns the `WebGLRenderer`, `Scene`, `requestAnimationFrame` loop, procedural rigs, `512x512` `CanvasTexture` generators, and Web Audio synthesizer. **Zero React imports allowed.**
- **React + Zustand Overlay (`src/ui/`, `src/state/useGameStore.ts`):** Purely a 2D HUD and menu layer (`pointer-events-none` on root containers). Throttled snapshots (~15–20 Hz or discrete state transitions) bridge the 60 FPS ECS loop to React.

### Target Module Structure

```text
arcane-usurper/
├── SPEC.md
├── AGENTS.md
├── vite.config.ts # Must include `base: './'` for itch.io HTML5 iframe builds
├── src/
│ ├── main.tsx # Bootstraps ECSWorld, SceneManager, SoundEngine & React HUD
│ ├── config/
│ │ └── gameConfig.ts # Frozen `as const` constants, palettes, drain rates & bounds
│ ├── state/
│ │ └── useGameStore.ts # Zustand store bridging 60fps ECS simulation <-> React UI
│ ├── ecs/
│ │ ├── components.ts # Pure data interfaces (Transform, Health, Projectile, Siphonable...)
│ │ ├── World.ts # Typed entity store & cached archetype queries
│ │ └── systems/
│ │ ├── InputSystem.ts # Maps keyboard/mouse inputs to Player intent components
│ │ ├── MovementSystem.ts # Integrates Velocity, arena clamping, Blink i-frames & stride
│ │ ├── ChamberSystem.ts # Spawns chamber servant waves & unlocks boss portal on clear
│ │ ├── BossAISystem.ts # Executes pluggable phase attack patterns & stagger transitions
│ │ ├── CombatSystem.ts # Projectile/laser/pillar collisions, damage & hit particles
│ │ ├── FinisherSystem.ts # Interactive Siphon Kiss, [1-4] poses, [F] taunt & drain throttle
│ │ ├── DioramaSystem.ts # Victory collapse, Endless Savor, Encore NG+ & Defeat Puppet
│ │ └── RenderSyncSystem.ts # Syncs ECS Transform/state -> Three.js Object3D & animations
│ ├── engine/
│ │ ├── SceneManager.ts # WebGLRenderer, lighting, fog, arena builders & resize handler
│ │ ├── CameraRig.ts # 3rd-person PointerLock follow + 360° Finisher/Diorama orbit
│ │ └── SoundEngine.ts # Procedural Web Audio API SFX & dynamic phase music sequencer
│ ├── rigs/
│ │ ├── DarkMageRig.ts # Proportioned humanoid Dark Mage rig & NG+ frost-wing aura
│ │ ├── ServantRig.ts # Modular chamber minion rig (Ice Knight / Drone / Siren)
│ │ └── bosses/
│ │ ├── BossBase.ts # Standardized BossRigAdapter interface & bleach helpers
│ │ ├── MarinaRig.ts # Glacial Empress rig, 512x512 face canvas & pose controllers
│ │ ├── MikuRig.ts # [Future] Cyber-Siren rig
│ │ └── MermaidRig.ts # [Future] Mermaid Princess rig
│ └── ui/
│ ├── CombatHUD.tsx # HP bars, phase badge, chamber counter, controls & audio toggle
│ ├── FinisherHUD.tsx # Drain gauge, Savor/Flow/Surge pills, [1-4] poses & [F] Taunt
│ └── DioramaHUD.tsx # Victory ("Pull Her Up & Keep Kissing" / "Encore NG+") & Defeat
```

---

## 3. SOLID Principles Enforcement

Every new or refactored module must strictly adhere to **SOLID**:

1. **Single Responsibility Principle (SRP):**
   - **Components (`components.ts`)** hold _only_ serializable state/references—zero methods or update logic.
   - **Systems (`ecs/systems/*.ts`)** each govern _one_ domain rule (`MovementSystem` never deals damage; `CombatSystem` never updates DOM/Zustand UI directly except via discrete events; `RenderSyncSystem` is the only system mutating `THREE.Object3D` transforms during combat).
   - **Rigs (`rigs/*.ts`)** encapsulate mesh construction, material references, and skeletal/pose interpolation—zero AI decision-making or collision math.

2. **Open/Closed Principle (OCP):**
   - Adding new realms (**Miku**, **Mermaid Princess**), new chamber servants, or new boss attack patterns must be achieved by registering new `BossRigAdapter` implementations, `AttackPatternStrategy` objects, or entity factory recipes—**never** by adding `if (boss.id === 'marina')` switch-chains inside `CombatSystem`, `FinisherSystem`, or `DioramaSystem`.

3. **Liskov Substitution Principle (LSP):**
   - Every boss rig (`MarinaRig`, `MikuRig`, `MermaidRig`) must honor the exact `BossRigAdapter` contract (`headAnchor`, `headAccessory`, `drainableMaterials`, `applyFinisherPose`, `applyVictoryCollapsePose`, `applyPuppetMasterPose`). Swapping any boss into `FinisherSystem` or `DioramaSystem` must work identically without special-case overrides.

4. **Interface Segregation Principle (ISP):**
   - Keep ECS components granular and trait-focused so entities only carry what they use (e.g., `ChamberServant` entities carry `Health` + `Hurtbox` + `ServantAI`, whereas only sovereign bosses carry `SiphonableBoss` + `BossPhaseState`).
   - Expose narrow service interfaces (`IAudioTrigger`, `ICameraTarget`) to systems rather than passing the entire `SceneManager` or `Game` god-object.

5. **Dependency Inversion Principle (DIP):**
   - High-level systems (`BossAISystem`, `FinisherSystem`, `DioramaSystem`) depend on abstractions (`ECSWorld` component queries, `BossRigAdapter`, `IAudioTrigger`) injected into their constructors rather than instantiating concrete rigs or global singletons directly.

---

## 4. Strict Constants & Configuration Discipline (`gameConfig.ts`)

- **Zero Magic Numbers, Strings, or Inline Hex Codes:**
  - Every numeric constant (speeds, cooldowns, radii, drain rates, camera near/distance limits, animation lerp factors) and every color token (`#09090B`, `#38BDF8`, `#A855F7`, `#94A3B8`) must be defined in `src/config/gameConfig.ts` using `as const` frozen configuration objects (`PLAYER_CONFIG`, `BOSS_CONFIG`, `FINISHER_CONFIG`, `CAMERA_CONFIG`, `ARENA_CONFIG`, `AUDIO_CONFIG`, `PALETTE`).
  - Use TypeScript string-literal unions or `as const` lookup maps for all state identifiers (`GameState`, `BossExpression`, `FinisherPoseId`, `DrainThrottleMode`, `AudioMode`) so invalid states fail at compile time.

---

## 5. Critical Implementation Constraints (Blocks 4 & 5 + Itch.io)

1. **Preserve Legacy Visual & Audio Fidelity:**
   - When extracting `DarkMageRig.ts`, `MarinaRig.ts`, `SceneManager.ts`, and `SoundEngine.ts` from the 7,340-line monolith, port all procedural geometry proportions, cel-shaded `MeshToonMaterial` + ink-black `BackSide` outlines, `512x512` facial expression drawing routines, and Web Audio synthesis algorithms verbatim before adding new features.
2. **Pose `[2]` (Glacial Ballroom Dip) Lip Alignment:**
   - When `finisherPose === 2`, keep root separation tight (`FINISHER_CONFIG.dipRootSeparation ≈ 0.40m`), dip the boss's spine backward ~45°, and pitch the Dark Mage's upper torso and head forward (`FINISHER_CONFIG.dipMageExtraPitch ≈ +0.32 rad`) against `boss.headAnchor` so their lips remain locked in direct physical contact with zero air gap.
3. **Endless Savor Isolation:**
   - Clicking **`[PULL HER UP & KEEP KISSING]`** sets `isEndlessSavor = true`, restores the finisher kiss stance with `siphonProgress` locked at `1.0` (`CORE DEPLETED — ENDLESS SAVOR`) and `drainableMaterials` bleached to `PALETTE.drainedAshSilver` (`#94A3B8`), and keeps `[1-4]` pose switching, `[F]` taunt, and `360°` orbit/zoom active indefinitely until the player clicks **`[STOP & LAY HER BACK DOWN]`** or **`[ENTER ENCORE STAGE (NG+)]`**.
4. **Forced Frost Puppet Defeat (`playerHP <= 0`):**
   - Transition to `DEFEAT_DIORAMA`, clear all active projectiles, seat the dazed/blushing Dark Mage on the ice holding glowing frost-crystals attached via shimmering ice-blue marionette lines to standing Marina's fingertips, and enable `360°` orbit/zoom until **`[SHATTER THE FROST / RETRY STAGE]`** is clicked.
5. **Browser Lifecycle & Itch.io Compatibility:**
   - Maintain `base: './'` in `vite.config.ts` so `npm run build` outputs relative paths compatible with itch.io's sandboxed `<iframe>` hosting.
   - Resume `AudioContext` safely on the first user gesture, and always call `document.exitPointerLock()` immediately upon entering `STAGGER`, `SIPHON_FINISHER`, `VICTORY_DIORAMA`, `ENDLESS_SAVOR`, or `DEFEAT_DIORAMA`.
6. **Zero Truncation & Compile Gate:**
   - Never emit partial files or placeholder comments (`// ... existing code ...`, `// TODO`). After every atomic module batch, run:
     ```bash
     npx tsc --noEmit && npm run build
     ```
