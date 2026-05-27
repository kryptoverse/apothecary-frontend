'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { ArrowLeft, Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { getSession } from '@/lib/auth';

type JoinTokenResponse = {
    app_id: string;
    channel_name: string;
    token: string;
    uid: number;
    expires_at: string;
    video_session: {
        video_session_id: string;
        status: string;
        scheduled_start_at: string;
        scheduled_end_at: string;
        doctor_name?: string;
    };
};

export default function VideoSessionPage() {
    const params = useParams<{ sessionId: string }>();
    const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
    const router = useRouter();
    const [session] = useState(() => getSession());
    const clientRef = useRef<IAgoraRTCClient | null>(null);
    const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
    const localVideoRef = useRef<ICameraVideoTrack | null>(null);
    const localVideoElRef = useRef<HTMLDivElement | null>(null);
    const remoteVideoElRef = useRef<HTMLDivElement | null>(null);
    const [joinData, setJoinData] = useState<JoinTokenResponse | null>(null);
    const [status, setStatus] = useState('Preparing secure video room...');
    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);

    useEffect(() => {
        if (!session || !['doctor', 'patient'].includes(session.user.role)) {
            router.push('/auth/login');
            return;
        }

        let mounted = true;
        let localClient: IAgoraRTCClient | null = null;
        let localAudio: IMicrophoneAudioTrack | null = null;
        let localVideo: ICameraVideoTrack | null = null;
        let pingInterval: NodeJS.Timeout | null = null;

        const join = async () => {
            try {
                const tokenResponse = await apiRequest<JoinTokenResponse>(`/video-sessions/${sessionId}/join-token`, {
                    method: 'POST',
                    token: session.access_token
                });
                if (!mounted || !tokenResponse.data) return;
                setJoinData(tokenResponse.data);
                setStatus('Connecting to Agora...');

                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                localClient = client;
                clientRef.current = client;

                client.on('user-published', async (user, mediaType) => {
                    await client.subscribe(user, mediaType);
                    if (mediaType === 'video' && remoteVideoElRef.current) {
                        (user.videoTrack as IRemoteVideoTrack).play(remoteVideoElRef.current);
                    }
                    if (mediaType === 'audio') {
                        user.audioTrack?.play();
                    }
                });

                client.on('user-unpublished', (_user, mediaType) => {
                    if (mediaType === 'video' && remoteVideoElRef.current) {
                        remoteVideoElRef.current.innerHTML = '';
                    }
                });

                client.on('token-privilege-will-expire', async () => {
                    const renewed = await apiRequest<JoinTokenResponse>(`/video-sessions/${sessionId}/join-token`, {
                        method: 'POST',
                        token: session.access_token
                    });
                    if (renewed.data?.token) {
                        await client.renewToken(renewed.data.token);
                    }
                });

                client.on('token-privilege-did-expire', async () => {
                    setError('Your video token expired. Rejoin the session if it is still active.');
                    await leaveTracks(client, localAudioRef.current, localVideoRef.current);
                });

                await client.join(tokenResponse.data.app_id, tokenResponse.data.channel_name, tokenResponse.data.token, tokenResponse.data.uid);
                
                if (!mounted) {
                    await client.leave();
                    return;
                }

                const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
                localAudio = audioTrack;
                localVideo = videoTrack;
                localAudioRef.current = audioTrack;
                localVideoRef.current = videoTrack;
                
                if (!mounted) {
                    audioTrack.close();
                    videoTrack.close();
                    await client.leave();
                    return;
                }

                if (localVideoElRef.current) {
                    videoTrack.play(localVideoElRef.current);
                }
                await client.publish([audioTrack, videoTrack]);
                
                if (mounted) {
                    setStatus('Connected');
                    setIsJoining(false);

                    pingInterval = setInterval(async () => {
                        try {
                            await apiRequest(`/video-sessions/${sessionId}/ping`, {
                                method: 'POST',
                                token: session.access_token
                            });
                        } catch (e) {
                            console.error('Failed to ping video session:', e);
                        }
                    }, 30000);
                }
            } catch (err) {
                if (mounted) setError(err instanceof Error ? err.message : 'Unable to join video session.');
            } finally {
                if (mounted) setIsJoining(false);
            }
        };

        void join();

        return () => {
            mounted = false;
            if (pingInterval) clearInterval(pingInterval);
            void leaveTracks(localClient, localAudio, localVideo);
        };
    }, [router, session, sessionId]);

    const toggleMic = async () => {
        if (!localAudioRef.current) return;
        await localAudioRef.current.setEnabled(!micOn);
        setMicOn(value => !value);
    };

    const toggleCamera = async () => {
        if (!localVideoRef.current) return;
        await localVideoRef.current.setEnabled(!cameraOn);
        setCameraOn(value => !value);
    };

    const leave = async () => {
        await leaveTracks(clientRef.current, localAudioRef.current, localVideoRef.current);
        if (role === 'doctor') {
            try {
                await apiRequest(`/video-sessions/${sessionId}/end`, {
                    method: 'POST',
                    token: session?.access_token || ''
                });
            } catch (e) {
                console.error('Failed to explicitly end video session:', e);
            }
        }
        router.back();
    };

    const role = session?.user.role === 'patient' ? 'patient' : 'doctor';

    return (
        <DashboardLayout role={role}>
            <div className="flex min-h-[calc(100vh-130px)] flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Video Session</h2>
                        <p className="text-sm text-gray-600">{joinData ? `${formatDateTime(joinData.video_session.scheduled_start_at)} - ${formatDateTime(joinData.video_session.scheduled_end_at)}` : status}</p>
                    </div>
                    <Button variant="secondary" onClick={() => router.back()} leftIcon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
                </div>

                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

                <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="relative min-h-[420px] overflow-hidden rounded-lg bg-slate-950">
                        <div ref={remoteVideoElRef} className="h-full min-h-[420px] w-full" />
                        {!error && isJoining && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-white">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                {status}
                            </div>
                        )}
                        <div className="absolute bottom-4 right-4 h-36 w-48 overflow-hidden rounded-lg border border-white/20 bg-slate-900 shadow-lg">
                            <div ref={localVideoElRef} className="h-full w-full" />
                        </div>
                    </div>

                    <aside className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-[#4a3428]">
                            <Video className="h-5 w-5" />
                            <h3 className="font-bold">Call Controls</h3>
                        </div>
                        <p className="mt-2 text-sm text-gray-500">Tokens are generated by the backend and expire automatically.</p>

                        <div className="mt-5 space-y-3">
                            <Button fullWidth variant="outline" onClick={toggleMic} leftIcon={micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}>
                                {micOn ? 'Mute Mic' : 'Unmute Mic'}
                            </Button>
                            <Button fullWidth variant="outline" onClick={toggleCamera} leftIcon={cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}>
                                {cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
                            </Button>
                            <Button fullWidth onClick={leave} leftIcon={<PhoneOff className="h-4 w-4" />}>
                                Leave Call
                            </Button>
                        </div>
                    </aside>
                </div>
            </div>
        </DashboardLayout>
    );
}

async function leaveTracks(client: IAgoraRTCClient | null, audio: IMicrophoneAudioTrack | null, video: ICameraVideoTrack | null) {
    audio?.close();
    video?.close();
    await client?.leave();
}

function formatDateTime(value?: string) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
