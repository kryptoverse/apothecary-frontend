'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Calendar,
    ClipboardList,
    FileText,
    Loader2,
    Mail,
    MessageSquare,
    RefreshCcw,
    ShieldCheck,
    Stethoscope,
    UserRound
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Avatar, Button } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { getSession, hasRole } from '@/lib/auth';

type CareRequestStatus =
    | 'new_request'
    | 'triage_claimed'
    | 'triage_in_progress'
    | 'pending_assignment'
    | 'assigned'
    | 'in_treatment'
    | 'follow_up_needed'
    | 'patient_requested_closure'
    | 'completed'
    | 'closed_by_patient'
    | 'cancelled'
    | 'referred_out'
    | 'not_appropriate_for_platform';

type CaseConversation = {
    conversation_id: string;
    status: 'open' | 'closed' | 'archived';
    assistant_email?: string | null;
    doctor_email?: string | null;
    doctor_handoff_notes?: string;
    doctor_handoff?: Record<string, string>;
    last_message_at?: string;
    created_at: string;
};

type PatientCase = {
    care_request_id: string;
    patient_id: string;
    doctor_id?: string | null;
    doctor_name?: string | null;
    doctor_email?: string | null;
    doctor_specialty?: string | null;
    doctor_credential_status?: string | null;
    assistant?: {
        assistant_id?: string | null;
        user_id?: string | null;
        email?: string | null;
        status?: string | null;
        claimed_at?: string;
        claim_expires_at?: string;
    } | null;
    assigned_by_email?: string | null;
    closed_by_email?: string | null;
    conversation?: CaseConversation | null;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    preferred_specialty?: string;
    preferred_doctor_gender?: string;
    availability?: string;
    patient_notes?: string;
    triage_notes?: string;
    doctor_notes?: string;
    status: CareRequestStatus;
    source?: string;
    assigned_at?: string;
    requested_closure_at?: string;
    closed_at?: string;
    outcome?: string;
    created_at: string;
    updated_at: string;
};

type PatientCaseDetails = {
    patient: {
        patient_id: string;
        user_id?: string;
        name: string;
        email?: string;
        account_status?: string;
        tier?: string;
        email_verified?: boolean;
        care_status: string;
        illness_description?: string;
        care_status_updated_at?: string;
        onboarding_source?: string;
        date_of_birth?: string;
        phone_number?: string;
        timezone?: string;
        activity_score?: number;
        current_streak?: number;
        last_active?: string;
        doctor?: {
            doctor_id: string;
            name?: string;
            email?: string;
            status?: string;
            specialty?: string;
            credential_status?: string;
            max_patients?: number;
            assigned_at?: string;
            assigned_by_email?: string;
            assignment_source?: string;
        } | null;
        created_at: string;
        updated_at: string;
    };
    summary: {
        total_cases: number;
        open_cases: number;
        closed_cases: number;
        latest_case_id?: string | null;
    };
    cases: PatientCase[];
};

type DetailsResponse = PatientCaseDetails;

type Message = {
    message_id: string;
    sender_role: 'patient' | 'assistant' | 'doctor' | 'admin' | 'system';
    body: string;
    created_at: string;
};

type MessagesResponse = {
    messages: Message[];
};

const requestStyles: Record<string, string> = {
    new_request: 'bg-amber-100 text-amber-800 border-amber-200',
    triage_claimed: 'bg-sky-100 text-sky-800 border-sky-200',
    triage_in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    pending_assignment: 'bg-purple-100 text-purple-800 border-purple-200',
    assigned: 'bg-green-100 text-green-700 border-green-200',
    in_treatment: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    follow_up_needed: 'bg-blue-100 text-blue-800 border-blue-200',
    patient_requested_closure: 'bg-orange-100 text-orange-800 border-orange-200',
    completed: 'bg-gray-100 text-gray-700 border-gray-200',
    closed_by_patient: 'bg-gray-100 text-gray-700 border-gray-200',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
    referred_out: 'bg-gray-100 text-gray-700 border-gray-200',
    not_appropriate_for_platform: 'bg-gray-100 text-gray-700 border-gray-200'
};

const urgencyStyles: Record<string, string> = {
    low: 'bg-blue-50 text-blue-700 border-blue-200',
    normal: 'bg-green-50 text-green-700 border-green-200',
    high: 'bg-red-50 text-red-700 border-red-200'
};

function label(value?: string) {
    return (value || '-').replace(/_/g, ' ');
}

function formatDateTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminPatientCaseDetailPage() {
    const router = useRouter();
    const params = useParams<{ patientId: string }>();
    const patientId = Array.isArray(params.patientId) ? params.patientId[0] : params.patientId;
    const [details, setDetails] = useState<PatientCaseDetails | null>(null);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [messages, setMessages] = useState<Message[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadDetails = useCallback(async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await apiRequest<DetailsResponse>(`/admin/patients/${patientId}/case-details`, { token: session.access_token });
            const nextDetails = response.data || null;
            setDetails(nextDetails);
            setSelectedCaseId(current => current || nextDetails?.summary.latest_case_id || nextDetails?.cases[0]?.care_request_id || '');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load patient case details.');
        } finally {
            setIsLoading(false);
        }
    }, [patientId, router]);

    useEffect(() => {
        if (!hasRole('admin')) {
            router.push('/auth/login');
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadDetails();
    }, [loadDetails, router]);

    const selectedCase = useMemo(() => {
        return details?.cases.find(careCase => careCase.care_request_id === selectedCaseId) || details?.cases[0] || null;
    }, [details, selectedCaseId]);

    const loadChat = async () => {
        const session = getSession();
        const conversationId = selectedCase?.conversation?.conversation_id;
        if (!session || !conversationId) return;

        setIsChatLoading(true);
        setError(null);

        try {
            const response = await apiRequest<MessagesResponse>(`/triage-chat/conversations/${conversationId}/messages?limit=120`, {
                token: session.access_token
            });
            setMessages(response.data?.messages || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load chat history.');
        } finally {
            setIsChatLoading(false);
        }
    };

    return (
        <DashboardLayout role="admin">
            <div className="min-w-0 space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard/admin/patients')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                            Back
                        </Button>
                        <div className="min-w-0">
                            <h2 className="text-2xl font-bold text-[#4a3428]">Patient Case Detail</h2>
                            <p className="text-gray-600">Full patient record, case history, care team, handoff notes, and on-demand chat audit.</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadDetails} leftIcon={<RefreshCcw className="h-4 w-4" />}>
                        Refresh
                    </Button>
                </div>

                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {isLoading && <div className="rounded-lg border border-gray-100 bg-white p-8 text-center text-gray-500">Loading patient details...</div>}

                {!isLoading && details && (
                    <>
                        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                            <section className="min-w-0 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                                <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="flex min-w-0 items-start gap-4">
                                        <Avatar name={details.patient.name} />
                                        <div className="min-w-0">
                                            <h3 className="truncate text-xl font-bold text-[#4a3428]">{details.patient.name}</h3>
                                            <p className="truncate text-sm text-gray-600">{details.patient.email}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Badge>{label(details.patient.care_status)}</Badge>
                                                <Badge tone="blue">{details.patient.account_status || 'account'}</Badge>
                                                {details.patient.email_verified && <Badge tone="green">Email verified</Badge>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 text-center">
                                        <Metric label="Cases" value={details.summary.total_cases} />
                                        <Metric label="Open" value={details.summary.open_cases} />
                                        <Metric label="Closed" value={details.summary.closed_cases} />
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 md:grid-cols-3">
                                    <InfoCard icon={<Mail className="h-4 w-4" />} label="Phone" value={details.patient.phone_number || 'Not provided'} />
                                    <InfoCard icon={<Calendar className="h-4 w-4" />} label="Joined" value={formatDateTime(details.patient.created_at)} />
                                    <InfoCard icon={<UserRound className="h-4 w-4" />} label="Timezone" value={details.patient.timezone || 'Not provided'} />
                                </div>

                                {details.patient.illness_description && (
                                    <InfoPanel title="Current Patient Concern" value={details.patient.illness_description} />
                                )}
                            </section>

                            <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                                <h3 className="font-bold text-[#4a3428]">Current Doctor</h3>
                                {details.patient.doctor ? (
                                    <div className="mt-4 space-y-3">
                                        <p className="font-semibold text-gray-800">{details.patient.doctor.name}</p>
                                        <p className="text-sm text-gray-600">{details.patient.doctor.email}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge tone="green">{details.patient.doctor.credential_status || 'credential'}</Badge>
                                            <Badge>{details.patient.doctor.specialty || 'General'}</Badge>
                                        </div>
                                        <p className="text-xs text-gray-500">Assigned {formatDateTime(details.patient.doctor.assigned_at)} by {details.patient.doctor.assigned_by_email || details.patient.doctor.assignment_source || 'system'}</p>
                                    </div>
                                ) : (
                                    <p className="mt-3 text-sm text-gray-500">No active Doctor assigned.</p>
                                )}
                            </section>
                        </div>

                        <div className="grid min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                            <aside className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                                <div className="mb-3">
                                    <h3 className="font-bold text-[#4a3428]">Case History</h3>
                                    <p className="text-sm text-gray-500">Latest case is selected by default.</p>
                                </div>
                                <div className="space-y-2">
                                    {details.cases.map((careCase, index) => (
                                        <button
                                            key={careCase.care_request_id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCaseId(careCase.care_request_id);
                                                setMessages(null);
                                            }}
                                            className={`w-full rounded-lg border p-3 text-left transition ${careCase.care_request_id === selectedCase?.care_request_id ? 'border-[#E67E3C] bg-orange-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-[#4a3428]">Case {details.cases.length - index}</span>
                                                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${requestStyles[careCase.status]}`}>{label(careCase.status)}</span>
                                            </div>
                                            <p className="mt-2 line-clamp-2 text-sm text-gray-600">{careCase.reason}</p>
                                            <p className="mt-2 text-xs text-gray-400">{formatDateTime(careCase.created_at)}</p>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            {selectedCase && (
                                <main className="min-w-0 space-y-4">
                                    <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <ClipboardList className="h-4 w-4 text-[#E67E3C]" />
                                                    <h3 className="font-bold text-[#4a3428]">Selected Case</h3>
                                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${requestStyles[selectedCase.status]}`}>{label(selectedCase.status)}</span>
                                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[selectedCase.urgency]}`}>{selectedCase.urgency}</span>
                                                </div>
                                                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{selectedCase.reason}</p>
                                            </div>
                                            <div className="text-sm text-gray-500 md:text-right">
                                                <p>Created {formatDateTime(selectedCase.created_at)}</p>
                                                <p>Updated {formatDateTime(selectedCase.updated_at)}</p>
                                            </div>
                                        </div>
                                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                                            <InfoCard icon={<FileText className="h-4 w-4" />} label="Preferred Specialty" value={selectedCase.preferred_specialty || 'Any'} />
                                            <InfoCard icon={<UserRound className="h-4 w-4" />} label="Doctor Gender" value={selectedCase.preferred_doctor_gender || 'Any'} />
                                            <InfoCard icon={<Calendar className="h-4 w-4" />} label="Availability" value={selectedCase.availability || 'Not specified'} />
                                        </div>
                                    </section>

                                    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                                        <TeamCard
                                            title="Assistant"
                                            icon={<ShieldCheck className="h-5 w-5" />}
                                            name={selectedCase.assistant?.email || 'No assistant claimed'}
                                            rows={[
                                                ['Status', selectedCase.assistant?.status || '-'],
                                                ['Claimed', formatDateTime(selectedCase.assistant?.claimed_at)],
                                                ['Claim expires', formatDateTime(selectedCase.assistant?.claim_expires_at)]
                                            ]}
                                        />
                                        <TeamCard
                                            title="Doctor"
                                            icon={<Stethoscope className="h-5 w-5" />}
                                            name={selectedCase.doctor_name || selectedCase.doctor_email || 'No Doctor assigned'}
                                            rows={[
                                                ['Email', selectedCase.doctor_email || '-'],
                                                ['Specialty', selectedCase.doctor_specialty || '-'],
                                                ['Credential', selectedCase.doctor_credential_status || '-'],
                                                ['Assigned', formatDateTime(selectedCase.assigned_at)]
                                            ]}
                                        />
                                    </div>

                                    <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                                        <h3 className="font-bold text-[#4a3428]">Clinical Notes and Handoff</h3>
                                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                            <InfoPanel title="Patient Notes" value={selectedCase.patient_notes || '-'} />
                                            <InfoPanel title="Triage Notes" value={selectedCase.triage_notes || '-'} />
                                            <InfoPanel title="Doctor Notes" value={selectedCase.doctor_notes || '-'} />
                                            <InfoPanel title="Doctor Handoff" value={formatHandoff(selectedCase.conversation)} />
                                        </div>
                                    </section>

                                    <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <h3 className="font-bold text-[#4a3428]">Care Thread Chat</h3>
                                                <p className="text-sm text-gray-500">Messages are loaded only when needed for audit/review.</p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={loadChat}
                                                disabled={!selectedCase.conversation || isChatLoading}
                                                leftIcon={isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                                            >
                                                {messages ? 'Reload chat' : 'Load chat'}
                                            </Button>
                                        </div>
                                        {!selectedCase.conversation && <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No care thread exists for this case yet.</p>}
                                        {messages && (
                                            <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
                                                {messages.length === 0 && <p className="text-center text-sm text-gray-500">No messages found.</p>}
                                                {messages.map(message => (
                                                    <div key={message.message_id} className="rounded-lg border border-gray-100 bg-white p-3">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="text-xs font-bold uppercase tracking-wide text-[#E67E3C]">{message.sender_role}</span>
                                                            <span className="text-xs text-gray-400">{formatDateTime(message.created_at)}</span>
                                                        </div>
                                                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{message.body}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </main>
                            )}
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}

function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' }) {
    const toneClass = tone === 'green'
        ? 'border-green-200 bg-green-50 text-green-700'
        : tone === 'blue'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-gray-50 text-gray-700';
    return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${toneClass}`}>{children}</span>;
}

function Metric({ label: metricLabel, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-2xl font-bold text-[#4a3428]">{value}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{metricLabel}</p>
        </div>
    );
}

function InfoCard({ icon, label: cardLabel, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {icon}
                <span>{cardLabel}</span>
            </div>
            <p className="mt-2 break-words text-sm font-medium text-gray-700">{value}</p>
        </div>
    );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
    return (
        <div className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{value}</p>
        </div>
    );
}

function TeamCard({ title, icon, name, rows }: { title: string; icon: ReactNode; name: string; rows: Array<[string, string]> }) {
    return (
        <section className="min-w-0 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-[#4a3428]">
                {icon}
                <h3 className="font-bold">{title}</h3>
            </div>
            <p className="mt-3 break-words font-semibold text-gray-800">{name}</p>
            <div className="mt-4 space-y-2">
                {rows.map(([rowLabel, value]) => (
                    <div key={rowLabel} className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-500">{rowLabel}</span>
                        <span className="break-words text-right font-medium text-gray-700">{value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function formatHandoff(conversation?: CaseConversation | null) {
    if (!conversation) return '-';
    const fields = conversation.doctor_handoff || {};
    const structured = Object.entries(fields)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${label(key)}: ${value}`)
        .join('\n');
    return [structured, conversation.doctor_handoff_notes].filter(Boolean).join('\n\n') || '-';
}
