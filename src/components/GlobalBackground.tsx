import React from 'react';
import { useApp } from '../store/AppContext';

export const GlobalBackground: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { state, batterySaver } = useApp();
  const { themePrefs } = state;

  const getGradientStyle = (): React.CSSProperties => {
    if (!themePrefs.useGradients || themePrefs.gradientStyle === 'none') {
      return {};
    }
    const alpha = Math.min(0.32, Math.max(0.05, themePrefs.gradientIntensity * 0.3));
    if (themePrefs.gradientStyle === 'topGlow') {
      return {
        backgroundImage: `radial-gradient(ellipse 85% 42% at 50% -8%, color-mix(in srgb, var(--sx-primary) ${Math.round(alpha * 100)}%, transparent), transparent 72%)`,
      };
    }
    if (themePrefs.gradientStyle === 'radial') {
      return {
        backgroundImage: `radial-gradient(circle at 80% 18%, color-mix(in srgb, var(--sx-primary) ${Math.round(alpha * 85)}%, transparent), transparent 48%), radial-gradient(circle at 12% 85%, color-mix(in srgb, var(--sx-secondary) ${Math.round(alpha * 65)}%, transparent), transparent 52%)`,
      };
    }
    return {
      backgroundImage: `linear-gradient(135deg, color-mix(in srgb, var(--sx-primary) ${Math.round(alpha * 70)}%, transparent) 0%, transparent 45%, color-mix(in srgb, var(--sx-tertiary) ${Math.round(alpha * 50)}%, transparent) 100%)`,
    };
  };

  return (
    <div className="relative min-h-screen w-full bg-[var(--sx-surface)] text-[var(--sx-on-surface)]">
      {themePrefs.useGradients && themePrefs.gradientStyle !== 'none' && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 z-0 ${
            batterySaver ? '' : 'transition-opacity duration-300'
          }`}
          style={getGradientStyle()}
        />
      )}
      {!batterySaver && themePrefs.useNoiseOverlay && (
        <div
          aria-hidden="true"
          className="sx-noise-overlay pointer-events-none fixed inset-0 z-0"
          style={{ opacity: themePrefs.noiseOpacity }}
        />
      )}
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
};
