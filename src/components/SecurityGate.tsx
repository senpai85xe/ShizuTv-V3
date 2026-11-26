import React, { useState } from 'react';
import { Lock, Delete } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { ShonenXLogo } from './ShonenXLogo';

export const SecurityGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLocked, unlockApp, state } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isLocked) return <>{children}</>;

  const targetLength = state.securityPrefs.pinCode.length || 4;

  const handleDigit = (digit: string) => {
    const next = pin + digit;
    setError(false);
    if (next.length >= targetLength) {
      const ok = unlockApp(next);
      if (!ok) {
        setError(true);
        setPin('');
      } else {
        setPin('');
      }
    } else {
      setPin(next);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--sx-surface)] p-6 select-none">
      <div className="w-full max-w-xs flex flex-col items-center space-y-6">
        <ShonenXLogo size={42} className="text-[var(--sx-primary)]" />
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sx-primary)]">
            <Lock className="w-3.5 h-3.5" />
            <span>App Locked</span>
          </div>
          <h1 className="text-xl font-extrabold">Enter your PIN</h1>
          {error && (
            <p className="text-xs font-semibold text-red-400">Incorrect PIN. Try again.</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {Array.from({ length: targetLength }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                i < pin.length
                  ? 'bg-[var(--sx-primary)] border-[var(--sx-primary)] scale-110'
                  : 'border-[var(--sx-outline)] sx-glass-control'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-14 rounded-2xl sx-glass-panel border border-[var(--sx-outline)] text-lg font-bold hover:border-[var(--sx-primary)] active:scale-95 transition-all"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl sx-glass-panel border border-[var(--sx-outline)] text-lg font-bold hover:border-[var(--sx-primary)] active:scale-95 transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Backspace"
            className="h-14 rounded-2xl sx-glass-panel border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] active:scale-95 transition-all"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
