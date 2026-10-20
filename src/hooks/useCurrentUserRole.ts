"use client";

import { useSyncExternalStore } from "react";
import { currentUserAccess } from "@/lib/currentUserAccess";

export function useCurrentUserRole() {
  return useSyncExternalStore(currentUserAccess.subscribe, currentUserAccess.getSnapshot, currentUserAccess.getServerSnapshot);
}
