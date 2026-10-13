'use client';

// components/CopyButton.js — copies a plain text value to the clipboard.
// Accepts:
//   value  {string}  — the text to copy (e.g. a 10-digit account number)
//   label  {string}  — human-readable name used in aria-label / tooltip
//                      (default: "account number")
//
// Security note: this component is intentionally generic but MUST NOT be
// used to copy sensitive values such as balances or PINs.

import { useState, useEffect, useRef } from 'react';

// ── Inline SVG icons ──────────────────────────────────────────────────────────

// Two overlapping rectangles — standard "copy" metaphor.
function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="w-4 h-4"
    >
      {/* Back rectangle */}
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      {/* Front rectangle with cut-out top-left corner */}
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// Simple check-mark — shown briefly after a successful copy.
function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="w-4 h-4"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CopyButton({ value, label = 'account number' }) {
  // 'idle' | 'copied' | 'failed'
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);

  // Clean up the reset timer on unmount to prevent state updates after unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    // Avoid double-clicking during the "Copied!" window.
    if (status !== 'idle') return;

    const text = String(value); // always plain digits, never extra formatting

    let success = false;

    // Primary path: modern Clipboard API.
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        // Clipboard API present but denied (e.g. iframe without permission).
        success = false;
      }
    }

    // Fallback: hidden <textarea> + execCommand (works in older browsers / WebViews).
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        // Keep it off-screen and non-interactive.
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        success = false;
      }
    }

    setStatus(success ? 'copied' : 'failed');

    // Reset back to idle after 2 seconds.
    timerRef.current = setTimeout(() => {
      setStatus('idle');
    }, 2000);
  }

  const isCopied = status === 'copied';
  const isFailed = status === 'failed';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        className={[
          'inline-flex items-center justify-center rounded p-1 transition',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1',
          isCopied
            ? 'text-emerald-400 hover:text-emerald-300'
            : isFailed
            ? 'text-red-400 hover:text-red-300'
            : 'text-emerald-200 hover:text-white',
        ].join(' ')}
      >
        {isCopied ? <CheckIcon /> : <CopyIcon />}
      </button>

      {/*
        aria-live="polite" announces the feedback to screen readers without
        interrupting whatever the reader was saying.
        The span is always in the DOM so screen readers track it reliably.
      */}
      <span
        aria-live="polite"
        className={[
          'text-xs font-medium transition-opacity duration-200',
          isCopied ? 'text-emerald-300 opacity-100' : 'opacity-0 select-none',
        ].join(' ')}
      >
        {isFailed ? "Couldn't copy" : 'Copied!'}
      </span>
    </span>
  );
}
