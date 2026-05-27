'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';
import {
    LayoutDashboard,
    Users,
    Hospital,
    TrendingUp,
    Bell,
    Settings,
    MessageSquare,
    Calendar,
    ClipboardList,
    FileText,
    User,
    LogOut,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    KeyRound,
    UserRoundCheck,
    Stethoscope
} from 'lucide-react';
import Image from 'next/image';
import { clearSession, getSession } from '@/lib/auth';

interface DashboardLayoutProps {
    children: React.ReactNode;
    role: 'admin' | 'doctor' | 'patient';
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        // Initialize from localStorage, default to true if not set
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sidebarOpen');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [session] = useState(() => {
        if (typeof window === 'undefined') {
            return null;
        }

        return getSession();
    });
    const profileRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        clearSession();
        router.push('/auth/login');
    };

    const toggleSidebar = () => {
        const newState = !isSidebarOpen;
        setIsSidebarOpen(newState);
        // Save to localStorage to persist across navigation
        localStorage.setItem('sidebarOpen', String(newState));
    };

    const userEmail = session?.user.email || (role === 'admin' ? 'admin@Apothecary.com' : role === 'doctor' ? 'doctor@Apothecary.com' : 'patient@Apothecary.com');
    const userName = userEmail.split('@')[0].replace(/[._-]+/g, ' ');
    const backendRole = session?.user.role || role;
    const routeRole = role;

    const adminMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/admin' },
        { name: 'Patients', icon: Hospital, path: '/dashboard/admin/patients' },
        { name: 'Doctors', icon: Users, path: '/dashboard/admin/doctors' },
        { name: 'Assistants', icon: UserRoundCheck, path: '/dashboard/admin/admin-assistants' },
        { name: 'Assignments', icon: UserRoundCheck, path: '/dashboard/admin/patient-assignments' },
        { name: 'Analytics', icon: TrendingUp, path: '/dashboard/admin/analytics' },
        { name: 'Notifications', icon: Bell, path: '/dashboard/admin/notifications' },
        { name: 'Settings', icon: Settings, path: '/dashboard/admin/settings' },
    ];

    const DoctorMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/doctor' },
        { name: 'My Patients', icon: Users, path: '/dashboard/doctor/patients' },
        { name: 'Assistants', icon: UserRoundCheck, path: '/dashboard/doctor/assistants' },
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
        { name: 'Care Requests', icon: ClipboardList, path: '/dashboard/patient/care-requests' },
        { name: 'My Profile', icon: User, path: '/dashboard/patient/profile' },
        { name: 'Chat', icon: MessageSquare, path: '/dashboard/patient/chat' },
    ];

    const menuItems = role === 'admin' ? adminMenuItems : role === 'patient' ? PatientMenuItems : backendRole === 'assistant' ? AssistantMenuItems : DoctorMenuItems;

    return (
        <div className="flex min-h-screen bg-background">
            {/* SideNavBar */}
            <aside className="h-full w-64 fixed left-0 top-0 bg-surface-container-lowest border-r border-outline-variant flex flex-col p-container-margin gap-base-unit z-50">
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
            <div className="flex-grow ml-64 flex flex-col">
                {/* TopNavBar */}
                <header className="sticky top-0 bg-surface-bright shadow-sm h-16 w-full flex justify-end items-center px-container-margin py-base-unit z-40">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-4">
                            <NotificationBell role={role} />
                        </div>
                        <div className="h-8 w-[1px] bg-outline-variant mx-2"></div>
                        <div className="relative" ref={profileRef}>
                            <div 
                                className="flex items-center gap-3 cursor-pointer hover:bg-surface-container-low p-1 pr-3 rounded-full transition-colors"
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                            >
                                <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-primary font-bold text-sm">
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-body-md text-body-md font-semibold text-primary">{userName}</span>
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
                <main className="flex-1 overflow-auto p-6">{children}</main>
            </div>
        </div>
    );
}
