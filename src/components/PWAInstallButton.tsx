import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center gap-1.5 rounded-xl font-bold sx-glass-cta ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold sx-glass-panel text-[var(--sx-on-surface)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)] transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              onClick={() => setShowIOSGuide(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Install ShizuTv on iOS"
              className="sx-backdrop-enter fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="sx-sheet-enter w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl sx-glass-modal border border-[var(--sx-outline)] p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-extrabold tracking-tight">Install ShizuTv</h3>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    aria-label="Close install instructions"
                    className="p-1.5 rounded-xl sx-glass-control text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ol className="space-y-2.5 text-xs text-[var(--sx-on-surface-muted)]">
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--sx-primary)]/15 text-[var(--sx-primary)] font-bold">
                      1
                    </span>
                    <span>
                      Tap the <strong className="text-[var(--sx-on-surface)]">Share</strong>{' '}
                      <Share className="inline w-3.5 h-3.5 text-[var(--sx-primary)]" /> button in
                      Safari&apos;s toolbar.
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--sx-primary)]/15 text-[var(--sx-primary)] font-bold">
                      2
                    </span>
                    <span>
                      Scroll down and choose{' '}
                      <strong className="text-[var(--sx-on-surface)]">Add to Home Screen</strong>.
                    </span>
                  </li>
                </ol>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  return null;
};
