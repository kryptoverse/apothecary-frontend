'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiRequest } from '@/lib/api';
import { getSession, hasRole } from '@/lib/auth';
import { Button, Input, Select, Textarea, Badge, Modal } from '@/components/ui';
import { 
    ClipboardList, 
    Stethoscope, 
    Clock, 
    ShieldAlert, 
    UserCheck, 
    RefreshCcw, 
    Search,
    MessageSquare,
    AlertCircle
} from 'lucide-react';

type CareRequest = {
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    patient_email: string;
    doctor_id: string | null;
    doctor_name: string | null;
    doctor_email: string | null;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    preferred_specialty?: string;
    preferred_doctor_gender?: 'male' | 'female' | 'any';
    availability?: string;
    patient_notes?: string;
    triage_notes?: string;
    status: 'new_request' | 'triage_in_progress' | 'pending_assignment' | 'assigned' | 'in_treatment' | 'patient_requested_closure';
    created_at: string;
    updated_at: string;
};

type CareRequestsResponse = {
    care_requests: CareRequest[];
};

type AssistantDoctor = {
    doctor_id: string;
    email: string;
    status: string;
    specialty?: string;
    name: string;
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
    high: 'bg-red-50 text-red-700 border-red-200',
};

const statusStyles: Record<string, string> = {
    new_request: 'bg-amber-100 text-amber-800 border-amber-200',
    triage_in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    pending_assignment: 'bg-purple-100 text-purple-800 border-purple-200',
    assigned: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    in_treatment: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    patient_requested_closure: 'bg-orange-100 text-orange-850 border-orange-200',
};

function formatStatus(status?: string) {
    return (status || '-').replace(/_/g, ' ');
}

export default function AssistantCareRequestsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [requests, setRequests] = useState<CareRequest[]>([]);
    const [doctors, setDoctors] = useState<AssistantDoctor[]>([]);
    const [permissions, setPermissions] = useState<any>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    // Filters & Search
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [urgencyFilter, setUrgencyFilter] = useState('all');

    // Modals
    const [selectedRequest, setSelectedRequest] = useState<CareRequest | null>(null);
    const [assignTarget, setAssignTarget] = useState<CareRequest | null>(null);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    
    // Triage edit form state
    const [triageForm, setTriageForm] = useState({
        status: 'triage_in_progress' as any,
        triage_notes: '',
    });

    const loadData = async (silent = false) => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        if (!silent) setIsLoading(true);
        setError('');

        try {
            const [profileRes, doctorsRes, requestsRes] = await Promise.all([
                apiRequest<AssistantMeResponse>('/assistant/me', { token: session.access_token }),
                apiRequest<{ Doctors: AssistantDoctor[] }>('/assistant/doctors', { token: session.access_token }),
                apiRequest<CareRequestsResponse>('/assistant/care-requests?status=open', { token: session.access_token })
            ]);

            if (profileRes.data?.Assistant) {
                setPermissions(profileRes.data.Assistant.permissions);
            }
            if (doctorsRes.data?.Doctors) {
                setDoctors(doctorsRes.data.Doctors.filter(d => d.status === 'active'));
            }
            if (requestsRes.data?.care_requests) {
                setRequests(requestsRes.data.care_requests);
            }
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

        loadData();
    }, [router]);

    // Handle Triage Update Submit
    const handleTriageSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRequest) return;

        setError('');
        setSuccess('');
        setIsSaving(true);

        const session = getSession();
        if (!session) return;

        try {
            await apiRequest(`/assistant/care-requests/${selectedRequest.care_request_id}/triage`, {
                method: 'PATCH',
                token: session.access_token,
                body: JSON.stringify({
                    status: triageForm.status,
                    triage_notes: triageForm.triage_notes.trim() || undefined,
                })
            });

            setSuccess('Triage status updated successfully.');
            setSelectedRequest(null);
            await loadData(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update triage notes.');
        } finally {
            setIsSaving(false);
        }
    };

    // Handle Doctor Assignment Submit
    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignTarget || !selectedDoctorId) return;

        setError('');
        setSuccess('');
        setIsSaving(true);

        const session = getSession();
        if (!session) return;

        try {
            await apiRequest(`/assistant/patients/${assignTarget.patient_id}/assign-doctor`, {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    doctor_id: selectedDoctorId,
                    force: true, // Assistant reassign confirmation is forced here to allow updating triage assignments
                })
            });

            setSuccess(`Successfully assigned patient to the selected Doctor.`);
            setAssignTarget(null);
            setSelectedDoctorId('');
            await loadData(true);
        } catch (err) {
            // Check for conflict (e.g. 409 already assigned or modified by someone else)
            if (err instanceof Error && (err.message.includes('already assigned') || err.message.includes('Conflict'))) {
                setError('This care request was already triaged or assigned by another staff member. Reloading queue...');
                setAssignTarget(null);
                setSelectedDoctorId('');
                await loadData(true);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to save doctor assignment.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const openTriageModal = (req: CareRequest) => {
        setSelectedRequest(req);
        setTriageForm({
            status: req.status === 'new_request' ? 'triage_in_progress' : req.status,
            triage_notes: req.triage_notes || '',
        });
    };

    // Filter requests
    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            const matchesSearch = !search.trim() || 
                req.patient_name.toLowerCase().includes(search.toLowerCase()) || 
                req.patient_email.toLowerCase().includes(search.toLowerCase()) || 
                req.reason.toLowerCase().includes(search.toLowerCase());
            
            const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
            const matchesUrgency = urgencyFilter === 'all' || req.urgency === urgencyFilter;

            return matchesSearch && matchesStatus && matchesUrgency;
        });
    }, [requests, search, statusFilter, urgencyFilter]);

    // Stats
    const stats = useMemo(() => {
        return {
            open: requests.length,
            inProgress: requests.filter(r => r.status === 'triage_in_progress').length,
            pendingAssign: requests.filter(r => r.status === 'pending_assignment').length,
        };
    }, [requests]);

    if (isLoading) {
        return (
            <DashboardLayout role="doctor">
                <div className="flex items-center justify-center h-full min-h-[300px]">
                    <p className="text-gray-500">Loading clinical triage queue...</p>
                </div>
            </DashboardLayout>
        );
    }

    const canAssign = permissions?.can_assign_patients || false;

    return (
        <DashboardLayout role="doctor">
            <div className="space-y-6">
                
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Clinical Care Triage Queue</h2>
                        <p className="text-gray-600">Review symptoms, triage care requests, and assign patients to matching Doctors.</p>
                    </div>
                    <Button variant="outline" onClick={() => loadData(true)} leftIcon={<RefreshCcw className="h-4 w-4" />}>
                        Refresh List
                    </Button>
                </div>

                {/* Notifications & Warnings */}
                {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        {success}
                    </div>
                )}

                {/* Chat module notification helper */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-blue-800 flex items-start gap-3">
                    <MessageSquare className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold">Future Chat Integration:</span> When chat is added, starting a conversation with a patient will mark them as "Triage in Progress". Other assistants will instantly see this to avoid double-contacting.
                    </div>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Open Care Requests</p>
                        <h4 className="text-2xl font-bold text-[#4a3428] mt-1">{stats.open}</h4>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Triage In Progress</p>
                        <h4 className="text-2xl font-bold text-blue-600 mt-1">{stats.inProgress}</h4>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Pending Assignment</p>
                        <h4 className="text-2xl font-bold text-purple-600 mt-1">{stats.pendingAssign}</h4>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Triage Access</p>
                        <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${canAssign ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {canAssign ? 'Assigning Enabled' : 'View Only'}
                        </span>
                    </div>
                </div>

                {/* Main Queue & Filtering */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="relative w-full md:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name, email or reason..."
                                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            >
                                <option value="all">All Statuses</option>
                                <option value="new_request">New Requests</option>
                                <option value="triage_in_progress">Triage In Progress</option>
                                <option value="pending_assignment">Pending Assignment</option>
                                <option value="assigned">Assigned</option>
                            </select>
                            <select
                                value={urgencyFilter}
                                onChange={(e) => setUrgencyFilter(e.target.value)}
                                className="rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            >
                                <option value="all">All Urgency</option>
                                <option value="low">Low</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 text-sm font-semibold text-gray-600">
                                    <th className="py-3 px-4">Patient</th>
                                    <th className="py-3 px-4">Urgency</th>
                                    <th className="py-3 px-4">Requested Preference</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Submitted</th>
                                    <th className="py-3 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-gray-500">
                                            No care requests found in the current queue view.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRequests.map((req) => (
                                        <tr key={req.care_request_id} className="hover:bg-gray-50/50">
                                            <td className="py-4 px-4">
                                                <div>
                                                    <p className="font-semibold text-[#4a3428]">{req.patient_name}</p>
                                                    <p className="text-xs text-gray-500">{req.patient_email}</p>
                                                    <p className="text-xs text-gray-600 mt-1 max-w-xs truncate" title={req.reason}>
                                                        {req.reason}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 whitespace-nowrap">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${urgencyStyles[req.urgency] || 'bg-gray-100'}`}>
                                                    {req.urgency}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-xs text-gray-600 space-y-0.5">
                                                    {req.preferred_specialty && <p>Spec: <span className="font-semibold">{req.preferred_specialty}</span></p>}
                                                    {req.preferred_doctor_gender && req.preferred_doctor_gender !== 'any' && (
                                                        <p>Gender: <span className="font-semibold capitalize">{req.preferred_doctor_gender}</span></p>
                                                    )}
                                                    {req.availability && <p className="truncate max-w-xs">Time: {req.availability}</p>}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 whitespace-nowrap">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize border ${statusStyles[req.status] || 'bg-gray-100'}`}>
                                                        {formatStatus(req.status)}
                                                    </span>
                                                    {req.status === 'triage_in_progress' && (
                                                        <span className="text-[10px] text-blue-600 flex items-center gap-1 font-medium">
                                                            <AlertCircle className="h-3 w-3" /> Being actively reviewed
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-gray-500 whitespace-nowrap">
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                                                <Button size="sm" variant="secondary" onClick={() => openTriageModal(req)}>
                                                    Triage / Notes
                                                </Button>
                                                {canAssign && (
                                                    <Button size="sm" onClick={() => { setAssignTarget(req); setSelectedDoctorId(''); }}>
                                                        Assign Doctor
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Triage / Update Notes Modal */}
            <Modal isOpen={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)} title="Triage Care Request" size="lg">
                {selectedRequest && (
                    <form onSubmit={handleTriageSubmit} className="p-6 space-y-4">
                        {selectedRequest.status === 'triage_in_progress' && (
                            <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-xl text-sm">
                                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-semibold">Active Triage Alert:</span> This care request is currently flagged as <strong>Triage In Progress</strong>. If another assistant has initiated work or started communications, check internal notes to avoid overlap.
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                            <div className="flex justify-between">
                                <p className="font-bold text-[#4a3428]">{selectedRequest.patient_name}</p>
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${urgencyStyles[selectedRequest.urgency]}`}>
                                    {selectedRequest.urgency} Urgency
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">{selectedRequest.patient_email}</p>
                            <div className="border-t border-gray-200/60 pt-2 mt-2">
                                <p className="text-xs font-semibold text-gray-500">Patient Symptom Reason:</p>
                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{selectedRequest.reason}</p>
                            </div>
                            {selectedRequest.patient_notes && (
                                <div className="pt-2">
                                    <p className="text-xs font-semibold text-gray-500">Additional Patient Notes:</p>
                                    <p className="text-sm text-gray-600 mt-1">{selectedRequest.patient_notes}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="triage_status" className="text-sm font-medium text-gray-700">Triage Status</label>
                            <Select 
                                id="triage_status"
                                value={triageForm.status}
                                onChange={(e) => setTriageForm({...triageForm, status: e.target.value as any})}
                                options={[
                                    { value: 'triage_in_progress', label: 'Triage In Progress (Active Review)' },
                                    { value: 'pending_assignment', label: 'Pending Assignment (Ready for Match)' },
                                ]}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="triage_notes" className="text-sm font-medium text-gray-700">Internal Clinical Triage Notes</label>
                            <Textarea 
                                id="triage_notes"
                                rows={4}
                                placeholder="Add comments regarding symptoms, matching suggestions, or triage communications."
                                value={triageForm.triage_notes}
                                onChange={(e) => setTriageForm({...triageForm, triage_notes: e.target.value})}
                            />
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-gray-200 pt-4">
                            <Button type="button" variant="secondary" onClick={() => setSelectedRequest(null)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" isLoading={isSaving}>
                                Save Triage State
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Doctor Assignment Modal */}
            <Modal isOpen={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title="Assign Patient to Doctor" size="md">
                {assignTarget && (
                    <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <p className="font-bold text-[#4a3428]">{assignTarget.patient_name}</p>
                            <p className="text-xs text-gray-500">{assignTarget.patient_email}</p>
                            {assignTarget.preferred_specialty && (
                                <p className="text-xs text-gray-600 mt-2">
                                    Preferred Specialty: <span className="font-semibold">{assignTarget.preferred_specialty}</span>
                                </p>
                            )}
                            {assignTarget.preferred_doctor_gender && assignTarget.preferred_doctor_gender !== 'any' && (
                                <p className="text-xs text-gray-600 mt-0.5">
                                    Preferred Doctor Gender: <span className="font-semibold capitalize">{assignTarget.preferred_doctor_gender}</span>
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="doctor_id" className="text-sm font-medium text-gray-700">Select Doctor</label>
                            <Select 
                                id="doctor_id"
                                required
                                value={selectedDoctorId}
                                onChange={(e) => setSelectedDoctorId(e.target.value)}
                                options={[
                                    { value: '', label: 'Choose a Doctor...' },
                                    ...doctors.map(d => ({
                                        value: d.doctor_id,
                                        label: `${d.name} (${d.specialty || 'General Practice'})`
                                    }))
                                ]}
                            />
                        </div>

                        {doctors.length === 0 && (
                            <p className="text-xs text-red-500">
                                There are no active Doctors assigned to your assistant profile. Please contact an admin to assign doctors.
                            </p>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-gray-200 pt-4">
                            <Button type="button" variant="secondary" onClick={() => setAssignTarget(null)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" isLoading={isSaving} disabled={!selectedDoctorId || doctors.length === 0}>
                                Assign Doctor
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

        </DashboardLayout>
    );
}
