'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
    AlertCircle,
    Check,
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
    Wifi,
    WifiOff
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { createTriageChatSocket, type TriageChatSocket } from '@/lib/triageChatSocket';
import { Button } from '@/components/ui';

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
    const [conversations, setConversations] = useState<TriageConversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<TriageConversation | null>(null);
    const [messages, setMessages] = useState<TriageMessage[]>([]);
    const [messageBody, setMessageBody] = useState('');
    const [handoffDraft, setHandoffDraft] = useState<StructuredHandoff>(emptyHandoff);
    const [doctors, setDoctors] = useState<AssignableDoctor[]>([]);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isAssigningDoctor, setIsAssigningDoctor] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
    const socketRef = useRef<TriageChatSocket | null>(null);
    const selectedIdRef = useRef<string | null>(null);
    const messageEndRef = useRef<HTMLDivElement | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const canWriteNotes = role === 'assistant' || role === 'admin';
    const activeConversationId = selectedConversation?.conversation_id || null;

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

    const selectConversation = useCallback(async (conversation: TriageConversation) => {
        const previousId = selectedIdRef.current;
        if (previousId && previousId !== conversation.conversation_id) {
            socketRef.current?.emit('conversation.leave', { conversation_id: previousId });
        }

        selectedIdRef.current = conversation.conversation_id;
        setSelectedConversation(conversation);
        setHandoffDraft(normalizeHandoff(conversation.doctor_handoff, conversation));
        setSelectedDoctorId(conversation.doctor_id || '');
        setError('');

        socketRef.current?.emit('conversation.join', { conversation_id: conversation.conversation_id });
        await loadMessages(conversation.conversation_id);
    }, [loadMessages]);

    const loadConversations = useCallback(async (silent = false) => {
        const session = getSession();
        if (!session) return;

        if (!silent) setIsLoading(true);
        setError('');

        try {
            const response = await apiRequest<ConversationsResponse>('/triage-chat/conversations?status=open&limit=60', {
                token: session.access_token
            });
            const next = response.data?.conversations || [];
            setConversations(next);

            if (!selectedIdRef.current && next.length > 0) {
                await selectConversation(next[0]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load triage conversations.');
        } finally {
            setIsLoading(false);
        }
    }, [selectConversation]);

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
        <div className="flex h-[calc(100vh-7rem)] min-h-[620px] flex-col overflow-hidden">
            <div className="mb-3 flex flex-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-bold text-[#4a3428]">Triage Messaging</h2>
                    <p className="text-sm text-gray-600">
                        {role === 'patient'
                            ? 'Message the clinical assistant reviewing your active care request.'
                            : 'Chat with claimed triage patients and prepare notes for Doctor handoff.'}
                    </p>
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

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm xl:grid-cols-[330px_minmax(0,1fr)_320px] 2xl:grid-cols-[360px_minmax(0,1fr)_340px]">
                <aside className="flex min-h-0 flex-col border-b border-gray-100 bg-white xl:border-b-0 xl:border-r">
                    <div className="flex-none border-b border-gray-100 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {role === 'patient' ? 'Care Threads' : 'Patient Chats'}
                                </p>
                                <p className="text-sm text-gray-500">{filteredConversations.length} active</p>
                            </div>
                            <MessageSquare className="h-5 w-5 text-[#E67E3C]" />
                        </div>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="Search conversations"
                                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            />
                        </div>
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
                                    className={`w-full border-b border-gray-100 p-4 text-left transition ${active ? 'bg-[#fff4ec]' : 'hover:bg-gray-50'}`}
                                >
                                    <div className="flex gap-3">
                                        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${active ? 'bg-[#E67E3C] text-white' : 'bg-gray-100 text-[#4a3428]'}`}>
                                            {initials(conversation.patient_name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-[#4a3428]">{conversation.patient_name}</p>
                                                    <p className="truncate text-xs text-gray-500">{conversation.patient_email || 'Patient'}</p>
                                                </div>
                                                {conversation.unread_count > 0 ? (
                                                    <span className="rounded-full bg-[#E67E3C] px-2 py-0.5 text-xs font-bold text-white">
                                                        {conversation.unread_count}
                                                    </span>
                                                ) : (
                                                    <Circle className="mt-1 h-2.5 w-2.5 fill-green-500 text-green-500" />
                                                )}
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-600">{conversation.reason || 'No request reason recorded.'}</p>
                                            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-400">
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

                <section className="flex min-h-0 flex-col bg-gray-50/60">
                    {selectedConversation ? (
                        <>
                            <div className="flex-none border-b border-gray-100 bg-white p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#E67E3C] text-sm font-bold text-white">
                                            {initials(selectedConversation.patient_name)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="truncate text-lg font-bold text-[#4a3428]">{selectedConversation.patient_name}</h3>
                                            {selectedConversation.urgency && (
                                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyClasses[selectedConversation.urgency]}`}>
                                                    {selectedConversation.urgency}
                                                </span>
                                            )}
                                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">
                                                {formatStatus(selectedConversation.care_request_status)}
                                            </span>
                                            </div>
                                            <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-gray-600">{selectedConversation.reason || 'No request reason recorded.'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                        <Lock className="h-4 w-4 text-[#E67E3C]" />
                                        Triage thread
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
                                            return (
                                                <div key={message.message_id} className="flex justify-center">
                                                    <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">
                                                        {message.body}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={message.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[72%] rounded-lg px-4 py-3 shadow-sm ${mine ? 'rounded-br-sm bg-[#E67E3C] text-white' : 'rounded-bl-sm border border-gray-100 bg-white text-[#4a3428]'}`}>
                                                    <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                                                    <p className={`mt-2 text-right text-[11px] ${mine ? 'text-white/75' : 'text-gray-400'}`}>
                                                        {message.delivery_status === 'sending' ? 'Sending...' : message.delivery_status === 'failed' ? 'Failed' : formatTime(message.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {hasTyping && (
                                        <div className="text-xs font-medium text-gray-500">The other person is typing...</div>
                                    )}
                                    <div ref={messageEndRef} />
                                </div>
                            </div>

                            <form onSubmit={sendMessage} className="flex-none border-t border-gray-100 bg-white p-4">
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
                                        rows={2}
                                        placeholder={canSend ? 'Type a triage message...' : 'This chat is closed.'}
                                        className="min-h-[48px] flex-1 resize-none rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
                                    />
                                    <Button type="submit" disabled={!messageBody.trim() || !canSend} isLoading={isSending} leftIcon={<Send className="h-4 w-4" />}>
                                        Send
                                    </Button>
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

                <aside className="min-h-0 overflow-y-auto border-t border-gray-100 bg-white p-5 xl:border-l xl:border-t-0">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Care Handoff</p>
                            <h3 className="mt-1 text-lg font-bold text-[#4a3428]">Doctor Notes</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                {canWriteNotes
                                    ? 'Write concise clinical context for the Doctor before assignment.'
                                    : 'These notes are prepared by the care team for Doctor handoff.'}
                            </p>
                        </div>

                        {selectedConversation ? (
                            <>
                                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                                    <div className="flex items-center gap-2 font-semibold text-[#4a3428]">
                                        <ClipboardList className="h-4 w-4 text-[#E67E3C]" />
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
                                                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
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
                                                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
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
                                                                ? 'border-[#E67E3C] bg-[#fff4ec]'
                                                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold text-[#4a3428]">{doctor.name}</p>
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
                                            disabled={!selectedDoctorId || Boolean(filteredDoctors.find(doctor => doctor.doctor_id === selectedDoctorId && !doctor.is_available_for_assignment))}
                                            leftIcon={<Stethoscope className="h-4 w-4" />}
                                        >
                                            Save Handoff + Assign Doctor
                                        </Button>
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
                </aside>
            </div>
        </div>
    );
}
