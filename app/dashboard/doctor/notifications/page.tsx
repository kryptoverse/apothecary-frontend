'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationsPageContent from '@/components/NotificationsPageContent';
import { hasRole } from '@/lib/auth';

export default function DoctorNotificationsPage() {
    const router = useRouter();

    useEffect(() => {
        if (!hasRole('doctor')) {
            router.push('/auth/login');
        }
    }, [router]);

    return (
        <DashboardLayout role="doctor">
            <NotificationsPageContent role="doctor" />
        </DashboardLayout>
    );
}
