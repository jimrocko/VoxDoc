import { registerSW } from 'virtual:pwa-register';
import { announce, initAnnouncer } from './a11y/announcer.ts';
import { startApp } from './app.ts';
import { unlockSpeech } from './audio/speech.ts';
import { unlockAudio } from './audio/tones.ts';
import { byId } from './dom.ts';
import { status } from './feedback.ts';
import { initScanInputs } from './scan/scan.ts';
import { initVoicePanel } from './voice/panel.ts';

// VoiceOver-Doppeltippen löst nicht immer `pointerdown` aus, aber immer `click`.
const unlockEvents = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

/** iOS gibt Ton und Sprachausgabe erst nach der ersten Berührung frei. */
function setupAudioUnlock(): void {
  const unlock = (): void => {
    unlockAudio();
    unlockSpeech();
    for (const type of unlockEvents) {
      window.removeEventListener(type, unlock, true);
    }
  };
  for (const type of unlockEvents) {
    window.addEventListener(type, unlock, true);
  }
}

function main(): void {
  initAnnouncer(byId('announcer'));
  setupAudioUnlock();
  initScanInputs();
  startApp();
  initVoicePanel();

  const updateSW = registerSW({
    immediate: true,
    onOfflineReady: () => announce('VoxDoc ist jetzt auch offline verfügbar.'),
    // Neue Version: nur anbieten, nicht ungefragt neu laden.
    onNeedRefresh: () => {
      byId('update-banner').hidden = false;
      status('Eine neue Version von VoxDoc ist bereit. Tippe oben auf „Jetzt aktualisieren“, wenn es passt.');
    },
  });
  byId('update-reload').addEventListener('click', () => void updateSW(true));
}

main();
