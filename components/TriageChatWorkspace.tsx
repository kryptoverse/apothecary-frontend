'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
    AlertCircle,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Circle,
    ClipboardList,
    Lock,
    MessageSquare,
    RefreshCcw,
    Save,
    Search,
    Send,
    ShieldCheck,
    Stethoscope,
    Video,
    Wifi,
    WifiOff
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { createTriageChatSocket, type TriageChatSocket } from '@/lib/triageChatSocket';
import { Button } from '@/components/ui';
import VideoSessionPanel from '@/components/VideoSessionPanel';

type WorkspaceRole = 'assistant' | 'doctor' | 'patient' | 'admin';

type TriageConversationStatus = 'open' | 'closed' | 'archived';

type TriageConversation = {
    conversation_id: string;
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    patient_email?: string;
    assistant_user_id?: string | null;
    assistant_email?: string | null;
    doctor_user_id?: string | null;
    doctor_id?: string | null;
    doctor_name?: string | null;
    doctor_email?: string | null;
    doctor_specialty?: string | null;
    status: TriageConversationStatus;
    care_request_status?: string;
    urgency?: 'low' | 'normal' | 'high';
    reason?: string;
    doctor_handoff_notes: string;
    doctor_handoff?: StructuredHandoff;
    unread_count: number;
    last_message_at?: string;
    closed_at?: string;
    created_at: string;
    updated_at: string;
};

type TriageMessage = {
    message_id: string;
    conversation_id: string;
    care_request_id?: string;
    patient_id?: string;
    sender_user_id?: string | null;
    sender_role: 'patient' | 'assistant' | 'doctor' | 'admin' | 'system';
    message_type: 'text' | 'system';
    body: string;
    created_at: string;
    delivery_status?: 'sending' | 'sent' | 'failed';
};

type InlineChatVideoSession = {
    video_session_id: string;
    status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'expired' | 'missed';
    scheduled_start_at: string;
    scheduled_end_at: string;
    max_duration_minutes: number;
    doctor_name?: string;
};

type StructuredHandoff = {
    patient_concern: string;
    symptoms: string;
    urgency: string;
    preferred_specialty: string;
    preferred_doctor_gender: string;
    availability: string;
    red_flags: string;
    suggested_doctor_type: string;
    internal_comments: string;
};

type AssignableDoctor = {
    doctor_id: string;
    email: string;
    status: string;
    specialty?: string;
    name: string;
    credential_status: 'pending' | 'verified' | 'rejected';
    max_patients: number;
    active_patient_count: number;
    available_slots_next_14_days: number;
    is_available_for_assignment: boolean;
    disabled_reason?: string | null;
};

type ConversationsResponse = {
    conversations: TriageConversation[];
};

type ConversationResponse = {
    conversation: TriageConversation;
};

type MessagesResponse = {
    messages: TriageMessage[];
};

type SendMessageResponse = {
    message: TriageMessage;
    conversation: TriageConversation;
};

type SocketAck<T> = {
    success: boolean;
    message?: string;
    data?: T;
};

const urgencyClasses: Record<string, string> = {
    low: 'bg-blue-50 text-blue-700 border-blue-200',
    normal: 'bg-green-50 text-green-700 border-green-200',
    high: 'bg-red-50 text-red-700 border-red-200'
};

const emptyHandoff: StructuredHandoff = {
    patient_concern: '',
    symptoms: '',
    urgency: '',
    preferred_specialty: '',
    preferred_doctor_gender: '',
    availability: '',
    red_flags: '',
    suggested_doctor_type: '',
    internal_comments: ''
};

const handoffFields: Array<{ key: keyof StructuredHandoff; label: string; placeholder: string; rows?: number }> = [
    { key: 'patient_concern', label: 'Patient concern', placeholder: 'Main reason the patient requested care.', rows: 2 },
    { key: 'symptoms', label: 'Symptoms', placeholder: 'Relevant symptoms, duration, severity, and context.', rows: 3 },
    { key: 'urgency', label: 'Urgency', placeholder: 'Low / normal / high plus why.', rows: 2 },
    { key: 'preferred_specialty', label: 'Preferred specialty', placeholder: 'General Physician, Dermatology, Cardiology...', rows: 2 },
    { key: 'preferred_doctor_gender', label: 'Preferred Doctor gender', placeholder: 'Any, female, male, or patient-stated preference.', rows: 2 },
    { key: 'availability', label: 'Availability', placeholder: 'Days/times the patient said work best.', rows: 2 },
    { key: 'red_flags', label: 'Red flags', placeholder: 'Safety concerns, urgent symptoms, contraindications, or none reported.', rows: 3 },
    { key: 'suggested_doctor_type', label: 'Suggested Doctor type', placeholder: 'Best matching Doctor profile or specialty.', rows: 2 },
    { key: 'internal_comments', label: 'Internal comments', placeholder: 'Assistant-only context for Doctor/admin.', rows: 3 }
];

function formatStatus(value?: string) {
    return (value || '-').replace(/_/g, ' ');
}

function formatTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatShortTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function isOwnMessage(message: TriageMessage, role: WorkspaceRole) {
    return message.sender_role === role;
}

function senderLabel(role: TriageMessage['sender_role'], currentRole: WorkspaceRole) {
    if (role === currentRole) return 'You';
    if (role === 'patient') return 'Patient';
    if (role === 'assistant') return 'Assistant';
    if (role === 'doctor') return 'Doctor';
    if (role === 'admin') return 'Admin';
    return 'System';
}

function messageTone(message: TriageMessage, currentRole: WorkspaceRole) {
    if (isOwnMessage(message, currentRole)) {
        return 'rounded-br-sm bg-primary text-white';
    }

    if (message.sender_role === 'patient') {
        return 'rounded-bl-sm border border-blue-100 bg-blue-50 text-blue-950';
    }

    if (message.sender_role === 'assistant') {
        return 'rounded-bl-sm border border-amber-100 bg-amber-50 text-amber-950';
    }

    if (message.sender_role === 'doctor') {
        return 'rounded-bl-sm border border-emerald-100 bg-emerald-50 text-emerald-950';
    }

    return 'rounded-bl-sm border border-gray-100 bg-white text-foreground';
}

function initials(name?: string) {
    const parts = (name || 'Patient').trim().split(/\s+/);
    return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'P';
}

function normalizeHandoff(handoff?: Partial<StructuredHandoff>, fallback?: TriageConversation | null): StructuredHandoff {
    return {
        ...emptyHandoff,
        patient_concern: handoff?.patient_concern || fallback?.reason || '',
        urgency: handoff?.urgency || fallback?.urgency || '',
        preferred_specialty: handoff?.preferred_specialty || '',
        preferred_doctor_gender: handoff?.preferred_doctor_gender || '',
        availability: handoff?.availability || '',
        symptoms: handoff?.symptoms || '',
        red_flags: handoff?.red_flags || '',
        suggested_doctor_type: handoff?.suggested_doctor_type || '',
        internal_comments: handoff?.internal_comments || ''
    };
}

function handoffToSummary(handoff: StructuredHandoff) {
    return handoffFields
        .map(field => {
            const value = handoff[field.key]?.trim();
            return value ? `${field.label}: ${value}` : '';
        })
        .filter(Boolean)
        .join('\n');
}

export default function TriageChatWorkspace({ role, initialCareRequestId }: { role: WorkspaceRole; initialCareRequestId?: string | null }) {
    const router = useRouter();
    const [conversations, setConversations] = useState<TriageConversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<TriageConversation | null>(null);
    const [messages, setMessages] = useState<TriageMessage[]>([]);
    const [messageBody, setMessageBody] = useState('');
    const [handoffDraft, setHandoffDraft] = useState<StructuredHandoff>(emptyHandoff);
    const [doctors, setDoctors] = useState<AssignableDoctor[]>([]);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [resolutionOutcome, setResolutionOutcome] = useState('completed');
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [search, setSearch] = useState('');
    const [activeMobilePane, setActiveMobilePane] = useState<'list' | 'chat' | 'details'>(role === 'patient' ? 'chat' : 'list');
    const [chatTab, setChatTab] = useState<'active' | 'closed'>('active');
    const [isSearchExpanded, setIsSearchExpanded] = useState(true);
    const [isHandoffExpanded, setIsHandoffExpanded] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isAssigningDoctor, setIsAssigningDoctor] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
    const [upcomingSessions, setUpcomingSessions] = useState<InlineChatVideoSession[]>([]);
    const socketRef = useRef<TriageChatSocket | null>(null);
    const selectedIdRef = useRef<string | null>(null);
    const messageEndRef = useRef<HTMLDivElement | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const canWriteNotes = role === 'assistant' || role === 'admin';
    const activeConversationId = selectedConversation?.conversation_id || null;
    const title = role === 'doctor' ? 'Care Team Messaging' : role === 'patient' ? 'Care Team Chat' : 'Triage Messaging';
    const subtitle = role === 'doctor'
        ? 'Review patient messages, assistant triage, and handoff notes in one care thread.'
        : role === 'patient'
            ? 'Message your care team for your active case.'
            : 'Chat with claimed triage patients and prepare notes for Doctor handoff.';

    const reconcileIncomingMessage = useCallback((incoming: TriageMessage) => {
        setMessages(current => {
            if (current.some(message => message.message_id === incoming.message_id)) {
                return current;
            }

            const optimisticIndex = current.findIndex(message => (
                message.message_id.startsWith('temp:') &&
                message.conversation_id === incoming.conversation_id &&
                message.sender_role === incoming.sender_role &&
                message.body === incoming.body
            ));

            if (optimisticIndex >= 0) {
                const next = [...current];
                next[optimisticIndex] = { ...incoming, delivery_status: 'sent' };
                return next;
            }

            return [...current, incoming];
        });
    }, []);

    const mergeConversation = useCallback((conversation: TriageConversation) => {
        setConversations(current => {
            const exists = current.some(item => item.conversation_id === conversation.conversation_id);
            const next = exists
                ? current.map(item => item.conversation_id === conversation.conversation_id ? conversation : item)
                : [conversation, ...current];

            return next.sort((a, b) => {
                const aTime = new Date(a.last_message_at || a.updated_at || a.created_at).getTime();
                const bTime = new Date(b.last_message_at || b.updated_at || b.created_at).getTime();
                return bTime - aTime;
            });
        });

        setSelectedConversation(current => (
            current?.conversation_id === conversation.conversation_id ? conversation : current
        ));
    }, []);

    const markRead = useCallback(async (conversationId: string) => {
        const session = getSession();
        if (!session) return;

        socketRef.current?.emit('message.read', { conversation_id: conversationId });
        await apiRequest(`/triage-chat/conversations/${conversationId}/read`, {
            method: 'POST',
            token: session.access_token
        }).catch(() => undefined);
    }, []);

    const loadMessages = useCallback(async (conversationId: string) => {
        const session = getSession();
        if (!session) return;

        const response = await apiRequest<MessagesResponse>(`/triage-chat/conversations/${conversationId}/messages?limit=80`, {
            token: session.access_token
        });
        setMessages(response.data?.messages || []);
        await markRead(conversationId);
    }, [markRead]);

    const fetchUpcomingSessions = useCallback(async (careRequestId: string) => {
        const session = getSession();
        if (!session) return;
        try {
            const res = await apiRequest<{ video_sessions: InlineChatVideoSession[] }>(
                `/video-sessions/care-requests/${careRequestId}`,
                { token: session.access_token }
            );
            const all = res.data?.video_sessions || [];
            setUpcomingSessions(all.filter(s => ['scheduled', 'active'].includes(s.status)));
        } catch {
            setUpcomingSessions([]);
        }
    }, []);

    const selectConversation = useCallback(async (conversation: TriageConversation) => {
        const previousId = selectedIdRef.current;
        if (previousId && previousId !== conversation.conversation_id) {
            socketRef.current?.emit('conversation.leave', { conversation_id: previousId });
        }

        selectedIdRef.current = conversation.conversation_id;
        setSelectedConversation(conversation);
        setActiveMobilePane('chat');
        setHandoffDraft(normalizeHandoff(conversation.doctor_handoff, conversation));
        setSelectedDoctorId(conversation.doctor_id || '');
        setError('');
        setUpcomingSessions([]);

        socketRef.current?.emit('conversation.join', { conversation_id: conversation.conversation_id });
        await loadMessages(conversation.conversation_id);
        await fetchUpcomingSessions(conversation.care_request_id);
    }, [loadMessages, fetchUpcomingSessions]);

    const loadConversations = useCallback(async (silent = false) => {
        const session = getSession();
        if (!session) return;

        if (!silent) setIsLoading(true);
        setError('');

        try {
            const statusFilter = chatTab === 'active' ? 'open' : 'closed';
            const response = await apiRequest<ConversationsResponse>(`/triage-chat/conversations?status=${statusFilter}&limit=60`, {
                token: session.access_token
            });
            const next = response.data?.conversations || [];
            setConversations(next);

            if (!selectedIdRef.current && next.length > 0) {
                await selectConversation(next[0]);
            } else if (selectedIdRef.current && !next.some(c => c.conversation_id === selectedIdRef.current)) {
                setSelectedConversation(null);
                selectedIdRef.current = null;
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load triage conversations.');
        } finally {
            setIsLoading(false);
        }
    }, [chatTab, selectConversation]);

    const openCareRequestConversation = useCallback(async (careRequestId: string) => {
        const session = getSession();
        if (!session) return;

        setIsLoading(true);
        setError('');

        try {
            const response = await apiRequest<ConversationResponse>(`/triage-chat/care-requests/${careRequestId}/conversation`, {
                method: 'POST',
                token: session.access_token
            });
            const conversation = response.data?.conversation;
            if (conversation) {
                mergeConversation(conversation);
                await selectConversation(conversation);
                await loadConversations(true);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to open this triage chat.');
        } finally {
            setIsLoading(false);
        }
    }, [loadConversations, mergeConversation, selectConversation]);

    useEffect(() => {
        const session = getSession();
        if (!session) return;

        const socket = createTriageChatSocket(session.access_token);
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            if (selectedIdRef.current) {
                socket.emit('conversation.join', { conversation_id: selectedIdRef.current });
            }
        });
        socket.on('disconnect', () => setIsConnected(false));
        socket.on('connect_error', () => setIsConnected(false));

        socket.on('triage:message_created', (payload: SendMessageResponse) => {
            if (!payload?.message || !payload?.conversation) return;
            mergeConversation(payload.conversation);

            if (payload.message.conversation_id === selectedIdRef.current) {
                reconcileIncomingMessage(payload.message);
                void markRead(payload.message.conversation_id);
            }
        });

        socket.on('triage:notes_updated', (payload: ConversationResponse) => {
            if (payload?.conversation) {
                mergeConversation(payload.conversation);
                if (payload.conversation.conversation_id === selectedIdRef.current) {
                    setHandoffDraft(normalizeHandoff(payload.conversation.doctor_handoff, payload.conversation));
                }
            }
        });

        socket.on('triage:doctor_onboarded', (payload: ConversationResponse) => {
            if (payload?.conversation) {
                mergeConversation(payload.conversation);
            }
        });

        socket.on('triage:conversation_closed', (payload: ConversationResponse) => {
            if (payload?.conversation) mergeConversation(payload.conversation);
        });

        socket.on('triage:typing_start', (payload: { conversation_id: string; user_id: string; role: string }) => {
            if (payload.conversation_id !== selectedIdRef.current) return;
            setTypingUsers(current => ({ ...current, [payload.user_id]: payload.role !== role }));
        });

        socket.on('triage:typing_stop', (payload: { conversation_id: string; user_id: string }) => {
            setTypingUsers(current => {
                const next = { ...current };
                delete next[payload.user_id];
                return next;
            });
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [markRead, mergeConversation, reconcileIncomingMessage, role]);

    useEffect(() => {
        const loadTimer = setTimeout(() => {
            if (initialCareRequestId) {
                void openCareRequestConversation(initialCareRequestId);
                return;
            }

            void loadConversations();
        }, 0);

        return () => clearTimeout(loadTimer);
    }, [initialCareRequestId, loadConversations, openCareRequestConversation]);

    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const filteredConversations = useMemo(() => {
        const value = search.trim().toLowerCase();
        if (!value) return conversations;

        return conversations.filter(conversation => (
            `${conversation.patient_name} ${conversation.patient_email || ''} ${conversation.reason || ''} ${conversation.doctor_handoff_notes || ''}`
                .toLowerCase()
                .includes(value)
        ));
    }, [conversations, search]);

    const filteredDoctors = useMemo(() => {
        const value = doctorSearch.trim().toLowerCase();
        return doctors.filter(doctor => {
            if (!value) return true;
            return `${doctor.name} ${doctor.email} ${doctor.specialty || ''}`.toLowerCase().includes(value);
        });
    }, [doctorSearch, doctors]);

    useEffect(() => {
        const session = getSession();
        if (!session || role !== 'assistant') return;

        apiRequest<{ Doctors: AssignableDoctor[] }>('/assistant/assignable-doctors', {
            token: session.access_token
        })
            .then(response => setDoctors(response.data?.Doctors || []))
            .catch(() => undefined);
    }, [role]);

    const resolveCase = async () => {
        const session = getSession();
        if (!selectedConversation?.patient_id || !session) return;
        
        setIsResolving(true);
        setError('');
        setSuccess('');
        try {
            await apiRequest(`/doctor/patients/${selectedConversation.patient_id}/treatment-outcome`, {
                method: 'PATCH',
                body: JSON.stringify({
                    outcome: resolutionOutcome,
                    doctor_notes: resolutionNotes
                }),
                token: session.access_token
            });
            await loadConversations(false);
            setResolutionNotes('');
            setSuccess('Case resolved successfully.');
        } catch (err) {
            console.error('Failed to resolve case:', err);
            setError(err instanceof Error ? err.message : 'Failed to resolve case.');
        } finally {
            setIsResolving(false);
        }
    };

    const sendMessage = async (event: FormEvent) => {
        event.preventDefault();
        const body = messageBody.trim();
        if (!body || !activeConversationId || isSending) return;

        const session = getSession();
        if (!session) return;

        const senderRole = role === 'patient' ? 'patient' : role === 'assistant' ? 'assistant' : role === 'doctor' ? 'doctor' : 'admin';
        const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const optimisticMessage: TriageMessage = {
            message_id: tempId,
            conversation_id: activeConversationId,
            care_request_id: selectedConversation?.care_request_id || '',
            patient_id: selectedConversation?.patient_id || '',
            sender_role: senderRole,
            message_type: 'text',
            body,
            created_at: new Date().toISOString(),
            delivery_status: 'sending'
        };

        setIsSending(true);
        setError('');
        setMessageBody('');
        setMessages(current => [...current, optimisticMessage]);

        const finish = (result: SendMessageResponse) => {
            mergeConversation(result.conversation);
            reconcileIncomingMessage(result.message);
        };

        try {
            if (socketRef.current?.connected) {
                const result = await new Promise<SocketAck<SendMessageResponse>>(resolve => {
                    socketRef.current?.emit('message.send', { conversation_id: activeConversationId, body }, resolve);
                });

                if (!result.success || !result.data) {
                    throw new Error(result.message || 'Unable to send message.');
                }
                finish(result.data);
            } else {
                const response = await apiRequest<SendMessageResponse>(`/triage-chat/conversations/${activeConversationId}/messages`, {
                    method: 'POST',
                    token: session.access_token,
                    body: JSON.stringify({ body })
                });
                if (response.data) finish(response.data);
            }
        } catch (err) {
            setMessages(current => current.map(message => (
                message.message_id === tempId ? { ...message, delivery_status: 'failed' } : message
            )));
            setError(err instanceof Error ? err.message : 'Unable to send message.');
        } finally {
            setIsSending(false);
        }
    };

    const handleTyping = (value: string) => {
        setMessageBody(value);
        if (!activeConversationId || !socketRef.current?.connected) return;

        socketRef.current.emit('typing.start', { conversation_id: activeConversationId });

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            socketRef.current?.emit('typing.stop', { conversation_id: activeConversationId });
        }, 900);
    };

    const persistHandoff = async () => {
        if (!activeConversationId) return;

        const session = getSession();
        if (!session) return;

        const summary = handoffToSummary(handoffDraft);

        const response = await apiRequest<ConversationResponse>(`/triage-chat/conversations/${activeConversationId}/handoff-notes`, {
            method: 'PATCH',
            token: session.access_token,
            body: JSON.stringify({
                doctor_handoff: handoffDraft,
                doctor_handoff_notes: summary
            })
        });

        if (response.data?.conversation) {
            mergeConversation(response.data.conversation);
        }
    };

    const saveNotes = async () => {
        if (!activeConversationId) return;

        setIsSavingNotes(true);
        setError('');
        setSuccess('');

        try {
            await persistHandoff();
            setSuccess('Doctor handoff notes saved.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to save handoff notes.');
        } finally {
            setIsSavingNotes(false);
        }
    };

    const assignDoctorFromChat = async () => {
        if (!selectedConversation || !selectedDoctorId) return;

        const session = getSession();
        if (!session) return;

        setIsAssigningDoctor(true);
        setError('');
        setSuccess('');

        try {
            await persistHandoff();
            await apiRequest(`/assistant/care-requests/${selectedConversation.care_request_id}/assign-doctor`, {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    doctor_id: selectedDoctorId,
                    force: false
                })
            });
            setSuccess('Doctor assigned and onboarded into this care thread.');
            await loadConversations(true);
            if (selectedIdRef.current) {
                const response = await apiRequest<ConversationResponse>(`/triage-chat/conversations/${selectedIdRef.current}`, {
                    token: session.access_token
                });
                if (response.data?.conversation) {
                    mergeConversation(response.data.conversation);
                    setSelectedConversation(response.data.conversation);
                    setSelectedDoctorId(response.data.conversation.doctor_id || selectedDoctorId);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to assign Doctor from chat.');
        } finally {
            setIsAssigningDoctor(false);
        }
    };

    const hasTyping = Object.values(typingUsers).some(Boolean);
    const canSend = Boolean(activeConversationId && selectedConversation?.status === 'open');

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-7rem)] items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm">
                <p className="text-gray-500">Loading triage chat...</p>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden w-full">
            <div className="hidden lg:flex mb-3 flex-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-bold text-foreground">{title}</h2>
                    <p className="text-sm text-gray-600">{subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${isConnected ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                        {isConnected ? 'Live' : 'Reconnecting'}
                    </span>
                    <Button variant="outline" onClick={() => loadConversations(true)} leftIcon={<RefreshCcw className="h-4 w-4" />}>
                        Refresh
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mb-3 flex flex-none items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {success && (
                <div className="mb-3 flex flex-none items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                    <Check className="h-5 w-5 flex-shrink-0" />
                    <span>{success}</span>
                </div>
            )}

            <div className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden border-0 bg-white shadow-none md:rounded-2xl md:border md:border-gray-200 md:shadow-sm ${
                role === 'patient'
                    ? 'xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]'
                    : isHandoffExpanded
                        ? 'xl:grid-cols-[280px_minmax(0,1fr)_320px] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]'
                        : 'xl:grid-cols-[280px_minmax(0,1fr)_56px] 2xl:grid-cols-[300px_minmax(0,1fr)_56px]'
            }`}>
                {role !== 'patient' && (
                <aside className={`min-h-0 flex-col border-gray-100 bg-white xl:border-r xl:flex ${activeMobilePane === 'list' ? 'flex' : 'hidden'}`}>
                    <div className="flex-none border-b border-gray-100 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Patient Chats
                                </p>
                                <p className="text-sm text-gray-500">{filteredConversations.length} {chatTab}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSearchExpanded(value => !value)}
                                className="rounded-lg p-2 text-primary hover:bg-accent"
                                title={isSearchExpanded ? 'Collapse search' : 'Expand search'}
                            >
                                <ChevronDown className={`h-4 w-4 transition ${isSearchExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        <div className="mb-3 flex w-full rounded-lg border border-gray-200 bg-gray-50 p-1">
                            <button
                                type="button"
                                onClick={() => setChatTab('active')}
                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${chatTab === 'active' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Active
                            </button>
                            <button
                                type="button"
                                onClick={() => setChatTab('closed')}
                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${chatTab === 'closed' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Concluded
                            </button>
                        </div>
                        {isSearchExpanded && (
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search conversations"
                                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {filteredConversations.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-500">
                                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                                No active triage chats yet.
                            </div>
                        ) : filteredConversations.map(conversation => {
                            const active = conversation.conversation_id === activeConversationId;
                            return (
                                <button
                                    key={conversation.conversation_id}
                                    type="button"
                                    onClick={() => selectConversation(conversation)}
                                    className={`w-full border-b border-gray-100 px-4 py-3 text-left transition ${active ? 'bg-accent' : 'hover:bg-gray-50'}`}
                                >
                                    <div className="flex gap-3">
                                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-primary text-white' : 'bg-gray-100 text-foreground'}`}>
                                            {initials(conversation.patient_name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">{conversation.patient_name}</p>
                                                    <p className="truncate text-xs text-gray-500">{conversation.patient_email || 'Patient'}</p>
                                                </div>
                                                {conversation.unread_count > 0 ? (
                                                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                                                        {conversation.unread_count}
                                                    </span>
                                                ) : (
                                                    <Circle className="mt-1 h-2.5 w-2.5 fill-green-500 text-green-500" />
                                                )}
                                            </div>
                                            <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-600">{conversation.reason || 'No request reason recorded.'}</p>
                                            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-400">
                                                <span className="truncate capitalize">{formatStatus(conversation.care_request_status)}</span>
                                                <span className="flex-shrink-0">{formatShortTime(conversation.last_message_at || conversation.updated_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>
                )}

                <section className={`min-h-0 flex-1 flex-col w-full bg-gray-50/60 xl:flex ${activeMobilePane === 'chat' ? 'flex' : 'hidden'}`}>
                    {selectedConversation ? (
                        <>
                            <div className="flex-none border-b border-gray-100 bg-white px-3 py-2 md:p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {role !== 'patient' && (
                                            <button 
                                                onClick={() => setActiveMobilePane('list')} 
                                                className="xl:hidden -ml-1 p-1 text-gray-500 hover:text-foreground hover:bg-gray-100 rounded-full"
                                                title="Back to Patient Chats"
                                            >
                                                <ChevronLeft className="h-6 w-6" />
                                            </button>
                                        )}
                                        <div className="flex h-8 w-8 md:h-11 md:w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs md:text-sm font-bold text-white">
                                            {initials(selectedConversation.patient_name)}
                                        </div>
                                        <div className="min-w-0 flex flex-col">
                                            <h3 className="truncate text-[15px] md:text-lg font-bold text-foreground leading-tight">{selectedConversation.patient_name}</h3>
                                            <span className="text-[10px] text-gray-500 md:hidden leading-tight">Online</span>
                                            <div className="hidden md:flex flex-wrap items-center gap-2 mt-1">
                                                {selectedConversation.urgency && (
                                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyClasses[selectedConversation.urgency]}`}>
                                                        {selectedConversation.urgency}
                                                    </span>
                                                )}
                                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">
                                                    {formatStatus(selectedConversation.care_request_status)}
                                                </span>
                                            </div>
                                            <p className="hidden md:block mt-1 line-clamp-2 max-w-3xl text-sm text-gray-600">{selectedConversation.reason || 'No request reason recorded.'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="hidden md:flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                            <Lock className="h-4 w-4 text-primary" />
                                            {selectedConversation.doctor_id ? 'Care team thread' : role === 'patient' ? 'Your care thread' : 'Triage thread'}
                                        </div>
                                        <button 
                                            onClick={() => setActiveMobilePane('details')}
                                            className="xl:hidden p-1.5 text-gray-500 hover:text-foreground hover:bg-gray-100 rounded-full border border-gray-200"
                                            title="View Details"
                                        >
                                            <ClipboardList className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                <div className="mx-auto max-w-4xl space-y-4">
                                    {messages.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                                            Start the triage conversation here. Messages are saved for the Doctor handoff.
                                        </div>
                                    ) : messages.map(message => {
                                        const mine = isOwnMessage(message, role);
                                        if (message.message_type === 'system') {
                                            const hasVideoLink = message.body.includes('[Click here to join](#video-session)');
                                            const bodyText = message.body.replace('[Click here to join](#video-session)', '');
                                            
                                            return (
                                                <div key={message.message_id} className="flex flex-col items-center gap-2">
                                                    <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm text-center">
                                                        {bodyText}
                                                    </span>
                                                    {hasVideoLink && (
                                                        <button
                                                            onClick={() => {
                                                                const activeSession = upcomingSessions.find(s => s.status === 'active');
                                                                if (activeSession) {
                                                                    router.push(`/dashboard/video-session/${activeSession.video_session_id}`);
                                                                } else {
                                                                    // Fallback if the active session hasn't loaded yet
                                                                    router.push('/dashboard/patient/video-session'); // Adjust to generic route if needed
                                                                }
                                                            }}
                                                            className="flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-bold text-white shadow-md transition-transform active:scale-95 hover:bg-[var(--primary-dark)]"
                                                        >
                                                            <Video className="h-4 w-4" />
                                                            Join Video Session
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={message.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'} ${messageTone(message, role)}`}>
                                                    <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${mine ? 'text-white/75' : 'text-gray-500'}`}>
                                                        {senderLabel(message.sender_role, role)}
                                                    </p>
                                                    <p className="whitespace-pre-wrap text-sm leading-snug">{message.body}</p>
                                                    <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/75' : 'text-gray-400'}`}>
                                                        {message.delivery_status === 'sending' ? 'Sending...' : message.delivery_status === 'failed' ? 'Failed' : formatTime(message.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {hasTyping && (
                                        <div className="text-xs font-medium text-gray-500">The other person is typing...</div>
                                    )}

                                    {/* Inline video session join card — visible to patient and doctor */}
                                    {upcomingSessions.length > 0 && (role === 'patient' || role === 'doctor') && upcomingSessions.map(vs => (
                                        <div
                                            key={vs.video_session_id}
                                            className="mx-auto w-full max-w-sm"
                                        >
                                            <div className={`rounded-2xl border-2 p-4 shadow-md ${
                                                vs.status === 'active'
                                                    ? 'border-green-400 bg-green-50'
                                                    : 'border-[var(--primary)] bg-[var(--accent)]'
                                            }`}>
                                                <div className="flex items-start gap-3">
                                                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                                                        vs.status === 'active' ? 'bg-green-500' : 'bg-[var(--primary)]'
                                                    }`}>
                                                        <Video className="h-5 w-5 text-white" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-xs font-bold uppercase tracking-wide ${
                                                            vs.status === 'active' ? 'text-green-700' : 'text-[var(--primary-dark)]'
                                                        }`}>
                                                            {vs.status === 'active' ? '🔴 Session is Live Now' : '📅 Video Session Scheduled'}
                                                        </p>
                                                        <p className="mt-0.5 text-sm font-semibold text-gray-800">
                                                            {formatInlineSessionTime(vs.scheduled_start_at)}
                                                        </p>
                                                        <p className="text-xs text-gray-600">
                                                            {vs.max_duration_minutes} min
                                                            {vs.doctor_name ? ` · with ${vs.doctor_name}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => router.push(`/dashboard/video-session/${vs.video_session_id}`)}
                                                    className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-all active:scale-95 hover:opacity-90 ${
                                                        vs.status === 'active'
                                                            ? 'bg-green-500 hover:bg-green-600'
                                                            : 'bg-[var(--primary)] hover:bg-[var(--primary-dark)]'
                                                    }`}
                                                >
                                                    <Video className="h-4 w-4" />
                                                    {vs.status === 'active' ? 'Join Now' : 'Join Session'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <div ref={messageEndRef} />
                                </div>
                            </div>

                            <form onSubmit={sendMessage} className="flex-none border-t border-gray-100 bg-white px-4 py-3">
                                {selectedConversation.status !== 'open' && (
                                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        This triage chat is closed and preserved for care handoff.
                                    </div>
                                )}
                                <div className="mx-auto flex max-w-4xl items-end gap-3">
                                    <textarea
                                        value={messageBody}
                                        onChange={event => handleTyping(event.target.value)}
                                        disabled={!canSend}
                                        rows={1}
                                        placeholder={canSend ? 'Type a triage message...' : 'This chat is closed.'}
                                        className="min-h-[44px] flex-1 resize-none rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm outline-none focus:border-transparent focus:bg-white focus:ring-1 focus:ring-primary disabled:bg-gray-100"
                                    />
                                    <button type="submit" disabled={!messageBody.trim() || !canSend} className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-90 ${(!messageBody.trim() || !canSend) ? 'bg-gray-300' : 'bg-primary hover:bg-primary-dark'}`}>
                                        {isSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send className="h-4 w-4 translate-x-px translate-y-px" />}
                                    </button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-8 text-center text-gray-500">
                            <div>
                                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                                <p>Select an active triage conversation.</p>
                            </div>
                        </div>
                    )}
                </section>

                <aside className={`min-h-0 border-gray-100 bg-white xl:border-l xl:border-t-0 xl:block ${activeMobilePane === 'details' ? 'block' : 'hidden'} ${isHandoffExpanded ? 'overflow-y-auto p-5' : 'overflow-hidden p-2'}`}>
                    <div className="xl:hidden mb-4">
                        <button 
                            onClick={() => setActiveMobilePane('chat')}
                            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-foreground"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Back to Chat
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsHandoffExpanded(value => !value)}
                        className={`mb-3 flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent ${!isHandoffExpanded ? 'h-full flex-col justify-center gap-3 px-2 py-4 [writing-mode:vertical-rl]' : ''}`}
                        title={isHandoffExpanded ? 'Collapse handoff' : 'Expand handoff'}
                    >
                        <span>Care Handoff</span>
                        {isHandoffExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </button>
                    {isHandoffExpanded && (
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Care Handoff</p>
                            <h3 className="mt-1 text-lg font-bold text-foreground">Doctor Notes</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                {canWriteNotes
                                    ? 'Write concise clinical context for the Doctor before assignment.'
                                    : 'These notes are prepared by the care team for Doctor handoff.'}
                            </p>
                        </div>

                        {selectedConversation ? (
                            <>
                                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                                    <div className="flex items-center gap-2 font-semibold text-foreground">
                                        <ClipboardList className="h-4 w-4 text-primary" />
                                        Request Summary
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap text-gray-700">{selectedConversation.reason || '-'}</p>
                                    <div className="mt-4 grid gap-2 text-xs text-gray-600">
                                        <p>Status: <span className="font-semibold capitalize">{formatStatus(selectedConversation.care_request_status)}</span></p>
                                        <p>Doctor: <span className="font-semibold">{selectedConversation.doctor_name || 'Not assigned yet'}</span></p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {handoffFields.map(field => (
                                        <div key={field.key}>
                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                {field.label}
                                            </label>
                                            <textarea
                                                value={handoffDraft[field.key]}
                                                onChange={event => setHandoffDraft(current => ({ ...current, [field.key]: event.target.value }))}
                                                disabled={!canWriteNotes}
                                                rows={field.rows || 2}
                                                placeholder={field.placeholder}
                                                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                                            />
                                        </div>
                                    ))}
                                    {canWriteNotes && (
                                        <Button className="mt-3" fullWidth onClick={saveNotes} isLoading={isSavingNotes} leftIcon={<Save className="h-4 w-4" />}>
                                            Save Handoff
                                        </Button>
                                    )}
                                </div>

                                {role === 'assistant' && (
                                    <div className="rounded-lg border border-gray-100 bg-white p-4">
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Doctor Assignment</p>
                                            <p className="mt-1 text-sm text-gray-600">Save the handoff and onboard the selected Doctor into this care thread.</p>
                                        </div>

                                        {selectedConversation.doctor_id && (
                                            <div className="mb-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-800">
                                                Assigned to {selectedConversation.doctor_name || 'Doctor'}{selectedConversation.doctor_specialty ? ` - ${selectedConversation.doctor_specialty}` : ''}.
                                            </div>
                                        )}

                                        <div className="relative mb-3">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                            <input
                                                value={doctorSearch}
                                                onChange={event => setDoctorSearch(event.target.value)}
                                                placeholder="Search Doctors"
                                                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                            />
                                        </div>

                                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                            {filteredDoctors.length === 0 ? (
                                                <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">No assignable Doctors found.</p>
                                            ) : filteredDoctors.map(doctor => {
                                                const selected = selectedDoctorId === doctor.doctor_id;
                                                return (
                                                    <button
                                                        key={doctor.doctor_id}
                                                        type="button"
                                                        disabled={!doctor.is_available_for_assignment}
                                                        onClick={() => setSelectedDoctorId(doctor.doctor_id)}
                                                        className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                                                            selected
                                                                ? 'border-primary bg-accent'
                                                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold text-foreground">{doctor.name}</p>
                                                                <p className="truncate text-xs text-gray-500">{doctor.email}</p>
                                                            </div>
                                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${doctor.is_available_for_assignment ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                {doctor.is_available_for_assignment ? 'Available' : 'Blocked'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 text-xs text-gray-600">
                                                            <p>{doctor.specialty || 'General'} - {doctor.active_patient_count}/{doctor.max_patients} active</p>
                                                            <p>{doctor.available_slots_next_14_days} open slots in 14 days</p>
                                                        </div>
                                                        {doctor.disabled_reason && <p className="mt-2 text-xs text-red-600">{doctor.disabled_reason}</p>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <Button
                                            className="mt-3"
                                            fullWidth
                                            onClick={assignDoctorFromChat}
                                            isLoading={isAssigningDoctor}
                                            disabled={
                                                !selectedDoctorId ||
                                                selectedConversation.doctor_id === selectedDoctorId ||
                                                Boolean(filteredDoctors.find(doctor => doctor.doctor_id === selectedDoctorId && !doctor.is_available_for_assignment))
                                            }
                                            leftIcon={<Stethoscope className="h-4 w-4" />}
                                        >
                                            {selectedConversation.doctor_id === selectedDoctorId ? 'Doctor Already Assigned' : 'Save Handoff + Assign Doctor'}
                                        </Button>
                                    </div>
                                )}

                                {role !== 'assistant' && (
                                    <VideoSessionPanel careRequestId={selectedConversation.care_request_id} role={role} />
                                )}

                                {role === 'doctor' && selectedConversation.status === 'open' && (
                                    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resolve Case</p>
                                            <p className="mt-1 text-sm text-gray-600">Mark the patient&apos;s care request as complete or refer them out.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Outcome</label>
                                                <select
                                                    value={resolutionOutcome}
                                                    onChange={e => setResolutionOutcome(e.target.value)}
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                                >
                                                    <option value="completed">Completed</option>
                                                    <option value="follow_up_needed">Follow Up Needed</option>
                                                    <option value="referred_out">Referred Out</option>
                                                    <option value="not_appropriate_for_platform">Not Appropriate for Platform</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Doctor Notes (Optional)</label>
                                                <textarea
                                                    value={resolutionNotes}
                                                    onChange={e => setResolutionNotes(e.target.value)}
                                                    rows={3}
                                                    placeholder="Add final clinical notes or referral instructions..."
                                                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                                />
                                            </div>
                                            <Button
                                                fullWidth
                                                onClick={resolveCase}
                                                isLoading={isResolving}
                                                leftIcon={<Check className="h-4 w-4" />}
                                            >
                                                Resolve Case
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-lg border border-green-100 bg-green-50 p-4 text-sm text-green-800">
                                    <div className="flex items-start gap-2">
                                        <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                        <p>When a Doctor is assigned, this thread stays open and the Doctor can review chat history plus the structured handoff.</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                                <Stethoscope className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                                Select a conversation to view handoff details.
                            </div>
                        )}
                    </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

function formatInlineSessionTime(value?: string) {
    if (!value) return 'Time TBD';
    const date = new Date(value);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    const formatted = date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });

    if (diffMins <= 0) return `${formatted} (now)`;
    if (diffMins < 60) return `${formatted} (in ${diffMins}m)`;
    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${formatted} (in ${diffHours}h)`;
    return formatted;
}
