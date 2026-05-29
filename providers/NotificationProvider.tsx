'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createTriageChatSocket } from '@/lib/triageChatSocket';
import { getSession } from '@/lib/auth';
import { apiRequest } from '@/lib/api';
import { ApiNotification } from '@/components/NotificationsPageContent';

interface NotificationContextType {
    unreadCount: number;
    triggerRefresh: () => void;
    recentNotifications: ApiNotification[];
    careRequestTick: number;
}

const NotificationContext = createContext<NotificationContextType>({
    unreadCount: 0,
    triggerRefresh: () => {},
    recentNotifications: [],
    careRequestTick: 0
});

export const useNotificationContext = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [recentNotifications, setRecentNotifications] = useState<ApiNotification[]>([]);
    const [refreshTick, setRefreshTick] = useState(0);
    const [careRequestTick, setCareRequestTick] = useState(0);
    const [toastMsg, setToastMsg] = useState<{ title: string; body: string } | null>(null);

    const triggerRefresh = useCallback(() => setRefreshTick(t => t + 1), []);

    // Fetch initial count and recents
    useEffect(() => {
        const session = getSession();
        if (!session) return;

        // Fetch unread count
        apiRequest<{ unread: number }>('/notifications/unread-count', { token: session.access_token })
            .then(res => setUnreadCount(res.data?.unread || 0))
            .catch(() => {});

        // Fetch recent notifications for the bell dropdown
        apiRequest<{ notifications: ApiNotification[] }>('/notifications?limit=5', { token: session.access_token })
            .then(res => setRecentNotifications(res.data?.notifications || []))
            .catch(() => {});

    }, [refreshTick]);

    // Setup socket
    useEffect(() => {
        const session = getSession();
        if (!session) return;

        const socket = createTriageChatSocket(session.access_token);

        socket.on('notification:new', (payload: ApiNotification) => {
            setUnreadCount(prev => prev + 1);
            setRecentNotifications(prev => [payload, ...prev].slice(0, 5));
            setToastMsg({ title: payload.title, body: payload.body });
            
            setTimeout(() => {
                setToastMsg(null);
            }, 5000);
        });

        socket.on('care_request:created', () => {
            setCareRequestTick(t => t + 1);
        });
        socket.on('care_request:updated', () => {
            setCareRequestTick(t => t + 1);
        });

        return () => {
            socket.off('notification:new');
            socket.off('care_request:created');
            socket.off('care_request:updated');
            socket.disconnect();
        };
    }, []);

    return (
        <NotificationContext.Provider value={{ unreadCount, triggerRefresh, recentNotifications, careRequestTick }}>
            {children}
            
            {/* Global Toast Popup */}
            {toastMsg && (
                <div className="fixed top-6 right-6 z-[100] bg-white text-gray-900 px-5 py-4 rounded-xl shadow-2xl border border-gray-100 animate-in slide-in-from-top-4 fade-in duration-300 w-80">
                    <div className="flex gap-3 items-start">
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-primary flex-shrink-0" />
                        <div>
                            <h4 className="text-sm font-bold">{toastMsg.title}</h4>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{toastMsg.body}</p>
                        </div>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
}
