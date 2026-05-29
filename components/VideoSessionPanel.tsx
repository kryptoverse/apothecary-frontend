'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Loader2, Phone, RefreshCcw, Video } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { Button } from '@/components/ui';

type Role = 'assistant' | 'doctor' | 'patient' | 'admin';

type VideoSession = {
    video_session_id: string;
    status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'expired' | 'missed';
    scheduled_start_at: string;
    scheduled_end_at: string;
    max_duration_minutes: number;
    doctor_name?: string;
    doctor_email?: string;
    slot_status?: string;
    started_at?: string;
    ended_at?: string;
    cancel_reason?: string;
};

type Slot = {
    slot_id: string;
    scheduled_at: string;
    duration_mins: number;
    status: string;
    mode: string;
};

type SessionsResponse = {
    video_sessions: VideoSession[];
};

type SlotsResponse = {
    slots: Slot[];
};

export default function VideoSessionPanel({ careRequestId, role }: { careRequestId?: string; role: Role }) {
    const router = useRouter();
    const [sessions, setSessions] = useState<VideoSession[]>([]);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isUrgentCreating, setIsUrgentCreating] = useState(false);
    const canSchedule = role === 'doctor' || role === 'admin' || role === 'patient';

    const [dateRange] = useState(() => {
        const start = new Date();
        const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
        return {
            start: start.toISOString().slice(0, 10),
            end: end.toISOString().slice(0, 10)
        };
    });

    const load = useCallback(async () => {
        const session = getSession();
        if (!session || !careRequestId) return;

        setIsLoading(true);
        setNotice(null);

        try {
            const sessionsRes = await apiRequest<SessionsResponse>(`/video-sessions/care-requests/${careRequestId}`, {
                token: session.access_token
            });
            setSessions(sessionsRes.data?.video_sessions || []);

            if (canSchedule) {
                const slotsRes = await apiRequest<SlotsResponse>(`/video-sessions/care-requests/${careRequestId}/available-slots?start_date=${dateRange.start}&end_date=${dateRange.end}`, {
                    token: session.access_token
                });
                setSlots(slotsRes.data?.slots || []);
            }
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Unable to load video sessions.');
        } finally {
            setIsLoading(false);
        }
    }, [canSchedule, careRequestId, dateRange.end, dateRange.start]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const createSession = async () => {
        const session = getSession();
        if (!session || !careRequestId || !selectedSlotId) return;

        setIsCreating(true);
        setNotice(null);

        try {
            await apiRequest('/video-sessions', {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    care_request_id: careRequestId,
                    slot_id: selectedSlotId
                })
            });
            setSelectedSlotId('');
            await load();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Unable to schedule video session.');
        } finally {
            setIsCreating(false);
        }
    };

    const createUrgentSession = async () => {
        const session = getSession();
        if (!session || !careRequestId) return;

        setIsUrgentCreating(true);
        setNotice(null);

        try {
            const res = await apiRequest<{ message: string, video_session: VideoSession }>('/video-sessions/urgent', {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({ care_request_id: careRequestId })
            });
            await load();
            if (res.data?.video_session?.video_session_id) {
                joinSession(res.data.video_session.video_session_id);
            }
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Unable to start urgent video session.');
        } finally {
            setIsUrgentCreating(false);
        }
    };

    const endSession = async (sessionId: string) => {
        const auth = getSession();
        if (!auth) return;
        await apiRequest(`/video-sessions/${sessionId}/end`, { method: 'POST', token: auth.access_token });
        await load();
    };

    const cancelSession = async (sessionId: string) => {
        const auth = getSession();
        if (!auth) return;
        await apiRequest(`/video-sessions/${sessionId}/cancel`, {
            method: 'POST',
            token: auth.access_token,
            body: JSON.stringify({ reason: 'Cancelled from care thread.' })
        });
        await load();
    };

    const joinSession = (sessionId: string) => {
        router.push(`/dashboard/video-session/${sessionId}`);
    };

    const upcoming = sessions.filter(session => ['scheduled', 'active'].includes(session.status));

    return (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 font-semibold text-blue-950">
                        <Video className="h-4 w-4" />
                        Video Sessions
                    </div>
                    <p className="mt-1 text-xs text-blue-800">Booked from Doctor slots, capped at 50 minutes.</p>
                </div>
                <button type="button" onClick={load} className="rounded-lg border border-blue-100 bg-white p-2 text-blue-700">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                </button>
            </div>

            {notice && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{notice}</p>}

            <div className="mt-4 space-y-2">
                {upcoming.length === 0 && <p className="rounded-lg bg-white p-3 text-sm text-gray-500">No upcoming video session.</p>}
                {upcoming.map(session => (
                    <div key={session.video_session_id} className="rounded-lg border border-blue-100 bg-white p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-semibold text-gray-800">{formatDateTime(session.scheduled_start_at)}</p>
                                <p className="text-xs text-gray-500">{session.max_duration_minutes} min - {session.status}</p>
                            </div>
                            {(role === 'doctor' || role === 'patient') && (
                                <Button 
                                    size="sm" 
                                    onClick={() => joinSession(session.video_session_id)} 
                                    disabled={new Date().getTime() > new Date(session.scheduled_end_at).getTime() + 10 * 60 * 1000}
                                    leftIcon={<Phone className="h-4 w-4" />}
                                >
                                    {new Date().getTime() > new Date(session.scheduled_end_at).getTime() + 10 * 60 * 1000 ? 'Expired' : 'Join'}
                                </Button>
                            )}
                        </div>
                        {(role === 'doctor' || role === 'admin') && session.status === 'active' && (
                            <Button className="mt-2" size="sm" variant="outline" onClick={() => void endSession(session.video_session_id)}>
                                End Session
                            </Button>
                        )}
                        {(role === 'doctor' || role === 'admin') && session.status === 'scheduled' && (
                            <Button className="mt-2" size="sm" variant="outline" onClick={() => void cancelSession(session.video_session_id)}>
                                Cancel Session
                            </Button>
                        )}
                    </div>
                ))}
            </div>

            {canSchedule && (
                <div className="mt-4 border-t border-blue-100 pt-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-blue-900">Schedule from available slot</label>
                    <select
                        value={selectedSlotId}
                        onChange={event => setSelectedSlotId(event.target.value)}
                        className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                    >
                        <option value="">Choose a slot</option>
                        {slots.map(slot => (
                            <option key={slot.slot_id} value={slot.slot_id}>
                                {formatDateTime(slot.scheduled_at)} - {slot.duration_mins} min
                            </option>
                        ))}
                    </select>
                    {slots.length === 0 && <p className="mt-2 text-xs text-blue-800">No available video slots in the next 30 days.</p>}
                    <Button
                        className="mt-3"
                        fullWidth
                        disabled={!selectedSlotId || isUrgentCreating}
                        isLoading={isCreating}
                        onClick={createSession}
                        leftIcon={<CalendarClock className="h-4 w-4" />}
                    >
                        Schedule Video Session
                    </Button>
                    {role !== 'patient' && (
                        <div className="mt-4 border-t border-blue-100 pt-4">
                            <Button
                                variant="secondary"
                                fullWidth
                                isLoading={isUrgentCreating}
                                disabled={isCreating}
                                onClick={createUrgentSession}
                                leftIcon={<Video className="h-4 w-4" />}
                                className="bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
                            >
                                Start Urgent Video Call
                            </Button>
                            <p className="mt-2 text-center text-xs text-blue-800">Bypasses schedule, creates instant 15m session.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function formatDateTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
