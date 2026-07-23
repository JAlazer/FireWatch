import { Redirect } from "expo-router";

// The app's entry point. For now it sends the user straight into the survey.
// (Later, a branded splash/logo screen can show briefly before this.)
export default function Index() {
  return <Redirect href="/onboarding" />;
}
