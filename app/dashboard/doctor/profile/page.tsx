'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { getSession, hasRole } from '@/lib/auth';
import { apiRequest } from '@/lib/api';

type TabId = 'personal' | 'professional' | 'availability' | 'settings';

type AvailabilitySlot = {
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone?: string;
    video_link?: string;
    is_available?: boolean;
};

type DoctorProfileResponse = {
    user: {
        email: string;
        status: string;
        email_verified: boolean;
        mfa_enabled: boolean;
        otp_required: boolean;
        must_change_password: boolean;
    };
    Doctor: {
        doctor_id: string;
        personal_info?: {
            full_name?: string;
            phone_number?: string;
            timezone?: string;
            profile_photo_url?: string;
        } | null;
        professional_info?: {
            license_number?: string;
            specialty?: string;
            bio?: string;
            credentials?: string[];
            years_experience?: number;
            session_modalities?: Array<'video' | 'text' | 'either'>;
        };
        max_patients: number;
        availability: AvailabilitySlot[];
        portal_settings?: {
            email_notifications: boolean;
            push_notifications: boolean;
            booking_notifications: boolean;
            ai_content_notifications: boolean;
            default_session_duration_mins: number;
        };
        credential_status: 'pending' | 'verified' | 'rejected';
        credential_notes?: string;
    };
};

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fallbackTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Vancouver',
    'America/Mexico_City',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Dublin',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Amsterdam',
    'Europe/Zurich',
    'Europe/Istanbul',
    'Africa/Cairo',
    'Africa/Johannesburg',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Dhaka',
    'Asia/Bangkok',
    'Asia/Singapore',
    'Asia/Hong_Kong',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland',
];

const timezones = typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
    ? (Intl.supportedValuesOf('timeZone') as string[])
    : fallbackTimezones;

const emptyProfile: DoctorProfileResponse = {
    user: {
        email: '',
        status: '',
        email_verified: false,
        mfa_enabled: false,
        otp_required: false,
        must_change_password: false,
    },
    Doctor: {
        doctor_id: '',
        personal_info: {
            full_name: '',
            phone_number: '',
            timezone: '',
            profile_photo_url: '',
        },
        professional_info: {
            license_number: '',
            specialty: '',
            bio: '',
            credentials: [],
            years_experience: 0,
            session_modalities: ['video'],
        },
        max_patients: 20,
        availability: [],
        portal_settings: {
            email_notifications: true,
            push_notifications: true,
            booking_notifications: true,
            ai_content_notifications: true,
            default_session_duration_mins: 50,
        },
        credential_status: 'pending',
    },
};

export default function DoctorProfile() {
    const router = useRouter();
    const [profile, setProfile] = useState<DoctorProfileResponse>(emptyProfile);
    const [draft, setDraft] = useState<DoctorProfileResponse>(emptyProfile);
    const [activeTab, setActiveTab] = useState<TabId>('personal');
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [credentialsText, setCredentialsText] = useState('');

    const session = useMemo(() => (typeof window === 'undefined' ? null : getSession()), []);
    const token = session?.access_token;

    useEffect(() => {
        if (!hasRole('doctor')) {
            router.push('/auth/login');
            return;
        }

        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const loadProfile = async () => {
        if (!token) return;

        setIsLoading(true);
        setNotice(null);

        try {
            const response = await apiRequest<DoctorProfileResponse>('/doctor/profile', { token });
            const normalized = normalizeProfile(response.data || emptyProfile);
            setProfile(normalized);
            setDraft(normalized);
            setCredentialsText((normalized.Doctor.professional_info?.credentials || []).join(', '));
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to load Doctor profile.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const normalizeProfile = (value: DoctorProfileResponse): DoctorProfileResponse => ({
        ...emptyProfile,
        ...value,
        user: { ...emptyProfile.user, ...value.user },
        Doctor: {
            ...emptyProfile.Doctor,
            ...value.Doctor,
            personal_info: {
                ...emptyProfile.Doctor.personal_info,
                ...(value.Doctor.personal_info || {}),
            },
            professional_info: {
                ...emptyProfile.Doctor.professional_info,
                ...(value.Doctor.professional_info || {}),
            },
            portal_settings: {
                ...emptyProfile.Doctor.portal_settings!,
                ...(value.Doctor.portal_settings || {}),
            },
            availability: value.Doctor.availability || [],
        },
    });

    const fullName = draft.Doctor.personal_info?.full_name || draft.user.email.split('@')[0] || 'doctor';
    const initials = fullName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'D';

    const updatePersonal = (field: keyof NonNullable<DoctorProfileResponse['Doctor']['personal_info']>, value: string) => {
        setDraft((current) => ({
            ...current,
            Doctor: {
                ...current.Doctor,
                personal_info: {
                    ...(current.Doctor.personal_info || {}),
                    [field]: value,
                },
            },
        }));
    };

    const updateProfessional = (field: keyof NonNullable<DoctorProfileResponse['Doctor']['professional_info']>, value: any) => {
        setDraft((current) => ({
            ...current,
            Doctor: {
                ...current.Doctor,
                professional_info: {
                    ...(current.Doctor.professional_info || {}),
                    [field]: value,
                },
            },
        }));
    };

    const updateSettings = (field: keyof NonNullable<DoctorProfileResponse['Doctor']['portal_settings']>, value: boolean | number) => {
        setDraft((current) => ({
            ...current,
            Doctor: {
                ...current.Doctor,
                portal_settings: {
                    ...current.Doctor.portal_settings!,
                    [field]: value,
                },
            },
        }));
    };

    const updateAvailability = (index: number, field: keyof AvailabilitySlot, value: string | number | boolean) => {
        setDraft((current) => {
            const availability = [...current.Doctor.availability];
            availability[index] = { ...availability[index], [field]: value };
            return {
                ...current,
                Doctor: { ...current.Doctor, availability },
            };
        });
    };

    const addAvailability = () => {
        setDraft((current) => ({
            ...current,
            Doctor: {
                ...current.Doctor,
                availability: [
                    ...current.Doctor.availability,
                    {
                        day_of_week: 1,
                        start_time: '09:00',
                        end_time: '17:00',
                        timezone: current.Doctor.personal_info?.timezone || 'America/New_York',
                        is_available: true,
                    },
                ],
            },
        }));
    };

    const removeAvailability = (index: number) => {
        setDraft((current) => ({
            ...current,
            Doctor: {
                ...current.Doctor,
                availability: current.Doctor.availability.filter((_, itemIndex) => itemIndex !== index),
            },
        }));
    };

    const handleSave = async () => {
        if (!token) return;

        setIsSaving(true);
        setNotice(null);

        try {
            if (activeTab === 'personal') {
                const personal = draft.Doctor.personal_info || {};
                await apiRequest('/doctor/profile/personal', {
                    method: 'PATCH',
                    token,
                    body: JSON.stringify({
                        ...(personal.full_name ? { full_name: personal.full_name } : {}),
                        ...(personal.phone_number ? { phone_number: personal.phone_number } : {}),
                        ...(personal.timezone ? { timezone: personal.timezone } : {}),
                        ...(personal.profile_photo_url ? { profile_photo_url: personal.profile_photo_url } : {}),
                    }),
                });
            }

            if (activeTab === 'professional') {
                const professional = draft.Doctor.professional_info || {};
                const parsedCredentials = credentialsText
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean);

                await apiRequest('/doctor/profile/professional', {
                    method: 'PATCH',
                    token,
                    body: JSON.stringify({
                        ...(professional.license_number ? { license_number: professional.license_number } : {}),
                        ...(professional.specialty ? { specialty: professional.specialty } : {}),
                        ...(professional.bio ? { bio: professional.bio } : {}),
                        credentials: parsedCredentials,
                        years_experience: Number(professional.years_experience || 0),
                        session_modalities: professional.session_modalities || ['video'],
                    }),
                });
            }

            if (activeTab === 'availability') {
                await apiRequest('/doctor/availability', {
                    method: 'PUT',
                    token,
                    body: JSON.stringify({ availability: draft.Doctor.availability }),
                });
            }

            if (activeTab === 'settings') {
                await apiRequest('/doctor/settings', {
                    method: 'PATCH',
                    token,
                    body: JSON.stringify(draft.Doctor.portal_settings),
                });
            }

            await loadProfile();
            setIsEditing(false);
            setNotice({ type: 'success', message: 'Doctor profile updated successfully.' });
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to save profile changes.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setDraft(profile);
        setCredentialsText((profile.Doctor.professional_info?.credentials || []).join(', '));
        setIsEditing(false);
        setNotice(null);
    };

    const tabs: Array<{ id: TabId; label: string }> = [
        { id: 'personal', label: 'Personal Info' },
        { id: 'professional', label: 'Professional Info' },
        
        { id: 'settings', label: 'Settings' },
    ];

    return (
        <DashboardLayout role="doctor">
            <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">My Doctor Profile</h2>
                        <p className="text-gray-600">Manage your professional profile, availability, and portal settings.</p>
                    </div>

                    {!isEditing ? (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="rounded-full bg-[#E67E3C] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d16b2a]"
                        >
                            Edit Profile
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={handleCancel}
                                className="rounded-full border-2 border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="rounded-full bg-[#E67E3C] px-6 py-3 font-medium text-white transition-colors hover:bg-[#d16b2a] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    )}
                </div>

                {notice && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {notice.message}
                    </div>
                )}

                {isLoading ? (
                    <div className="rounded-2xl bg-white p-8 text-gray-600 shadow-sm">Loading Doctor profile...</div>
                ) : (
                    <>
                        <div className="rounded-2xl bg-gradient-to-r from-[#E67E3C] to-[#d16b2a] p-8 text-white">
                            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-3xl font-bold text-[#E67E3C]">
                                        {initials}
                                    </div>
                                    <div>
                                        <h3 className="mb-2 text-3xl font-bold">{fullName}</h3>
                                        <p className="mb-3 text-white/90">{draft.Doctor.professional_info?.specialty || 'Specialty not set'}</p>
                                        <div className="flex flex-wrap gap-4 text-sm">
                                            <span>{draft.user.email}</span>
                                            {draft.Doctor.personal_info?.phone_number && <span>{draft.Doctor.personal_info.phone_number}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-white/15 px-4 py-3 text-sm">
                                    Credential status: <span className="font-semibold capitalize">{draft.Doctor.credential_status}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                            <Stat label="Max Patients" value={draft.Doctor.max_patients} />
                            <Stat label="Weekly Slots" value={draft.Doctor.availability.length} />
                            <Stat label="Session Duration" value={`${draft.Doctor.portal_settings?.default_session_duration_mins || 50}m`} />
                            <Stat label="Account Status" value={draft.user.status || 'pending'} />
                        </div>

                        <div className="rounded-2xl bg-white shadow-sm">
                            <div className="border-b border-gray-200 px-6">
                                <div className="flex flex-wrap gap-6">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`border-b-2 px-1 py-4 font-medium transition-colors ${activeTab === tab.id ? 'border-[#E67E3C] text-[#E67E3C]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6">
                                {activeTab === 'personal' && (
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                        <Field label="Full Name" value={draft.Doctor.personal_info?.full_name || ''} disabled={!isEditing} onChange={(value) => updatePersonal('full_name', value)} />
                                        <Field label="Email" type="email" value={draft.user.email} disabled />
                                        <Field label="Phone Number" value={draft.Doctor.personal_info?.phone_number || ''} disabled={!isEditing} onChange={(value) => updatePersonal('phone_number', value)} />
                                        <TimezoneSelect
                                            label="Timezone"
                                            value={draft.Doctor.personal_info?.timezone || ''}
                                            disabled={!isEditing}
                                            onChange={(value) => updatePersonal('timezone', value)}
                                        />
                                        <div className="md:col-span-2">
                                            <Field label="Profile Photo URL" value={draft.Doctor.personal_info?.profile_photo_url || ''} disabled={!isEditing} onChange={(value) => updatePersonal('profile_photo_url', value)} />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'professional' && (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                            <Field label="License Number" value={draft.Doctor.professional_info?.license_number || ''} disabled={!isEditing} onChange={(value) => updateProfessional('license_number', value)} />
                                            <Field label="Specialty" value={draft.Doctor.professional_info?.specialty || ''} disabled={!isEditing} onChange={(value) => updateProfessional('specialty', value)} />
                                            <Field label="Years of Experience" type="number" value={String(draft.Doctor.professional_info?.years_experience || 0)} disabled={!isEditing} onChange={(value) => updateProfessional('years_experience', Number(value))} />
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-gray-700">Session Modalities</label>
                                                <select
                                                    value={draft.Doctor.professional_info?.session_modalities?.[0] || 'video'}
                                                    disabled={!isEditing}
                                                    onChange={(event) => updateProfessional('session_modalities', [event.target.value])}
                                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
                                                >
                                                    <option value="video">Video</option>
                                                    <option value="text">Text</option>
                                                    <option value="either">Either</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-gray-700">Professional Bio</label>
                                            <textarea
                                                value={draft.Doctor.professional_info?.bio || ''}
                                                disabled={!isEditing}
                                                onChange={(event) => updateProfessional('bio', event.target.value)}
                                                rows={5}
                                                className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-gray-700">Credentials</label>
                                            <input
                                                type="text"
                                                value={credentialsText}
                                                disabled={!isEditing}
                                                onChange={(event) => setCredentialsText(event.target.value)}
                                                placeholder="LMFT, CBT Certified"
                                                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
                                            />
                                            <p className="mt-2 text-xs text-gray-500">Separate credentials with commas.</p>
                                        </div>

                                        <ProfessionalReviewNotice
                                            status={draft.Doctor.credential_status}
                                            notes={draft.Doctor.credential_notes}
                                            isEditing={isEditing}
                                        />
                                    </div>
                                )}


                                {activeTab === 'settings' && (
                                    <div className="space-y-6">
                                        <div className="rounded-2xl bg-[#fef3e8] p-6">
                                            <h4 className="mb-4 font-semibold text-[#4a3428]">Notification Preferences</h4>
                                            <div className="space-y-4">
                                                <Toggle label="Email notifications" checked={!!draft.Doctor.portal_settings?.email_notifications} disabled={!isEditing} onChange={(value) => updateSettings('email_notifications', value)} />
                                                <Toggle label="Push notifications" checked={!!draft.Doctor.portal_settings?.push_notifications} disabled={!isEditing} onChange={(value) => updateSettings('push_notifications', value)} />
                                                <Toggle label="Booking notifications" checked={!!draft.Doctor.portal_settings?.booking_notifications} disabled={!isEditing} onChange={(value) => updateSettings('booking_notifications', value)} />
                                                <Toggle label="AI content review notifications" checked={!!draft.Doctor.portal_settings?.ai_content_notifications} disabled={!isEditing} onChange={(value) => updateSettings('ai_content_notifications', value)} />
                                            </div>
                                        </div>

                                        <Field
                                            label="Default Session Duration"
                                            type="number"
                                            value={String(draft.Doctor.portal_settings?.default_session_duration_mins || 50)}
                                            disabled={!isEditing}
                                            onChange={(value) => updateSettings('default_session_duration_mins', Number(value))}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="mb-1 text-sm text-gray-600">{label}</p>
            <p className="text-3xl font-bold text-[#4a3428]">{value}</p>
        </div>
    );
}

function Field({ label, value, type = 'text', disabled, placeholder, onChange }: {
    label: string;
    value: string;
    type?: string;
    disabled?: boolean;
    placeholder?: string;
    onChange?: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
            <input
                type={type}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(event) => onChange?.(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
            />
        </div>
    );
}

function SmallField({ label, value, type = 'text', disabled, onChange }: {
    label: string;
    value: string;
    type?: string;
    disabled?: boolean;
    onChange?: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-2 block text-xs font-medium text-gray-500">{label}</label>
            <input
                type={type}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange?.(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100"
            />
        </div>
    );
}

function TimezoneSelect({ label, value, disabled, compact, onChange }: {
    label: string;
    value: string;
    disabled?: boolean;
    compact?: boolean;
    onChange: (value: string) => void;
}) {
    const options = value && !timezones.includes(value) ? [value, ...timezones] : timezones;

    return (
        <div>
            <label className={`mb-2 block font-medium text-gray-700 ${compact ? 'text-xs text-gray-500' : 'text-sm'}`}>{label}</label>
            <select
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={`w-full rounded-lg border border-gray-300 outline-none focus:border-transparent focus:ring-2 focus:ring-[#E67E3C] disabled:bg-gray-100 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
            >
                <option value="">Select timezone</option>
                {options.map((timezone) => (
                    <option key={timezone} value={timezone}>
                        {timezone.replace(/_/g, ' ')}
                    </option>
                ))}
            </select>
        </div>
    );
}

function ProfessionalReviewNotice({ status, notes, isEditing }: {
    status: 'pending' | 'verified' | 'rejected';
    notes?: string;
    isEditing: boolean;
}) {
    const noteBlock = notes?.trim() ? (
        <div className="mt-3 rounded-lg bg-white/70 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Admin review note</p>
            <p>{notes}</p>
        </div>
    ) : null;

    if (isEditing) {
        return (
            <div className="rounded-2xl bg-[#fff6e8] p-5 text-sm text-gray-700">
                Changing license number, specialty, credentials, years of experience, or session modalities will return your credentials to pending Super Admin review.
                {noteBlock}
            </div>
        );
    }

    if (status === 'verified') {
        return (
            <div className="rounded-2xl bg-green-50 p-5 text-sm text-green-800">
                Your professional credentials are verified. If you edit reviewed credential fields later, they will be submitted for Super Admin review again.
                {noteBlock}
            </div>
        );
    }

    if (status === 'rejected') {
        return (
            <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">
                Your professional credentials need revision. Update the requested details and save to send them back for review.
                {noteBlock}
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-yellow-50 p-5 text-sm text-yellow-800">
            Your professional credentials are pending Super Admin verification.
            {noteBlock}
        </div>
    );
}

function Toggle({ label, checked, disabled, onChange }: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <p className="font-medium text-gray-700">{label}</p>
            <label className="relative inline-flex cursor-pointer items-center">
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.checked)}
                    className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#E67E3C] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#E67E3C]/20 peer-disabled:cursor-not-allowed peer-disabled:opacity-60"></div>
            </label>
        </div>
    );
}
