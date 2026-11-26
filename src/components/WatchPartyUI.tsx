import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LogOut,
  MessageSquare,
  Send,
  Share2,
  Users,
} from 'lucide-react';
import {
  buildWatchPartyInviteUrl,
  FloatingEmojiItem,
  getParticipantInitial,
  WATCH_PARTY_REACTIONS,
  WatchPartyChatMessage,
  WatchPartyConnectionStatus,
  WatchPartyRoom,
} from '../utils/watchParty';

export interface WatchPartyUIProps {
  room: WatchPartyRoom;
  currentParticipantId: string | null;
  connectionStatus: WatchPartyConnectionStatus;
  lastEventNotice?: string | null;
  messages?: WatchPartyChatMessage[];
  reactions?: FloatingEmojiItem[];
  onSendMessage?: (text: string) => void;
  onSendReaction?: (emoji: string) => void;
  onLeaveRoom: () => void;
  collapsible?: boolean;
  showInviteStrip?: boolean;
  focusSignal?: number;
  subTab?: 'chat' | 'people';
  onSubTabChange?: (tab: 'chat' | 'people') => void;
  showFloatingReactions?: boolean;
}

export const WatchPartyUI: React.FC<WatchPartyUIProps> = ({
  room,
  currentParticipantId,
  connectionStatus,
  lastEventNotice,
  messages = [],
  reactions = [],
  onSendMessage,
  onSendReaction,
  onLeaveRoom,
  collapsible = true,
  showInviteStrip = true,
  focusSignal = 0,
  subTab,
  onSubTabChange,
  showFloatingReactions = true,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [internalSubTab, setInternalSubTab] = useState<'people' | 'chat'>('chat');
  const activeSubTab = subTab ?? internalSubTab;
  const setActiveSubTab = (tab: 'chat' | 'people') => {
    setInternalSubTab(tab);
    onSubTabChange?.(tab);
  };
  const [chatDraft, setChatDraft] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);
  const [burstingEmoji, setBurstingEmoji] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeSubTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length, activeSubTab]);

  useEffect(() => {
    if (focusSignal > 0) {
      setCollapsed(false);
      setActiveSubTab('chat');
      window.setTimeout(() => chatInputRef.current?.focus(), 80);
    }
  }, [focusSignal]);

  const handleCopy = async (kind: 'code' | 'link') => {
    const value =
      kind === 'code'
        ? room.roomCode
        : buildWatchPartyInviteUrl(room.roomCode);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(kind);
      window.setTimeout(() => {
        setCopiedTarget((curr) => (curr === kind ? null : curr));
      }, 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = chatDraft.trim();
    if (!cleaned || !onSendMessage) return;
    onSendMessage(cleaned);
    setChatDraft('');
  };

  const handleReactionTap = (emoji: string) => {
    if (!onSendReaction) return;
    setBurstingEmoji(emoji);
    onSendReaction(emoji);
    window.setTimeout(() => {
      setBurstingEmoji((curr) => (curr === emoji ? null : curr));
    }, 240);
  };

  const isReconnecting = connectionStatus === 'reconnecting';
  const statusText = isReconnecting ? 'Reconnecting' : 'Live Sync';
  const displayMessages = messages.length > 0 ? messages : room.messages || [];

  return (
    <aside
      data-testid="watch-party-ui"
      data-no-gesture="true"
      aria-label="Live Chat and Reactions"
      className="relative w-full rounded-[var(--sx-radius)] bg-white/32 dark:bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/14 ring-1 ring-inset ring-white/25 dark:ring-white/8 text-[var(--sx-on-surface)] shadow-[0_18px_46px_-14px_rgba(0,0,0,0.2)] overflow-hidden"
    >
      {/* Ambient live reaction preview ribbon at the top-right inside panel if no video overlay exists */}
      {showFloatingReactions && reactions.length > 0 && (
        <div
          data-testid="watch-party-ui-floating-emojis"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-28 top-12 overflow-hidden z-20"
        >
          {reactions.slice(-8).map((item) => (
            <span
              key={`panel-${item.id}`}
              style={
                {
                  left: `${item.xPercent}%`,
                  '--sx-emoji-drift': `${item.driftPx}px`,
                  '--sx-emoji-rot': `${item.rotateDeg}deg`,
                  '--sx-emoji-scale': String(item.scale),
                } as React.CSSProperties
              }
              className="sx-watch-emoji-float absolute bottom-0 text-xl select-none drop-shadow-md"
            >
              {item.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-white/22 dark:bg-white/[0.04] backdrop-blur-xl border-b border-white/35 dark:border-white/12">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-white/35 dark:bg-white/10 backdrop-blur-md border border-white/45 dark:border-white/14 text-[var(--sx-primary)]">
            <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              Live chat
            </h2>
            <p className="flex items-center gap-1 text-[10.5px] sm:text-[11px] font-medium text-[var(--sx-on-surface-muted)] whitespace-nowrap">
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isReconnecting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'
                }`}
              />
              <span>{statusText}</span>
              {room.track && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{room.track}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{room.participants.length} watching</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="watch-party-leave-header-btn"
            onClick={onLeaveRoom}
            title="Leave Room"
            className="min-h-[30px] sm:min-h-[34px] px-2.5 sm:px-3 py-1 rounded-full bg-red-500/12 hover:bg-red-500/20 backdrop-blur-md border border-red-500/25 text-red-600 dark:text-red-300 text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Leave</span>
          </button>

          {collapsible && (
            <button
              type="button"
              data-testid="watch-party-collapse-btn"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand Live Chat' : 'Minimize Live Chat'}
              className="min-h-[34px] min-w-[34px] rounded-full hover:bg-[var(--sx-surface-high)]/75 dark:hover:bg-white/10 backdrop-blur-md flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors shrink-0"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-3.5 sm:p-4 space-y-3">
          {showInviteStrip && (
            <div className="rounded-2xl bg-white/26 dark:bg-white/[0.05] backdrop-blur-xl backdrop-saturate-150 border border-white/45 dark:border-white/14 ring-1 ring-inset ring-white/20 dark:ring-white/8 px-3.5 py-2 flex items-center justify-between gap-2.5 shadow-sm">
              <div className="min-w-0 flex items-baseline gap-2">
                <span className="text-[11px] font-medium text-[var(--sx-on-surface-muted)]">
                  Room
                </span>
                <span
                  data-testid="watch-party-room-code"
                  className="font-mono-tabular text-sm font-black tracking-[0.16em] text-[var(--sx-on-surface)] select-all"
                >
                  {room.roomCode}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="watch-party-copy-code-btn"
                  onClick={() => void handleCopy('code')}
                  aria-label="Copy room code"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/35 dark:bg-white/10 backdrop-blur-md border border-white/45 dark:border-white/14 text-[11px] font-bold text-[var(--sx-on-surface)] whitespace-nowrap"
                >
                  {copiedTarget === 'code' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  data-testid="watch-party-copy-link-btn"
                  onClick={() => void handleCopy('link')}
                  aria-label="Copy invite link"
                  className="min-h-[30px] min-w-[30px] rounded-full bg-white/35 dark:bg-white/10 backdrop-blur-md border border-white/45 dark:border-white/14 flex items-center justify-center text-[var(--sx-on-surface)]"
                >
                  {copiedTarget === 'link' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {lastEventNotice && (
            <p
              data-testid="watch-party-event-notice"
              className="px-3 py-1 rounded-full bg-white/24 dark:bg-white/[0.05] backdrop-blur-md border border-white/40 dark:border-white/10 ring-1 ring-inset ring-white/20 dark:ring-white/5 text-[11px] font-medium text-[var(--sx-on-surface-muted)] truncate"
            >
              {lastEventNotice}
            </p>
          )}

          {/* Sub-tabs: Comments/Chat vs Viewers */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-white/26 dark:bg-white/[0.05] backdrop-blur-xl backdrop-saturate-150 border border-white/45 dark:border-white/14 ring-1 ring-inset ring-white/20 dark:ring-white/8 shadow-sm">
            <button
              type="button"
              data-testid="watch-party-tab-chat"
              onClick={() => setActiveSubTab('chat')}
              className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                activeSubTab === 'chat'
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="tabular-nums">Comments ({displayMessages.length})</span>
            </button>
            <button
              type="button"
              data-testid="watch-party-tab-people"
              onClick={() => setActiveSubTab('people')}
              className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                activeSubTab === 'people'
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="tabular-nums">Viewers ({room.participants.length})</span>
            </button>
          </div>

          {activeSubTab === 'chat' ? (
            <div className="space-y-3">
              {/* YouTube Live Style Scrolling Comment Feed */}
              <div
                data-testid="watch-party-chat-list"
                className="h-44 sm:h-56 overflow-y-auto space-y-1.5 pr-1 text-xs"
              >
                {displayMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-6 px-4 rounded-2xl bg-white/20 dark:bg-white/[0.04] backdrop-blur-md border border-white/40 dark:border-white/10">
                    <p className="text-xs font-semibold text-[var(--sx-on-surface-muted)]">
                      No comments yet — chat or send a reaction while watching live!
                    </p>
                  </div>
                ) : (
                  displayMessages.map((msg) => {
                    const isSelf = msg.senderId === currentParticipantId;
                    const isMsgHost = msg.senderId === room.hostId;
                    return (
                      <div
                        key={msg.id}
                        data-testid="watch-party-chat-item"
                        className="flex items-start gap-2 leading-snug break-words rounded-2xl bg-white/24 dark:bg-white/[0.05] backdrop-blur-md border border-white/40 dark:border-white/10 ring-1 ring-inset ring-white/20 dark:ring-white/5 px-2.5 py-1.5"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold ${
                            isMsgHost
                              ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                              : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface)]'
                          }`}
                        >
                          {getParticipantInitial(msg.senderName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span
                            className={`font-bold mr-1.5 ${
                              isSelf
                                ? 'text-[var(--sx-primary)]'
                                : 'text-[var(--sx-on-surface)]'
                            }`}
                          >
                            {msg.senderName}
                          </span>
                          <span className="text-[var(--sx-on-surface-muted)]">
                            {msg.text}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Floating Emoji Reaction Bar (uses standard frosted glass container + spring animation tokens) */}
              {onSendReaction && (
                <div
                  data-testid="watch-party-reaction-bar"
                  aria-label="Floating emoji reaction bar"
                  className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-2xl bg-white/32 dark:bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 border border-white/48 dark:border-white/14 ring-1 ring-inset ring-white/25 dark:ring-white/10 shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_14px_34px_rgba(0,0,0,0.4)] overflow-x-auto no-scrollbar"
                >
                  {WATCH_PARTY_REACTIONS.map((emoji, idx) => (
                    <button
                      key={emoji}
                      type="button"
                      data-testid={`watch-party-reaction-btn-${idx}`}
                      aria-label={`Send ${emoji} reaction`}
                      onClick={() => handleReactionTap(emoji)}
                      className={`sx-reaction-btn min-w-[38px] min-h-[38px] rounded-full flex items-center justify-center text-lg leading-none select-none hover:bg-[var(--sx-surface-container)]/75 dark:hover:bg-white/15 hover:backdrop-blur-md hover:ring-1 hover:ring-white/25 dark:hover:ring-white/15 ${
                        burstingEmoji === emoji
                          ? 'scale-110 bg-[var(--sx-surface-container)]/85 dark:bg-white/20 backdrop-blur-md ring-1 ring-white/30 dark:ring-white/20 shadow-sm'
                          : ''
                      }`}
                    >
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Comment / Chat Input */}
              {onSendMessage && (
                <form onSubmit={handleChatSubmit} className="flex items-center gap-2">
                  <input
                    ref={chatInputRef}
                    type="text"
                    data-testid="watch-party-chat-input"
                    value={chatDraft}
                    maxLength={280}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Comment live..."
                    className="flex-1 min-w-0 min-h-[42px] px-4 py-2 rounded-full bg-white/28 dark:bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150 border border-white/48 dark:border-white/14 ring-1 ring-inset ring-white/20 dark:ring-white/8 text-xs sm:text-sm text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)] focus:outline-none focus:border-[var(--sx-primary)] focus:bg-white/45 dark:focus:bg-white/[0.12] transition-colors"
                  />
                  <button
                    type="submit"
                    data-testid="watch-party-chat-send-btn"
                    aria-label="Send comment"
                    disabled={!chatDraft.trim()}
                    className="w-10 h-10 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] flex items-center justify-center shrink-0 disabled:opacity-45 shadow-sm transition-opacity"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          ) : (
            <ul
              data-testid="watch-party-participants-list"
              className="max-h-56 overflow-y-auto divide-y divide-white/25 dark:divide-white/10 rounded-2xl bg-white/24 dark:bg-white/[0.05] backdrop-blur-xl backdrop-saturate-150 border border-white/45 dark:border-white/12 ring-1 ring-inset ring-white/20 dark:ring-white/8 px-3 py-1"
            >
              {room.participants.map((participant) => {
                const isSelf = participant.id === currentParticipantId;
                const roleSegments: string[] = [participant.isHost ? 'Host' : 'Viewer'];
                if (isSelf) roleSegments.push('You');
                return (
                  <li
                    key={participant.id}
                    data-testid="watch-party-participant"
                    className="flex items-center justify-between gap-2 py-2 first:pt-1 last:pb-1"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                          participant.isHost
                            ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                            : 'bg-[var(--sx-surface-high)] text-[var(--sx-on-surface)]'
                        }`}
                      >
                        {getParticipantInitial(participant.name)}
                      </span>
                      <span className="text-xs font-semibold text-[var(--sx-on-surface)] truncate">
                        {participant.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] whitespace-nowrap shrink-0">
                      {roleSegments.join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
};
