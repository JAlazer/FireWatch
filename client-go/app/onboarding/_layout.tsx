import { Stack } from "expo-router";

// No visible header — the "Step 1 of 2" label lives inside the screen body
// instead (to match the mockup, which has no grey nav bar).
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
