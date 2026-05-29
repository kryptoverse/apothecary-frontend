'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useNotificationContext } from '@/providers/NotificationProvider';
import { TYPE_ICON_MAP, TYPE_COLOR_MAP, TYPE_LABEL_MAP } from './NotificationsPageContent';

interface NotificationBellProps {
    role: 'admin' | 'doctor' | 'patient';
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationBell({ role }: NotificationBellProps) {
    const { unreadCount, recentNotifications, triggerRefresh } = useNotificationContext();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = () => {
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Notification Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-600 hover:text-primary transition-colors rounded-full hover:bg-gray-100"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Notification Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[400px] flex flex-col">
                    {/* Header */}
                    <div className="p-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-foreground">Notifications</h3>
                        </div>
                    </div>

                    {/* Notifications List */}
                    <div className="flex-1 overflow-y-auto">
                        {recentNotifications.length === 0 ? (
                            <div className="p-6 text-center">
                                <Bell className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                                <p className="text-gray-500 text-sm">No notifications</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {recentNotifications.map((n) => {
                                    const colorClass = TYPE_COLOR_MAP[n.type] ?? 'bg-gray-100 text-gray-600';
                                    const icon = TYPE_ICON_MAP[n.type] ?? <Bell className="w-4 h-4" />;
                                    
                                    return (
                                        <div
                                            key={n._id}
                                            className={`p-3 hover:bg-gray-50 transition-colors cursor-pointer ${!n.is_read ? 'bg-accent' : ''}`}
                                            onClick={handleNotificationClick}
                                        >
                                            <div className="flex items-start space-x-2">
                                                {/* Icon */}
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                                    {icon}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between mb-1">
                                                        <h4 className="text-xs font-semibold text-foreground line-clamp-1">
                                                            {n.title}
                                                        </h4>
                                                        {!n.is_read && (
                                                            <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 ml-2 mt-0.5"></span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-600 line-clamp-1 mb-1">
                                                        {n.body}
                                                    </p>
                                                    <span className="text-xs text-gray-400">
                                                        {timeAgo(n.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-gray-200">
                        <Link
                            href={`/dashboard/${role}/notifications`}
                            className="block text-center text-sm text-primary hover:text-primary-dark font-medium"
                            onClick={() => setIsOpen(false)}
                        >
                            View All Notifications
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
