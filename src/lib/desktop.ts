"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getDesktopSnapshot() {
  return Boolean(window.doveeDesktop?.isDesktop);
}

function getServerSnapshot() {
  return false;
}

export function useDesktopApp() {
  const desktop = useSyncExternalStore(subscribe, getDesktopSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    const api = window.doveeDesktop;
    if (!api?.isDesktop) return;
    document.documentElement.classList.add("desktop", `platform-${api.platform}`);
  }, []);

  return desktop;
}
