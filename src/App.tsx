import { useEffect, useRef, useState } from 'react';
import { GameEngine, type IGameController } from './engine/GameEngine';
import { useGameStore } from './state/useGameStore';
import { CombatHUD } from './ui/CombatHUD';
import { DioramaHUD } from './ui/DioramaHUD';
import { FinisherHUD } from './ui/FinisherHUD';
import { LobbyHUD } from './ui/LobbyHUD';
import { PauseMenu } from './ui/PauseMenu';
import { TitleOverlay } from './ui/TitleOverlay';

/**
 * Root React shell mounting the imperative WebGL canvas container and 2D HUD overlay.
 * Contains zero Three.js logic — all 3D and ECS systems live inside GameEngine.
 */
export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [controller, setController] = useState<IGameController | null>(null);
  const isFirstPersonGaze = useGameStore((s) => s.isFirstPersonGaze);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let engine: GameEngine | null = null;
    try {
      engine = new GameEngine(container);
      setController(engine);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Unable to initialize 3D WebGL context.';
      useGameStore.getState().setErrorMessage(msg);
      console.error('[Arcane Usurper] Initialization error:', error);
    }

    return () => {
      setController(null);
      engine?.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div
        ref={containerRef}
        id="game-canvas-container"
        className="fixed inset-0 w-full h-full overflow-hidden"
      />
      <TitleOverlay controller={controller} />
      {!isFirstPersonGaze && <LobbyHUD controller={controller} />}
      {!isFirstPersonGaze && <CombatHUD controller={controller} />}
      {!isFirstPersonGaze && <FinisherHUD controller={controller} />}
      {!isFirstPersonGaze && <DioramaHUD controller={controller} />}
      <PauseMenu controller={controller} />
    </div>
  );
}
