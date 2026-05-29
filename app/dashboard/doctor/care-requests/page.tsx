'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { useNotificationContext } from '@/providers/NotificationProvider';
import { Button, Modal, Select, Textarea } from '@/components/ui';
import {
    AlertCircle,
    CheckCircle2,
    ClipboardList,
    Clock,
    Lock,
    MessageSquare,
    RefreshCcw,
    Search,
    ShieldAlert,
    Stethoscope,
    Unlock,
    UserCheck,
    Users
} from 'lucide-react';

type QueueView = 'unclaimed' | 'mine' | 'pending_assignment' | 'all';

type CareRequestStatus =
    | 'new_request'
    | 'triage_claimed'
    | 'triage_in_progress'
    | 'pending_assignment'
    | 'assigned'
    | 'in_treatment'
    | 'patient_requested_closure';

type CareRequest = {
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    patient_email: string;
    doctor_id: string | null;
    doctor_name: string | null;
    doctor_email: string | null;
    claimed_by_user_id: string | null;
    claimed_by_email: string | null;
    claimed_at?: string;
    claim_expires_at?: string;
    is_claimed: boolean;
    is_claimed_by_me?: boolean;
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
};

type CareRequestsResponse = {
    care_requests: CareRequest[];
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

type AssistantMeResponse = {
    Assistant: {
        permissions: {
            can_view_assigned_patients: boolean;
            can_assign_patients: boolean;
            can_manage_bookings: boolean;
            can_send_communications: boolean;
        };
    };
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
    patient_requested_closure: 'bg-orange-100 text-orange-800 border-orange-200'
};

const queueTabs: Array<{ key: QueueView; label: string; icon: ComponentType<{ className?: string }> }> = [
    { key: 'unclaimed', label: 'Unclaimed', icon: Unlock },
    { key: 'mine', label: 'My Queue', icon: Lock },
    { key: 'pending_assignment', label: 'Ready to Assign', icon: UserCheck },
    { key: 'all', label: 'All Scoped', icon: Users }
];

const claimableStatuses: CareRequestStatus[] = ['new_request', 'triage_claimed', 'triage_in_progress', 'pending_assignment'];

function formatStatus(status?: string) {
    return (status || '-').replace(/_/g, ' ');
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

export default function AssistantCareRequestsPage() {
    const router = useRouter();
    const { careRequestTick } = useNotificationContext();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [requests, setRequests] = useState<CareRequest[]>([]);
    const [doctors, setDoctors] = useState<AssignableDoctor[]>([]);
    const [permissions, setPermissions] = useState<AssistantMeResponse['Assistant']['permissions'] | null>(null);
    const [queueView, setQueueView] = useState<QueueView>('unclaimed');
    const [search, setSearch] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState('all');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<CareRequest | null>(null);
    const [assignTarget, setAssignTarget] = useState<CareRequest | null>(null);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [doctorSearch, setDoctorSearch] = useState('');
    const [triageForm, setTriageForm] = useState({
        status: 'triage_in_progress' as 'triage_in_progress' | 'pending_assignment',
        triage_notes: ''
    });

    const loadData = async (silent = false, nextQueue = queueView) => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        if (!silent) setIsLoading(true);
        setError('');

        try {
            const params = new URLSearchParams({ status: 'open', queue: nextQueue, limit: '100' });
            if (search.trim()) params.set('search', search.trim());

            const [profileRes, doctorsRes, requestsRes] = await Promise.all([
                apiRequest<AssistantMeResponse>('/assistant/me', { token: session.access_token }),
                apiRequest<{ Doctors: AssignableDoctor[] }>('/assistant/assignable-doctors', { token: session.access_token }),
                apiRequest<CareRequestsResponse>(`/assistant/care-requests?${params.toString()}`, { token: session.access_token })
            ]);

            setPermissions(profileRes.data?.Assistant.permissions || null);
            setDoctors(doctorsRes.data?.Doctors || []);
            setRequests(requestsRes.data?.care_requests || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load clinical triage queue.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const session = getSession();
        if (!session || session.user.role !== 'assistant') {
            router.push('/auth/login');
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData(false, 'unclaimed');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, careRequestTick]);

    const canAssign = permissions?.can_assign_patients || false;
    const currentUserId = getSession()?.user.user_id;

    const isClaimedByMe = useCallback((request: CareRequest) => {
        return Boolean(
            request.is_claimed_by_me ||
            (currentUserId && request.claimed_by_user_id === currentUserId)
        );
    }, [currentUserId]);

    const canClaimRequest = (request: CareRequest) => {
        return claimableStatuses.includes(request.status) && !request.doctor_id;
    };

    const changeQueue = async (view: QueueView) => {
        setQueueView(view);
        await loadData(true, view);
    };

    const claimRequest = async (request: CareRequest) => {
        const session = getSession();
        if (!session) return;

        setError('');
        setSuccess('');
        setIsSaving(true);
        try {
            await apiRequest(`/assistant/care-requests/${request.care_request_id}/claim`, {
                method: 'POST',
                token: session.access_token
            });
            setSuccess(`${request.patient_name} is now in your queue.`);
            await changeQueue('mine');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to claim care request.');
            await loadData(true);
        } finally {
            setIsSaving(false);
        }
    };

    const releaseRequest = async (request: CareRequest) => {
        const session = getSession();
        if (!session) return;

        setError('');
        setSuccess('');
        setIsSaving(true);
        try {
            await apiRequest(`/assistant/care-requests/${request.care_request_id}/release`, {
                method: 'POST',
                token: session.access_token
            });
            setSuccess(`${request.patient_name} was returned to the unclaimed queue.`);
            await loadData(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to release care request.');
        } finally {
            setIsSaving(false);
        }
    };

    const openTriageChat = (request: CareRequest) => {
        router.push(`/dashboard/doctor/chat?careRequestId=${request.care_request_id}`);
    };

    const openTriageModal = (request: CareRequest) => {
        setSelectedRequest(request);
        setTriageForm({
            status: request.status === 'pending_assignment' ? 'pending_assignment' : 'triage_in_progress',
            triage_notes: request.triage_notes || ''
        });
    };

    const handleTriageSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedRequest) return;

        const session = getSession();
        if (!session) return;

        setError('');
        setSuccess('');
        setIsSaving(true);

        try {
            await apiRequest(`/assistant/care-requests/${selectedRequest.care_request_id}/triage`, {
                method: 'PATCH',
                token: session.access_token,
                body: JSON.stringify({
                    status: triageForm.status,
                    triage_notes: triageForm.triage_notes.trim() || undefined
                })
            });

            setSuccess('Triage state saved.');
            setSelectedRequest(null);
            await loadData(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update triage notes.');
            await loadData(true);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAssignSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!assignTarget || !selectedDoctorId) return;

        const session = getSession();
        if (!session) return;

        setError('');
        setSuccess('');
        setIsSaving(true);

        try {
            await apiRequest(`/assistant/care-requests/${assignTarget.care_request_id}/assign-doctor`, {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    doctor_id: selectedDoctorId,
                    force: false
                })
            });

            setSuccess('Patient assigned to the selected Doctor.');
            setAssignTarget(null);
            setSelectedDoctorId('');
            await loadData(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save doctor assignment.');
            await loadData(true);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredRequests = useMemo(() => {
        return requests.filter(request => {
            const matchesUrgency = urgencyFilter === 'all' || request.urgency === urgencyFilter;
            const searchText = `${request.patient_name} ${request.patient_email} ${request.reason} ${request.triage_notes || ''}`.toLowerCase();
            const matchesSearch = !search.trim() || searchText.includes(search.trim().toLowerCase());
            return matchesUrgency && matchesSearch;
        });
    }, [requests, search, urgencyFilter]);

    const filteredDoctors = useMemo(() => {
        const value = doctorSearch.trim().toLowerCase();
        return doctors.filter(doctor => {
            if (!value) return true;
            return `${doctor.name} ${doctor.email} ${doctor.specialty || ''}`.toLowerCase().includes(value);
        });
    }, [doctors, doctorSearch]);

    const selectedDoctor = doctors.find(doctor => doctor.doctor_id === selectedDoctorId);

    const stats = useMemo(() => ({
        queue: requests.length,
        claimed: requests.filter(request => isClaimedByMe(request)).length,
        ready: requests.filter(request => request.status === 'pending_assignment').length,
        doctorsAvailable: doctors.filter(doctor => doctor.is_available_for_assignment).length
    }), [requests, doctors, isClaimedByMe]);

    if (isLoading) {
        return (
            <DashboardLayout role="doctor">
                <div className="flex min-h-[300px] items-center justify-center">
                    <p className="text-gray-500">Loading clinical triage queue...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role="doctor">
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-foreground">Clinical Care Triage Queue</h2>
                        <p className="text-gray-600">Claim one request, complete triage, then assign the patient to an available Doctor.</p>
                    </div>
                    <Button variant="outline" onClick={() => loadData(true)} leftIcon={<RefreshCcw className="h-4 w-4" />}>
                        Refresh
                    </Button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <ShieldAlert className="h-5 w-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                        <span>{success}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <StatTile label="Current View" value={stats.queue} icon={<ClipboardList className="h-5 w-5" />} />
                    <StatTile label="Claimed by Me" value={stats.claimed} icon={<Lock className="h-5 w-5" />} tone="blue" />
                    <StatTile label="Ready to Assign" value={stats.ready} icon={<UserCheck className="h-5 w-5" />} tone="purple" />
                    <StatTile label="Assignable Doctors" value={stats.doctorsAvailable} icon={<Stethoscope className="h-5 w-5" />} tone="green" />
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Claiming a request locks it to your queue for 2 hours. Other assistants can still see ownership in scoped views, but they cannot edit or assign it unless the claim is released or expires.
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                            {queueTabs.map(tab => {
                                const Icon = tab.icon;
                                const active = queueView === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => changeQueue(tab.key)}
                                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                            active
                                                ? 'border-primary bg-accent text-primary-dark'
                                                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative min-w-[260px]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter') loadData(true);
                                    }}
                                    placeholder="Search patient or reason"
                                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <select
                                value={urgencyFilter}
                                onChange={event => setUrgencyFilter(event.target.value)}
                                className="rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                            >
                                <option value="all">All urgency</option>
                                <option value="high">High</option>
                                <option value="normal">Normal</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    <th className="px-4 py-3">Patient and Request</th>
                                    <th className="px-4 py-3">Urgency</th>
                                    <th className="px-4 py-3">Preferences</th>
                                    <th className="px-4 py-3">Ownership</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                                            No care requests match this queue view.
                                        </td>
                                    </tr>
                                ) : filteredRequests.map(request => (
                                    <tr key={request.care_request_id} className="hover:bg-gray-50/60">
                                        <td className="px-4 py-4">
                                            <p className="font-semibold text-foreground">{request.patient_name}</p>
                                            <p className="text-xs text-gray-500">{request.patient_email}</p>
                                            <p className="mt-2 max-w-md text-gray-700">{request.reason}</p>
                                            {request.patient_notes && (
                                                <p className="mt-1 max-w-md text-xs text-gray-500">{request.patient_notes}</p>
                                            )}
                                            <p className="mt-2 text-xs text-gray-400">Submitted {formatDateTime(request.created_at)}</p>
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[request.urgency]}`}>
                                                {request.urgency}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 align-top text-xs text-gray-600">
                                            <p>Specialty: <span className="font-semibold">{request.preferred_specialty || 'Any'}</span></p>
                                            <p>Doctor gender: <span className="font-semibold capitalize">{request.preferred_doctor_gender || 'Any'}</span></p>
                                            <p className="mt-1 max-w-[220px]">Availability: {request.availability || 'Not specified'}</p>
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            {request.is_claimed ? (
                                                <div className="text-xs text-gray-600">
                                                    <p className="font-semibold text-foreground">
                                                        {isClaimedByMe(request) ? 'You' : request.claimed_by_email || 'Another assistant'}
                                                    </p>
                                                    <p>Claimed {formatDateTime(request.claimed_at)}</p>
                                                    <p>Expires {formatDateTime(request.claim_expires_at)}</p>
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
                                                    <Unlock className="h-3.5 w-3.5" />
                                                    Unclaimed
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[request.status] || 'border-gray-200 bg-gray-100 text-gray-700'}`}>
                                                {formatStatus(request.status)}
                                            </span>
                                            {request.triage_notes && (
                                                <p className="mt-2 max-w-[220px] text-xs text-gray-500">{request.triage_notes}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            <div className="flex flex-col items-end gap-2">
                                                {canClaimRequest(request) && (queueView === 'unclaimed' || !request.is_claimed) ? (
                                                    <Button size="sm" onClick={() => claimRequest(request)} disabled={isSaving || !canAssign}>
                                                        Claim
                                                    </Button>
                                                ) : isClaimedByMe(request) ? (
                                                    <>
                                                        <Button size="sm" variant="outline" onClick={() => openTriageChat(request)} leftIcon={<MessageSquare className="h-4 w-4" />}>
                                                            Chat
                                                        </Button>
                                                        <Button size="sm" variant="secondary" onClick={() => openTriageModal(request)}>
                                                            Triage
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => {
                                                                setAssignTarget(request);
                                                                setSelectedDoctorId('');
                                                                setDoctorSearch('');
                                                            }}
                                                            disabled={!canAssign || request.status !== 'pending_assignment'}
                                                        >
                                                            Assign Doctor
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => releaseRequest(request)} disabled={isSaving}>
                                                            Release
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
                                                        {request.doctor_id || request.status === 'assigned' ? 'Assigned to Doctor' : 'Locked by another assistant'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <Modal isOpen={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)} title="Triage Care Request" size="lg">
                {selectedRequest && (
                    <form onSubmit={handleTriageSubmit} className="space-y-5 p-6">
                        <RequestSummary request={selectedRequest} />

                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                            <div className="flex gap-2">
                                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                <p>This request is locked to your queue while you triage. Set it to Ready for Match when enough detail is available for assignment.</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="triage_status" className="text-sm font-medium text-gray-700">Triage Status</label>
                            <Select
                                id="triage_status"
                                value={triageForm.status}
                                onChange={event => setTriageForm({ ...triageForm, status: event.target.value as typeof triageForm.status })}
                                options={[
                                    { value: 'triage_in_progress', label: 'Triage in progress' },
                                    { value: 'pending_assignment', label: 'Ready for Doctor assignment' }
                                ]}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="triage_notes" className="text-sm font-medium text-gray-700">Internal Triage Notes</label>
                            <Textarea
                                id="triage_notes"
                                rows={5}
                                placeholder="Symptoms clarified, safety concerns, specialty suggestion, scheduling limitations, or communication notes."
                                value={triageForm.triage_notes}
                                onChange={event => setTriageForm({ ...triageForm, triage_notes: event.target.value })}
                            />
                        </div>

                        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
                            <Button type="button" variant="secondary" onClick={() => setSelectedRequest(null)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" isLoading={isSaving}>
                                Save Triage
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal isOpen={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title="Assign Patient to Doctor" size="xl">
                {assignTarget && (
                    <form onSubmit={handleAssignSubmit} className="space-y-5 p-6">
                        <RequestSummary request={assignTarget} />

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Doctor Options</p>
                                <p className="text-xs text-gray-500">Only Doctors in your assistant scope are shown. Full, inactive, or unverified Doctors cannot be selected.</p>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={doctorSearch}
                                    onChange={event => setDoctorSearch(event.target.value)}
                                    placeholder="Search Doctors"
                                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            {filteredDoctors.length === 0 ? (
                                <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 md:col-span-2">
                                    No Doctors are available in your assignment scope.
                                </div>
                            ) : filteredDoctors.map(doctor => {
                                const selected = selectedDoctorId === doctor.doctor_id;
                                const capacityText = `${doctor.active_patient_count}/${doctor.max_patients} active patients`;
                                return (
                                    <button
                                        key={doctor.doctor_id}
                                        type="button"
                                        disabled={!doctor.is_available_for_assignment}
                                        onClick={() => setSelectedDoctorId(doctor.doctor_id)}
                                        className={`rounded-lg border p-4 text-left transition ${
                                            selected
                                                ? 'border-primary bg-accent ring-2 ring-primary/20'
                                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-foreground">{doctor.name}</p>
                                                <p className="text-xs text-gray-500">{doctor.email}</p>
                                            </div>
                                            {doctor.credential_status === 'verified' ? (
                                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">Verified</span>
                                            ) : (
                                                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Not verified</span>
                                            )}
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                                            <p>Specialty: <span className="font-semibold">{doctor.specialty || 'General'}</span></p>
                                            <p>{capacityText}</p>
                                            <p>{doctor.available_slots_next_14_days} open slots in 14 days</p>
                                            <p className="capitalize">Account: {doctor.status}</p>
                                        </div>
                                        {doctor.disabled_reason && (
                                            <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">{doctor.disabled_reason}</p>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {selectedDoctor && (
                            <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
                                {assignTarget.patient_name} will be assigned to {selectedDoctor.name}.
                            </div>
                        )}

                        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
                            <Button type="button" variant="secondary" onClick={() => setAssignTarget(null)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" isLoading={isSaving} disabled={!selectedDoctorId || !selectedDoctor?.is_available_for_assignment}>
                                Assign Doctor
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>
        </DashboardLayout>
    );
}

function StatTile({ label, value, icon, tone = 'orange' }: { label: string; value: number; icon: ReactNode; tone?: 'orange' | 'blue' | 'purple' | 'green' }) {
    const toneClasses = {
        orange: 'bg-orange-50 text-orange-700',
        blue: 'bg-blue-50 text-blue-700',
        purple: 'bg-purple-50 text-purple-700',
        green: 'bg-green-50 text-green-700'
    };

    return (
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <span className={`rounded-lg p-2 ${toneClasses[tone]}`}>{icon}</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
        </div>
    );
}

function RequestSummary({ request }: { request: CareRequest }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="font-bold text-foreground">{request.patient_name}</p>
                    <p className="text-xs text-gray-500">{request.patient_email}</p>
                </div>
                <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[request.urgency]}`}>
                    {request.urgency} urgency
                </span>
            </div>
            <div className="mt-3 border-t border-gray-200 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Patient reason</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{request.reason}</p>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
                <p>Specialty: <span className="font-semibold">{request.preferred_specialty || 'Any'}</span></p>
                <p>Doctor gender: <span className="font-semibold capitalize">{request.preferred_doctor_gender || 'Any'}</span></p>
                <p className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {request.availability || 'No availability note'}</p>
            </div>
        </div>
    );
}
