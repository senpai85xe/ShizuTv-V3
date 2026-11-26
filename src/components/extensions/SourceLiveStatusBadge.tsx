import React from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Cpu,
  Globe,
  HelpCircle,
  ShieldAlert,
  Smartphone,
  XCircle,
} from 'lucide-react';
import type {
  SourceLiveStatusBadge as LiveStatusData,
  SourceLiveStatusKind,
} from '../../utils/sourceStatus';

export function getLiveStatusBadgeClasses(kind: SourceLiveStatusKind): string {
  switch (kind) {
    case 'working':
      return 'bg-emerald-500/16 border-emerald-500/35 text-emerald-700 dark:text-emerald-300';
    case 'web-ready':
      return 'bg-teal-500/15 border-teal-500/32 text-teal-700 dark:text-teal-300';
    case 'partial':
      return 'bg-amber-500/16 border-amber-500/35 text-amber-700 dark:text-amber-300';
    case 'blocked':
      return 'bg-rose-500/16 border-rose-500/35 text-rose-700 dark:text-rose-300';
    case 'failed':
      return 'bg-red-500/16 border-red-500/35 text-red-700 dark:text-red-300';
    case 'android-native':
      return 'bg-sky-500/14 border-sky-500/30 text-sky-700 dark:text-sky-300';
    case 'unsupported':
      return 'bg-orange-500/15 border-orange-500/32 text-orange-700 dark:text-orange-300';
    case 'untested':
    default:
      return 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border-white/30 dark:border-white/12 text-[var(--sx-on-surface-muted)]';
  }
}

export const LiveStatusBadgeIcon: React.FC<{
  kind: SourceLiveStatusKind;
  isInbuilt?: boolean;
  className?: string;
}> = ({ kind, isInbuilt, className = 'w-2.5 h-2.5' }) => {
  switch (kind) {
    case 'working':
      return <CheckCircle2 className={`${className} shrink-0`} />;
    case 'web-ready':
      return isInbuilt ? (
        <Cpu className={`${className} shrink-0`} />
      ) : (
        <Globe className={`${className} shrink-0`} />
      );
    case 'partial':
      return <AlertCircle className={`${className} shrink-0`} />;
    case 'blocked':
      return <ShieldAlert className={`${className} shrink-0`} />;
    case 'failed':
      return <XCircle className={`${className} shrink-0`} />;
    case 'android-native':
      return <Smartphone className={`${className} shrink-0`} />;
    case 'unsupported':
      return <Ban className={`${className} shrink-0`} />;
    case 'untested':
    default:
      return <HelpCircle className={`${className} shrink-0`} />;
  }
};

export const SourceLiveStatusChip: React.FC<{
  badge: LiveStatusData;
  isInbuilt?: boolean;
  testId?: string;
  title?: string;
}> = ({ badge, isInbuilt, testId, title }) => {
  return (
    <span
      data-testid={testId}
      title={title ?? badge.shortHint ?? badge.label}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold leading-tight ${getLiveStatusBadgeClasses(
        badge.kind,
      )}`}
    >
      <LiveStatusBadgeIcon kind={badge.kind} isInbuilt={isInbuilt} />
      <span>{badge.label}</span>
    </span>
  );
};
