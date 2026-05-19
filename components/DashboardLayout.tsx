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
    UserRoundCheck
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
        { name: 'Assigned Patients', icon: Users, path: '/dashboard/doctor/patients' },
        { name: 'Bookings', icon: ClipboardList, path: '/dashboard/doctor/appointments' },
        { name: 'Messages', icon: MessageSquare, path: '/dashboard/doctor/chat' },
        { name: 'Notifications', icon: Bell, path: '/dashboard/doctor/notifications' },
    ];

    const PatientMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/patient' },
        { name: 'My Profile', icon: User, path: '/dashboard/patient/profile' },
        { name: 'Chat', icon: MessageSquare, path: '/dashboard/patient/chat' },
    ];

    const menuItems = role === 'admin' ? adminMenuItems : role === 'patient' ? PatientMenuItems : backendRole === 'assistant' ? AssistantMenuItems : DoctorMenuItems;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Sidebar */}
            <aside
                className={`${isSidebarOpen ? 'w-64' : 'w-20'
                    } text-white transition-all duration-300 fixed left-0 top-0 h-screen z-40`}
            >
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `url('/sidebar.webp') `,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    }}
                >
                    <div className='absolute inset-0 bg-gradient-to-b from-[#e67d3c91] to-[#6b4323] flex flex-col'>
                        {/* Logo and Toggle Button */}
                        <div className="pt-4 pb-2 border-b border-[#6b4423] relative">
                            <div className={`text-xl font-bold ${!isSidebarOpen && 'text-center'}`}>
                                <Image src="/mini-logo.webp" height={50} width={50} alt="Apothecary Logo" className="mx-auto" />
                            </div>

                            {/* Toggle Button */}
                            <button
                                onClick={toggleSidebar}
                                className="absolute -right-3 top-1/2 -translate-y-1/2 bg-[#E67E3C] hover:bg-[#d66d2b] text-white rounded-full p-1.5 shadow-lg transition-all duration-300 hover:scale-110"
                                title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                            >
                                {isSidebarOpen ? (
                                    <ChevronLeft className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                            </button>
                        </div>

                        {/* Menu Items */}
                        <nav className="flex-1 p-4 overflow-y-auto">
                            <ul className="space-y-2">
                                {menuItems.map((item) => {
                                    const IconComponent = item.icon;
                                    return (
                                        <li key={item.path}>
                                            <Link
                                                href={item.path}
                                                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${pathname === item.path
                                                    ? 'bg-[#E67E3C] text-white'
                                                    : 'text-gray-300 hover:bg-[#6b4423]'
                                                    }`}
                                            >
                                                <IconComponent className="w-5 h-5" />
                                                {isSidebarOpen && <span>{item.name}</span>}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>

                        {/* Logout Button */}
                        <div className="p-4 border-t border-[#6b4423]">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-gray-300 hover:bg-red-600 transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                                {isSidebarOpen && <span>Logout</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
                {/* Top Bar */}
                <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 fixed right-0 top-0 z-30" style={{ left: isSidebarOpen ? '16rem' : '5rem' }}>
                    <div className="flex items-center space-x-4">
                        <h1 className="text-2xl font-bold text-[#4a3428]">
                            {menuItems.find((item) => item.path === pathname)?.name || 'Dashboard'}
                        </h1>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Notification Bell */}
                        <NotificationBell role={role} />

                        {/* Profile Dropdown */}
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className="flex items-center space-x-2 hover:bg-gray-50 rounded-lg p-2 transition-colors"
                            >
                                <div className="w-10 h-10 bg-[#E67E3C] rounded-full flex items-center justify-center text-white font-bold">
                                    {role === 'admin' ? 'A' : role === 'doctor' ? 'D' : 'P'}
                                </div>
                                <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {isProfileOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-2">
                                    {/* User Info */}
                                    <div className="px-4 py-3 border-b border-gray-200">
                                        <p className="text-sm font-semibold text-[#4a3428]">{userName}</p>
                                        <p className="text-xs text-gray-500">{userEmail}</p>
                                        <p className="text-xs text-[#E67E3C] font-medium mt-1 capitalize">{backendRole.replace('_', ' ')}</p>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="py-1">
                                        {backendRole !== 'assistant' && (
                                            <Link
                                            href={`/dashboard/${routeRole}/profile`}
                                            className="flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <User className="w-4 h-4" />
                                            <span>My Profile</span>
                                        </Link>
                                        )}
                                        <Link
                                            href={`/dashboard/${routeRole}/change-password`}
                                            className="flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                            onClick={() => setIsProfileOpen(false)}
                                        >
                                            <KeyRound className="w-4 h-4" />
                                            <span>Change Password</span>
                                        </Link>
                                    </div>

                                    {/* Logout */}
                                    <div className="border-t border-gray-200 pt-1">
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-6 mt-16">{children}</main>
            </div>
        </div>
    );
}
