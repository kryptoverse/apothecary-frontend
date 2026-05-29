'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationsPageContent from '@/components/NotificationsPageContent';
import { hasRole } from '@/lib/auth';

export default function PatientNotificationsPage() {
    const router = useRouter();

    useEffect(() => {
        if (!hasRole('patient')) {
            router.push('/auth/login');
        }
    }, [router]);

    return (
        <DashboardLayout role="patient">
            <NotificationsPageContent role="patient" />
        </DashboardLayout>
    );
}
