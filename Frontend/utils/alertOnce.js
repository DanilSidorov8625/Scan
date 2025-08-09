// utils/alertOnce.js
import { Alert } from 'react-native';

let inFlight = false;
const lastShown = new Map(); // key -> timestamp
const COOLDOWN_MS = 5000;    // suppress duplicates for 5s

export function alertOnce(key, title, message, onOk) {
  const now = Date.now();

  // suppress if we showed the same key recently
  const last = lastShown.get(key) || 0;
  if (now - last < COOLDOWN_MS) return;

  // if an alert is currently visible, don't stack more
  if (inFlight) return;

  inFlight = true;
  lastShown.set(key, now);

  Alert.alert(title, message, [
    { text: 'OK', onPress: () => { inFlight = false; onOk?.(); } }
  ], { cancelable: false });
}