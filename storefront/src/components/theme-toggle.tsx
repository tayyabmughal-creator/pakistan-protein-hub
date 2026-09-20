"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark toggle.
 *
 * The class is already applied before paint by the inline script in the root
 * layout; this only reads the resulting state and flips it. It renders a
 * placeholder until mounted because the server cannot know which theme the
 * browser chose, and rendering the wrong icon then correcting it is a visible
 * flicker on every page load.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    try {
      localStorage.setItem("pn-theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable. The theme still applies for this page view.
    }
  }

  if (!mounted) {
    // Same dimensions as the real button so the header does not shift when it
    // appears — layout shift in a fixed header is especially jarring.
    return <div className="size-9" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex size-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM3 11h1a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2Zm17 0h1a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2ZM5.6 4.2l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4Zm12.1 12.1.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4ZM4.2 18.4l.7-.7a1 1 0 0 1 1.4 1.4l-.7.7a1 1 0 0 1-1.4-1.4ZM16.3 6.3l.7-.7a1 1 0 1 1 1.4 1.4l-.7.7a1 1 0 0 1-1.4-1.4Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M21.6 13.4A9 9 0 1 1 10.6 2.4a7 7 0 0 0 11 11Z" />
        </svg>
      )}
    </button>
  );
}
