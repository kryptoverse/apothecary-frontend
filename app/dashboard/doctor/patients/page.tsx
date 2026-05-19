'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MailPlus, RefreshCcw, Search, Stethoscope, UserCheck } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Avatar, Badge, Button, Modal } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { getSession, hasRole } from '@/lib/auth';

type PatientInvite = {
    invite_id: string;
    email: string;
    doctor_id?: string;
    patient_id?: string;
    status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
    expires_at: string;
    used_at?: string;
    declined_at?: string;
    created_at: string;
    is_expired: boolean;
    care_status?: string;
    illness_description?: string;
    doctor_assigned_at?: string;
};

type PatientInviteResponse = {
    invites: PatientInvite[];
    total: number;
};

type AssistantPatientResponse = {
    patients: Array<{
        patient_id: string;
        name: string;
        email: string;
        status: string;
        tier: string;
        created_at: string;
        updated_at: string;
        care_status?: string;
        illness_description?: string;
        doctor_assigned_at?: string;
    }>;
    total: number;
};

type DoctorPatientResponse = {
    patients: Array<{
        patient_id: string;
        name: string;
        email: string;
        status: string;
        tier: string;
        care_status?: string;
        illness_description?: string;
        doctor_assigned_at?: string;
        created_at: string;
        updated_at: string;
    }>;
    total: number;
};

type AssistantDoctor = {
    doctor_id: string;
    email: string;
    status: string;
    specialty?: string;
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

const inviteStatusStyles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    revoked: 'bg-gray-100 text-gray-700',
    expired: 'bg-gray-100 text-gray-500',
};

function formatNameFromEmail(email: string) {
    const local = email.split('@')[0] || email;
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export default function DoctorPatients() {
    const router = useRouter();
    const [invites, setInvites] = useState<PatientInvite[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [form, setForm] = useState({
        email: '',
        note: '',
    });
    const [isAssistantAccount, setIsAssistantAccount] = useState(false);
    const [isDoctorAccount, setIsDoctorAccount] = useState(false);
    const [canAssignPatients, setCanAssignPatients] = useState(false);
    const [assistantDoctors, setAssistantDoctors] = useState<AssistantDoctor[]>([]);
    const [assignTarget, setAssignTarget] = useState<PatientInvite | null>(null);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [forceReassign, setForceReassign] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [outcomeTarget, setOutcomeTarget] = useState<PatientInvite | null>(null);
    const [outcome, setOutcome] = useState<'completed' | 'follow_up_needed' | 'referred_out' | 'not_appropriate_for_platform'>('completed');
    const [doctorNotes, setDoctorNotes] = useState('');
    const [isSavingOutcome, setIsSavingOutcome] = useState(false);

    useEffect(() => {
        if (!hasRole('doctor')) {
            router.push('/auth/login');
            return;
        }

        loadInvites();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const loadInvites = async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setIsLoading(true);
        setNotice(null);

        try {
            if (session.user.role === 'assistant') {
                setIsAssistantAccount(true);
                setIsDoctorAccount(false);
                const [profileResponse, doctorsResponse, response] = await Promise.all([
                    apiRequest<AssistantMeResponse>('/assistant/me', { token: session.access_token }),
                    apiRequest<{ Doctors: AssistantDoctor[] }>('/assistant/doctors', { token: session.access_token }),
                    apiRequest<AssistantPatientResponse>('/assistant/patients', { token: session.access_token }),
                ]);

                setCanAssignPatients(Boolean(profileResponse.data?.Assistant.permissions.can_assign_patients));
                setAssistantDoctors((doctorsResponse.data?.Doctors || []).filter(doctor => doctor.status === 'active'));
                setInvites((response.data?.patients || []).map((patient) => ({
                    invite_id: patient.patient_id,
                    email: patient.email,
                    patient_id: patient.patient_id,
                    status: patient.status === 'active' ? 'accepted' : 'pending',
                    expires_at: patient.updated_at || patient.created_at,
                    created_at: patient.created_at,
                    is_expired: false,
                    care_status: patient.care_status,
                    illness_description: patient.illness_description,
                    doctor_assigned_at: patient.doctor_assigned_at,
                })));
                return;
            }

            setIsAssistantAccount(false);
            setIsDoctorAccount(true);
            const [patientsResponse, invitesResponse] = await Promise.all([
                apiRequest<DoctorPatientResponse>('/doctor/patients', { token: session.access_token }),
                apiRequest<PatientInviteResponse>('/doctor/patient-invites', { token: session.access_token }),
            ]);
            const assignedPatients = (patientsResponse.data?.patients || []).map((patient) => ({
                invite_id: patient.patient_id,
                email: patient.email,
                patient_id: patient.patient_id,
                status: patient.status === 'active' ? 'accepted' as const : 'pending' as const,
                expires_at: patient.updated_at || patient.created_at,
                created_at: patient.created_at,
                is_expired: false,
                care_status: patient.care_status,
                illness_description: patient.illness_description,
                doctor_assigned_at: patient.doctor_assigned_at,
            }));
            setInvites([...assignedPatients, ...(invitesResponse.data?.invites || [])]);
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to load patient invites.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const filteredInvites = useMemo(() => {
        return invites.filter((invite) => {
            const matchesSearch = !search.trim() || invite.email.toLowerCase().includes(search.trim().toLowerCase());
            const matchesStatus = statusFilter === 'all' || invite.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [invites, search, statusFilter]);

    const stats = useMemo(() => ({
        total: invites.length,
        pending: invites.filter((invite) => invite.status === 'pending').length,
        accepted: invites.filter((invite) => invite.status === 'accepted').length,
        expired: invites.filter((invite) => invite.status === 'expired' || invite.is_expired).length,
    }), [invites]);

    const sendInvite = async (event: React.FormEvent) => {
        event.preventDefault();
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setIsSending(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>('/doctor/patient-invites', {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    email: form.email.trim().toLowerCase(),
                    ...(form.note.trim() ? { note: form.note.trim() } : {}),
                }),
            });

            setNotice({
                type: 'success',
                message: response.data?.message || 'Patient invite sent successfully.',
            });
            setForm({ email: '', note: '' });
            setIsInviteOpen(false);
            await loadInvites();
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to send patient invite.',
            });
        } finally {
            setIsSending(false);
        }
    };

    const openAssign = (patient: PatientInvite) => {
        setAssignTarget(patient);
        setSelectedDoctorId(patient.doctor_id || '');
        setForceReassign(Boolean(patient.doctor_id));
    };

    const assignPatient = async (event: React.FormEvent) => {
        event.preventDefault();
        const session = getSession();
        if (!session || !assignTarget?.patient_id || !selectedDoctorId) {
            return;
        }

        setIsAssigning(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/assistant/patients/${assignTarget.patient_id}/assign-doctor`, {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({
                    doctor_id: selectedDoctorId,
                    force: forceReassign,
                }),
            });

            setNotice({
                type: 'success',
                message: response.data?.message || 'Patient assigned successfully.',
            });
            setAssignTarget(null);
            await loadInvites();
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to assign patient.',
            });
        } finally {
            setIsAssigning(false);
        }
    };

    const openOutcome = (patient: PatientInvite) => {
        setOutcomeTarget(patient);
        setOutcome('completed');
        setDoctorNotes('');
    };

    const saveOutcome = async (event: React.FormEvent) => {
        event.preventDefault();
        const session = getSession();
        if (!session || !outcomeTarget?.patient_id) {
            return;
        }

        setIsSavingOutcome(true);
        setNotice(null);

        try {
            const response = await apiRequest<{ message: string }>(`/doctor/patients/${outcomeTarget.patient_id}/treatment-outcome`, {
                method: 'PATCH',
                token: session.access_token,
                body: JSON.stringify({
                    outcome,
                    ...(doctorNotes.trim() ? { doctor_notes: doctorNotes.trim() } : {}),
                }),
            });

            setNotice({ type: 'success', message: response.data?.message || 'Treatment outcome saved.' });
            setOutcomeTarget(null);
            await loadInvites();
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to save treatment outcome.' });
        } finally {
            setIsSavingOutcome(false);
        }
    };

    return (
        <DashboardLayout role="doctor">
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">{isAssistantAccount ? 'Assigned Patients' : 'My Patients'}</h2>
                        <p className="text-gray-600">
                            {isAssistantAccount ? 'Patients visible through assigned Doctor relationships.' : 'Manage assigned patients and invitation status.'}
                        </p>
                    </div>
                    {isDoctorAccount && (
                        <Button
                            className="rounded-full"
                            onClick={() => setIsInviteOpen(true)}
                            leftIcon={<MailPlus className="h-5 w-5" />}
                        >
                            Invite Patient
                        </Button>
                    )}
                    {isAssistantAccount && canAssignPatients && (
                        <Button variant="outline" onClick={loadInvites} leftIcon={<UserCheck className="h-5 w-5" />}>
                            Assignment Enabled
                        </Button>
                    )}
                </div>

                {notice && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {notice.message}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                    <Stat label={isAssistantAccount ? 'Visible Patients' : 'Total Invites'} value={isLoading ? '...' : stats.total} />
                    <Stat label="Pending" value={isLoading ? '...' : stats.pending} tone="yellow" />
                    <Stat label={isAssistantAccount ? 'Active' : 'Accepted'} value={isLoading ? '...' : stats.accepted} tone="green" />
                    <Stat label="Expired" value={isLoading ? '...' : stats.expired} tone="gray" />
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="relative w-full md:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={isAssistantAccount ? 'Search patient email...' : 'Search invite email...'}
                                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            />
                        </div>
                        <div className="flex gap-3">
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                                className="rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="accepted">Accepted</option>
                                <option value="declined">Declined</option>
                                <option value="expired">Expired</option>
                            </select>
                            <Button variant="outline" size="sm" onClick={loadInvites} leftIcon={<RefreshCcw className="h-4 w-4" />}>
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Patient</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Status</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Sent</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Expires</th>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Completed</th>
                                    {isAssistantAccount && canAssignPatients && (
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Actions</th>
                                    )}
                                    {isDoctorAccount && (
                                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading && (
                                    <tr>
                                        <td colSpan={(isAssistantAccount && canAssignPatients) || isDoctorAccount ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                                            Loading patients...
                                        </td>
                                    </tr>
                                )}

                                {!isLoading && filteredInvites.length === 0 && (
                                    <tr>
                                        <td colSpan={(isAssistantAccount && canAssignPatients) || isDoctorAccount ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                                            No patients found.
                                        </td>
                                    </tr>
                                )}

                                {!isLoading && filteredInvites.map((invite) => (
                                    <tr key={invite.invite_id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={invite.email} />
                                                <div>
                                                    <p className="font-medium text-[#4a3428]">{formatNameFromEmail(invite.email)}</p>
                                                    <p className="text-sm text-gray-600">{invite.email}</p>
                                                    {isAssistantAccount && invite.illness_description && (
                                                        <p className="mt-1 max-w-sm text-xs text-gray-500">{invite.illness_description}</p>
                                                    )}
                                                    {isDoctorAccount && invite.illness_description && (
                                                        <p className="mt-1 max-w-sm text-xs text-gray-500">{invite.illness_description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${inviteStatusStyles[invite.status] || inviteStatusStyles.pending}`}>
                                                {invite.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-gray-600">{new Date(invite.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-4 text-gray-600">{new Date(invite.expires_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-4 text-gray-600">
                                            {invite.used_at ? new Date(invite.used_at).toLocaleDateString() : invite.declined_at ? new Date(invite.declined_at).toLocaleDateString() : '-'}
                                        </td>
                                        {isAssistantAccount && canAssignPatients && (
                                            <td className="px-4 py-4">
                                                <Button size="sm" variant="outline" onClick={() => openAssign(invite)} leftIcon={<UserCheck className="h-4 w-4" />}>
                                                    Assign
                                                </Button>
                                            </td>
                                        )}
                                        {isDoctorAccount && invite.patient_id && invite.care_status && (
                                            <td className="px-4 py-4">
                                                <Button size="sm" variant="outline" onClick={() => openOutcome(invite)} leftIcon={<Stethoscope className="h-4 w-4" />}>
                                                    Outcome
                                                </Button>
                                            </td>
                                        )}
                                        {isDoctorAccount && (!invite.patient_id || !invite.care_status) && (
                                            <td className="px-4 py-4 text-sm text-gray-400">Invite</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {!isAssistantAccount && <Modal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Invite Patient" size="lg">
                    <form onSubmit={sendInvite} className="space-y-5 p-6">
                        <div className="rounded-xl bg-[#fef3e8] px-4 py-3 text-sm text-gray-700">
                            The patient will receive a secure one-time invite link by email. New patients can complete registration from the link; existing patients can accept the invite inside the app.
                        </div>

                        <div>
                            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">Patient Email</label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={form.email}
                                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                                placeholder="patient@example.com"
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            />
                        </div>

                        <div>
                            <label htmlFor="note" className="mb-2 block text-sm font-medium text-gray-700">Message to Patient (optional)</label>
                            <textarea
                                id="note"
                                rows={4}
                                value={form.note}
                                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                                placeholder="Add a short note for the invitation email."
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                            />
                        </div>

                        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                            <Button type="button" variant="secondary" onClick={() => setIsInviteOpen(false)} disabled={isSending}>
                                Cancel
                            </Button>
                            <Button type="submit" isLoading={isSending} leftIcon={<MailPlus className="h-5 w-5" />}>
                                Send Invite
                            </Button>
                        </div>
                    </form>
                </Modal>}

                {isAssistantAccount && (
                    <Modal isOpen={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title="Assign Patient" size="lg">
                        {assignTarget && (
                            <form onSubmit={assignPatient} className="space-y-5 p-6">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                    <p className="font-semibold text-[#4a3428]">{formatNameFromEmail(assignTarget.email)}</p>
                                    <p className="text-sm text-gray-600">{assignTarget.email}</p>
                                    <p className="mt-2 text-sm text-gray-600">{assignTarget.illness_description || 'No illness details provided.'}</p>
                                </div>

                                <div>
                                    <label htmlFor="assistant_doctor_id" className="mb-2 block text-sm font-medium text-gray-700">Doctor</label>
                                    <select
                                        id="assistant_doctor_id"
                                        required
                                        value={selectedDoctorId}
                                        onChange={(event) => setSelectedDoctorId(event.target.value)}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                                    >
                                        <option value="">Select Doctor</option>
                                        {assistantDoctors.map((doctor) => (
                                            <option key={doctor.doctor_id} value={doctor.doctor_id}>
                                                {formatNameFromEmail(doctor.email)} - {doctor.specialty || 'General'}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {assignTarget.doctor_id && (
                                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={forceReassign}
                                            onChange={(event) => setForceReassign(event.target.checked)}
                                            className="h-4 w-4 rounded accent-[#E67E3C]"
                                        />
                                        <span className="text-sm text-amber-800">Confirm reassignment from the current Doctor</span>
                                    </label>
                                )}

                                {assistantDoctors.length === 0 && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        No active Doctors are assigned to your assistant account.
                                    </div>
                                )}

                                <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                                    <Button type="button" variant="secondary" onClick={() => setAssignTarget(null)} disabled={isAssigning}>Cancel</Button>
                                    <Button type="submit" isLoading={isAssigning} disabled={!selectedDoctorId || assistantDoctors.length === 0} leftIcon={<Stethoscope className="h-5 w-5" />}>
                                        Save Assignment
                                    </Button>
                                </div>
                            </form>
                        )}
                    </Modal>
                )}

                {isDoctorAccount && (
                    <Modal isOpen={Boolean(outcomeTarget)} onClose={() => setOutcomeTarget(null)} title="Treatment Outcome" size="lg">
                        {outcomeTarget && (
                            <form onSubmit={saveOutcome} className="space-y-5 p-6">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                    <p className="font-semibold text-[#4a3428]">{formatNameFromEmail(outcomeTarget.email)}</p>
                                    <p className="text-sm text-gray-600">{outcomeTarget.illness_description || 'No illness details provided.'}</p>
                                </div>
                                <div>
                                    <label htmlFor="outcome" className="mb-2 block text-sm font-medium text-gray-700">Outcome</label>
                                    <select
                                        id="outcome"
                                        value={outcome}
                                        onChange={(event) => setOutcome(event.target.value as typeof outcome)}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                                    >
                                        <option value="completed">Completed / treated</option>
                                        <option value="follow_up_needed">Further treatment needed</option>
                                        <option value="referred_out">Referred out</option>
                                        <option value="not_appropriate_for_platform">Not appropriate for platform</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="doctorNotes" className="mb-2 block text-sm font-medium text-gray-700">Doctor Notes</label>
                                    <textarea
                                        id="doctorNotes"
                                        rows={5}
                                        value={doctorNotes}
                                        onChange={(event) => setDoctorNotes(event.target.value)}
                                        placeholder="Clinical/admin notes for this outcome."
                                        className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C]"
                                    />
                                </div>
                                <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                                    <Button type="button" variant="secondary" onClick={() => setOutcomeTarget(null)} disabled={isSavingOutcome}>Cancel</Button>
                                    <Button type="submit" isLoading={isSavingOutcome} leftIcon={<Stethoscope className="h-5 w-5" />}>Save Outcome</Button>
                                </div>
                            </form>
                        )}
                    </Modal>
                )}
            </div>
        </DashboardLayout>
    );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'green' | 'yellow' | 'gray' }) {
    const color = tone === 'green' ? 'text-green-600' : tone === 'yellow' ? 'text-yellow-600' : tone === 'gray' ? 'text-gray-500' : 'text-[#4a3428]';

    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="mb-1 text-sm text-gray-600">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
    );
}
