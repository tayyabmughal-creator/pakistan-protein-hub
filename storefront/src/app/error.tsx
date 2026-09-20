"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Shows the customer a recovery path and nothing else. The `error.digest` is
 * Next's server-side correlation id — safe to display and the only thing that
 * lets support tie a report to a log line. The message itself is never shown:
 * it can contain an upstream URL or a stack frame.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Storefront render error", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="mt-2 text-ink-soft">
        We hit a problem loading this page. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-brand px-5 py-2.5 font-semibold text-black hover:bg-brand-strong"
      >
        Try again
      </button>
      {error.digest && (
        <p className="mt-6 text-xs text-ink-faint">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
