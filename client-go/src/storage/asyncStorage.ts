// The AsyncStorage-backed KeyValueStore adapter used by the app. Isolated here so
// the core store logic (onboardingStore.ts) stays adapter-agnostic and testable in
// Node without pulling in the native module.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStore } from "./onboardingStore";

export const asyncStorageAdapter: KeyValueStore = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};
