'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { getSession, hasRole } from '@/lib/auth';
import { apiRequest } from '@/lib/api';
import { Button, Input, Select, Textarea, Badge, Modal } from '@/components/ui';
import { ClipboardList, Stethoscope, Clock, ShieldAlert, HeartHandshake, CheckCircle } from 'lucide-react';

type CareRequest = {
    care_request_id: string;
    patient_id: string;
    patient_name: string;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    triage_notes?: string;
    status: string;
    created_at: string;
};

type CareRequestsResponse = {
    care_requests: CareRequest[];
};

const urgencyStyles: Record<string, string> = {
    low: 'bg-blue-50 text-blue-700 border-blue-200',
    normal: 'bg-green-50 text-green-700 border-green-200',
    high: 'bg-red-50 text-red-700 border-red-200',
};

const statusStyles: Record<string, string> = {
    new_request: 'bg-amber-100 text-amber-800',
    triage_in_progress: 'bg-blue-100 text-blue-800',
    pending_assignment: 'bg-purple-100 text-purple-800',
    assigned: 'bg-emerald-100 text-emerald-800',
    in_treatment: 'bg-indigo-100 text-indigo-800',
    patient_requested_closure: 'bg-orange-100 text-orange-855',
    closed: 'bg-gray-100 text-gray-800',
};

function formatStatus(status?: string) {
    return (status || '-').replace(/_/g, ' ');
}

export default function PatientCareRequestsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [requests, setRequests] = useState<CareRequest[]>([]);
    const [profile, setProfile] = useState<any>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    // Modal states
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isClosureOpen, setIsClosureOpen] = useState(false);

    // Form inputs
    const [formData, setFormData] = useState({
        reason: '',
        urgency: 'normal' as 'low' | 'normal' | 'high',
        preferred_specialty: '',
        preferred_doctor_gender: 'any' as 'male' | 'female' | 'any',
        availability: '',
        patient_notes: '',
    });

    const loadData = async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        try {
            const [profileRes, requestsRes] = await Promise.all([
                apiRequest<any>('/patient/profile', { token: session.access_token }),
                apiRequest<CareRequestsResponse>('/patient/care-requests', { token: session.access_token })
            ]);

            if (profileRes.data) setProfile(profileRes.data);
            if (requestsRes.data?.care_requests) {
                setRequests(requestsRes.data.care_requests);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load care requests.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!hasRole('patient')) {
            router.push('/auth/login');
            return;
        }

        loadData();
    }, [router]);

    const handleCreateRequest = async (e: React.FormEvent) => {
        e.preventDefault();
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
                    patient_notes: formData.patient_notes.trim() || undefined,
                })
            });

            setSuccess('Care request submitted successfully. Our medical staff will triage it soon.');
            setIsCreateOpen(false);
            
            // Reset form
            setFormData({
                reason: '',
                urgency: 'normal',
                preferred_specialty: '',
                preferred_doctor_gender: 'any',
                availability: '',
                patient_notes: '',
            });

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
                token: session.access_token,
            });

            setSuccess('Your request for care closure has been submitted.');
            setIsClosureOpen(false);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to request care closure.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <DashboardLayout role="patient">
                <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Loading care requests...</p>
                </div>
            </DashboardLayout>
        );
    }

    const careStatus = profile?.patient?.care_status || 'inactive';
    const activeRequest = requests.find(r => r.status !== 'closed' && r.status !== 'cancelled');

    return (
        <DashboardLayout role="patient">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header Section */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Care Requests & Episode History</h2>
                        <p className="text-gray-600">Request clinical care, track active requests, and manage your treatment episodes.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button 
                            onClick={() => setIsCreateOpen(true)}
                            leftIcon={<Stethoscope className="h-4 w-4" />}
                            disabled={careStatus === 'needs_care' || careStatus === 'assigned' || careStatus === 'in_treatment'}
                        >
                            New Care Request
                        </Button>
                        {(careStatus === 'needs_care' || careStatus === 'assigned' || careStatus === 'in_treatment') && (
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
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                        {success}
                    </div>
                )}

                {/* Dashboard Stats / Info cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-2xl shadow-sm p-6 flex items-start gap-4 border border-gray-100">
                        <div className="p-3 bg-[#fef3e8] rounded-xl text-[#E67E3C]">
                            <HeartHandshake className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Care Status</p>
                            <h4 className="text-xl font-bold text-[#4a3428] mt-1 capitalize">{formatStatus(careStatus)}</h4>
                            <p className="text-xs text-gray-500 mt-2">
                                {careStatus === 'needs_care' && 'Triage and doctor matching in progress.'}
                                {careStatus === 'assigned' && 'Doctor assigned. Ready for treatment.'}
                                {careStatus === 'in_treatment' && 'You are actively receiving care.'}
                                {careStatus === 'treated' && 'Successfully completed treatment episode.'}
                                {careStatus === 'inactive' && 'No active care request or assignment.'}
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm p-6 flex items-start gap-4 border border-gray-100">
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                            <Clock className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Active Requests</p>
                            <h4 className="text-xl font-bold text-[#4a3428] mt-1">
                                {activeRequest ? 1 : 0}
                            </h4>
                            {activeRequest ? (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xxs font-semibold capitalize ${statusStyles[activeRequest.status]}`}>
                                        {formatStatus(activeRequest.status)}
                                    </span>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 mt-2">No pending requests under triage.</p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm p-6 flex items-start gap-4 border border-gray-100">
                        <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                            <ClipboardList className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total History</p>
                            <h4 className="text-xl font-bold text-[#4a3428] mt-1">{requests.length} Requests</h4>
                            <p className="text-xs text-gray-500 mt-2">Total care request history on platform.</p>
                        </div>
                    </div>
                </div>

                {/* History list */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-[#4a3428] mb-4">Request History</h3>
                    
                    {requests.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <p className="text-gray-500">You have no care request history yet.</p>
                            <p className="text-xs text-gray-400 mt-1">Click "New Care Request" above to start your journey.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-200 text-sm font-semibold text-gray-600">
                                        <th className="py-3 px-4">Date</th>
                                        <th className="py-3 px-4">Reason / Concern</th>
                                        <th className="py-3 px-4">Urgency</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4">Clinical Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {requests.map((request) => (
                                        <tr key={request.care_request_id} className="hover:bg-gray-50/50">
                                            <td className="py-4 px-4 text-gray-500 whitespace-nowrap">
                                                {new Date(request.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="py-4 px-4 font-medium text-[#4a3428] max-w-xs md:max-w-md truncate" title={request.reason}>
                                                {request.reason}
                                            </td>
                                            <td className="py-4 px-4 whitespace-nowrap">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${urgencyStyles[request.urgency] || 'bg-gray-100 text-gray-600'}`}>
                                                    {request.urgency}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 whitespace-nowrap">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusStyles[request.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {formatStatus(request.status)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-gray-500 max-w-xs truncate" title={request.triage_notes}>
                                                {request.triage_notes || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Care Request Modal */}
            <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Request Clinical Care" size="lg">
                <form onSubmit={handleCreateRequest} className="p-6 space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="reason" className="text-sm font-medium text-gray-700">What do you need help with? <span className="text-red-500">*</span></label>
                        <Textarea 
                            id="reason"
                            required
                            rows={3}
                            placeholder="Please describe your symptoms, concern, or reason for requesting care in detail."
                            value={formData.reason}
                            onChange={(e) => setFormData({...formData, reason: e.target.value})}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="urgency" className="text-sm font-medium text-gray-700">Urgency Level</label>
                            <Select 
                                id="urgency"
                                value={formData.urgency}
                                onChange={(e) => setFormData({...formData, urgency: e.target.value as any})}
                            >
                                <option value="low">Low (Non-urgent/Routine)</option>
                                <option value="normal">Normal (Standard Care)</option>
                                <option value="high">High (Needs Prompt Review)</option>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="preferred_doctor_gender" className="text-sm font-medium text-gray-700">Preferred Doctor Gender</label>
                            <Select 
                                id="preferred_doctor_gender"
                                value={formData.preferred_doctor_gender}
                                onChange={(e) => setFormData({...formData, preferred_doctor_gender: e.target.value as any})}
                            >
                                <option value="any">No Preference</option>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="preferred_specialty" className="text-sm font-medium text-gray-700">Preferred Medical Specialty (Optional)</label>
                        <Input 
                            id="preferred_specialty"
                            type="text"
                            placeholder="e.g. Cardiology, Psychiatry, General Practitioner"
                            value={formData.preferred_specialty}
                            onChange={(e) => setFormData({...formData, preferred_specialty: e.target.value})}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="availability" className="text-sm font-medium text-gray-700">Preferred Booking Times / Availability (Optional)</label>
                        <Textarea 
                            id="availability"
                            rows={2}
                            placeholder="e.g. Weekday mornings, Thursday afternoons"
                            value={formData.availability}
                            onChange={(e) => setFormData({...formData, availability: e.target.value})}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="patient_notes" className="text-sm font-medium text-gray-700">Additional Notes for Clinical Staff (Optional)</label>
                        <Textarea 
                            id="patient_notes"
                            rows={2}
                            placeholder="Any other details you would like the triaging doctor/assistant to know."
                            value={formData.patient_notes}
                            onChange={(e) => setFormData({...formData, patient_notes: e.target.value})}
                        />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-gray-200 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="submit" isLoading={isSaving}>
                            Submit Care Request
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Request Closure Confirmation Modal */}
            <Modal isOpen={isClosureOpen} onClose={() => setIsClosureOpen(false)} title="Confirm Care Closure" size="md">
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3 text-amber-600 bg-amber-50 p-4 rounded-xl">
                        <ShieldAlert className="h-6 w-6 flex-shrink-0" />
                        <p className="text-sm font-semibold">Are you sure you want to request care closure?</p>
                    </div>
                    <p className="text-sm text-gray-600">
                        This will notify the clinical team that you no longer require treatment. Your status will be updated, and any active care assignment will be closed.
                    </p>
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-gray-200 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsClosureOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleRequestClosure} isLoading={isSaving}>
                            Confirm Closure
                        </Button>
                    </div>
                </div>
            </Modal>

        </DashboardLayout>
    );
}
