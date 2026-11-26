import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Server,
  Wifi,
  Trash2,
  Save,
  Loader2,
  ShieldAlert,
  Globe,
  Smartphone,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  BACKEND_CONFIG_CHANGED_EVENT,
  BACKEND_URL_STORAGE_KEY,
  clearRuntimeBackendUrl,
  getEffectiveBackendConfig,
  setRuntimeBackendUrl,
  testBackendConnection,
  validateAndNormalizeBackendUrl,
  type BackendConnectionTestResult,
} from '../utils/backendConfig';

export const BackendSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, addLog } = useApp();
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const [configVersion, setConfigVersion] = useState(0);
  const effectiveConfig = useMemo(() => {
    void configVersion;
    return getEffectiveBackendConfig();
  }, [configVersion]);

  const [inputUrl, setInputUrl] = useState<string>(
    () => effectiveConfig.runtimeBaseUrl || effectiveConfig.envBaseUrl || '',
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<BackendConnectionTestResult | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    const handleConfigChange = () => {
      setConfigVersion((v) => v + 1);
    };
    window.addEventListener(BACKEND_CONFIG_CHANGED_EVENT, handleConfigChange);
    return () => {
      window.removeEventListener(BACKEND_CONFIG_CHANGED_EVENT, handleConfigChange);
    };
  }, []);

  const currentOrigin =
    typeof window !== 'undefined' && window.location ? window.location.origin : 'unknown';

  const trimmedInput = inputUrl.trim();
  const liveValidation = useMemo(() => {
    if (!trimmedInput) return null;
    return validateAndNormalizeBackendUrl(trimmedInput);
  }, [trimmedInput]);

  const sourceLabel =
    effectiveConfig.source === 'runtime'
      ? 'Runtime Setting (Android / Browser Storage)'
      : effectiveConfig.source === 'env'
        ? 'Build Env (VITE_API_BASE_URL)'
        : effectiveConfig.isNative
          ? 'Not Configured'
          : 'Same-Origin Web (/api/*)';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);
    const validated = validateAndNormalizeBackendUrl(inputUrl);
    if (!validated.ok) {
      setFeedback({ type: 'err', text: validated.error });
      return;
    }

    try {
      const normalized = setRuntimeBackendUrl(validated.url);
      setInputUrl(normalized);
      setConfigVersion((v) => v + 1);
      addLog('INFO', 'Backend', `Saved runtime backend URL: ${normalized}`);
      setFeedback({
        type: 'ok',
        text: `Saved backend server URL: ${normalized}. All /api/* and WebSocket requests now route to this server.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save backend URL.',
      });
    }
  };

  const handleTest = async () => {
    setFeedback(null);
    setTestResult(null);
    const candidate = trimmedInput || effectiveConfig.baseUrl || '';
    if (!candidate) {
      setTestResult({
        ok: false,
        normalizedUrl: null,
        message: 'Enter your Express backend URL first before testing the connection.',
      });
      return;
    }

    setTesting(true);
    try {
      const result = await testBackendConnection(candidate);
      setTestResult(result);
      addLog(
        result.ok ? 'INFO' : 'WARN',
        'Backend',
        `Health check (${result.normalizedUrl || candidate}): ${result.message}`,
      );
    } finally {
      setTesting(false);
    }
  };

  const handleClear = () => {
    clearRuntimeBackendUrl();
    setConfigVersion((v) => v + 1);
    const afterClear = getEffectiveBackendConfig();
    setInputUrl(afterClear.envBaseUrl || '');
    setTestResult(null);
    addLog('INFO', 'Backend', 'Cleared runtime backend URL override');
    setFeedback({
      type: 'ok',
      text: afterClear.envBaseUrl
        ? `Cleared runtime override. Reverted to build-time VITE_API_BASE_URL (${afterClear.envBaseUrl}).`
        : afterClear.isNative
          ? 'Cleared saved backend URL. Configure a server URL again before fetching extensions or streams on Android.'
          : 'Cleared custom backend URL. Web requests will use same-origin /api/* routes.',
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="p-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors shrink-0"
            aria-label="Back to Settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">
              Backend Server Configuration
            </h1>
            <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5 truncate">
              Configure the remote Express backend URL for Android APK &amp; cross-origin API routing
            </p>
          </div>
        </div>
      </div>

      {/* Android Warning Banner if Native & Unconfigured */}
      {effectiveConfig.isNative && !effectiveConfig.baseUrl && (
        <div
          data-testid="backend-native-warning"
          style={{ borderRadius: roundness }}
          className="p-4 bg-amber-500/12 border border-amber-500/45 flex items-start gap-3 text-xs text-[var(--sx-on-surface)]"
        >
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-600 dark:text-amber-300">
              Backend URL Required on Android
            </div>
            <p className="text-[var(--sx-on-surface)]/85 leading-relaxed">
              The Capacitor Android shell serves static assets from <span className="font-mono">{currentOrigin}</span>.
              Without an Express backend URL configured here (or baked into <span className="font-mono">VITE_API_BASE_URL</span>),
              <span className="font-mono"> /api/*</span> calls cannot resolve streams, diagnostics, repositories, or Watch Party sockets.
            </p>
          </div>
        </div>
      )}

      {/* Current Runtime Summary */}
      <section
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            <Server className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            <span>Active Routing Status</span>
          </div>
          <span
            data-testid="backend-platform-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)] text-[11px] font-bold"
          >
            {effectiveConfig.isNative ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                <span>Android Native (Capacitor)</span>
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                <span>Web Browser</span>
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
              Effective Backend URL
            </div>
            <div
              data-testid="backend-effective-url"
              className="font-mono font-bold text-[var(--sx-on-surface)] break-all"
            >
              {effectiveConfig.baseUrl || (effectiveConfig.isNative ? 'Not Configured' : 'Same-Origin (/api/*)')}
            </div>
          </div>

          <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
              Configuration Source
            </div>
            <div data-testid="backend-config-source" className="font-semibold text-[var(--sx-on-surface)]">
              {sourceLabel}
            </div>
          </div>

          <div className="p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/70 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
              App Origin
            </div>
            <div className="font-mono text-[var(--sx-on-surface-muted)] break-all">
              {currentOrigin}
            </div>
          </div>
        </div>
      </section>

      {/* Configure Backend URL Form */}
      <form
        onSubmit={handleSave}
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
      >
        <div className="space-y-1">
          <label htmlFor="backend-url-input" className="text-sm font-bold block">
            Express Backend Base URL
          </label>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Enter your deployed HTTPS ShizuTv Express server origin (or emulator LAN URL such as{' '}
            <span className="font-mono">http://10.0.2.2:3000</span>). Do not append{' '}
            <span className="font-mono">/api</span> and never point to{' '}
            <span className="font-mono">https://localhost</span>.
          </p>
        </div>

        <div className="space-y-2">
          <input
            id="backend-url-input"
            data-testid="backend-url-input"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://api.yourdomain.com"
            value={inputUrl}
            onChange={(e) => {
              setInputUrl(e.target.value);
              setFeedback(null);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs sm:text-sm font-mono outline-none focus:border-[var(--sx-primary)]"
          />

          {liveValidation && !liveValidation.ok && (
            <p
              data-testid="backend-validation-error"
              className="text-xs text-red-500 font-medium flex items-start gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{liveValidation.error}</span>
            </p>
          )}
          {liveValidation && liveValidation.ok && trimmedInput !== liveValidation.url && (
            <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
              Will normalize to <span className="font-mono text-[var(--sx-on-surface)]">{liveValidation.url}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="submit"
            data-testid="backend-save-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl sx-glass-cta text-xs font-bold"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Backend URL</span>
          </button>

          <button
            type="button"
            data-testid="backend-test-btn"
            disabled={testing}
            onClick={() => void handleTest()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
            )}
            <span>{testing ? 'Testing /api/health...' : 'Test Connection'}</span>
          </button>

          <button
            type="button"
            data-testid="backend-clear-btn"
            onClick={handleClear}
            disabled={!effectiveConfig.runtimeBaseUrl && !trimmedInput}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/12 text-red-500 border border-red-500/35 text-xs font-bold hover:bg-red-500/20 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Saved URL</span>
          </button>
        </div>

        {feedback && (
          <div
            data-testid="backend-feedback"
            className={`p-3 rounded-xl border text-xs font-medium text-[var(--sx-on-surface)] flex items-start gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-500/12 border-emerald-500/40'
                : 'bg-red-500/12 border-red-500/40'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {testResult && (
          <div
            data-testid="backend-test-result"
            className={`p-3 rounded-xl border text-xs text-[var(--sx-on-surface)] flex items-start gap-2 ${
              testResult.ok
                ? 'bg-emerald-500/12 border-emerald-500/40'
                : 'bg-red-500/12 border-red-500/40'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div
                className={`font-bold ${
                  testResult.ok ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {testResult.ok ? 'Health Check Passed' : 'Health Check Failed'}
              </div>
              <div>{testResult.message}</div>
            </div>
          </div>
        )}
      </form>

      {/* Notes for Build & CORS */}
      <section
        style={{ borderRadius: roundness }}
        className="p-5 sx-glass-panel border border-[var(--sx-outline)] text-xs text-[var(--sx-on-surface-muted)] space-y-2 leading-relaxed"
      >
        <div className="font-bold text-[var(--sx-on-surface)]">
          Deployment &amp; Storage Notes
        </div>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            Runtime override is persisted under{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">{BACKEND_URL_STORAGE_KEY}</span>{' '}
            and takes precedence over build-time{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">VITE_API_BASE_URL</span>.
          </li>
          <li>
            Your Express backend allows Capacitor origins (
            <span className="font-mono text-[var(--sx-on-surface)]">https://localhost</span>,{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">capacitor://localhost</span>,{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">ionic://localhost</span>),{' '}
            local dev origins,{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">APP_URL</span>, and explicit
            origins listed in{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">CORS_ALLOWED_ORIGINS</span>.
          </li>
          <li>
            Web builds leave the backend URL unset by default so same-origin{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">/api/*</span> and{' '}
            <span className="font-mono text-[var(--sx-on-surface)]">/ws/watch-party</span> work automatically.
          </li>
        </ul>
      </section>
    </div>
  );
};
