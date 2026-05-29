'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    Bell,
    MessageSquare,
    Calendar,
    Settings,
    Clock,
    AlertTriangle,
    Heart,
    Stethoscope,
    ShieldAlert,
    Trash2,
    CheckCheck,
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
    InboxIcon,
    RefreshCw,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotifType =
    | 'activity_reminder'
    | 'session_reminder'
    | 'streak_alert'
    | 'doctor_message'
    | 'triage_message'
    | 'care_request'
    | 'crisis';

export interface ApiNotification {
    _id: string;
    type: NotifType;
    title: string;
    body: string;
    is_read: boolean;
    created_at: string;
}

interface PaginatedResponse {
    notifications: ApiNotification[];
    total: number;
    unread: number;
    page: number;
    limit: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 15;

export const TYPE_TABS: { label: string; value: 'all' | NotifType | 'unread' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread' },
    { label: 'Care', value: 'care_request' },
    { label: 'Messages', value: 'triage_message' },
    { label: 'Sessions', value: 'session_reminder' },
    { label: 'Activity', value: 'activity_reminder' },
    { label: 'System', value: 'session_reminder' }, // reuses session_reminder for now; extend if needed
    { label: '🚨 Crisis', value: 'crisis' },
];

export const TYPE_ICON_MAP: Record<NotifType, React.ReactNode> = {
    activity_reminder: <Heart className="w-4 h-4" />,
    session_reminder: <Calendar className="w-4 h-4" />,
    streak_alert: <Clock className="w-4 h-4" />,
    doctor_message: <MessageSquare className="w-4 h-4" />,
    triage_message: <MessageSquare className="w-4 h-4" />,
    care_request: <Stethoscope className="w-4 h-4" />,
    crisis: <ShieldAlert className="w-4 h-4" />,
};

export const TYPE_COLOR_MAP: Record<NotifType, string> = {
    activity_reminder: 'bg-emerald-100 text-emerald-700',
    session_reminder: 'bg-blue-100 text-blue-700',
    streak_alert: 'bg-amber-100 text-amber-700',
    doctor_message: 'bg-violet-100 text-violet-700',
    triage_message: 'bg-indigo-100 text-indigo-700',
    care_request: 'bg-cyan-100 text-cyan-700',
    crisis: 'bg-red-100 text-red-700',
};

export const TYPE_LABEL_MAP: Record<NotifType, string> = {
    activity_reminder: 'Activity',
    session_reminder: 'Session',
    streak_alert: 'Streak',
    doctor_message: 'Message',
    triage_message: 'Triage',
    care_request: 'Care',
    crisis: 'Crisis',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface NotificationsPageContentProps {
    role: 'admin' | 'doctor' | 'patient';
}

export default function NotificationsPageContent({ role }: NotificationsPageContentProps) {
    const [notifications, setNotifications] = useState<ApiNotification[]>([]);
    const [tab, setTab] = useState<'all' | NotifType | 'unread'>('all');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<Omit<PaginatedResponse, 'notifications'> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState<string | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Fetch ────────────────────────────────────────────────────────────────

    const fetchNotifications = useCallback(async (p: number, t: typeof tab) => {
        const session = getSession();
        if (!session) return;

        setLoading(true);
        setError(null);
        try {
            const filter = t === 'all' ? '' : `&filter=${t}`;
            const res = await apiRequest<PaginatedResponse>(
                `/notifications?page=${p}&limit=${PAGE_LIMIT}${filter}`,
                { token: session.access_token }
            );
            if (res.data) {
                setNotifications(res.data.notifications);
                setMeta(res.data);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load notifications');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        setSelected(new Set());
    }, [tab]);

    useEffect(() => {
        void fetchNotifications(page, tab);
    }, [page, tab, fetchNotifications]);

    // ── Toast ─────────────────────────────────────────────────────────────────

    const showToast = (msg: string) => {
        setToastMsg(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
    };

    // ── Mark read ────────────────────────────────────────────────────────────

    const markOneRead = async (id: string) => {
        const session = getSession();
        if (!session) return;
        try {
            await apiRequest(`/notifications/${id}/read`, {
                method: 'PATCH',
                token: session.access_token,
            });
            setNotifications(prev =>
                prev.map(n => n._id === id ? { ...n, is_read: true } : n)
            );
            if (meta) setMeta({ ...meta, unread: Math.max(0, meta.unread - 1) });
        } catch { /* silent */ }
    };

    const markAllRead = async () => {
        const session = getSession();
        if (!session) return;
        setBulkLoading(true);
        try {
            await apiRequest('/notifications/read-all', {
                method: 'PATCH',
                token: session.access_token,
            });
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            if (meta) setMeta({ ...meta, unread: 0 });
            showToast('All notifications marked as read');
        } catch { /* silent */ } finally {
            setBulkLoading(false);
        }
    };

    // ── Delete ───────────────────────────────────────────────────────────────

    const deleteOne = async (id: string) => {
        const session = getSession();
        if (!session) return;
        try {
            await apiRequest(`/notifications/${id}`, {
                method: 'DELETE',
                token: session.access_token,
            });
            setNotifications(prev => prev.filter(n => n._id !== id));
            setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
            if (meta) setMeta({ ...meta, total: meta.total - 1 });
        } catch { /* silent */ }
    };

    const deleteSelected = async () => {
        if (selected.size === 0) return;
        setBulkLoading(true);
        try {
            await Promise.all([...selected].map(id => deleteOne(id)));
            setSelected(new Set());
            showToast(`${selected.size} notification${selected.size > 1 ? 's' : ''} deleted`);
        } finally {
            setBulkLoading(false);
        }
    };

    const deleteAllNotifications = async () => {
        const session = getSession();
        if (!session) return;
        if (!confirm('Delete all notifications? This cannot be undone.')) return;
        setBulkLoading(true);
        try {
            await apiRequest('/notifications', {
                method: 'DELETE',
                token: session.access_token,
            });
            setNotifications([]);
            setMeta(meta ? { ...meta, total: 0, unread: 0, total_pages: 0 } : null);
            setSelected(new Set());
            showToast('All notifications deleted');
        } catch { /* silent */ } finally {
            setBulkLoading(false);
        }
    };

    // ── Selection ────────────────────────────────────────────────────────────

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === notifications.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(notifications.map(n => n._id)));
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const unread = meta?.unread ?? 0;
    const total = meta?.total ?? 0;

    return (
        <div className="max-w-4xl mx-auto px-2 md:px-0 py-6 space-y-5">

            {/* ── Toast ── */}
            {toastMsg && (
                <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    {toastMsg}
                </div>
            )}

            {/* ── Header ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                            <Bell className="w-6 h-6 text-primary" />
                            Notifications
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {unread > 0
                                ? <span className="text-primary font-medium">{unread} unread</span>
                                : 'All caught up'} · {total} total
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => void fetchNotifications(page, tab)}
                            disabled={loading}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>

                        {unread > 0 && (
                            <button
                                onClick={() => void markAllRead()}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <CheckCheck className="w-4 h-4" />
                                Mark all read
                            </button>
                        )}

                        {total > 0 && (
                            <button
                                onClick={() => void deleteAllNotifications()}
                                disabled={bulkLoading}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4" />
                                Clear all
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Filter tabs ── */}
                <div className="flex gap-2 mt-5 overflow-x-auto pb-1 scrollbar-none">
                    {TYPE_TABS.map(t => (
                        <button
                            key={t.value}
                            onClick={() => setTab(t.value)}
                            className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 border ${tab === t.value
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Bulk action bar ── */}
            {selected.size > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
                    <span className="text-sm font-medium text-primary">
                        {selected.size} selected
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSelected(new Set())}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Deselect
                        </button>
                        <button
                            onClick={() => void deleteSelected()}
                            disabled={bulkLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {bulkLoading
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            Delete selected
                        </button>
                    </div>
                </div>
            )}

            {/* ── List ── */}
            <div className="space-y-2">
                {loading && notifications.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex flex-col items-center gap-3 text-gray-400">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Loading notifications…</p>
                    </div>
                ) : error ? (
                    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-10 flex flex-col items-center gap-3 text-red-500">
                        <AlertTriangle className="w-8 h-8" />
                        <p className="text-sm font-medium">{error}</p>
                        <button
                            onClick={() => void fetchNotifications(page, tab)}
                            className="text-xs text-primary underline"
                        >
                            Try again
                        </button>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex flex-col items-center gap-3 text-gray-400">
                        <InboxIcon className="w-12 h-12 opacity-30" />
                        <p className="font-semibold text-gray-500">No notifications</p>
                        <p className="text-sm text-gray-400">
                            {tab === 'unread'
                                ? "You're all caught up!"
                                : tab === 'all'
                                    ? "Nothing here yet"
                                    : `No ${tab.replace('_', ' ')} notifications`}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Select-all row */}
                        <div className="flex items-center gap-3 px-4 py-2">
                            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={selected.size === notifications.length && notifications.length > 0}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded accent-primary"
                                />
                                Select all on this page
                            </label>
                        </div>

                        {notifications.map(n => (
                            <NotificationRow
                                key={n._id}
                                notification={n}
                                selected={selected.has(n._id)}
                                onToggleSelect={() => toggleSelect(n._id)}
                                onMarkRead={() => void markOneRead(n._id)}
                                onDelete={() => void deleteOne(n._id)}
                            />
                        ))}
                    </>
                )}
            </div>

            {/* ── Pagination ── */}
            {meta && meta.total_pages > 1 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-500">
                        Page <span className="font-medium text-gray-800">{page}</span> of{' '}
                        <span className="font-medium text-gray-800">{meta.total_pages}</span>
                        <span className="hidden sm:inline"> · {total} notifications</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => p - 1)}
                            disabled={!meta.has_prev || loading}
                            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" /> Prev
                        </button>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={!meta.has_next || loading}
                            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
    notification: ApiNotification;
    selected: boolean;
    onToggleSelect: () => void;
    onMarkRead: () => void;
    onDelete: () => void;
}

function NotificationRow({ notification: n, selected, onToggleSelect, onMarkRead, onDelete }: RowProps) {
    const colorClass = TYPE_COLOR_MAP[n.type] ?? 'bg-gray-100 text-gray-600';
    const icon = TYPE_ICON_MAP[n.type] ?? <Bell className="w-4 h-4" />;
    const isCrisis = n.type === 'crisis';

    return (
        <div
            className={`
                group relative bg-white rounded-xl border transition-all duration-200
                ${selected ? 'border-primary ring-1 ring-primary/30' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'}
                ${!n.is_read ? 'border-l-[3px] border-l-primary' : ''}
                ${isCrisis ? 'border-red-300 bg-red-50/40' : ''}
            `}
        >
            <div className="flex items-start gap-4 p-4">
                {/* Checkbox */}
                <div className="flex-shrink-0 pt-0.5">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={onToggleSelect}
                        className="w-4 h-4 rounded accent-primary"
                    />
                </div>

                {/* Type icon */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`text-sm font-semibold ${!n.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                                {n.title}
                            </h3>
                            {!n.is_read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
                                {TYPE_LABEL_MAP[n.type]}
                            </span>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                            {timeAgo(n.created_at)}
                        </span>
                    </div>

                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{n.body}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        {!n.is_read && (
                            <button
                                onClick={onMarkRead}
                                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                                <Check className="w-3 h-3" /> Mark read
                            </button>
                        )}
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                        >
                            <Trash2 className="w-3 h-3" /> Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
