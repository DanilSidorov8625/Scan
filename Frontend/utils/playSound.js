// utils/playSound.js
import { Audio } from 'expo-av';
import errorSound from '../assets/sounds/error.mp3';
import successSound from '../assets/sounds/success.mp3';

/**
 * Play a one-off toast sound.
 * @param {boolean} isError – Pass true to play the error tone, false for success.
 */
export async function playSound(isError = false) {
  const sound = new Audio.Sound();
  try {
    // Metro will have already bundled these two because of the static import above.
    const asset = isError ? errorSound : successSound;
    await sound.loadAsync(asset);
    await sound.playAsync();

    // Unload when finished
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch (e) {
    console.warn('Error playing toast sound', e);
    // ensure we unload if it partially loaded
    try { await sound.unloadAsync(); } catch {}
  }
}