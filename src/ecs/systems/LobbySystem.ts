import * as THREE from 'three';
import {
  FINISHER_MODES,
  GAME_STATES,
  LOBBY_CONFIG,
  LOBBY_PROMPT_KINDS,
  SIPHON_GALLERY_CONFIG,
  type FinisherMode,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { MageTowerLevel } from '../../levels/MageTowerLevel';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import {
  useGameStore,
  type LobbyPromptState,
} from '../../state/useGameStore';
import type { ECSWorld, ISystem } from '../World';

export interface ILobbyCallbacks {
  getGameState: () => GameState;
  onEnterRealm1: () => void;
  onEnterRealm2: () => void;
  onEnterRealm3: () => void;
  onEnterLobbySiphon: (
    target: 'marina' | 'serena' | 'miku',
    mode: FinisherMode,
  ) => void;
  onEncoreTierToggled: (nextTier: number) => void;
  onSyncGalleryUnlocked: (unlocked: boolean) => void;
}

/**
 * Governs the playable 3D **Obsidian Spire Sanctum** Hub Lobby (SRP & DIP):
 * - Syncs Stolen Trophy Pedestal visibility & frost aura from persisted `marinaDefeated` state
 * - Evaluates proximity prompts for Realm I (Active), Realms II & III (Sealed), and the
 *   Stolen Frost Tiara Trophy Pedestal (Encore NG+ toggle)
 * - Handles `[E]` interactions, Target Crystal hit feedback, and sealed portal ward reactions.
 */
export class LobbySystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly mageTower: MageTowerLevel;
  private readonly mageRig: DarkMageRig;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly callbacks: ILobbyCallbacks;

  private activePrompt: LobbyPromptState | null = null;
  private liveMarinaCharge: number = SIPHON_GALLERY_CONFIG.defaultCoreCharge;
  private lastSyncedStoreCharge = -1;
  private liveSerenaCharge: number = SIPHON_GALLERY_CONFIG.defaultCoreCharge;
  private lastSyncedSerenaCharge = -1;
  private liveMikuCharge: number = SIPHON_GALLERY_CONFIG.defaultCoreCharge;
  private lastSyncedMikuCharge = -1;
  private chargeSyncAccum = 0;
  private serenaChargeSyncAccum = 0;
  private mikuChargeSyncAccum = 0;
  private readonly scratchBurst = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    mageTower: MageTowerLevel,
    mageRig: DarkMageRig,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    callbacks: ILobbyCallbacks,
  ) {
    this.world = world;
    this.mageTower = mageTower;
    this.mageRig = mageRig;
    this.audio = audio;
    this.vfx = vfx;
    this.callbacks = callbacks;
  }

  /**
   * Synchronizes the Sanctum's trophy pedestal & player visual aura when entering TITLE/LOBBY.
   */
  public syncSanctumState(): void {
    const store = useGameStore.getState();
    this.liveMarinaCharge = store.marinaCoreCharge;
    this.lastSyncedStoreCharge = store.marinaCoreCharge;
    this.liveSerenaCharge = store.serenaCoreCharge;
    this.lastSyncedSerenaCharge = store.serenaCoreCharge;
    this.liveMikuCharge = store.mikuCoreCharge;
    this.lastSyncedMikuCharge = store.mikuCoreCharge;
    this.chargeSyncAccum = 0;
    this.serenaChargeSyncAccum = 0;
    this.mikuChargeSyncAccum = 0;
    this.mageTower.setTrophyVisible(
      store.marinaDefeated,
      store.encoreTier,
      store.serenaDefeated,
      store.mikuDefeated,
    );
    this.mageTower.setGalleryCaptives(
      store.marinaDefeated,
      store.serenaDefeated,
      store.mikuDefeated,
    );
    this.callbacks.onSyncGalleryUnlocked(
      store.marinaDefeated || store.serenaDefeated || store.mikuDefeated,
    );
    this.mageTower.updateMarinaCaptiveState(this.liveMarinaCharge, 0, 0.016);
    this.mageTower.updateSerenaCaptiveState(this.liveSerenaCharge, 0, 0.016);
    this.mageTower.updateMikuCaptiveState(this.liveMikuCharge, 0, 0.016);
    this.mageRig.setEncoreTier(store.encoreTier);
    this.setPromptIfChanged(null);
  }

  /**
   * Invoked by CombatSystem when a Void Bolt, NG+ Spear-Beam, or Umbral Pulse strikes
   * the Abyssal Target Crystal in the eastern alcove.
   */
  public handleDummyHit(
    damage: number,
    isEncore: boolean,
    hitPoint: THREE.Vector3,
  ): void {
    this.mageTower.triggerDummyHit();
    this.audio.playDummyCrystalHit();
    this.vfx.spawnImpactBurst(hitPoint, 10);
    if (isEncore) {
      this.vfx.spawnFrostShatterBurst(hitPoint, 8, 5.5);
    }

    useGameStore.getState().setLobbyDummyHit({
      damage,
      isEncore,
      timestamp: Date.now(),
    });
  }

  /**
   * Invoked by CombatSystem when a spell strikes one of the two sealed Realm portals.
   */
  public handleSealedPortalHit(
    realmIndex: 2 | 3,
    hitPoint: THREE.Vector3,
  ): void {
    this.mageTower.triggerWardRipple(realmIndex);
    this.vfx.spawnFrostShatterBurst(hitPoint, 8, 5.0);
    if (realmIndex === 2) {
      this.audio.playSunkenWardChime();
    } else {
      this.audio.playHarmonicWardPulse();
    }
  }

  /**
   * Triggers the currently highlighted Sanctum `[E]` or Siphon Gallery `[R]` interaction
   * (via keyboard or HUD click).
   */
  public executeActiveInteraction(
    mode: FinisherMode = FINISHER_MODES.KISS,
  ): void {
    if (!this.activePrompt) return;

    const isDaisPrompt =
      this.activePrompt.kind === LOBBY_PROMPT_KINDS.MARINA_DAIS ||
      this.activePrompt.kind === LOBBY_PROMPT_KINDS.SERENA_DAIS ||
      this.activePrompt.kind === LOBBY_PROMPT_KINDS.MIKU_DAIS;
    if (mode === FINISHER_MODES.BEAM && !isDaisPrompt) {
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.REALM_1) {
      const store = useGameStore.getState();
      store.setActiveRealm(1);
      store.setHasReachedSummit(false);
      this.audio.playPortalWarp();
      this.setPromptIfChanged(null);
      this.callbacks.onEnterRealm1();
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.REALM_2) {
      const store = useGameStore.getState();
      store.setActiveRealm(2);
      store.setHasReachedSummit(false);
      this.audio.playPortalWarp();
      this.setPromptIfChanged(null);
      this.callbacks.onEnterRealm2();
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.REALM_3) {
      const store = useGameStore.getState();
      store.setActiveRealm(3);
      store.setHasReachedSummit(false);
      this.audio.playPortalWarp();
      this.setPromptIfChanged(null);
      this.callbacks.onEnterRealm3();
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.REALM_2_SEALED) {
      this.mageTower.triggerWardRipple(2);
      this.audio.playSunkenWardChime();
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.REALM_3_SEALED) {
      this.mageTower.triggerWardRipple(3);
      this.audio.playHarmonicWardPulse();
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.SIPHON_GALLERY_WARD) {
      this.mageTower.triggerGalleryWardRipple();
      this.audio.playSunkenWardChime();
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.MARINA_DAIS) {
      const store = useGameStore.getState();
      if (!store.marinaDefeated) return;
      if (mode === FINISHER_MODES.BEAM && this.liveMarinaCharge <= 0) return;
      store.setMarinaCoreCharge(this.liveMarinaCharge);
      this.lastSyncedStoreCharge = this.liveMarinaCharge;
      this.setPromptIfChanged(null);
      this.callbacks.onEnterLobbySiphon('marina', mode);
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.SERENA_DAIS) {
      const store = useGameStore.getState();
      if (!store.serenaDefeated) return;
      if (mode === FINISHER_MODES.BEAM && this.liveSerenaCharge <= 0) return;
      store.setSerenaCoreCharge(this.liveSerenaCharge);
      this.lastSyncedSerenaCharge = this.liveSerenaCharge;
      this.setPromptIfChanged(null);
      this.callbacks.onEnterLobbySiphon('serena', mode);
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.MIKU_DAIS) {
      const store = useGameStore.getState();
      if (!store.mikuDefeated) return;
      if (mode === FINISHER_MODES.BEAM && this.liveMikuCharge <= 0) return;
      store.setMikuCoreCharge(this.liveMikuCharge);
      this.lastSyncedMikuCharge = this.liveMikuCharge;
      this.setPromptIfChanged(null);
      this.callbacks.onEnterLobbySiphon('miku', mode);
      return;
    }

    if (this.activePrompt.kind === LOBBY_PROMPT_KINDS.TROPHY_PEDESTAL) {
      const store = useGameStore.getState();
      if (
        !store.marinaDefeated &&
        !store.serenaDefeated &&
        !store.mikuDefeated
      ) {
        return;
      }
      const nextTier = store.encoreTier > 0 ? 0 : 1;
      store.setEncoreTier(nextTier);

      const player = this.world.queryFirst('playerTag', 'playerCombat');
      if (player) {
        player.playerCombat.encoreTier = nextTier;
      }

      this.mageRig.setEncoreTier(nextTier);
      this.mageTower.setTrophyVisible(
        store.marinaDefeated,
        nextTier,
        store.serenaDefeated,
        store.mikuDefeated,
      );
      this.audio.playTrophyToggle();
      this.callbacks.onEncoreTierToggled(nextTier);

      this.scratchBurst.set(
        LOBBY_CONFIG.trophyPedestalPos.x,
        1.65,
        LOBBY_CONFIG.trophyPedestalPos.z,
      );
      this.vfx.spawnFrostShatterBurst(this.scratchBurst, 14, 6.2);
      this.vfx.spawnImpactBurst(this.scratchBurst, 10);
    }
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();
    const store = useGameStore.getState();

    if (state === GAME_STATES.TITLE) {
      this.liveMarinaCharge = store.marinaCoreCharge;
      this.lastSyncedStoreCharge = store.marinaCoreCharge;
      this.liveSerenaCharge = store.serenaCoreCharge;
      this.lastSyncedSerenaCharge = store.serenaCoreCharge;
      this.liveMikuCharge = store.mikuCoreCharge;
      this.lastSyncedMikuCharge = store.mikuCoreCharge;
      this.mageTower.setTrophyVisible(
        store.marinaDefeated,
        store.encoreTier,
        store.serenaDefeated,
        store.mikuDefeated,
      );
      this.mageTower.setGalleryCaptives(
        store.marinaDefeated,
        store.serenaDefeated,
        store.mikuDefeated,
      );
      this.callbacks.onSyncGalleryUnlocked(
        store.marinaDefeated || store.serenaDefeated || store.mikuDefeated,
      );
      this.mageTower.updateMarinaCaptiveState(
        this.liveMarinaCharge,
        elapsed,
        dt,
      );
      this.mageTower.updateSerenaCaptiveState(
        this.liveSerenaCharge,
        elapsed,
        dt,
      );
      this.mageTower.updateMikuCaptiveState(
        this.liveMikuCharge,
        elapsed,
        dt,
      );
      if (this.activePrompt !== null) {
        this.setPromptIfChanged(null);
      }
      return;
    }

    if (state !== GAME_STATES.LOBBY) {
      if (this.activePrompt !== null) {
        this.setPromptIfChanged(null);
      }
      return;
    }

    // Adopt external charge mutations (e.g. after returning from Chambers, Boss Victory, or Lobby Siphon)
    if (Math.abs(store.marinaCoreCharge - this.lastSyncedStoreCharge) > 0.0005) {
      this.liveMarinaCharge = store.marinaCoreCharge;
      this.lastSyncedStoreCharge = store.marinaCoreCharge;
    }
    if (Math.abs(store.serenaCoreCharge - this.lastSyncedSerenaCharge) > 0.0005) {
      this.liveSerenaCharge = store.serenaCoreCharge;
      this.lastSyncedSerenaCharge = store.serenaCoreCharge;
    }
    if (Math.abs(store.mikuCoreCharge - this.lastSyncedMikuCharge) > 0.0005) {
      this.liveMikuCharge = store.mikuCoreCharge;
      this.lastSyncedMikuCharge = store.mikuCoreCharge;
    }

    // Passive cryogenic core recharge while exploring the Sanctum after defeating Marina
    if (store.marinaDefeated && this.liveMarinaCharge < 1.0) {
      this.liveMarinaCharge = Math.min(
        1.0,
        this.liveMarinaCharge +
          SIPHON_GALLERY_CONFIG.passiveRechargePerSec * dt,
      );
      this.chargeSyncAccum += dt;
      if (
        this.chargeSyncAccum >=
          SIPHON_GALLERY_CONFIG.chargeStoreSyncIntervalSec ||
        this.liveMarinaCharge >= 1.0
      ) {
        this.chargeSyncAccum = 0;
        this.lastSyncedStoreCharge = this.liveMarinaCharge;
        store.setMarinaCoreCharge(this.liveMarinaCharge);
      }
    }

    // Passive tidal core recharge while exploring the Sanctum after defeating Serena
    if (store.serenaDefeated && this.liveSerenaCharge < 1.0) {
      this.liveSerenaCharge = Math.min(
        1.0,
        this.liveSerenaCharge +
          SIPHON_GALLERY_CONFIG.passiveRechargePerSec * dt,
      );
      this.serenaChargeSyncAccum += dt;
      if (
        this.serenaChargeSyncAccum >=
          SIPHON_GALLERY_CONFIG.chargeStoreSyncIntervalSec ||
        this.liveSerenaCharge >= 1.0
      ) {
        this.serenaChargeSyncAccum = 0;
        this.lastSyncedSerenaCharge = this.liveSerenaCharge;
        store.setSerenaCoreCharge(this.liveSerenaCharge);
      }
    }

    // Passive harmonic core recharge while exploring the Sanctum after defeating Miku
    if (store.mikuDefeated && this.liveMikuCharge < 1.0) {
      this.liveMikuCharge = Math.min(
        1.0,
        this.liveMikuCharge +
          SIPHON_GALLERY_CONFIG.passiveRechargePerSec * dt,
      );
      this.mikuChargeSyncAccum += dt;
      if (
        this.mikuChargeSyncAccum >=
          SIPHON_GALLERY_CONFIG.chargeStoreSyncIntervalSec ||
        this.liveMikuCharge >= 1.0
      ) {
        this.mikuChargeSyncAccum = 0;
        this.lastSyncedMikuCharge = this.liveMikuCharge;
        store.setMikuCoreCharge(this.liveMikuCharge);
      }
    }

    this.mageTower.setTrophyVisible(
      store.marinaDefeated,
      store.encoreTier,
      store.serenaDefeated,
      store.mikuDefeated,
    );
    this.mageTower.setGalleryCaptives(
      store.marinaDefeated,
      store.serenaDefeated,
      store.mikuDefeated,
    );
    this.callbacks.onSyncGalleryUnlocked(
      store.marinaDefeated || store.serenaDefeated || store.mikuDefeated,
    );
    this.mageTower.updateMarinaCaptiveState(
      this.liveMarinaCharge,
      elapsed,
      dt,
    );
    this.mageTower.updateSerenaCaptiveState(
      this.liveSerenaCharge,
      elapsed,
      dt,
    );
    this.mageTower.updateMikuCaptiveState(
      this.liveMikuCharge,
      elapsed,
      dt,
    );

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'health',
      'playerIntent',
    );
    if (!player) return;

    // Keep player topped off safely inside the Sanctum
    player.health.current = player.health.max;

    const px = player.transform.position.x;
    const pz = player.transform.position.z;
    const encoreTier = store.encoreTier;

    // Determine closest interactable within range
    let bestPrompt: LobbyPromptState | null = null;
    let bestDist = Infinity;

    const dR1 = Math.hypot(
      px - LOBBY_CONFIG.realm1PortalPos.x,
      pz - LOBBY_CONFIG.realm1PortalPos.z,
    );
    if (dR1 <= LOBBY_CONFIG.portalInteractRadius && dR1 < bestDist) {
      bestDist = dR1;
      bestPrompt = {
        kind: LOBBY_PROMPT_KINDS.REALM_1,
        title: '[E] ENTER REALM I — THE GLACIAL SPIRE',
        subtitle:
          encoreTier > 0
            ? `ENCORE NG+${encoreTier} • ROYAL ICE CHAMBERS`
            : 'ROYAL ICE CHAMBERS → MARINA’S SUMMIT',
      };
    }

    const dR2 = Math.hypot(
      px - LOBBY_CONFIG.realm2PortalPos.x,
      pz - LOBBY_CONFIG.realm2PortalPos.z,
    );
    if (dR2 <= LOBBY_CONFIG.portalInteractRadius && dR2 < bestDist) {
      bestDist = dR2;
      bestPrompt = {
        kind: LOBBY_PROMPT_KINDS.REALM_2,
        title: '[E] ENTER REALM II — THE SUNKEN SANCTUARY',
        subtitle:
          encoreTier > 0
            ? `ENCORE NG+${encoreTier} • SUNKEN AQUEDUCT`
            : 'SUNKEN AQUEDUCT → PEARL AMPHITHEATER',
      };
    }

    const dR3 = Math.hypot(
      px - LOBBY_CONFIG.realm3PortalPos.x,
      pz - LOBBY_CONFIG.realm3PortalPos.z,
    );
    if (dR3 <= LOBBY_CONFIG.portalInteractRadius && dR3 < bestDist) {
      bestDist = dR3;
      bestPrompt = {
        kind: LOBBY_PROMPT_KINDS.REALM_3,
        title: '[E] ENTER REALM III — THE HARMONIC CITADEL',
        subtitle:
          encoreTier > 0
            ? `ENCORE NG+${encoreTier} • CYBER BACKSTAGE`
            : 'CYBER BACKSTAGE → CONCERT STAGE',
      };
    }

    const anySovereignDefeated =
      store.marinaDefeated || store.serenaDefeated || store.mikuDefeated;
    if (anySovereignDefeated) {
      const defeatedCount =
        (store.marinaDefeated ? 1 : 0) +
        (store.serenaDefeated ? 1 : 0) +
        (store.mikuDefeated ? 1 : 0);
      const dTrophy = Math.hypot(
        px - LOBBY_CONFIG.trophyPedestalPos.x,
        pz - LOBBY_CONFIG.trophyPedestalPos.z,
      );
      if (dTrophy <= LOBBY_CONFIG.trophyInteractRadius && dTrophy < bestDist) {
        bestDist = dTrophy;
        bestPrompt = {
          kind: LOBBY_PROMPT_KINDS.TROPHY_PEDESTAL,
          title:
            defeatedCount > 1
              ? '[E] STOLEN SOVEREIGN RELICS — TOGGLE ENCORE (NG+)'
              : store.mikuDefeated
                ? '[E] STOLEN HARMONIC TUNING RELIC — TOGGLE ENCORE (NG+)'
                : store.serenaDefeated
                  ? '[E] STOLEN CORAL TIARA — TOGGLE ENCORE (NG+)'
                  : '[E] STOLEN FROST TIARA — TOGGLE ENCORE (NG+)',
          subtitle:
            encoreTier > 0
              ? `ENCORE USURPER: ACTIVE (NG+${encoreTier})`
              : 'ENCORE USURPER: OFF (STANDARD)',
        };
      }

      if (store.marinaDefeated) {
        const dMarina = Math.hypot(
          px - SIPHON_GALLERY_CONFIG.marinaDaisPos.x,
          pz - SIPHON_GALLERY_CONFIG.marinaDaisPos.z,
        );
        if (dMarina <= SIPHON_GALLERY_CONFIG.interactRadius && dMarina < bestDist) {
          bestDist = dMarina;
          bestPrompt = {
            kind: LOBBY_PROMPT_KINDS.MARINA_DAIS,
            title: '[E] SIPHON CAPTIVE SOVEREIGN',
            subtitle: `CRYO CORE CHARGE: ${Math.round(this.liveMarinaCharge * 100)}%`,
          };
        }
      }

      if (store.serenaDefeated) {
        const dSerena = Math.hypot(
          px - SIPHON_GALLERY_CONFIG.serenaDaisPos.x,
          pz - SIPHON_GALLERY_CONFIG.serenaDaisPos.z,
        );
        if (dSerena <= SIPHON_GALLERY_CONFIG.interactRadius && dSerena < bestDist) {
          bestDist = dSerena;
          bestPrompt = {
            kind: LOBBY_PROMPT_KINDS.SERENA_DAIS,
            title: '[E] SIPHON CAPTIVE SIREN',
            subtitle: `TIDAL CORE CHARGE: ${Math.round(this.liveSerenaCharge * 100)}%`,
          };
        }
      }

      if (store.mikuDefeated) {
        const dMiku = Math.hypot(
          px - SIPHON_GALLERY_CONFIG.mikuDaisPos.x,
          pz - SIPHON_GALLERY_CONFIG.mikuDaisPos.z,
        );
        if (dMiku <= SIPHON_GALLERY_CONFIG.interactRadius && dMiku < bestDist) {
          bestDist = dMiku;
          bestPrompt = {
            kind: LOBBY_PROMPT_KINDS.MIKU_DAIS,
            title: '[E] SIPHON CAPTIVE SOVEREIGN',
            subtitle: `HARMONIC CORE CHARGE: ${Math.round(this.liveMikuCharge * 100)}%`,
          };
        }
      }
    } else {
      const dWard = Math.hypot(px, pz - SIPHON_GALLERY_CONFIG.southArchwayZ);
      if (dWard <= SIPHON_GALLERY_CONFIG.wardInteractRadius && dWard < bestDist) {
        bestDist = dWard;
        bestPrompt = {
          kind: LOBBY_PROMPT_KINDS.SIPHON_GALLERY_WARD,
          title: 'SIPHON GALLERY — SEALED',
          subtitle: 'Defeat a Realm Sovereign to unlock the Siphon Gallery',
        };
      }
    }

    this.setPromptIfChanged(bestPrompt);

    if (bestPrompt && player.playerIntent.portalInteractRequested) {
      this.executeActiveInteraction(FINISHER_MODES.KISS);
    } else if (bestPrompt && player.playerIntent.beamFinisherExecuteRequested) {
      this.executeActiveInteraction(FINISHER_MODES.BEAM);
    }
  }

  private setPromptIfChanged(next: LobbyPromptState | null): void {
    const prev = this.activePrompt;
    const same =
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.kind === next.kind &&
        prev.title === next.title &&
        prev.subtitle === next.subtitle);
    if (same) return;

    this.activePrompt = next;
    useGameStore.getState().setLobbyPrompt(next);
  }
}
