'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { getSession, hasRole } from '@/lib/auth';
import { apiRequest } from '@/lib/api';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import {
    AlertCircle,
    CheckCircle2,
    ClipboardList,
    Clock,
    HeartHandshake,
    MessageSquare,
    ShieldAlert,
    Stethoscope,
    UserCheck
} from 'lucide-react';

type CareStatus = 'needs_care' | 'assigned' | 'in_treatment' | 'treated' | 'inactive';

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

type CareRequest = {
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    patient_email?: string;
    doctor_id: string | null;
    doctor_name?: string | null;
    doctor_email?: string | null;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    preferred_specialty?: string;
    preferred_doctor_gender?: 'male' | 'female' | 'any';
    availability?: string;
    patient_notes?: string;
    triage_notes?: string;
    status: CareRequestStatus;
    created_at: string;
    updated_at: string;
    assigned_at?: string;
    closed_at?: string;
    outcome?: string;
};

type CareRequestsResponse = {
    care_requests: CareRequest[];
};

type PatientProfileResponse = {
    patient: {
        care_status: CareStatus;
        care_status_updated_at?: string;
        illness_description?: string;
    };
    Doctor?: {
        doctor_id: string;
        email?: string;
        specialty?: string;
    } | null;
};

type RequestForm = {
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    preferred_specialty: string;
    preferred_doctor_gender: 'male' | 'female' | 'any';
    availability: string;
    patient_notes: string;
};

const initialForm: RequestForm = {
    reason: '',
    urgency: 'normal',
    preferred_specialty: '',
    preferred_doctor_gender: 'any',
    availability: '',
    patient_notes: ''
};

const urgencyStyles: Record<string, string> = {
    low: 'bg-blue-50 text-blue-700 border-blue-200',
    normal: 'bg-green-50 text-green-700 border-green-200',
    high: 'bg-red-50 text-red-700 border-red-200'
};

const statusStyles: Record<string, string> = {
    new_request: 'bg-amber-100 text-amber-800 border-amber-200',
    triage_claimed: 'bg-sky-100 text-sky-800 border-sky-200',
    triage_in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    pending_assignment: 'bg-purple-100 text-purple-800 border-purple-200',
    assigned: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    in_treatment: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    follow_up_needed: 'bg-blue-100 text-blue-800 border-blue-200',
    patient_requested_closure: 'bg-orange-100 text-orange-800 border-orange-200',
    completed: 'bg-gray-100 text-gray-700 border-gray-200',
    closed_by_patient: 'bg-gray-100 text-gray-700 border-gray-200',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
    referred_out: 'bg-gray-100 text-gray-700 border-gray-200',
    not_appropriate_for_platform: 'bg-gray-100 text-gray-700 border-gray-200'
};

const activeStatuses: CareRequestStatus[] = [
    'new_request',
    'triage_claimed',
    'triage_in_progress',
    'pending_assignment',
    'assigned',
    'in_treatment',
    'follow_up_needed',
    'patient_requested_closure'
];

function formatStatus(status?: string) {
    return (status || '-').replace(/_/g, ' ');
}

function formatDate(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatDateTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function getCurrentStep(status?: CareRequestStatus) {
    if (!status) return 0;
    if (status === 'new_request') return 1;
    if (status === 'triage_claimed' || status === 'triage_in_progress') return 2;
    if (status === 'pending_assignment') return 3;
    if (status === 'assigned' || status === 'in_treatment' || status === 'follow_up_needed') return 4;
    if (['completed', 'closed_by_patient', 'cancelled', 'referred_out', 'not_appropriate_for_platform'].includes(status)) return 5;
    return 1;
}

function getPatientMessage(status?: CareRequestStatus) {
    switch (status) {
        case 'new_request':
            return 'Your request is in the intake queue. A clinical assistant will review it soon.';
        case 'triage_claimed':
            return 'A clinical assistant has picked up your request and is preparing to review your details.';
        case 'triage_in_progress':
            return 'A clinical assistant is reviewing your concern. They may contact you if more details are needed.';
        case 'pending_assignment':
            return 'Your request has enough information for matching. The team is selecting an appropriate Doctor.';
        case 'assigned':
            return 'A Doctor has been assigned. You can continue with booking or treatment steps as they become available.';
        case 'in_treatment':
            return 'You are currently in an active treatment episode.';
        case 'follow_up_needed':
            return 'Your Doctor marked that follow-up care is needed.';
        case 'patient_requested_closure':
            return 'You asked to close this care episode. Your assigned Doctor or care team will review it.';
        case 'completed':
            return 'This care episode was completed.';
        case 'closed_by_patient':
            return 'You closed this care request before assignment.';
        case 'cancelled':
            return 'This care request was cancelled.';
        case 'referred_out':
            return 'The clinical team recommended care outside this platform.';
        case 'not_appropriate_for_platform':
            return 'The clinical team marked this request as not appropriate for this platform.';
        default:
            return 'Your care request status will appear here.';
    }
}

export default function PatientCareRequestsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [requests, setRequests] = useState<CareRequest[]>([]);
    const [profile, setProfile] = useState<PatientProfileResponse | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isClosureOpen, setIsClosureOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<CareRequest | null>(null);
    const [formData, setFormData] = useState<RequestForm>(initialForm);

    const loadData = useCallback(async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setError('');
        try {
            const [profileRes, requestsRes] = await Promise.all([
                apiRequest<PatientProfileResponse>('/patient/profile', { token: session.access_token }),
                apiRequest<CareRequestsResponse>('/patient/care-requests', { token: session.access_token })
            ]);

            setProfile(profileRes.data || null);
            setRequests(requestsRes.data?.care_requests || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load care requests.');
        } finally {
            setIsLoading(false);
        }
    }, [router]);

    useEffect(() => {
        if (!hasRole('patient')) {
            router.push('/auth/login');
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadData();
    }, [router, loadData]);

    const activeRequest = useMemo(() => {
        return requests.find(request => activeStatuses.includes(request.status)) || null;
    }, [requests]);

    const completedCount = useMemo(() => {
        return requests.filter(request => !activeStatuses.includes(request.status)).length;
    }, [requests]);

    const careStatus = profile?.patient.care_status || 'inactive';
    const canCreateRequest = !['needs_care', 'assigned', 'in_treatment'].includes(careStatus) && !activeRequest;
    const canRequestClosure = ['needs_care', 'assigned', 'in_treatment'].includes(careStatus) || Boolean(activeRequest);

    const handleCreateRequest = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setSuccess('');
        setIsSaving(true);

        const session = getSession();
        if (!session) return;

        try {
            await apiRequest('/patient/care-requests', {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    reason: formData.reason,
                    urgency: formData.urgency,
                    preferred_specialty: formData.preferred_specialty.trim() || undefined,
                    preferred_doctor_gender: formData.preferred_doctor_gender,
                    availability: formData.availability.trim() || undefined,
                    patient_notes: formData.patient_notes.trim() || undefined
                })
            });

            setSuccess('Care request submitted. The clinical team will review it.');
            setIsCreateOpen(false);
            setFormData(initialForm);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit care request.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRequestClosure = async () => {
        setError('');
        setSuccess('');
        setIsSaving(true);

        const session = getSession();
        if (!session) return;

        try {
            await apiRequest('/patient/care-requests/request-closure', {
                method: 'POST',
                token: session.access_token
            });

            setSuccess('Your care closure request was submitted.');
            setIsClosureOpen(false);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to request care closure.');
        } finally {
            setIsSaving(false);
        }
    };

    const openTriageChat = (request: CareRequest) => {
        router.push(`/dashboard/patient/chat?careRequestId=${request.care_request_id}`);
    };

    if (isLoading) {
        return (
            <DashboardLayout role="patient">
                <div className="flex min-h-[320px] items-center justify-center">
                    <p className="text-gray-500">Loading care requests...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role="patient">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Care Request Status</h2>
                        <p className="text-gray-600">Track your care request from intake through Doctor assignment.</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                            onClick={() => setIsCreateOpen(true)}
                            leftIcon={<Stethoscope className="h-4 w-4" />}
                            disabled={!canCreateRequest}
                        >
                            New Care Request
                        </Button>
                        {canRequestClosure && (
                            <Button
                                variant="outline"
                                onClick={() => setIsClosureOpen(true)}
                                leftIcon={<HeartHandshake className="h-4 w-4" />}
                            >
                                No Longer Need Care
                            </Button>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                        <span>{success}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <StatusCard
                        title="Care Status"
                        value={formatStatus(careStatus)}
                        detail={profile?.patient.care_status_updated_at ? `Updated ${formatDateTime(profile.patient.care_status_updated_at)}` : 'Your current care state'}
                        icon={<HeartHandshake className="h-5 w-5" />}
                    />
                    <StatusCard
                        title="Active Request"
                        value={activeRequest ? formatStatus(activeRequest.status) : 'None'}
                        detail={activeRequest ? getPatientMessage(activeRequest.status) : 'You do not have an open care request.'}
                        icon={<Clock className="h-5 w-5" />}
                        tone="blue"
                    />
                    <StatusCard
                        title="Care History"
                        value={`${requests.length} request${requests.length === 1 ? '' : 's'}`}
                        detail={`${completedCount} completed or closed episode${completedCount === 1 ? '' : 's'}`}
                        icon={<ClipboardList className="h-5 w-5" />}
                        tone="purple"
                    />
                </div>

                {activeRequest ? (
                    <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-xl font-bold text-[#4a3428]">Current Request</h3>
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[activeRequest.status]}`}>
                                        {formatStatus(activeRequest.status)}
                                    </span>
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[activeRequest.urgency]}`}>
                                        {activeRequest.urgency} urgency
                                    </span>
                                </div>
                                <p className="mt-2 max-w-3xl text-gray-700">{getPatientMessage(activeRequest.status)}</p>
                            </div>
                            <p className="text-sm text-gray-500">Submitted {formatDateTime(activeRequest.created_at)}</p>
                        </div>

                        <CareTimeline status={activeRequest.status} />

                        <div className="mt-6 grid gap-4 lg:grid-cols-3">
                            <InfoPanel title="Your concern" value={activeRequest.reason} />
                            <InfoPanel
                                title="Preferences"
                                value={`Specialty: ${activeRequest.preferred_specialty || 'Any'}\nDoctor gender: ${activeRequest.preferred_doctor_gender || 'Any'}\nAvailability: ${activeRequest.availability || 'Not specified'}`}
                            />
                            <InfoPanel
                                title="Assigned Doctor"
                                value={activeRequest.doctor_id ? `${activeRequest.doctor_name || 'Doctor assigned'}\n${activeRequest.doctor_email || ''}` : 'Not assigned yet'}
                            />
                        </div>

                        {activeRequest.triage_notes && (
                            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                                <p className="text-sm font-semibold text-blue-900">Care team note</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-blue-800">{activeRequest.triage_notes}</p>
                            </div>
                        )}

                        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                            <div className="flex gap-2">
                                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                <p>If your symptoms become urgent or unsafe, use local emergency services. Apothecary request review is not an emergency response channel.</p>
                            </div>
                        </div>

                        {['triage_claimed', 'triage_in_progress', 'pending_assignment'].includes(activeRequest.status) && (
                            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-semibold text-blue-900">Care team messaging is available</p>
                                    <p className="mt-1 text-sm text-blue-800">Use this thread to answer triage questions before Doctor assignment.</p>
                                </div>
                                <Button variant="outline" onClick={() => openTriageChat(activeRequest)} leftIcon={<MessageSquare className="h-4 w-4" />}>
                                    Message Care Team
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
                        <Stethoscope className="mx-auto h-10 w-10 text-[#E67E3C]" />
                        <h3 className="mt-4 text-lg font-bold text-[#4a3428]">No Active Care Request</h3>
                        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
                            When you need treatment again, submit a new request. The care team will triage your concern and match you with an available Doctor.
                        </p>
                        <Button className="mt-5" onClick={() => setIsCreateOpen(true)} disabled={!canCreateRequest}>
                            Start New Request
                        </Button>
                    </div>
                )}

                <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-[#4a3428]">Request History</h3>
                            <p className="text-sm text-gray-500">Past and current care episodes.</p>
                        </div>
                    </div>

                    {requests.length === 0 ? (
                        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
                            No care request history yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {requests.map(request => (
                                <button
                                    key={request.care_request_id}
                                    type="button"
                                    onClick={() => setSelectedRequest(request)}
                                    className="w-full rounded-lg border border-gray-100 bg-white p-4 text-left transition hover:border-gray-200 hover:bg-gray-50"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[request.status] || 'border-gray-200 bg-gray-100 text-gray-700'}`}>
                                                    {formatStatus(request.status)}
                                                </span>
                                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[request.urgency]}`}>
                                                    {request.urgency}
                                                </span>
                                            </div>
                                            <p className="mt-2 font-semibold text-[#4a3428]">{request.reason}</p>
                                            <p className="mt-1 text-sm text-gray-500">{getPatientMessage(request.status)}</p>
                                        </div>
                                        <div className="text-sm text-gray-500 md:text-right">
                                            <p>{formatDate(request.created_at)}</p>
                                            {request.doctor_name && <p>{request.doctor_name}</p>}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Request Clinical Care" size="lg">
                <form onSubmit={handleCreateRequest} className="space-y-4 p-6">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                        This starts a new care episode. A clinical assistant will review your concern before Doctor assignment.
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="reason" className="text-sm font-medium text-gray-700">What do you need help with?</label>
                        <Textarea
                            id="reason"
                            required
                            rows={4}
                            placeholder="Describe your symptoms, concern, or reason for requesting care."
                            value={formData.reason}
                            onChange={event => setFormData({ ...formData, reason: event.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="urgency" className="text-sm font-medium text-gray-700">Urgency Level</label>
                            <Select
                                id="urgency"
                                value={formData.urgency}
                                onChange={event => setFormData({ ...formData, urgency: event.target.value as RequestForm['urgency'] })}
                                options={[
                                    { value: 'low', label: 'Low - routine' },
                                    { value: 'normal', label: 'Normal - standard review' },
                                    { value: 'high', label: 'High - prompt review requested' }
                                ]}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="preferred_doctor_gender" className="text-sm font-medium text-gray-700">Preferred Doctor Gender</label>
                            <Select
                                id="preferred_doctor_gender"
                                value={formData.preferred_doctor_gender}
                                onChange={event => setFormData({ ...formData, preferred_doctor_gender: event.target.value as RequestForm['preferred_doctor_gender'] })}
                                options={[
                                    { value: 'any', label: 'No preference' },
                                    { value: 'female', label: 'Female' },
                                    { value: 'male', label: 'Male' }
                                ]}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="preferred_specialty" className="text-sm font-medium text-gray-700">Preferred Medical Specialty</label>
                        <Input
                            id="preferred_specialty"
                            type="text"
                            placeholder="General Physician, Cardiology, Psychiatry, Dermatology..."
                            value={formData.preferred_specialty}
                            onChange={event => setFormData({ ...formData, preferred_specialty: event.target.value })}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="availability" className="text-sm font-medium text-gray-700">Availability</label>
                        <Textarea
                            id="availability"
                            rows={2}
                            placeholder="Weekday mornings, evenings after 6 PM, weekends..."
                            value={formData.availability}
                            onChange={event => setFormData({ ...formData, availability: event.target.value })}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="patient_notes" className="text-sm font-medium text-gray-700">Additional Notes</label>
                        <Textarea
                            id="patient_notes"
                            rows={3}
                            placeholder="Relevant history, current medicines, accessibility needs, or anything the team should know."
                            value={formData.patient_notes}
                            onChange={event => setFormData({ ...formData, patient_notes: event.target.value })}
                        />
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
                        <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="submit" isLoading={isSaving}>
                            Submit Request
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isClosureOpen} onClose={() => setIsClosureOpen(false)} title="No Longer Need Care" size="md">
                <div className="space-y-4 p-6">
                    <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-amber-800">
                        <ShieldAlert className="mt-0.5 h-6 w-6 flex-shrink-0" />
                        <div>
                            <p className="font-semibold">Confirm this care update</p>
                            <p className="mt-1 text-sm">This tells the clinical team you no longer need treatment for this episode.</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600">
                        If you already have an assigned Doctor, they may need to confirm the episode outcome. You can request care again later if your condition changes.
                    </p>
                    <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
                        <Button type="button" variant="secondary" onClick={() => setIsClosureOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleRequestClosure} isLoading={isSaving}>
                            Confirm
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)} title="Care Request Details" size="lg">
                {selectedRequest && (
                    <div className="space-y-4 p-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[selectedRequest.status]}`}>
                                {formatStatus(selectedRequest.status)}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[selectedRequest.urgency]}`}>
                                {selectedRequest.urgency} urgency
                            </span>
                        </div>
                        <CareTimeline status={selectedRequest.status} compact />
                        <InfoPanel title="Reason" value={selectedRequest.reason} />
                        <InfoPanel title="Care team status" value={getPatientMessage(selectedRequest.status)} />
                        {selectedRequest.triage_notes && <InfoPanel title="Care team note" value={selectedRequest.triage_notes} />}
                        <div className="flex justify-end border-t border-gray-200 pt-4">
                            <Button type="button" variant="secondary" onClick={() => setSelectedRequest(null)}>
                                Close
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </DashboardLayout>
    );
}

function StatusCard({ title, value, detail, icon, tone = 'orange' }: { title: string; value: string; detail: string; icon: ReactNode; tone?: 'orange' | 'blue' | 'purple' }) {
    const toneClasses = {
        orange: 'bg-orange-50 text-orange-700',
        blue: 'bg-blue-50 text-blue-700',
        purple: 'bg-purple-50 text-purple-700'
    };

    return (
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
                <span className={`rounded-lg p-3 ${toneClasses[tone]}`}>{icon}</span>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
                    <p className="mt-1 text-xl font-bold capitalize text-[#4a3428]">{value}</p>
                    <p className="mt-2 text-sm text-gray-500">{detail}</p>
                </div>
            </div>
        </div>
    );
}

function CareTimeline({ status, compact = false }: { status: CareRequestStatus; compact?: boolean }) {
    const currentStep = getCurrentStep(status);
    const steps = [
        { label: 'Submitted', icon: ClipboardList },
        { label: 'Assistant review', icon: MessageSquare },
        { label: 'Matching', icon: UserCheck },
        { label: 'Doctor assigned', icon: Stethoscope },
        { label: 'Closed', icon: CheckCircle2 }
    ];

    return (
        <div className={compact ? 'mt-2' : 'mt-6'}>
            <div className="grid gap-3 md:grid-cols-5">
                {steps.map((step, index) => {
                    const stepNumber = index + 1;
                    const active = stepNumber <= currentStep;
                    const CurrentIcon = step.icon;
                    return (
                        <div key={step.label} className={`rounded-lg border p-3 ${active ? 'border-[#E67E3C] bg-[#fff4ec]' : 'border-gray-100 bg-gray-50'}`}>
                            <CurrentIcon className={`h-5 w-5 ${active ? 'text-[#E67E3C]' : 'text-gray-400'}`} />
                            <p className={`mt-2 text-sm font-semibold ${active ? 'text-[#4a3428]' : 'text-gray-500'}`}>{step.label}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{value || '-'}</p>
        </div>
    );
}
