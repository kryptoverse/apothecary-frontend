'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle2,
    ClipboardList,
    Clock,
    Eye,
    FileText,
    RefreshCcw,
    Search,
    ShieldAlert,
    Stethoscope,
    UserCheck,
    Users
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Avatar, Button, Modal } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { getSession, hasRole } from '@/lib/auth';

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

type Patient = {
    patient_id: string;
    email?: string;
    name: string;
    account_status?: string;
    tier?: string;
    doctor_id?: string | null;
    doctor_name?: string;
    doctor_email?: string;
    care_status: CareStatus;
    illness_description?: string;
    care_status_updated_at?: string;
    doctor_assigned_at?: string;
    latest_request?: {
        care_request_id: string;
        status: CareRequestStatus;
        urgency: string;
        reason: string;
        created_at: string;
    } | null;
    created_at: string;
    updated_at: string;
};

type CareRequest = {
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    patient_email?: string;
    doctor_id?: string | null;
    doctor_name?: string | null;
    doctor_email?: string | null;
    claimed_by_user_id?: string | null;
    claimed_by_email?: string | null;
    claimed_at?: string;
    claim_expires_at?: string;
    is_claimed?: boolean;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    preferred_specialty?: string;
    preferred_doctor_gender?: 'male' | 'female' | 'any';
    availability?: string;
    patient_notes?: string;
    triage_notes?: string;
    status: CareRequestStatus;
    assigned_at?: string;
    closed_at?: string;
    outcome?: string;
    created_at: string;
    updated_at: string;
};

type DoctorOption = {
    doctor_id: string;
    email: string;
    status: string;
    specialty?: string;
    max_patients: number;
    credential_status: string;
};

type PatientsResponse = {
    patients: Patient[];
    pagination: { total: number; page: number; limit: number; total_pages: number; has_next: boolean; has_prev: boolean };
};

type CareRequestsResponse = {
    care_requests: CareRequest[];
};

type DoctorsResponse = {
    Doctors: DoctorOption[];
};

type PatientStats = {
    total_patients: number;
    needs_care: number;
    assigned: number;
    in_treatment: number;
    treated: number;
    unassigned_open_requests: number;
    open_requests: number;
    closure_requests: number;
};

type AssignTarget = {
    patient_id: string;
    patient_name: string;
    patient_email?: string;
    current_doctor_id?: string | null;
    reason?: string;
    care_request_id?: string;
};

const careStyles: Record<string, string> = {
    needs_care: 'bg-amber-100 text-amber-800 border-amber-200',
    assigned: 'bg-green-100 text-green-700 border-green-200',
    in_treatment: 'bg-blue-100 text-blue-700 border-blue-200',
    treated: 'bg-gray-100 text-gray-700 border-gray-200',
    inactive: 'bg-gray-100 text-gray-600 border-gray-200'
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

const activeRequestStatuses: CareRequestStatus[] = [
    'new_request',
    'triage_claimed',
    'triage_in_progress',
    'pending_assignment',
    'assigned',
    'in_treatment',
    'follow_up_needed',
    'patient_requested_closure'
];

function label(value?: string) {
    return (value || '-').replace(/_/g, ' ');
}

function nameFromEmail(email = '') {
    return email.split('@')[0].split(/[._-]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'User';
}

function formatDate(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getRequestStep(status?: CareRequestStatus) {
    if (!status) return 0;
    if (status === 'new_request') return 1;
    if (status === 'triage_claimed' || status === 'triage_in_progress') return 2;
    if (status === 'pending_assignment') return 3;
    if (status === 'assigned' || status === 'in_treatment' || status === 'follow_up_needed') return 4;
    return 5;
}

function getAdminStatusMessage(status: CareRequestStatus) {
    switch (status) {
        case 'new_request':
            return 'Waiting for triage. Admin can triage directly or leave it for assistant queue.';
        case 'triage_claimed':
            return 'Claimed by an assistant. Admin can still override triage or assignment if needed.';
        case 'triage_in_progress':
            return 'Clinical review is in progress.';
        case 'pending_assignment':
            return 'Ready for Doctor assignment.';
        case 'assigned':
            return 'Patient has been assigned to a Doctor.';
        case 'in_treatment':
            return 'Patient is in active treatment.';
        case 'follow_up_needed':
            return 'Follow-up care is needed.';
        case 'patient_requested_closure':
            return 'Patient requested closure. Admin can resolve, cancel, or leave for Doctor review.';
        case 'completed':
            return 'Care episode completed.';
        case 'closed_by_patient':
            return 'Request closed by patient/admin confirmation.';
        case 'cancelled':
            return 'Request cancelled.';
        case 'referred_out':
            return 'Patient referred outside the platform.';
        case 'not_appropriate_for_platform':
            return 'Request marked not appropriate for platform care.';
        default:
            return 'Review care request state.';
    }
}

export default function AdminPatientsPage() {
    const router = useRouter();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [requests, setRequests] = useState<CareRequest[]>([]);
    const [doctors, setDoctors] = useState<DoctorOption[]>([]);
    const [stats, setStats] = useState<PatientStats | null>(null);
    const [search, setSearch] = useState('');
    const [careStatus, setCareStatus] = useState('all');
    const [assigned, setAssigned] = useState('all');
    const [requestStatus, setRequestStatus] = useState('open');
    const [isLoading, setIsLoading] = useState(true);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [triageTarget, setTriageTarget] = useState<CareRequest | null>(null);
    const [triageStatus, setTriageStatus] = useState<CareRequestStatus>('triage_in_progress');
    const [triageNotes, setTriageNotes] = useState('');
    const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [forceReassign, setForceReassign] = useState(false);
    const [detailTarget, setDetailTarget] = useState<CareRequest | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setIsLoading(true);
        setNotice(null);

        try {
            const patientParams = new URLSearchParams({ page: '1', limit: '200', care_status: careStatus });
            patientParams.set('_', Date.now().toString());
            if (search.trim()) patientParams.set('search', search.trim());
            if (assigned !== 'all') patientParams.set('assigned', assigned === 'assigned' ? 'true' : 'false');

            const requestParams = new URLSearchParams({ page: '1', limit: '200', status: requestStatus });
            requestParams.set('_', Date.now().toString());
            if (search.trim()) requestParams.set('search', search.trim());

            const [statsRes, patientRes, requestRes, doctorRes] = await Promise.all([
                apiRequest<PatientStats>('/admin/patients/stats', { token: session.access_token }),
                apiRequest<PatientsResponse>(`/admin/patients?${patientParams.toString()}`, { token: session.access_token }),
                apiRequest<CareRequestsResponse>(`/admin/care-requests?${requestParams.toString()}`, { token: session.access_token }),
                apiRequest<DoctorsResponse>('/admin/doctors/active?page=1&limit=500&credential_status=verified', { token: session.access_token })
            ]);

            setStats(statsRes.data || null);
            setPatients(patientRes.data?.patients || []);
            setRequests(requestRes.data?.care_requests || []);
            setDoctors((doctorRes.data?.Doctors || []).filter(doctor => doctor.status === 'active' && doctor.credential_status === 'verified'));
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load patient management data.' });
        } finally {
            setIsLoading(false);
        }
    }, [assigned, careStatus, requestStatus, router, search]);

    useEffect(() => {
        if (!hasRole('admin')) {
            router.push('/auth/login');
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadData();
    }, [router, loadData]);

    const statCards = useMemo(() => [
        { label: 'Patients', value: stats?.total_patients ?? 0, icon: <Users className="h-5 w-5" /> },
        { label: 'Needs Care', value: stats?.needs_care ?? 0, icon: <HeartIcon />, tone: 'amber' as const },
        { label: 'Open Requests', value: stats?.open_requests ?? 0, icon: <ClipboardList className="h-5 w-5" />, tone: 'blue' as const },
        { label: 'Closure Requests', value: stats?.closure_requests ?? 0, icon: <ShieldAlert className="h-5 w-5" />, tone: 'orange' as const }
    ], [stats]);

    const requestBreakdown = useMemo(() => ({
        new: requests.filter(request => request.status === 'new_request').length,
        triage: requests.filter(request => request.status === 'triage_claimed' || request.status === 'triage_in_progress').length,
        ready: requests.filter(request => request.status === 'pending_assignment').length,
        closures: requests.filter(request => request.status === 'patient_requested_closure').length
    }), [requests]);

    const openTriage = (request: CareRequest, status?: CareRequestStatus) => {
        setTriageTarget(request);
        setTriageStatus(status || (request.status === 'pending_assignment' ? 'pending_assignment' : 'triage_in_progress'));
        setTriageNotes(request.triage_notes || '');
    };

    const openAssign = (target: AssignTarget) => {
        setAssignTarget(target);
        setSelectedDoctorId(target.current_doctor_id || '');
        setForceReassign(Boolean(target.current_doctor_id));
    };

    const saveTriage = async (event?: FormEvent) => {
        event?.preventDefault();
        const session = getSession();
        if (!session || !triageTarget) return;

        setIsSaving(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/admin/care-requests/${triageTarget.care_request_id}/triage`, {
                method: 'PATCH',
                token: session.access_token,
                body: JSON.stringify({
                    status: triageStatus,
                    triage_notes: triageNotes.trim() || undefined
                })
            });

            setNotice({ type: 'success', message: response.data?.message || 'Care request updated.' });
            setTriageTarget(null);
            await loadData();
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update care request.' });
        } finally {
            setIsSaving(false);
        }
    };

    const quickUpdateRequest = async (request: CareRequest, status: CareRequestStatus) => {
        setTriageTarget(request);
        setTriageStatus(status);
        setTriageNotes(request.triage_notes || '');
        const session = getSession();
        if (!session) return;

        setIsSaving(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/admin/care-requests/${request.care_request_id}/triage`, {
                method: 'PATCH',
                token: session.access_token,
                body: JSON.stringify({
                    status,
                    triage_notes: request.triage_notes || undefined
                })
            });
            setNotice({ type: 'success', message: response.data?.message || 'Care request updated.' });
            setTriageTarget(null);
            await loadData();
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update care request.' });
        } finally {
            setIsSaving(false);
        }
    };

    const assignPatient = async (event: FormEvent) => {
        event.preventDefault();
        const session = getSession();
        if (!session || !assignTarget || !selectedDoctorId) return;

        setIsSaving(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/admin/patients/${assignTarget.patient_id}/assign-doctor`, {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    doctor_id: selectedDoctorId,
                    force: forceReassign
                })
            });

            setNotice({ type: 'success', message: response.data?.message || 'Patient assigned successfully.' });
            setAssignTarget(null);
            await loadData();
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to assign patient.' });
        } finally {
            setIsSaving(false);
        }
    };

    const unassignPatient = async (patient: Patient) => {
        const session = getSession();
        if (!session) return;

        setIsSaving(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/admin/patients/${patient.patient_id}/doctor`, {
                method: 'DELETE',
                token: session.access_token
            });

            setNotice({ type: 'success', message: response.data?.message || 'Patient unassigned.' });
            await loadData();
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to unassign patient.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <DashboardLayout role="admin">
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Patient Management</h2>
                        <p className="text-gray-600">Track patients, triage requests, assign Doctors, and resolve care episodes.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" size="sm" onClick={loadData} leftIcon={<RefreshCcw className="h-4 w-4" />}>Refresh</Button>
                        <Button size="sm" onClick={() => router.push('/dashboard/admin/patient-assignments')} leftIcon={<Stethoscope className="h-4 w-4" />}>Assignment Workspace</Button>
                    </div>
                </div>

                {notice && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {notice.message}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {statCards.map(card => (
                        <StatCard key={card.label} label={card.label} value={isLoading ? '...' : card.value} icon={card.icon} tone={card.tone} />
                    ))}
                </div>

                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 rounded-lg border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                        <div className="mb-4 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(130px,160px)_minmax(150px,170px)_auto]">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    onKeyDown={event => { if (event.key === 'Enter') void loadData(); }}
                                    placeholder="Search patient, email, illness..."
                                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                                />
                            </div>
                            <select value={careStatus} onChange={event => setCareStatus(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                                <option value="all">All care</option>
                                <option value="needs_care">Needs care</option>
                                <option value="assigned">Assigned</option>
                                <option value="in_treatment">In treatment</option>
                                <option value="treated">Treated</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <select value={assigned} onChange={event => setAssigned(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                                <option value="all">All assignment</option>
                                <option value="assigned">Assigned</option>
                                <option value="unassigned">Unassigned</option>
                            </select>
                            <Button size="sm" onClick={loadData} leftIcon={<Search className="h-4 w-4" />}>Apply</Button>
                        </div>

                        <div className="space-y-3">
                            <div className="hidden rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(105px,0.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(150px,0.6fr)] lg:items-center lg:gap-4">
                                <span>Patient</span>
                                <span>Care</span>
                                <span>Doctor</span>
                                <span>Latest Request</span>
                                <span className="text-right">Actions</span>
                            </div>
                            {isLoading && <p className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">Loading patients...</p>}
                            {!isLoading && patients.length === 0 && <p className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">No patients found.</p>}
                            {!isLoading && patients.map(patient => (
                                <PatientManagementRow
                                    key={patient.patient_id}
                                    patient={patient}
                                    isSaving={isSaving}
                                    onAssign={() => openAssign({
                                        patient_id: patient.patient_id,
                                        patient_name: patient.name || nameFromEmail(patient.email),
                                        patient_email: patient.email,
                                        current_doctor_id: patient.doctor_id,
                                        reason: patient.illness_description
                                    })}
                                    onUnassign={() => void unassignPatient(patient)}
                                    onView={() => router.push(`/dashboard/admin/patients/${patient.patient_id}`)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                        <h3 className="font-bold text-[#4a3428]">Request Pipeline</h3>
                        <p className="mt-1 text-sm text-gray-500">Current queue breakdown.</p>
                        <div className="mt-4 space-y-3">
                            <PipelineRow label="New intake" value={requestBreakdown.new} />
                            <PipelineRow label="Assistant review" value={requestBreakdown.triage} />
                            <PipelineRow label="Ready to assign" value={requestBreakdown.ready} />
                            <PipelineRow label="Closure review" value={requestBreakdown.closures} />
                        </div>
                        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                            Admin can override assistant ownership, triage status, Doctor assignment, and episode resolution.
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-[#4a3428]">Care Request Queue</h3>
                            <p className="text-sm text-gray-500">Triage, assign, cancel, or resolve requests from one place.</p>
                        </div>
                        <select value={requestStatus} onChange={event => setRequestStatus(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                            <option value="open">Open</option>
                            <option value="new_request">New</option>
                            <option value="triage_claimed">Claimed</option>
                            <option value="triage_in_progress">Triage</option>
                            <option value="pending_assignment">Pending assignment</option>
                            <option value="patient_requested_closure">Closure requested</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>

                    <div className="space-y-3">
                        {isLoading && <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">Loading requests...</p>}
                        {!isLoading && requests.length === 0 && <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">No care requests found.</p>}
                        {!isLoading && requests.map(request => (
                            <div key={request.care_request_id} className="rounded-lg border border-gray-200 p-4">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <ClipboardList className="h-4 w-4 text-[#E67E3C]" />
                                            <p className="font-semibold text-[#4a3428]">{request.patient_name}</p>
                                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${requestStyles[request.status] || 'border-gray-200 bg-gray-100 text-gray-600'}`}>{label(request.status)}</span>
                                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${urgencyStyles[request.urgency]}`}>{request.urgency}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-gray-700">{request.reason}</p>
                                        <p className="mt-1 text-xs text-gray-500">{getAdminStatusMessage(request.status)}</p>
                                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                                            <span>Submitted {formatDateTime(request.created_at)}</span>
                                            {request.claimed_by_email && <span>Claimed by {request.claimed_by_email}</span>}
                                            {request.doctor_name && <span>Doctor: {request.doctor_name}</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <Button size="sm" variant="secondary" onClick={() => setDetailTarget(request)} leftIcon={<FileText className="h-4 w-4" />}>Details</Button>
                                        {request.status !== 'pending_assignment' && activeRequestStatuses.includes(request.status) && (
                                            <Button size="sm" variant="outline" disabled={isSaving} onClick={() => void quickUpdateRequest(request, 'pending_assignment')}>Ready</Button>
                                        )}
                                        {activeRequestStatuses.includes(request.status) && (
                                            <Button size="sm" variant="outline" onClick={() => openTriage(request)}>Triage</Button>
                                        )}
                                        {(request.status === 'pending_assignment' || request.status === 'triage_in_progress' || request.status === 'triage_claimed' || request.status === 'new_request') && (
                                            <Button size="sm" onClick={() => openAssign({
                                                patient_id: request.patient_id,
                                                patient_name: request.patient_name,
                                                patient_email: request.patient_email,
                                                current_doctor_id: request.doctor_id,
                                                reason: request.reason,
                                                care_request_id: request.care_request_id
                                            })}>Assign</Button>
                                        )}
                                        {request.status === 'patient_requested_closure' && (
                                            <Button size="sm" onClick={() => openTriage(request, 'completed')}>Resolve</Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Modal isOpen={Boolean(triageTarget)} onClose={() => setTriageTarget(null)} title="Admin Care Request Action" size="lg">
                {triageTarget && (
                    <form onSubmit={saveTriage} className="space-y-5 p-6">
                        <RequestSummary request={triageTarget} />
                        <CareTimeline status={triageTarget.status} />
                        <div>
                            <label htmlFor="triageStatus" className="mb-2 block text-sm font-medium text-gray-700">Status Action</label>
                            <select id="triageStatus" value={triageStatus} onChange={event => setTriageStatus(event.target.value as CareRequestStatus)} className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                                <option value="triage_in_progress">Triage in progress</option>
                                <option value="pending_assignment">Ready for assignment</option>
                                <option value="completed">Complete episode</option>
                                <option value="closed_by_patient">Confirm patient closure</option>
                                <option value="referred_out">Refer out</option>
                                <option value="not_appropriate_for_platform">Not appropriate for platform</option>
                                <option value="cancelled">Cancel request</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="triageNotes" className="mb-2 block text-sm font-medium text-gray-700">Admin / Triage Notes</label>
                            <textarea id="triageNotes" rows={5} value={triageNotes} onChange={event => setTriageNotes(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#E67E3C]" />
                        </div>
                        {['completed', 'closed_by_patient', 'referred_out', 'not_appropriate_for_platform', 'cancelled'].includes(triageStatus) && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                                This will close the care request, mark the patient as treated, and clear active Doctor assignment for this episode.
                            </div>
                        )}
                        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                            <Button type="button" variant="secondary" onClick={() => setTriageTarget(null)} disabled={isSaving}>Cancel</Button>
                            <Button type="submit" isLoading={isSaving}>Save Action</Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal isOpen={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title="Assign Patient to Doctor" size="lg">
                {assignTarget && (
                    <form onSubmit={assignPatient} className="space-y-5 p-6">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                            <p className="font-semibold text-[#4a3428]">{assignTarget.patient_name}</p>
                            <p className="text-sm text-gray-600">{assignTarget.patient_email}</p>
                            {assignTarget.reason && <p className="mt-2 text-sm text-gray-700">{assignTarget.reason}</p>}
                        </div>
                        <div>
                            <label htmlFor="doctor_id" className="mb-2 block text-sm font-medium text-gray-700">Verified Active Doctor</label>
                            <select id="doctor_id" required value={selectedDoctorId} onChange={event => setSelectedDoctorId(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                                <option value="">Select a Doctor</option>
                                {doctors.map(doctor => (
                                    <option key={doctor.doctor_id} value={doctor.doctor_id}>
                                        {nameFromEmail(doctor.email)} - {doctor.specialty || 'General'} - capacity {doctor.max_patients}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {assignTarget.current_doctor_id && (
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                <input type="checkbox" checked={forceReassign} onChange={event => setForceReassign(event.target.checked)} className="h-4 w-4 rounded accent-[#E67E3C]" />
                                <span className="text-sm text-amber-800">Confirm reassignment from current Doctor</span>
                            </label>
                        )}
                        {doctors.length === 0 && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                No active verified Doctors are available.
                            </div>
                        )}
                        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                            <Button type="button" variant="secondary" onClick={() => setAssignTarget(null)} disabled={isSaving}>Cancel</Button>
                            <Button type="submit" isLoading={isSaving} disabled={!selectedDoctorId || doctors.length === 0} leftIcon={<Stethoscope className="h-5 w-5" />}>
                                Save Assignment
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal isOpen={Boolean(detailTarget)} onClose={() => setDetailTarget(null)} title="Care Request Details" size="lg">
                {detailTarget && (
                    <div className="space-y-4 p-6">
                        <RequestSummary request={detailTarget} />
                        <CareTimeline status={detailTarget.status} />
                        <InfoPanel title="Patient notes" value={detailTarget.patient_notes || '-'} />
                        <InfoPanel title="Triage notes" value={detailTarget.triage_notes || '-'} />
                        <InfoPanel title="Preferences" value={`Specialty: ${detailTarget.preferred_specialty || 'Any'}\nDoctor gender: ${detailTarget.preferred_doctor_gender || 'Any'}\nAvailability: ${detailTarget.availability || 'Not specified'}`} />
                        <div className="flex justify-end border-t border-gray-200 pt-4">
                            <Button type="button" variant="secondary" onClick={() => setDetailTarget(null)}>Close</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </DashboardLayout>
    );
}

function PatientManagementRow({ patient, isSaving, onAssign, onUnassign, onView }: { patient: Patient; isSaving: boolean; onAssign: () => void; onUnassign: () => void; onView: () => void }) {
    const patientName = patient.name || nameFromEmail(patient.email);

    return (
        <div className="min-w-0 rounded-lg border border-gray-100 bg-white p-4 shadow-sm transition hover:border-orange-100 hover:bg-orange-50/20 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(105px,0.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(150px,0.6fr)] lg:items-center lg:gap-4">
            <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-3">
                    <Avatar name={patientName || 'Patient'} />
                    <div className="min-w-0">
                        <p className="truncate font-semibold text-[#4a3428]">{patientName}</p>
                        <p className="truncate text-sm text-gray-600">{patient.email || 'No email available'}</p>
                        {patient.illness_description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{patient.illness_description}</p>}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 lg:mt-0">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${careStyles[patient.care_status] || 'border-gray-200 bg-gray-100 text-gray-600'}`}>
                    {label(patient.care_status)}
                </span>
            </div>

            <div className="mt-4 min-w-0 text-sm text-gray-600 lg:mt-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 lg:hidden">Doctor</p>
                {patient.doctor_id ? (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-gray-700">{patient.doctor_name || patient.doctor_email || 'Assigned'}</p>
                        {patient.doctor_assigned_at && <p className="text-xs text-gray-500">Since {formatDate(patient.doctor_assigned_at)}</p>}
                    </div>
                ) : (
                    <p className="font-medium text-gray-500">Unassigned</p>
                )}
            </div>

            <div className="mt-4 min-w-0 text-sm text-gray-600 lg:mt-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 lg:hidden">Latest Request</p>
                {patient.latest_request ? (
                    <div className="min-w-0">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${requestStyles[patient.latest_request.status] || 'border-gray-200 bg-gray-100 text-gray-600'}`}>
                            {label(patient.latest_request.status)}
                        </span>
                        <p className="mt-1 line-clamp-2 text-gray-600">{patient.latest_request.reason}</p>
                    </div>
                ) : (
                    <p className="text-gray-500">No request</p>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 lg:mt-0 lg:justify-end">
                <Button size="sm" variant="secondary" onClick={onView} leftIcon={<Eye className="h-4 w-4" />}>
                    View
                </Button>
                <Button size="sm" variant="outline" onClick={onAssign}>
                    {patient.doctor_id ? 'Reassign' : 'Assign'}
                </Button>
                {patient.doctor_id && (
                    <Button size="sm" variant="ghost" disabled={isSaving} onClick={onUnassign}>
                        Unassign
                    </Button>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, tone = 'default' }: { label: string; value: string | number; icon: ReactNode; tone?: 'default' | 'amber' | 'blue' | 'orange' }) {
    const toneClasses = {
        default: 'bg-gray-50 text-[#4a3428]',
        amber: 'bg-amber-50 text-amber-700',
        blue: 'bg-blue-50 text-blue-700',
        orange: 'bg-orange-50 text-orange-700'
    };

    return (
        <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <span className={`rounded-lg p-2 ${toneClasses[tone]}`}>{icon}</span>
            </div>
            <p className="mt-3 text-3xl font-bold text-[#4a3428]">{value}</p>
        </div>
    );
}

function HeartIcon() {
    return <Stethoscope className="h-5 w-5" />;
}

function PipelineRow({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="text-lg font-bold text-[#4a3428]">{value}</span>
        </div>
    );
}

function RequestSummary({ request }: { request: CareRequest }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="font-bold text-[#4a3428]">{request.patient_name}</p>
                    <p className="text-sm text-gray-600">{request.patient_email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${requestStyles[request.status]}`}>{label(request.status)}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${urgencyStyles[request.urgency]}`}>{request.urgency}</span>
                </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{request.reason}</p>
            <p className="mt-2 text-xs text-gray-500">Submitted {formatDateTime(request.created_at)}</p>
        </div>
    );
}

function CareTimeline({ status }: { status: CareRequestStatus }) {
    const current = getRequestStep(status);
    const steps = [
        { label: 'Submitted', icon: ClipboardList },
        { label: 'Review', icon: Clock },
        { label: 'Matching', icon: UserCheck },
        { label: 'Assigned', icon: Stethoscope },
        { label: 'Closed', icon: CheckCircle2 }
    ];

    return (
        <div className="grid gap-2 md:grid-cols-5">
            {steps.map((step, index) => {
                const StepIcon = step.icon;
                const active = index + 1 <= current;
                return (
                    <div key={step.label} className={`rounded-lg border p-3 ${active ? 'border-[#E67E3C] bg-[#fff4ec]' : 'border-gray-100 bg-gray-50'}`}>
                        <StepIcon className={`h-4 w-4 ${active ? 'text-[#E67E3C]' : 'text-gray-400'}`} />
                        <p className={`mt-2 text-xs font-semibold ${active ? 'text-[#4a3428]' : 'text-gray-500'}`}>{step.label}</p>
                    </div>
                );
            })}
        </div>
    );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{value}</p>
        </div>
    );
}
