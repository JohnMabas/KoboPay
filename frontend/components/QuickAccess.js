'use client';

// components/QuickAccess.js — Quick Access tile grid on the dashboard.
//
// Four tiles: Transfer (live), Airtime, Internet, Betting (coming soon).
// - Transfer: smooth-scrolls to #transfer-section and focuses the account input.
// - Coming-soon tiles: open a small accessible modal.
//
// The TILES array at the top is the single place to add / reorder tiles.

import { useState, useEffect, useRef } from 'react';

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function TransferIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="w-6 h-6">
      {/* Arrow pointing right */}
      <line x1="5" y1="9" x2="19" y2="9" />
      <polyline points="15 5 19 9 15 13" />
      {/* Arrow pointing left */}
      <line x1="19" y1="15" x2="5" y2="15" />
      <polyline points="9 11 5 15 9 19" />
    </svg>
  );
}

function AirtimeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="w-6 h-6">
      {/* Phone handset */}
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07
               A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67
               A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72
               c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91
               a16 16 0 0 0 6 6l.91-.9a2 2 0 0 1 2.11-.45
               c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function InternetIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="w-6 h-6">
      {/* Globe */}
      <circle cx="12" cy="12" r="10" />
      {/* Latitude lines */}
      <line x1="2" y1="12" x2="22" y2="12" />
      {/* Longitude curve suggesting a sphere */}
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10
               A15.3 15.3 0 0 1 8 12 15.3 15.3 0 0 1 12 2z" />
    </svg>
  );
}

function BettingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className="w-6 h-6">
      {/* Ticket outline */}
      <path d="M2 9a2 2 0 0 1 0-4V3h20v2a2 2 0 0 1 0 4v2a2 2 0 0 1 0 4v2H2v-2a2 2 0 0 1 0-4V9z" />
      {/* Dashed centre line */}
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 3" />
    </svg>
  );
}

// ── Tile definitions ──────────────────────────────────────────────────────────
// Edit this array to add, remove, or reorder tiles.
// action: 'transfer' (live) | 'soon' (shows coming-soon modal)

const TILES = [
  {
    id: 'transfer',
    label: 'Transfer',
    Icon: TransferIcon,
    action: 'transfer',
  },
  {
    id: 'airtime',
    label: 'Airtime',
    Icon: AirtimeIcon,
    action: 'soon',
  },
  {
    id: 'internet',
    label: 'Internet',
    Icon: InternetIcon,
    action: 'soon',
  },
  {
    id: 'betting',
    label: 'Betting',
    Icon: BettingIcon,
    action: 'soon',
  },
];

// ── Coming-soon modal ─────────────────────────────────────────────────────────

function ComingSoonModal({ label, onClose }) {
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null); // will receive focus when modal closes

  // Move focus into the modal when it opens.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape key.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Prevent page scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Generate a stable id for aria-labelledby.
  const titleId = `coming-soon-title-${label.toLowerCase().replace(/\s+/g, '-')}`;

  function handleBackdropClick(e) {
    // Close only when the backdrop itself is clicked, not its children.
    if (e.target === e.currentTarget) onClose();
  }

  return (
    // Backdrop
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
      >
        <h2
          id={titleId}
          className="text-lg font-semibold text-gray-800 mb-2"
        >
          {/* Plain text only — no dangerouslySetInnerHTML */}
          {label} is coming soon.
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          This feature is not available yet. Check back later.
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="bg-emerald-700 text-white px-5 py-2 rounded-lg font-semibold
                     hover:bg-emerald-800 transition
                     focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Quick Access section ──────────────────────────────────────────────────────

export default function QuickAccess() {
  // null = closed; string = label of the tile that opened it (for focus return)
  const [modalLabel, setModalLabel] = useState(null);

  // Keep refs for each tile button so we can return focus when the modal closes.
  const tileRefs = useRef({});

  function handleTileClick(tile) {
    if (tile.action === 'transfer') {
      // Smooth-scroll to the transfer section.
      const section = document.getElementById('transfer-section');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // After scroll animation, focus the first text input inside the section.
        setTimeout(() => {
          const firstInput = section.querySelector('input');
          firstInput?.focus();
        }, 400);
      }
    } else {
      // Open the coming-soon modal.
      setModalLabel(tile.label);
    }
  }

  function handleModalClose() {
    const label = modalLabel;
    setModalLabel(null);
    // Return focus to the tile that opened the modal.
    if (label) {
      const id = TILES.find((t) => t.label === label)?.id;
      if (id) tileRefs.current[id]?.focus();
    }
  }

  return (
    <section aria-label="Quick Access">
      <h2 className="text-base font-semibold text-gray-700 mb-3">Quick Access</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TILES.map((tile) => {
          const isSoon = tile.action === 'soon';
          return (
            <button
              key={tile.id}
              ref={(el) => { tileRefs.current[tile.id] = el; }}
              type="button"
              onClick={() => handleTileClick(tile)}
              className={[
                'relative flex flex-col items-center justify-center gap-2',
                'bg-white rounded-2xl shadow p-4 text-sm font-medium text-gray-700',
                'hover:shadow-md hover:bg-emerald-50 transition',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
              ].join(' ')}
            >
              {/* Icon in accent colour */}
              <span className="text-emerald-700">
                <tile.Icon />
              </span>

              {/* Label */}
              <span>{tile.label}</span>

              {/* "Soon" badge on coming-soon tiles */}
              {isSoon && (
                <span
                  className="absolute top-2 right-2 bg-emerald-100 text-emerald-700
                             text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                  aria-label="coming soon"
                >
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Coming-soon modal — rendered at this level so it sits above the grid */}
      {modalLabel !== null && (
        <ComingSoonModal label={modalLabel} onClose={handleModalClose} />
      )}
    </section>
  );
}
