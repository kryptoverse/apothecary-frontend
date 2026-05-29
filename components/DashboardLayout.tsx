'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';
import { NotificationProvider } from '@/providers/NotificationProvider';
import {
    LayoutDashboard,
    Users,
    Calendar,
    MessageSquare,
    Stethoscope,
    FileText,
    Bell,
    Hospital,
    User,
    LogOut,
    KeyRound,
    ClipboardList,
    Activity,
    UserCheck,
    Settings
} from 'lucide-react';
import { getSession } from '@/lib/auth';
import { apiRequest } from '@/lib/api';

export default function DashboardLayout({
    children,
    role = 'patient'
}: {
    children: React.ReactNode;
    role?: 'admin' | 'doctor' | 'patient';
}) {
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [backendRole, setBackendRole] = useState<string>(role);
    const profileRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const checkAuth = async () => {
            const session = getSession();
            if (!session) {
                router.push('/auth/login');
                return;
            }

            setUserName(localStorage.getItem('userName') || 'User');
            setUserEmail(session.user.email || '');

            if (session.user && session.user.role) {
                setBackendRole(session.user.role);
            }
        };

        checkAuth();
    }, [router]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            const session = getSession();
            if (session) {
                await apiRequest('/auth/logout', {
                    method: 'POST',
                    token: session.access_token
                }).catch(err => console.error('Logout API error:', err));
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('ApothecaryAuthSession');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('backendRole');
            router.push('/auth/login');
        }
    };

    const routeRole = backendRole === 'assistant' ? 'doctor' : backendRole;

    const adminMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/admin' },
        { name: 'Patients', icon: Hospital, path: '/dashboard/admin/patients' },
        { name: 'Doctors', icon: Users, path: '/dashboard/admin/doctors' },
        { name: 'Assistants', icon: User, path: '/dashboard/admin/admin-assistants' },
        { name: 'Assignments', icon: UserCheck, path: '/dashboard/admin/patient-assignments' },
        { name: 'Analytics', icon: Activity, path: '/dashboard/admin/analytics' },
        { name: 'Notifications', icon: Bell, path: '/dashboard/admin/notifications' },
        { name: 'Settings', icon: Settings, path: '/dashboard/admin/settings' },
    ];

    const DoctorMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/doctor' },
        { name: 'My Patients', icon: Users, path: '/dashboard/doctor/patients' },
        { name: 'Chat', icon: MessageSquare, path: '/dashboard/doctor/chat' },
        { name: 'Schedule', icon: Calendar, path: '/dashboard/doctor/schedule' },
        { name: 'Appointments', icon: ClipboardList, path: '/dashboard/doctor/appointments' },
        { name: 'Session Notes', icon: FileText, path: '/dashboard/doctor/notes' },
        { name: 'Notifications', icon: Bell, path: '/dashboard/doctor/notifications' },
    ];

    const AssistantMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/doctor' },
        { name: 'Care Requests', icon: Stethoscope, path: '/dashboard/doctor/care-requests' },
        { name: 'Assigned Patients', icon: Users, path: '/dashboard/doctor/patients' },
        { name: 'Bookings', icon: Calendar, path: '/dashboard/doctor/appointments' },
        { name: 'Messages', icon: MessageSquare, path: '/dashboard/doctor/chat' },
        { name: 'Notifications', icon: Bell, path: '/dashboard/doctor/notifications' },
    ];

    const PatientMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/patient' },
        { name: 'Chat', icon: MessageSquare, path: '/dashboard/patient/chat' },
        { name: 'Care Requests', icon: ClipboardList, path: '/dashboard/patient/care-requests' },
        { name: 'Notifications', icon: Bell, path: '/dashboard/patient/notifications' },
        { name: 'My Profile', icon: User, path: '/dashboard/patient/profile' },
    ];

    const menuItems = role === 'admin' ? adminMenuItems : role === 'patient' ? PatientMenuItems : backendRole === 'assistant' ? AssistantMenuItems : DoctorMenuItems;

    const isChatPage = pathname?.includes('/chat');

    return (
        <NotificationProvider>
            {/* Mobile Blocker for Staff */}
            {(role === 'admin' || role === 'doctor' || backendRole === 'assistant') && (
                <div className="md:hidden fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center shadow-2xl">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                        <Activity className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">Desktop Required</h2>
                    <p className="text-gray-600 mb-6 leading-relaxed">
                        For security and full administrative control, the <strong>{backendRole.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} Portal</strong> is only accessible on a laptop or desktop device.
                    </p>
                    <div className="bg-gray-50 rounded-xl p-4 w-full border border-gray-100">
                        <p className="text-sm text-gray-500 flex items-center gap-2 justify-center">
                            <Hospital className="w-4 h-4" /> Please open this link on your computer.
                        </p>
                    </div>
                </div>
            )}

            <div className={`${(role === 'admin' || role === 'doctor' || backendRole === 'assistant') ? 'hidden md:flex' : 'flex'} bg-background ${isChatPage ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'} w-full`}>
                {/* SideNavBar */}
                <aside className="hidden md:flex h-full w-64 fixed left-0 top-0 bg-surface-container-lowest border-r border-outline-variant flex-col p-container-margin gap-base-unit z-50">
                    <div className="mb-8 flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
                            <Hospital className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="font-headline-sm text-headline-sm text-primary">Apothecary</h1>
                            <p className="text-label-md font-label-md text-on-surface-variant capitalize">{backendRole.replace('_', ' ')} Portal</p>
                        </div>
                    </div>

                    <nav className="flex flex-col gap-2 flex-grow">
                        {menuItems.map((item) => {
                            const IconComponent = item.icon;
                            const isActive = pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive 
                                        ? 'bg-secondary-container text-on-secondary-container font-semibold' 
                                        : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                                >
                                    <IconComponent className={`w-5 h-5 ${isActive ? 'text-on-secondary-container' : 'group-active:opacity-80'}`} />
                                    <span className="font-body-md text-body-md">{item.name}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-auto">
                        <button onClick={handleLogout} className="w-full bg-error-container hover:bg-error transition-all text-on-error-container hover:text-white font-semibold py-3 rounded-lg active:scale-95 flex items-center justify-center gap-2">
                            <LogOut className="w-5 h-5" />
                            <span>Logout</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-grow md:ml-64 flex flex-col pb-20 md:pb-0 w-full max-w-[100vw] overflow-x-hidden">
                    {/* TopNavBar */}
                    <header className="sticky top-0 bg-surface-bright shadow-sm h-16 w-full flex justify-between items-center px-4 md:px-container-margin py-base-unit z-40">
                        <div className="flex items-center gap-2 md:hidden min-w-0 mr-2 shrink">
                            <div className="w-8 h-8 bg-primary-container rounded flex items-center justify-center shrink-0">
                                <Hospital className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="font-bold text-primary text-lg truncate">Apothecary</h1>
                        </div>
                        <div className="flex items-center gap-3 md:gap-6 shrink-0 ml-auto">
                            <div className="flex items-center gap-4">
                                <NotificationBell role={role} />
                            </div>
                            <div className="h-8 w-[1px] bg-outline-variant mx-2"></div>
                            <div className="relative" ref={profileRef}>
                                <div 
                                    className="flex items-center gap-3 cursor-pointer hover:bg-surface-container-low p-1 pr-3 rounded-full transition-colors"
                                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                                >
                                    <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                        {userName.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="hidden md:inline-block font-body-md text-body-md font-semibold text-primary truncate max-w-[150px]">{userName}</span>
                                </div>

                                {/* Dropdown Menu */}
                                {isProfileOpen && (
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-2">
                                        <div className="px-4 py-3 border-b border-gray-200">
                                            <p className="text-sm font-semibold text-foreground">{userName}</p>
                                            <p className="text-xs text-gray-500">{userEmail}</p>
                                            <p className="text-xs text-primary font-medium mt-1 capitalize">{backendRole.replace('_', ' ')}</p>
                                        </div>
                                        <div className="py-1">
                                            {backendRole !== 'assistant' && (
                                                <Link href={`/dashboard/${routeRole}/profile`} className="flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setIsProfileOpen(false)}>
                                                    <User className="w-4 h-4" />
                                                    <span>My Profile</span>
                                                </Link>
                                            )}
                                            <Link href={`/dashboard/${routeRole}/change-password`} className="flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setIsProfileOpen(false)}>
                                                <KeyRound className="w-4 h-4" />
                                                <span>Change Password</span>
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Page Content */}
                    <main className={`flex-1 flex flex-col p-0 md:p-6 ${isChatPage ? 'overflow-hidden' : 'overflow-auto'}`}>{children}</main>
                </div>

                {/* Bottom Navigation Bar (Mobile & Tablet) */}
                <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 px-2 pb-safe bg-surface-container-lowest border-t border-outline-variant shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:hidden">
                    {menuItems.map((item) => {
                        const IconComponent = item.icon;
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`flex flex-col items-center justify-center w-full h-full px-1 py-1 transition-colors ${isActive 
                                    ? 'text-primary' 
                                    : 'text-on-surface-variant'}`}
                            >
                                <div className={`flex items-center justify-center w-12 h-8 rounded-full mb-1 ${isActive ? 'bg-secondary-container/30' : ''}`}>
                                    <IconComponent className={`w-5 h-5 ${isActive ? 'text-on-secondary-container' : ''}`} />
                                </div>
                                <span className="text-[10px] font-bold text-center leading-tight truncate w-full px-1">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </NotificationProvider>
    );
}
