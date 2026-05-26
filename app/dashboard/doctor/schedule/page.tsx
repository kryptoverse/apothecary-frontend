'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { hasRole, getSession } from '@/lib/auth';
import { apiRequest } from '@/lib/api';

interface SessionBooking {
    _id: string;
    doctor_id: string;
    patient_id?: { _id: string; full_name: string };
    scheduled_at: string;
    duration_mins: number;
    status: 'available' | 'requested' | 'pending' | 'confirmed' | 'cancelled' | 'completed';
    mode: 'video' | 'text' | 'either';
}

export default function DoctorSchedule() {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [slots, setSlots] = useState<SessionBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Modal state
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [timeBlocks, setTimeBlocks] = useState([{ start: '09:00', end: '17:00' }]);
    const [isGenerating, setIsGenerating] = useState(false);

    const token = typeof window !== 'undefined' ? getSession()?.access_token : undefined;

    useEffect(() => {
        setMounted(true);
        if (!hasRole('doctor')) {
            router.push('/auth/login');
        } else {
            fetchSlots();
        }
    }, [router]);

    const fetchSlots = async () => {
        try {
            setLoading(true);
            const data = await apiRequest<SessionBooking[]>('/doctor/slots', { token });
            if (data.success) {
                setSlots(data.data || []);
            }
        } catch (error) {
            console.error('Failed to fetch slots', error);
        } finally {
            setLoading(false);
        }
    };

        const handleGenerateSlots = async () => {
        try {
            setIsGenerating(true);
            const dateStr = selectedDate.toISOString().split('T')[0];
            
            await Promise.all(timeBlocks.map(block => 
                apiRequest<{ generated_slots: number }>('/doctor/slots/generate', {
                    method: 'POST',
                    token,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: dateStr,
                        start_time: block.start,
                        end_time: block.end
                    })
                })
            ));
            
            setShowGenerateModal(false);
            fetchSlots();
        } catch (error) {
            console.error('Failed to generate slots', error);
            alert('Failed to generate slots. Please check your time range.');
        } finally {
            setIsGenerating(false);
        }
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        
        const calendar = [];
        for (let i = 0; i < firstDay; i++) {
            calendar.push(null);
        }
        for (let i = 1; i <= days; i++) {
            calendar.push(new Date(year, month, i));
        }
        return calendar;
    };

    const days = getDaysInMonth(selectedDate);
    
    // Group slots by date string YYYY-MM-DD
    const slotsByDate = slots.reduce((acc, slot) => {
        const dateStr = new Date(slot.scheduled_at).toISOString().split('T')[0];
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(slot);
        return acc;
    }, {} as Record<string, SessionBooking[]>);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'available': return 'bg-blue-100 text-blue-700';
            case 'requested': return 'bg-yellow-100 text-yellow-700';
            case 'pending': return 'bg-orange-100 text-orange-700';
            case 'confirmed': return 'bg-green-100 text-green-700';
            case 'completed': return 'bg-gray-100 text-gray-700';
            default: return 'bg-red-100 text-red-700';
        }
    };

    if (!mounted) {
        return (
            <DashboardLayout>
                <div className="p-8 animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
                    <div className="h-64 bg-gray-100 rounded-2xl"></div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role="doctor">
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-[#4a3428]">Schedule & Slot Management</h2>
                        <p className="text-gray-600">Generate availability slots for your patients to book.</p>
                    </div>
                </div>

                {/* Calendar Navigation */}
                <div className="bg-white rounded-2xl shadow-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                ←
                            </button>
                            <h3 className="text-xl font-bold text-[#4a3428]">
                                {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </h3>
                            <button
                                onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                →
                            </button>
                            <button
                                onClick={() => setSelectedDate(new Date())}
                                className="px-4 py-2 bg-[#fef3e8] text-[#E67E3C] rounded-lg font-medium hover:bg-[#f5e6d3] transition-colors"
                            >
                                Today
                            </button>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-2 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center font-semibold text-gray-500 py-2">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {days.map((date, index) => {
                            if (!date) return <div key={`empty-${index}`} className="p-3 min-h-[120px] bg-gray-50 rounded-lg" />;
                            
                            const dateStr = date.toISOString().split('T')[0];
                            const daySlots = slotsByDate[dateStr] || [];
                            const availableCount = daySlots.filter(s => s.status === 'available').length;
                            const bookedCount = daySlots.filter(s => ['requested', 'pending', 'confirmed'].includes(s.status)).length;
                            const isSelected = date.toDateString() === selectedDate.toDateString();

                            return (
                                <div
                                    key={index}
                                    onClick={() => {
                                        setSelectedDate(date);
                                        setShowGenerateModal(true);
                                    }}
                                    className={`border rounded-lg p-3 min-h-[120px] cursor-pointer hover:border-[#E67E3C] transition-colors ${isSelected ? 'border-[#E67E3C] bg-[#fef3e8]' : 'border-gray-200 bg-white'}`}
                                >
                                    <div className="text-right mb-2">
                                        <span className={`text-sm font-bold ${isSelected ? 'text-[#E67E3C]' : 'text-gray-700'}`}>
                                            {date.getDate()}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {availableCount > 0 && (
                                            <div className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                                {availableCount} Available
                                            </div>
                                        )}
                                        {bookedCount > 0 && (
                                            <div className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                                {bookedCount} Booked
                                            </div>
                                        )}
                                        {availableCount === 0 && bookedCount === 0 && (
                                            <div className="text-xs text-gray-400 text-center mt-4">
                                                No slots
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Day Details View */}
                <div className="bg-white rounded-2xl shadow-sm p-6">
                    <h3 className="text-xl font-bold text-[#4a3428] mb-4">
                        Slots for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    
                    {loading ? (
                        <p className="text-gray-500">Loading slots...</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(slotsByDate[selectedDate.toISOString().split('T')[0]] || []).map((slot) => {
                                const timeStr = new Date(slot.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                                return (
                                    <div key={slot._id} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-lg text-[#4a3428]">{timeStr}</span>
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(slot.status)}`}>
                                                {slot.status}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {slot.duration_mins} Minutes • {slot.mode}
                                        </div>
                                        {slot.patient_id && (
                                            <div className="mt-2 pt-2 border-t border-gray-100 text-sm">
                                                Patient: <span className="font-semibold text-gray-800">{slot.patient_id.full_name}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            
                            {(slotsByDate[selectedDate.toISOString().split('T')[0]] || []).length === 0 && (
                                <div className="col-span-full py-8 text-center text-gray-500 bg-gray-50 rounded-xl">
                                    No slots generated for this date yet. Click on the calendar day to generate slots!
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Generate Slots Modal */}
            {showGenerateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-2xl font-bold text-[#4a3428]">Generate Slots</h3>
                            <button
                                onClick={() => setShowGenerateModal(false)}
                                className="text-gray-500 hover:text-gray-700 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <p className="text-gray-600 mb-6">
                            Generate 50-minute slots for <strong>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>.
                        </p>

                                                <div className="space-y-4">
                            {timeBlocks.map((block, index) => (
                                <div key={index} className="flex gap-4 items-end bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                        <input
                                            type="time"
                                            value={block.start}
                                            onChange={(e) => {
                                                const newBlocks = [...timeBlocks];
                                                newBlocks[index].start = e.target.value;
                                                setTimeBlocks(newBlocks);
                                            }}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E67E3C] focus:border-transparent bg-white"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                        <input
                                            type="time"
                                            value={block.end}
                                            onChange={(e) => {
                                                const newBlocks = [...timeBlocks];
                                                newBlocks[index].end = e.target.value;
                                                setTimeBlocks(newBlocks);
                                            }}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E67E3C] focus:border-transparent bg-white"
                                        />
                                    </div>
                                    {timeBlocks.length > 1 && (
                                        <button 
                                            onClick={() => setTimeBlocks(timeBlocks.filter((_, i) => i !== index))}
                                            className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors font-medium mb-[1px]"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={() => setTimeBlocks([...timeBlocks, { start: '13:00', end: '17:00' }])}
                                className="text-sm font-semibold text-[#E67E3C] hover:text-[#d16b2a] flex items-center gap-1"
                            >
                                + Add another time block
                            </button>
                        </div>

                        <div className="mt-8 flex gap-3">
                            <button
                                onClick={() => setShowGenerateModal(false)}
                                className="flex-1 py-3 px-4 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleGenerateSlots}
                                disabled={isGenerating}
                                className="flex-1 py-3 px-4 bg-[#E67E3C] text-white rounded-xl font-medium hover:bg-[#d16b2a] transition-colors disabled:opacity-50"
                            >
                                {isGenerating ? 'Generating...' : 'Generate Slots'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
