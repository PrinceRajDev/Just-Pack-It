export const googleConfigured = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_APP_ID
);
export async function googleIdentity() {
  const [
    { initializeApp, getApps },
    { getAuth, GoogleAuthProvider, signInWithPopup, inMemoryPersistence, setPersistence, signOut },
  ] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  if (!googleConfigured) throw new Error("Google sign-in is not configured yet.");
  const app =
    getApps().find((app) => app.name === "jpi-auth") ??
    initializeApp(
      {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      },
      "jpi-auth",
    );
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const result = await signInWithPopup(auth, provider);
    return {
      idToken: await result.user.getIdToken(true),
      email: result.user.email ?? "",
      name: result.user.displayName ?? "",
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
      throw new Error("Google sign-in cancelled. You can try again.");
    if (code === "auth/popup-blocked")
      throw new Error("Allow popups for this website, then try Google again.");
    throw new Error("Google sign-in could not finish. Try again or use phone and password.");
  } finally {
    await signOut(auth).catch(() => {});
  }
}
