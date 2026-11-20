# Arcane Usurper

A 3D third-person cel-shaded anime action chamber-crawler and boss-rush game built with **TypeScript, Vite, Imperative Three.js, Object ECS, Zustand, React, and Tailwind CSS**.

Play as the **Obsidian Siphon Mage**, invading elemental, cybernetic, and oceanic realms to clear royal chambers, shatter sovereign wards, and drain rival rulers directly into your arcane core via an interactive **Arcane Siphon Kiss** finisher.

---

## Tech Stack & Architecture

- **3D Rendering & Audio:** Imperative Three.js (`three`, `MeshToonMaterial` + ink-black `BackSide` outlines, procedural `512x512` `CanvasTexture` anime facial expressions) & native Web Audio API synthesizer (`zero external asset dependencies`).
- **Simulation Layer:** Lightweight TypeScript Object ECS (`src/ecs/`) decoupled from React.
- **UI & State Bridge:** React + Tailwind CSS HUD overlays (`src/ui/`) synced via a throttled Zustand store (`src/state/useGameStore.ts`).
- **Documentation:** See `SPEC.md` for gameplay/system contracts and `AGENTS.md` for SOLID and ECS coding rules.

---

## Prerequisites

- **Node.js** `v18.0.0` or higher (`v20+` LTS recommended)
- **npm** `v9.0.0` or higher (bundled with Node.js)

---

## Project Setup & Dependencies

### Option A: Fresh Workspace Initialization

If you are initializing the project directory from scratch before adding `SPEC.md`, `AGENTS.md`, and `src/`:

```bash

# 1. Scaffold Vite + React + TypeScript project

npm create vite@latest arcane-usurper -- --template react-ts
cd arcane-usurper

# 2. Install core 3D engine & state bridge dependencies

npm install three zustand

# 3. Install TypeScript definitions & Tailwind CSS

npm install -D @types/three tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p
```

### Option B: Existing Repository Setup

If `package.json` is already present in your workspace:

```bash
npm install
```

### Required Dependencies Summary

- **Runtime (`dependencies`):**
  - `three` — 3D WebGL scene graph, cel-shaded toon materials, lighting, and spherical camera math.
  - `zustand` — Lightweight state store bridging the 60 FPS ECS loop to React HUD overlays.
  - `react` & `react-dom` — Non-blocking 2D HUD, finisher controls, and diorama menus.
- **Development (`devDependencies`):**
  - `@types/three` — Full TypeScript type declarations for Three.js.
  - `tailwindcss`, `postcss`, `autoprefixer` — Utility-first styling for frosted-obsidian HUD overlays.
  - `typescript` & `vite` — Strict type checking and fast ES module bundling.

---

## Running & Building Commands

### Start Local Development Server

Launches Vite with Hot Module Replacement (HMR) at `http://localhost:5173`:

```bash
npm run dev
```

### Type-Check & Production Build

Runs strict TypeScript verification (`tsc --noEmit`) followed by an optimized Vite production bundle into `dist/`:

```bash
npx tsc --noEmit && npm run build
```

### Preview Production Bundle Locally

Serves the built `dist/` folder locally to verify asset paths and Web Audio unlock behavior before deployment:

```bash
npm run preview
```

---

## Exporting for itch.io (HTML5)

1. **Verify Relative Base Path:** Ensure `vite.config.ts` includes `base: './'` so Vite emits relative `./assets/...` paths compatible with itch.io's sandboxed `<iframe>` hosting:

   ```typescript
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react";

   export default defineConfig({
     base: "./",
     plugins: [react()],
   });
   ```

2. **Build & Archive:** Run `npm run build`, open the `dist/` directory, and compress its **contents** (`index.html` and `assets/`) directly into `arcane-usurper-web.zip` so `index.html` sits at the root of the archive.
3. **itch.io Project Settings:**
   - **Kind of project:** `HTML`
   - **Viewport dimensions:** `1280 x 720` (`16:9`)
   - **Frame options:** Enable **Fullscreen button** and **Click to start** (ensures `AudioContext` and PointerLock unlock cleanly on the first click).

---

## Controls Reference

### Combat (`CHAMBER_COMBAT` / `BOSS_COMBAT`)

- **`W / A / S / D`** — 8-directional movement
- **`Mouse Move`** — Orbit third-person camera (PointerLock active)
- **`Spacebar`** — Shadow Blink Dash (invulnerability frames + afterimages)
- **`Left-Click`** — Fire Abyssal Void Bolts (Piercing Elemental Beams in Encore NG+)
- **`Right-Click` or `Q`** — Umbral Pulse (radial projectile clear & stagger burst)
- **`E`** — Execute **Arcane Siphon Kiss** (when boss enters `STAGGER` within `8.5m`)
- **`M`** — Toggle procedural Web Audio synthesizer

### Arcane Siphon Finisher & Dioramas

- **`Left-Click Drag`** — `360°` free-orbit camera around the characters
- **`Scroll Wheel`** — Smooth close-up zoom (`0.85m` to `3.2m`)
- **`1` / `2` / `3` / `4`** — Switch dominance poses (_Chin-Lift_, _Ballroom Dip_, _Silver-Hair Reins_, _Staff-Prop Lean_)
- **`S` / `Down Arrow` / `Right-Click` (Hold)** — **Savor Mode** (`1.5%/s` slow drain)
- **`W` / `Up Arrow` / `E` / `Space` (Hold/Tap)** — **Surge Overdrive** (`45.0%/s` rapid drain)
- **`F`** — Mocking tiara-flick taunt (`*MANA DEPLETED*` & dizzy eye spin)
