'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, X, UserCheck, Clock, Stethoscope, ChevronDown, ChevronUp } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';

type DoctorInvite = {
    invite_id: string;
    email: string;
    status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
    Doctor: {
        doctor_id: string;
        email: string;
        specialty?: string;
        name?: string;
    } | null;
    expires_at: string;
    created_at: string;
    is_expired: boolean;
};

type InvitesResponse = {
    invites: DoctorInvite[];
    pending_count: number;
    total: number;
};

type Props = {
    onAccepted?: () => void; // callback so parent can reload profile
};

export default function DoctorInviteBanner({ onAccepted }: Props) {
    const [invites, setInvites] = useState<DoctorInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState(true);

    const loadInvites = useCallback(async () => {
        const session = getSession();
        if (!session) return;

        try {
            const res = await apiRequest<InvitesResponse>('/patient/invites', {
                token: session.access_token
            });
            const all = res.data?.invites || [];
            // Only show pending, non-expired invites
            setInvites(all.filter(i => i.status === 'pending' && !i.is_expired));
        } catch {
            // silently fail — don't break the dashboard
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadInvites();
    }, [loadInvites]);

    const accept = async (inviteId: string) => {
        const session = getSession();
        if (!session) return;

        setActionLoadingId(inviteId);
        setError('');
        setSuccess('');

        try {
            await apiRequest(`/patient/invites/${inviteId}/accept`, {
                method: 'POST',
                token: session.access_token
            });
            setSuccess('You are now connected with your doctor! Welcome to premium care.');
            await loadInvites();
            onAccepted?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to accept invite. Please try again.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const decline = async (inviteId: string) => {
        const session = getSession();
        if (!session) return;

        setActionLoadingId(inviteId);
        setError('');

        try {
            await apiRequest(`/patient/invites/${inviteId}/decline`, {
                method: 'POST',
                token: session.access_token
            });
            await loadInvites();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to decline invite.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const visibleInvites = invites.filter(i => !dismissed.has(i.invite_id));

    if (isLoading || (visibleInvites.length === 0 && !success)) return null;

    return (
        <div className="w-full">
            {success && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
                    <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800">Doctor Connected</p>
                        <p className="text-xs text-green-700 mt-0.5">{success}</p>
                    </div>
                    <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {visibleInvites.length > 0 && (
                <div className="rounded-2xl border-2 border-[var(--primary)] bg-[var(--accent)] shadow-md overflow-hidden">
                    {/* Header */}
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--primary-fixed)] transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] shadow">
                                <UserCheck className="h-4 w-4 text-white" />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-[var(--primary-dark)]">
                                    Doctor Invitation{visibleInvites.length > 1 ? `s (${visibleInvites.length})` : ''}
                                </p>
                                <p className="text-xs text-[var(--on-surface-variant)]">
                                    A doctor has invited you to join their care team
                                </p>
                            </div>
                        </div>
                        {expanded ? (
                            <ChevronUp className="h-4 w-4 text-[var(--primary)]" />
                        ) : (
                            <ChevronDown className="h-4 w-4 text-[var(--primary)]" />
                        )}
                    </button>

                    {/* Invite cards */}
                    {expanded && (
                        <div className="divide-y divide-[var(--outline-variant)] border-t border-[var(--outline-variant)]">
                            {visibleInvites.map(invite => {
                                const isActing = actionLoadingId === invite.invite_id;
                                const doctorDisplay = invite.Doctor?.name
                                    || invite.Doctor?.email?.split('@')[0]
                                    || 'Your Doctor';
                                const specialty = invite.Doctor?.specialty;
                                const expiresAt = new Date(invite.expires_at);
                                const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000));

                                return (
                                    <div key={invite.invite_id} className="relative bg-white px-5 py-4">
                                        {/* Dismiss button */}
                                        <button
                                            onClick={() => setDismissed(s => new Set(s).add(invite.invite_id))}
                                            className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                            title="Dismiss (will show again on refresh)"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>

                                        <div className="flex items-start gap-4 pr-6">
                                            {/* Doctor avatar */}
                                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] text-sm font-bold text-white shadow">
                                                {doctorDisplay.slice(0, 2).toUpperCase()}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-gray-900">Dr. {doctorDisplay}</p>
                                                {specialty && (
                                                    <div className="mt-0.5 flex items-center gap-1.5">
                                                        <Stethoscope className="h-3 w-3 text-[var(--primary)]" />
                                                        <p className="text-xs font-medium text-[var(--primary)]">{specialty}</p>
                                                    </div>
                                                )}
                                                <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                                                    This doctor has invited you to connect. Accepting will link you to their care and upgrade your account to premium.
                                                </p>

                                                {/* Expiry notice */}
                                                <div className="mt-2 flex items-center gap-1.5">
                                                    <Clock className="h-3 w-3 text-amber-500" />
                                                    <span className="text-[11px] text-amber-600 font-medium">
                                                        {hoursLeft < 24
                                                            ? `Expires in ${hoursLeft}h`
                                                            : `Expires ${expiresAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                                                    </span>
                                                </div>

                                                {/* Actions */}
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => accept(invite.invite_id)}
                                                        disabled={isActing}
                                                        className="flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[var(--primary-dark)] active:scale-95 disabled:opacity-50"
                                                    >
                                                        {isActing ? (
                                                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                        ) : (
                                                            <CheckCircle className="h-3.5 w-3.5" />
                                                        )}
                                                        Accept Invitation
                                                    </button>
                                                    <button
                                                        onClick={() => decline(invite.invite_id)}
                                                        disabled={isActing}
                                                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:scale-95 disabled:opacity-50"
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
