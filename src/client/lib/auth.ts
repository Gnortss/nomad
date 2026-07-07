import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: window.location.origin });
export const useSession = authClient.useSession;
export const signInWithGoogle = () => authClient.signIn.social({ provider: "google", callbackURL: "/" });
export const signOut = () => authClient.signOut();
