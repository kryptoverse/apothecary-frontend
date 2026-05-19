'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { getSession, hasRole } from '@/lib/auth';
import { apiRequest, getApiBaseUrl } from '@/lib/api';
import { Button, Avatar } from '@/components/ui';
import { ClipboardList } from 'lucide-react';

type AssignedGender = 'girl' | 'boy';

export default function PatientDashboard() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [homeData, setHomeData] = useState<any>(null);
    const [avatarViewerUrl, setAvatarViewerUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isAssigningAvatar, setIsAssigningAvatar] = useState(false);
    const [error, setError] = useState('');

    const loadDashboard = useCallback(async () => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setError('');

        const [profileRes, homeRes] = await Promise.all([
            apiRequest<any>('/patient/profile', { token: session.access_token }),
            apiRequest<any>('/patient/home-data', { token: session.access_token })
        ]);

        if (profileRes.data) setProfile(profileRes.data);
        if (homeRes.data) setHomeData(homeRes.data);

        if (homeRes.data?.has_avatar) {
            const viewerSession = await apiRequest<{ token: string }>('/avatar-viewer/session', {
                method: 'POST',
                token: session.access_token,
            });
            const backendBaseUrl = getApiBaseUrl().replace('/api/v1', '');
            setAvatarViewerUrl(`${backendBaseUrl}/avatar-viewer-web/index.html?session=${encodeURIComponent(viewerSession.data?.token || '')}&apiBaseUrl=${encodeURIComponent(getApiBaseUrl())}&webSocketBaseUrl=${encodeURIComponent(backendBaseUrl)}`);
        } else {
            setAvatarViewerUrl('');
        }
    }, [router]);

    useEffect(() => {
        if (!hasRole('patient')) {
            router.push('/auth/login');
            return;
        }

        loadDashboard()
            .catch((err) => {
                setError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [loadDashboard, router]);

    const assignAvatar = async (gender: AssignedGender) => {
        const session = getSession();
        if (!session) {
            router.push('/auth/login');
            return;
        }

        setIsAssigningAvatar(true);
        setError('');

        try {
            await apiRequest('/patient/avatar/assign', {
                method: 'POST',
                token: session.access_token,
                body: JSON.stringify({ gender }),
            });
            await loadDashboard();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to assign avatar.');
        } finally {
            setIsAssigningAvatar(false);
        }
    };

    if (isLoading) {
        return (
            <DashboardLayout role="patient">
                <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Loading dashboard...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role="patient">
            <div className="space-y-6">
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Profile Completion Prompt */}
                {profile?.patient && !profile.patient.full_name && (
                    <div className="bg-[#fef3e8] border border-[#E67E3C]/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-[#4a3428]">Complete Your Profile</h3>
                            <p className="text-sm text-gray-600 mt-1">Please fill in your details to get the best experience.</p>
                        </div>
                        <Button onClick={() => router.push('/dashboard/patient/profile')}>
                            Go to Profile
                        </Button>
                    </div>
                )}

                {/* Header Welcome */}
                <div className="bg-white rounded-2xl shadow-sm p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">
                            Welcome back, {profile?.patient?.full_name || profile?.user?.email?.split('@')[0]}
                        </h2>
                        <p className="text-gray-600 mt-1">
                            {homeData?.streak_status?.message || "Ready for another session?"}
                        </p>
                    </div>
                    {profile?.Doctor && (
                        <div className="text-right flex items-center gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[#4a3428]">Assigned Doctor</p>
                                <p className="text-xs text-gray-500">{profile.Doctor.specialty}</p>
                            </div>
                            <Avatar name={profile.Doctor.email} size="md" />
                        </div>
                    )}
                </div>

                {/* Care Request Widget/Notice */}
                {profile?.patient && (
                    <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4 border border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-[#fef3e8] rounded-xl text-[#E67E3C]">
                                <ClipboardList className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#4a3428]">
                                    Care Status: <span className="capitalize">{profile.patient.care_status?.replace(/_/g, ' ') || 'Inactive'}</span>
                                </h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    {profile.patient.care_status === 'needs_care' && 'Your care request is being reviewed by our clinical staff.'}
                                    {profile.patient.care_status === 'assigned' && `You have been assigned to Doctor ${profile.Doctor?.email?.split('@')[0] || ''}.`}
                                    {profile.patient.care_status === 'in_treatment' && 'You are currently in an active treatment episode.'}
                                    {profile.patient.care_status === 'treated' && 'Your latest treatment episode is completed. Let us know if you need care again.'}
                                    {(profile.patient.care_status === 'inactive' || !profile.patient.care_status) && 'You do not have any active clinical care requests.'}
                                </p>
                            </div>
                        </div>
                        <Button variant="outline" onClick={() => router.push('/dashboard/patient/care-requests')}>
                            Manage Care
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Avatar & Doctor */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Avatar Viewer */}
                        <div className="bg-white rounded-2xl shadow-sm p-6 h-[400px] flex flex-col relative overflow-hidden">
                            <h3 className="text-xl font-bold text-[#4a3428] mb-4 z-10">Your 3D Avatar</h3>
                            {homeData?.has_avatar && avatarViewerUrl ? (
                                <div className="flex-1 rounded-xl overflow-hidden bg-gray-100 relative">
                                    <iframe 
                                        src={avatarViewerUrl} 
                                        className="absolute inset-0 w-full h-full border-0"
                                        title="Avatar Viewer"
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 rounded-xl bg-gradient-to-br from-[#fef3e8] to-[#f5e6d3] flex flex-col items-center justify-center p-6 border border-[#E67E3C]/20">
                                    <h4 className="text-lg font-bold text-[#4a3428] mb-2">Choose Your Avatar</h4>
                                    <p className="text-sm text-gray-600 text-center mb-6">
                                        Select a starting avatar. Apothecary will assign version 1 now and unlock newer versions as your activity grows.
                                    </p>
                                    <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                                        <Button type="button" isLoading={isAssigningAvatar} onClick={() => assignAvatar('girl')}>
                                            Girl Avatar
                                        </Button>
                                        <Button type="button" variant="outline" isLoading={isAssigningAvatar} onClick={() => assignAvatar('boy')}>
                                            Boy Avatar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sessions section */}
                        <div className="bg-white rounded-2xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-[#4a3428]">Upcoming Sessions</h3>
                                <Button size="sm">
                                    Book Session (Mock)
                                </Button>
                            </div>
                            
                            {homeData?.next_session ? (
                                <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-[#4a3428]">
                                            {new Date(homeData.next_session.scheduled_at).toLocaleDateString()} at {new Date(homeData.next_session.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        <p className="text-sm text-gray-600 capitalize">Status: {homeData.next_session.status}</p>
                                    </div>
                                    <Button variant="outline" size="sm">View Details</Button>
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-100">
                                    <p className="text-gray-500 text-sm">No upcoming sessions. Book one to get started.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Chat & Stats */}
                    <div className="space-y-6">
                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#fef3e8] rounded-xl p-4 border border-[#E67E3C]/20 text-center">
                                <p className="text-3xl font-bold text-[#E67E3C]">{homeData?.current_streak || 0}</p>
                                <p className="text-xs text-[#4a3428] font-semibold mt-1 uppercase tracking-wider">Day Streak</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 text-center">
                                <p className="text-3xl font-bold text-blue-600">{homeData?.activity_score || 0}</p>
                                <p className="text-xs text-blue-900 font-semibold mt-1 uppercase tracking-wider">Activity Score</p>
                            </div>
                        </div>

                        {/* Chat System Mock */}
                        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col h-[400px]">
                            <h3 className="text-xl font-bold text-[#4a3428] mb-4 flex-shrink-0">AI Assistant Chat</h3>
                            
                            <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 p-4 overflow-y-auto mb-4 space-y-3">
                                {/* Mock Messages */}
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[#E67E3C] text-white flex items-center justify-center font-bold flex-shrink-0">
                                        AI
                                    </div>
                                    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-sm text-gray-700">
                                        Hello! I'm your Apothecary AI assistant. How are you feeling today?
                                    </div>
                                </div>
                                <div className="flex gap-3 flex-row-reverse">
                                    <div className="w-8 h-8 rounded-full bg-[#4a3428] text-white flex items-center justify-center font-bold flex-shrink-0">
                                        You
                                    </div>
                                    <div className="bg-[#E67E3C] text-white p-3 rounded-xl shadow-sm text-sm">
                                        I'm doing well, just checking out the new dashboard!
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E67E3C]"
                                    placeholder="Type a message... (Mock)"
                                />
                                <Button size="sm" className="px-4">Send</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
