'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
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

    const [messages, setMessages] = useState<{ role: 'ai' | 'user', content: string }[]>([
        { role: 'ai', content: "Hello! I'm your Apothecary AI assistant. How are you feeling today?" }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    // Persists the backend session_id across messages so the LLM has memory.
    // useRef (not useState) so updates never trigger a re-render.
    const chatSessionIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || isTyping) return;
        
        const userMsg = chatInput.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setChatInput('');
        setIsTyping(true);
        
        // Add empty AI message to stream into
        setMessages(prev => [...prev, { role: 'ai', content: '' }]);
        
        try {
            const session = getSession();
            let viewerToken = '';
            if (avatarViewerUrl) {
                const urlParams = new URLSearchParams(avatarViewerUrl.split('?')[1]);
                viewerToken = urlParams.get('session') || '';
            }

            const res = await fetch(`${getApiBaseUrl()}/chat/message/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ 
                    message: userMsg,
                    viewer_session_id: viewerToken,
                    // Reuse existing session so the AI retains memory of this conversation
                    ...(chatSessionIdRef.current ? { session_id: chatSessionIdRef.current } : {})
                })
            });
            
            if (!res.ok) throw new Error('Chat failed');
            
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            
            if (reader) {
                let currentAiMessage = '';
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    
                    // Keep the last incomplete line in the buffer
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.error) {
                                    setMessages(prev => {
                                        const newMsgs = [...prev];
                                        newMsgs[newMsgs.length - 1] = { role: 'ai', content: `Error: ${data.error}` };
                                        return newMsgs;
                                    });
                                    setIsTyping(false);
                                    break;
                                }

                                if (data.text) {
                                    currentAiMessage += data.text;
                                    setMessages(prev => {
                                        const newMsgs = [...prev];
                                        newMsgs[newMsgs.length - 1] = { role: 'ai', content: currentAiMessage };
                                        return newMsgs;
                                    });
                                }
                                // Capture the session_id from the final done event so all
                                // future messages reuse the same backend session (memory).
                                if (data.done && data.session_id) {
                                    chatSessionIdRef.current = data.session_id;
                                }
                            } catch (e) {
                                console.warn('Failed to parse SSE data', e, line);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err);
            setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1] = { role: 'ai', content: 'Sorry, I encountered an error. Please try again.' };
                return newMsgs;
            });
        } finally {
            setIsTyping(false);
        }
    };

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

    useEffect(() => {
        if (!avatarViewerUrl) return;

        const urlParams = new URLSearchParams(avatarViewerUrl.split('?')[1] || '');
        const viewerToken = urlParams.get('session');
        if (!viewerToken) return;

        // Ping the backend every 10 minutes to extend the avatar viewer session DB expiration
        const intervalId = setInterval(async () => {
            const session = getSession();
            if (!session) return;
            
            try {
                await apiRequest('/avatar-viewer/session/extend', {
                    method: 'PUT',
                    token: session.access_token,
                    body: JSON.stringify({ viewerToken })
                });
            } catch (err) {
                console.error('Failed to extend avatar viewer session', err);
            }
        }, 10 * 60 * 1000); // 10 minutes

        return () => clearInterval(intervalId);
    }, [avatarViewerUrl]);

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

                        {/* Real AI Chat System */}
                        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col h-[400px]">
                            <h3 className="text-xl font-bold text-[#4a3428] mb-4 flex-shrink-0">AI Assistant Chat</h3>
                            
                            <div ref={chatContainerRef} className="flex-1 bg-gray-50 rounded-xl border border-gray-100 p-4 overflow-y-auto mb-4 space-y-3">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${msg.role === 'user' ? 'bg-[#4a3428] text-white' : 'bg-[#E67E3C] text-white'}`}>
                                            {msg.role === 'user' ? 'You' : 'AI'}
                                        </div>
                                        <div className={`p-3 rounded-xl shadow-sm text-sm ${msg.role === 'user' ? 'bg-[#E67E3C] text-white' : 'bg-white border border-gray-100 text-gray-700 whitespace-pre-wrap'}`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <form onSubmit={handleChatSubmit} className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    disabled={isTyping}
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E67E3C]"
                                    placeholder="Type a message..."
                                />
                                <Button type="submit" size="sm" className="px-4" disabled={isTyping || !chatInput.trim()}>Send</Button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
