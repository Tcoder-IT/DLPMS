import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    Calendar,
    Clock,
    User,
    CheckCircle2,
    XCircle,
    Loader2,
    AlertCircle,
    ChevronRight,
    Phone,
} from 'lucide-react';

const API = 'http://localhost:5000';
const SLOT_MS = 30 * 60 * 1000;

const SERVICE_LABELS = {
    LAND_REGISTRATION: 'Land Registration',
    TRANSFER_APPROVAL: 'Transfer Approval',
    DOCUMENT_VERIFICATION: 'Document Verification',
    TAX_QUERY: 'Tax Query',
};

const STATUS_META = {
    BOOKED: { label: 'Booked', cls: 'bg-blue-100 text-blue-800' },
    CONFIRMED: { label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-800' },
    COMPLETED: { label: 'Completed', cls: 'bg-gray-100 text-gray-600' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
    NO_SHOW: { label: 'No-Show', cls: 'bg-orange-100 text-orange-700' },
};

function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-ET', {
        weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
    });
}
function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-ET', { hour: '2-digit', minute: '2-digit' });
}

function generateSlots(dateStr) {
    const slots = [];
    for (let h = 8; h < 17; h++) {
        for (const m of [0, 30]) {
            const d = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
            slots.push(d);
        }
    }
    return slots;
}

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || { label: status, cls: 'bg-gray-100 text-gray-700' };
    return (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${meta.cls}`}>
            {meta.label}
        </span>
    );
}

// ─── CITIZEN VIEW ─────────────────────────────────────────────────────────────
function CitizenView() {
    const [tab, setTab] = useState('list'); // 'list' | 'book'
    const [myAppts, setMyAppts] = useState([]);
    const [officers, setOfficers] = useState([]);
    const [selectedOfficer, setSelectedOfficer] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [bookedSlots, setBookedSlots] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [serviceType, setServiceType] = useState('LAND_REGISTRATION');
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(false);
    const [feedback, setFeedback] = useState(null);

    const token = localStorage.getItem('accessToken');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const loadMyAppts = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/api/appointments/my`, { headers });
            if (r.ok) setMyAppts(await r.json());
        } finally { setLoading(false); }
    }, []);

    const loadOfficers = useCallback(async () => {
        const r = await fetch(`${API}/api/appointments/officers`, { headers });
        if (r.ok) setOfficers(await r.json());
    }, []);

    useEffect(() => { loadMyAppts(); loadOfficers(); }, [loadMyAppts, loadOfficers]);

    useEffect(() => {
        if (!selectedOfficer || !selectedDate) { setBookedSlots([]); return; }
        fetch(`${API}/api/appointments/officers/${selectedOfficer}/slots?date=${selectedDate}`, { headers })
            .then(r => r.json())
            .then(data => setBookedSlots(Array.isArray(data) ? data.map(s => new Date(s.dateTime).getTime()) : []));
    }, [selectedOfficer, selectedDate]);

    const cancelAppt = async (id) => {
        if (!window.confirm('Cancel this appointment?')) return;
        const r = await fetch(`${API}/api/appointments/${id}/cancel`, { method: 'PUT', headers });
        const d = await r.json();
        setFeedback({ ok: r.ok, msg: r.ok ? 'Appointment cancelled.' : d.error });
        loadMyAppts();
    };

    const handleBook = async (e) => {
        e.preventDefault();
        if (!selectedSlot) return setFeedback({ ok: false, msg: 'Please select a time slot.' });
        setBooking(true);
        const r = await fetch(`${API}/api/appointments`, {
            method: 'POST', headers,
            body: JSON.stringify({ officerId: selectedOfficer, serviceType, dateTime: selectedSlot.toISOString() }),
        });
        const d = await r.json();
        setBooking(false);
        setFeedback({ ok: r.ok, msg: r.ok ? '✅ Appointment booked successfully!' : d.error });
        if (r.ok) { loadMyAppts(); setTab('list'); setSelectedSlot(null); setSelectedDate(''); }
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const allSlots = selectedDate ? generateSlots(selectedDate) : [];

    return (
        <div>
            {/* Tab bar */}
            <div className="flex gap-2 mb-6">
                {[['list', '📋 My Appointments'], ['book', '+ New Booking']].map(([key, lbl]) => (
                    <button
                        key={key}
                        onClick={() => { setTab(key); setFeedback(null); }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === key
                                ? 'bg-[#1F4E79] text-white shadow'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-[#1F4E79]'
                            }`}
                    >
                        {lbl}
                    </button>
                ))}
            </div>

            {feedback && (
                <div className={`p-3 rounded-xl text-sm mb-4 font-medium border ${feedback.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                    }`}>
                    {feedback.msg}
                </div>
            )}

            {/* MY APPOINTMENTS */}
            {tab === 'list' && (
                loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#1F4E79]" size={32} /></div>
                ) : myAppts.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
                        <p className="font-bold text-gray-500">No appointments yet</p>
                        <p className="text-sm text-gray-400 mt-1">Click <strong>+ New Booking</strong> to schedule your office visit.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {myAppts.map(a => (
                            <div key={a.appointmentId} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex flex-col items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-bold text-[#1F4E79] uppercase">
                                            {new Date(a.dateTime).toLocaleString('en', { month: 'short' })}
                                        </span>
                                        <span className="text-xl font-black text-[#1F4E79] leading-none">
                                            {new Date(a.dateTime).getDate()}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-black text-gray-900">{fmtTime(a.dateTime)}</span>
                                            <StatusBadge status={a.status} />
                                        </div>
                                        <p className="text-sm font-semibold text-gray-700">{SERVICE_LABELS[a.serviceType]}</p>
                                        {a.officer?.owner?.fullName && (
                                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                                <User size={11} /> {a.officer.owner.fullName}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {['BOOKED', 'CONFIRMED'].includes(a.status) && (
                                    <button
                                        onClick={() => cancelAppt(a.appointmentId)}
                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                                    >
                                        <XCircle size={13} /> Cancel
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* BOOK NEW */}
            {tab === 'book' && (
                <form onSubmit={handleBook} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <h3 className="font-black text-gray-800 text-lg mb-1">Schedule Office Visit</h3>
                        <p className="text-sm text-gray-500">Consult with a Dire Dawa Land Administration Bureau officer in person.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Service Type</label>
                            <select
                                value={serviceType}
                                onChange={e => setServiceType(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-[#1F4E79] focus:outline-none"
                            >
                                {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Select Officer</label>
                            <select
                                value={selectedOfficer}
                                onChange={e => { setSelectedOfficer(e.target.value); setSelectedSlot(null); }}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-[#1F4E79] focus:outline-none"
                                required
                            >
                                <option value="">-- Choose an officer --</option>
                                {officers.map(o => (
                                    <option key={o.userId} value={o.userId}>
                                        {o.owner?.fullName || o.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Select Date</label>
                        <input
                            type="date"
                            min={todayStr}
                            value={selectedDate}
                            onChange={e => { setSelectedDate(e.target.value); setSelectedSlot(null); }}
                            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-[#1F4E79] focus:outline-none"
                            required
                        />
                    </div>

                    {selectedDate && selectedOfficer && (
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">
                                Available Slots — {fmtDate(selectedDate + 'T12:00:00')}
                                <span className="ml-2 text-gray-400 font-normal normal-case">30-minute sessions</span>
                            </label>
                            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2">
                                {allSlots.map(slot => {
                                    const slotMs = slot.getTime();
                                    const isBooked = bookedSlots.some(bs => Math.abs(bs - slotMs) < SLOT_MS);
                                    const isPast = slot < new Date();
                                    const isSelected = selectedSlot && selectedSlot.getTime() === slotMs;
                                    const disabled = isBooked || isPast;
                                    return (
                                        <button
                                            type="button"
                                            key={slotMs}
                                            disabled={disabled}
                                            onClick={() => setSelectedSlot(slot)}
                                            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all ${disabled
                                                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                                                    : isSelected
                                                        ? 'bg-[#1F4E79] text-white shadow-md scale-105'
                                                        : 'bg-indigo-50 text-[#1F4E79] hover:bg-[#1F4E79] hover:text-white'
                                                }`}
                                        >
                                            {fmtTime(slot.toISOString())}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedSlot && (
                                <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-semibold text-[#1F4E79] flex items-center gap-2">
                                    <CheckCircle2 size={16} />
                                    Selected: {fmtDate(selectedSlot.toISOString())} at {fmtTime(selectedSlot.toISOString())}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={booking || !selectedSlot}
                        className="w-full py-3 bg-[#1F4E79] text-white font-black rounded-xl hover:bg-blue-950 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                    >
                        {booking ? <><Loader2 className="animate-spin" size={18} /> Booking...</> : <><ChevronRight size={18} /> Confirm Appointment</>}
                    </button>
                </form>
            )}
        </div>
    );
}

// ─── OFFICER VIEW ─────────────────────────────────────────────────────────────
function OfficerView() {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    const token = localStorage.getItem('accessToken');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filterStatus) params.set('status', filterStatus);
        if (filterDate) params.set('date', filterDate);
        try {
            const r = await fetch(`${API}/api/appointments/queue?${params}`, { headers });
            if (r.ok) setAppointments(await r.json());
        } finally { setLoading(false); }
    }, [filterStatus, filterDate]);

    useEffect(() => { load(); }, [load]);

    const doAction = async (id, endpoint, body = {}) => {
        setActionLoading(id + endpoint);
        const r = await fetch(`${API}/api/appointments/${id}/${endpoint}`, {
            method: 'PUT', headers, body: JSON.stringify(body),
        });
        const d = await r.json();
        setFeedback({ ok: r.ok, msg: r.ok ? d.message : d.error });
        setActionLoading(null);
        load();
    };

    return (
        <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6 items-center">
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#1F4E79] focus:outline-none"
                >
                    <option value="">All Statuses</option>
                    {Object.entries(STATUS_META).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
                <input
                    type="date"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#1F4E79] focus:outline-none"
                />
                <button
                    onClick={() => { setFilterStatus(''); setFilterDate(''); }}
                    className="px-3 py-2 text-sm text-gray-500 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors"
                >
                    Clear Filters
                </button>
                <span className="ml-auto text-xs text-gray-400 font-semibold">{appointments.length} appointment{appointments.length !== 1 ? 's' : ''}</span>
            </div>

            {feedback && (
                <div className={`p-3 rounded-xl text-sm mb-4 font-medium border ${feedback.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                    }`}>
                    {feedback.msg}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#1F4E79]" size={32} /></div>
            ) : appointments.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                    <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
                    <p className="font-bold text-gray-500">No appointments match your filter</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {appointments.map(a => {
                        const owner = a.citizen?.owner;
                        return (
                            <div key={a.appointmentId} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex items-start gap-4">
                                        {/* Date block */}
                                        <div className="w-14 h-14 rounded-xl bg-indigo-50 flex flex-col items-center justify-center flex-shrink-0">
                                            <span className="text-[10px] font-bold text-[#1F4E79] uppercase">
                                                {new Date(a.dateTime).toLocaleString('en', { month: 'short' })}
                                            </span>
                                            <span className="text-2xl font-black text-[#1F4E79] leading-none">
                                                {new Date(a.dateTime).getDate()}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-black text-gray-900 text-lg">{fmtTime(a.dateTime)}</span>
                                                <StatusBadge status={a.status} />
                                            </div>
                                            <p className="text-sm font-bold text-gray-700 mb-1">{SERVICE_LABELS[a.serviceType]}</p>
                                            <div className="space-y-0.5 text-xs text-gray-500">
                                                {owner?.fullName && <p className="flex items-center gap-1"><User size={11} /> {owner.fullName}</p>}
                                                {owner?.nationalId && <p className="flex items-center gap-1"><AlertCircle size={11} /> {owner.nationalId}</p>}
                                                {owner?.phone && <p className="flex items-center gap-1"><Phone size={11} /> {owner.phone}</p>}
                                                {!owner && a.citizen?.email && <p>{a.citizen.email}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 min-w-[130px]">
                                        {a.status === 'BOOKED' && (
                                            <button
                                                disabled={!!actionLoading}
                                                onClick={() => doAction(a.appointmentId, 'confirm')}
                                                className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                <CheckCircle2 size={13} /> Confirm
                                            </button>
                                        )}
                                        {['BOOKED', 'CONFIRMED'].includes(a.status) && (
                                            <>
                                                <button
                                                    disabled={!!actionLoading}
                                                    onClick={() => doAction(a.appointmentId, 'outcome', { outcome: 'COMPLETED' })}
                                                    className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-white bg-[#1F4E79] rounded-xl hover:bg-blue-950 disabled:opacity-50 transition-colors"
                                                >
                                                    ✔ Completed
                                                </button>
                                                <button
                                                    disabled={!!actionLoading}
                                                    onClick={() => doAction(a.appointmentId, 'outcome', { outcome: 'NO_SHOW' })}
                                                    className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-orange-700 border border-orange-200 rounded-xl hover:bg-orange-50 disabled:opacity-50 transition-colors"
                                                >
                                                    No-Show
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AppointmentManagement() {
    const { user } = useAuth();
    const isOfficer = user?.role === 'LAND_OFFICER';

    return (
        <div className="min-h-full bg-gray-50 p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                    <Calendar className="text-[#1F4E79]" size={30} />
                    {isOfficer ? 'Appointment Queue' : 'Appointments'}
                </h1>
                <p className="text-gray-500 mt-1 ml-11">
                    {isOfficer
                        ? 'Manage citizen consultation requests and record appointment outcomes.'
                        : 'Schedule and manage your in-person DDLA office consultations.'}
                </p>
            </div>

            {/* Office Hours Banner */}
            <div className="bg-[#1F4E79] text-white rounded-2xl p-4 mb-6 flex items-start gap-3">
                <Clock size={18} className="mt-0.5 flex-shrink-0" />
                <p className="text-sm">
                    <span className="font-bold">DDLA Office Hours:</span> Monday – Friday, 08:00 – 17:00 (EAT).
                    Each appointment is 30 minutes. Please arrive 10 minutes early with required documents.
                    Cancellations must be made at least 1 hour before the scheduled time.
                </p>
            </div>

            {user ? (
                isOfficer ? <OfficerView /> : <CitizenView />
            ) : (
                <div className="text-center py-20 text-gray-400">
                    <AlertCircle size={40} className="mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold">Please log in to manage appointments.</p>
                </div>
            )}
        </div>
    );
}
