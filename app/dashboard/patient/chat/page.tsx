'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import TriageChatWorkspace from '@/components/TriageChatWorkspace';
import { getSession } from '@/lib/auth';

function PatientChatInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const careRequestId = searchParams.get('careRequestId');

    useEffect(() => {
        const session = getSession();
        if (!session || session.user.role !== 'patient') {
            router.push('/auth/login');
        }
    }, [router]);

    return (
        <DashboardLayout role="patient">
            <TriageChatWorkspace role="patient" initialCareRequestId={careRequestId} />
        </DashboardLayout>
    );
}

export default function PatientChatPage() {
    return (
        <Suspense fallback={<DashboardLayout role="patient"><p className="text-gray-500">Loading chat...</p></DashboardLayout>}>
            <PatientChatInner />
        </Suspense>
    );
}
