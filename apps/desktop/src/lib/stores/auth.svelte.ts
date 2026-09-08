import type { User } from "@office-chat/shared";
import type { Identity } from "../types";

export type AuthPhase = "join" | "connecting" | "ready";

export const auth = $state<{
  phase: AuthPhase;
  identity: Identity | null;
  user: User | null;
  authError: string | null;
}>({
  phase: "join",
  identity: null,
  user: null,
  authError: null,
});
