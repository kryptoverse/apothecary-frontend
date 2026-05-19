'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, RefreshCcw, Search, Stethoscope } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Avatar, Button, Modal } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { getSession, hasRole } from '@/lib/auth';

type Patient = {
    patient_id: string;
    email?: string;
    name: string;
    account_status?: string;
    tier?: string;
    doctor_id?: string | null;
    doctor_name?: string;
    doctor_email?: string;
    care_status: string;
    illness_description?: string;
    latest_request?: {
        care_request_id: string;
        status: string;
        urgency: string;
        reason: string;
        created_at: string;
    } | null;
    created_at: string;
    updated_at: string;
};

type PatientsResponse = {
    patients: Patient[];
    pagination: { total: number; page: number; limit: number; total_pages: number; has_next: boolean; has_prev: boolean };
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

type CareRequest = {
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    patient_email?: string;
    doctor_id?: string | null;
    doctor_name?: string;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    triage_notes?: string;
    status: string;
    created_at: string;
};

type CareRequestsResponse = {
    care_requests: CareRequest[];
};

const careStyle: Record<string, string> = {
    needs_care: 'bg-amber-100 text-amber-800',
    assigned: 'bg-green-100 text-green-700',
    in_treatment: 'bg-blue-100 text-blue-700',
    treated: 'bg-gray-100 text-gray-600',
    inactive: 'bg-gray-100 text-gray-500',
};

const requestStyle: Record<string, string> = {
    new_request: 'bg-amber-100 text-amber-800',
    triage_in_progress: 'bg-blue-100 text-blue-700',
    pending_assignment: 'bg-purple-100 text-purple-700',
    assigned: 'bg-green-100 text-green-700',
    in_treatment: 'bg-blue-100 text-blue-700',
    patient_requested_closure: 'bg-orange-100 text-orange-700',
};

function label(value?: string) {
    return (value || '-').replace(/_/g, ' ');
}

export default function AdminPatientsPage() {
    const router = useRouter();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [requests, setRequests] = useState<CareRequest[]>([]);
    const [stats, setStats] = useState<PatientStats | null>(null);
    const [search, setSearch] = useState('');
    const [careStatus, setCareStatus] = useState('all');
    const [assigned, setAssigned] = useState('all');
    const [requestStatus, setRequestStatus] = useState('open');
    const [isLoading, setIsLoading] = useState(true);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [triageTarget, setTriageTarget] = useState<CareRequest | null>(null);
    const [triageStatus, setTriageStatus] = useState<'triage_in_progress' | 'pending_assignment' | 'cancelled'>('triage_in_progress');
    const [triageNotes, setTriageNotes] = useState('');
    const [isSavingTriage, setIsSavingTriage] = useState(false);

    useEffect(() => {
        if (!hasRole('admin')) {
            router.push('/auth/login');
            return;
        }

        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const loadData = async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setIsLoading(true);
        setNotice(null);

        try {
            const patientParams = new URLSearchParams({
                page: '1',
                limit: '200',
                care_status: careStatus,
            });
            if (search.trim()) patientParams.set('search', search.trim());
            if (assigned !== 'all') patientParams.set('assigned', assigned === 'assigned' ? 'true' : 'false');

            const requestParams = new URLSearchParams({
                page: '1',
                limit: '100',
                status: requestStatus,
            });
            if (search.trim()) requestParams.set('search', search.trim());

            const [statsRes, patientRes, requestRes] = await Promise.all([
                apiRequest<PatientStats>('/admin/patients/stats', { token: session.access_token }),
                apiRequest<PatientsResponse>(`/admin/patients?${patientParams.toString()}`, { token: session.access_token }),
                apiRequest<CareRequestsResponse>(`/admin/care-requests?${requestParams.toString()}`, { token: session.access_token }),
            ]);

            setStats(statsRes.data || null);
            setPatients(patientRes.data?.patients || []);
            setRequests(requestRes.data?.care_requests || []);
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to load patients.' });
        } finally {
            setIsLoading(false);
        }
    };

    const openTriage = (request: CareRequest) => {
        setTriageTarget(request);
        setTriageStatus(request.status === 'pending_assignment' ? 'pending_assignment' : 'triage_in_progress');
        setTriageNotes(request.triage_notes || '');
    };

    const saveTriage = async (event: React.FormEvent) => {
        event.preventDefault();
        const session = getSession();
        if (!session || !triageTarget) return;

        setIsSavingTriage(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/admin/care-requests/${triageTarget.care_request_id}/triage`, {
                method: 'PATCH',
                token: session.access_token,
                body: JSON.stringify({
                    status: triageStatus,
                    triage_notes: triageNotes.trim(),
                }),
            });

            setNotice({ type: 'success', message: response.data?.message || 'Care request updated.' });
            setTriageTarget(null);
            await loadData();
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update care request.' });
        } finally {
            setIsSavingTriage(false);
        }
    };

    const statCards = useMemo(() => [
        { label: 'Patients', value: stats?.total_patients ?? 0 },
        { label: 'Needs Care', value: stats?.needs_care ?? 0, tone: 'amber' as const },
        { label: 'Open Requests', value: stats?.open_requests ?? 0, tone: 'blue' as const },
        { label: 'Closure Requests', value: stats?.closure_requests ?? 0, tone: 'orange' as const },
    ], [stats]);

    return (
        <DashboardLayout role="admin">
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Patient Management</h2>
                        <p className="text-gray-600">Track patients, care requests, triage, assignments, and closure requests.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" size="sm" onClick={loadData} leftIcon={<RefreshCcw className="h-4 w-4" />}>Refresh</Button>
                        <Button size="sm" onClick={() => router.push('/dashboard/admin/patient-assignments')} leftIcon={<Stethoscope className="h-4 w-4" />}>Assign Patients</Button>
                    </div>
                </div>

                {notice && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {notice.message}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {statCards.map(card => <Stat key={card.label} label={card.label} value={isLoading ? '...' : card.value} tone={card.tone} />)}
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') void loadData(); }}
                                placeholder="Search patient, email, illness..."
                                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            />
                        </div>
                        <select value={careStatus} onChange={event => setCareStatus(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                            <option value="all">All care</option>
                            <option value="needs_care">Needs care</option>
                            <option value="assigned">Assigned</option>
                            <option value="in_treatment">In treatment</option>
                            <option value="treated">Treated</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <select value={assigned} onChange={event => setAssigned(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                            <option value="all">All assignment</option>
                            <option value="assigned">Assigned</option>
                            <option value="unassigned">Unassigned</option>
                        </select>
                        <Button size="sm" onClick={loadData} leftIcon={<Search className="h-4 w-4" />}>Apply</Button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Patient</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Care</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Doctor</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Latest Request</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Loading patients...</td></tr>}
                                {!isLoading && patients.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">No patients found.</td></tr>}
                                {!isLoading && patients.map(patient => (
                                    <tr key={patient.patient_id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={patient.name || patient.email || 'Patient'} />
                                                <div>
                                                    <p className="font-medium text-[#4a3428]">{patient.name}</p>
                                                    <p className="text-sm text-gray-600">{patient.email}</p>
                                                    {patient.illness_description && <p className="mt-1 max-w-sm text-xs text-gray-500">{patient.illness_description}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${careStyle[patient.care_status] || 'bg-gray-100 text-gray-600'}`}>
                                                {label(patient.care_status)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">
                                            {patient.doctor_id ? patient.doctor_name || patient.doctor_email || 'Assigned' : 'Unassigned'}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">
                                            {patient.latest_request ? (
                                                <div>
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${requestStyle[patient.latest_request.status] || 'bg-gray-100 text-gray-600'}`}>
                                                        {label(patient.latest_request.status)}
                                                    </span>
                                                    <p className="mt-1 max-w-xs truncate">{patient.latest_request.reason}</p>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-600">{new Date(patient.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-[#4a3428]">Care Request Queue</h3>
                            <p className="text-sm text-gray-500">Triage patient requests before assignment or closure.</p>
                        </div>
                        <select value={requestStatus} onChange={event => setRequestStatus(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                            <option value="open">Open</option>
                            <option value="new_request">New</option>
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
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <ClipboardList className="h-4 w-4 text-[#E67E3C]" />
                                            <p className="font-semibold text-[#4a3428]">{request.patient_name}</p>
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${requestStyle[request.status] || 'bg-gray-100 text-gray-600'}`}>{label(request.status)}</span>
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold capitalize text-gray-600">{request.urgency}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-gray-600">{request.reason}</p>
                                        {request.triage_notes && <p className="mt-2 text-xs text-gray-500">Triage: {request.triage_notes}</p>}
                                    </div>
                                    <Button size="sm" variant="outline" onClick={() => openTriage(request)}>Triage</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Modal isOpen={Boolean(triageTarget)} onClose={() => setTriageTarget(null)} title="Triage Care Request" size="lg">
                {triageTarget && (
                    <form onSubmit={saveTriage} className="space-y-5 p-6">
                        <div className="rounded-xl bg-gray-50 px-4 py-3">
                            <p className="font-semibold text-[#4a3428]">{triageTarget.patient_name}</p>
                            <p className="text-sm text-gray-600">{triageTarget.reason}</p>
                        </div>
                        <div>
                            <label htmlFor="triageStatus" className="mb-2 block text-sm font-medium text-gray-700">Status</label>
                            <select id="triageStatus" value={triageStatus} onChange={event => setTriageStatus(event.target.value as typeof triageStatus)} className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#E67E3C]">
                                <option value="triage_in_progress">Triage in progress</option>
                                <option value="pending_assignment">Ready for assignment</option>
                                <option value="cancelled">Cancel request</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="triageNotes" className="mb-2 block text-sm font-medium text-gray-700">Triage Notes</label>
                            <textarea id="triageNotes" rows={5} value={triageNotes} onChange={event => setTriageNotes(event.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#E67E3C]" />
                        </div>
                        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                            <Button type="button" variant="secondary" onClick={() => setTriageTarget(null)} disabled={isSavingTriage}>Cancel</Button>
                            <Button type="submit" isLoading={isSavingTriage}>Save Triage</Button>
                        </div>
                    </form>
                )}
            </Modal>
        </DashboardLayout>
    );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'amber' | 'blue' | 'orange' }) {
    const color = tone === 'amber' ? 'text-amber-600' : tone === 'blue' ? 'text-blue-600' : tone === 'orange' ? 'text-orange-600' : 'text-[#4a3428]';
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="mb-1 text-sm text-gray-600">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
    );
}
