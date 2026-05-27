'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import TriageChatWorkspace from '@/components/TriageChatWorkspace';
import { getSession } from '@/lib/auth';

function AssistantChatInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const careRequestId = searchParams.get('careRequestId');
    const session = getSession();
    const chatRole = session?.user.role === 'doctor' ? 'doctor' : 'assistant';

    useEffect(() => {
        if (!session || !['assistant', 'doctor'].includes(session.user.role)) {
            router.push('/auth/login');
        }
    }, [router, session]);

    return (
        <DashboardLayout role="doctor">
            <TriageChatWorkspace role={chatRole} initialCareRequestId={careRequestId} />
        </DashboardLayout>
    );
}

export default function AssistantChatPage() {
    return (
        <Suspense fallback={<DashboardLayout role="doctor"><p className="text-gray-500">Loading chat...</p></DashboardLayout>}>
            <AssistantChatInner />
        </Suspense>
    );
}
