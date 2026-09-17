"use client";

import { useLayoutEffect, useState } from "react";

export function useDesktopApp() {
  const [desktop, setDesktop] = useState(false);

  useLayoutEffect(() => {
    const api = window.doveeDesktop;
    if (!api?.isDesktop) return;
    document.documentElement.classList.add("desktop", `platform-${api.platform}`);
    setDesktop(true);
  }, []);

  return desktop;
}
