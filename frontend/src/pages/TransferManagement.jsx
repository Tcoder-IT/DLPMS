import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowRightLeft,
    Search,
    Plus,
    CheckCircle2,
    XCircle,
    Clock,
    FileText,
    User,
    DollarSign,
    ShieldCheck,
    Loader2,
    AlertCircle,
    Eye,
    FileCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn, formatCurrency } from '../utils/utils';

export default function TransferManagement() {
    const { user } = useAuth();
    const location = useLocation();
    const isOfficer = user && (user.role === 'LAND_OFFICER' || user.role === 'ADMIN');

    // Active sub-tab for citizens: 'APPLY', 'TRACK'
    const [activeTab, setActiveTab] = useState('TRACK');

    // Citizen state: Parcels list for transfer application
    const [citizenParcels, setCitizenParcels] = useState([]);
    const [loadingParcels, setLoadingParcels] = useState(false);

    // Form state
    const [selectedParcelId, setSelectedParcelId] = useState(location.state?.selectedParcelId || '');
    const [buyerNationalId, setBuyerNationalId] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(null);
    const [formError, setFormError] = useState(null);

    // Tracking state
    const [trackingCode, setTrackingCode] = useState('TRK-98B2A1F0');
    const [trackedTransfer, setTrackedTransfer] = useState(null);
    const [trackingLoading, setTrackingLoading] = useState(false);
    const [trackingError, setTrackingError] = useState(null);

    // Officer state: Pending transfers
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [rejectionModal, setRejectionModal] = useState({ open: false, requestId: null, reason: '' });

    // Load initial data based on role
    useEffect(() => {
        if (isOfficer) {
            fetchPendingTransfers();
        } else {
            fetchCitizenParcels();
            // Auto-track default if code available
            if (trackingCode) {
                handleTrackLookup('TRK-98B2A1F0');
            }
        }
    }, [isOfficer]);

    const fetchCitizenParcels = async () => {
        try {
            setLoadingParcels(true);
            const token = localStorage.getItem('accessToken');
            if (!token) return;
            const res = await axios.get('http://localhost:5000/api/citizen/parcels', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCitizenParcels(res.data || []);
            if (res.data?.length > 0 && !selectedParcelId) {
                setSelectedParcelId(res.data[0].parcelId);
            }
        } catch (err) {
            console.error('Failed to fetch citizen parcels:', err);
        } finally {
            setLoadingParcels(false);
        }
    };

    const fetchPendingTransfers = async () => {
        try {
            setLoadingPending(true);
            const token = localStorage.getItem('accessToken');
            if (!token) return;
            const res = await axios.get('http://localhost:5000/api/officer/transfers/pending', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPendingTransfers(res.data || []);
        } catch (err) {
            console.error('Failed to fetch pending transfers:', err);
        } finally {
            setLoadingPending(false);
        }
    };

    const handleApplyTransfer = async (e) => {
        e.preventDefault();
        setFormError(null);
        setSubmitSuccess(null);

        if (!selectedParcelId || !buyerNationalId || !salePrice) {
            setFormError('Please fill in all mandatory application fields.');
            return;
        }

        try {
            setSubmitting(true);
            const token = localStorage.getItem('accessToken');
            const res = await axios.post(
                'http://localhost:5000/api/citizen/transfer',
                {
                    parcelId: selectedParcelId,
                    buyerNationalId: buyerNationalId.trim(),
                    salePrice: parseFloat(salePrice),
                    documents: ['sale_contract_draft.pdf', 'kebele_id_copy.pdf']
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setSubmitSuccess(res.data);
            setTrackingCode(res.data.trackingId);
            setActiveTab('TRACK');
            handleTrackLookup(res.data.trackingId);
        } catch (err) {
            console.error('Transfer application error:', err);
            setFormError(err.response?.data?.error || 'Failed to submit transfer request. Please verify buyer national ID.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleTrackLookup = async (codeToSearch) => {
        const code = codeToSearch || trackingCode;
        if (!code) return;
        try {
            setTrackingLoading(true);
            setTrackingError(null);
            const token = localStorage.getItem('accessToken');
            const res = await axios.get(`http://localhost:5000/api/citizen/status/${code.trim()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTrackedTransfer(res.data);
        } catch (err) {
            console.error('Tracking lookup error:', err);
            setTrackedTransfer(null);
            setTrackingError(err.response?.data?.error || 'No transfer application found with this tracking ID.');
        } finally {
            setTrackingLoading(false);
        }
    };

    const handleApprove = async (requestId) => {
        if (!window.confirm('Confirm approval of this ownership transfer? The buyer will become the new registered owner.')) return;
        try {
            setActionLoading(requestId);
            const token = localStorage.getItem('accessToken');
            await axios.put(
                `http://localhost:5000/api/officer/transfer/${requestId}/approve`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await fetchPendingTransfers();
            alert('Transfer application approved successfully. Legal ownership updated in cadastre.');
        } catch (err) {
            console.error('Error approving transfer:', err);
            alert('Failed to approve transfer.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (e) => {
        e.preventDefault();
        if (!rejectionModal.reason.trim()) {
            alert('A written rejection reason is mandatory under DDLA directives.');
            return;
        }
        try {
            setActionLoading(rejectionModal.requestId);
            const token = localStorage.getItem('accessToken');
            await axios.put(
                `http://localhost:5000/api/officer/transfer/${rejectionModal.requestId}/reject`,
                { reason: rejectionModal.reason },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setRejectionModal({ open: false, requestId: null, reason: '' });
            await fetchPendingTransfers();
            alert('Transfer application rejected and returned with comments.');
        } catch (err) {
            console.error('Error rejecting transfer:', err);
            alert('Failed to reject transfer.');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <ArrowRightLeft className="text-[#1F4E79]" />
                        <span>Land Ownership Transfer Workflow</span>
                    </h1>
                    <p className="text-gray-500 font-medium mt-1">
                        {isOfficer
                            ? 'Land Officer Portal — Review, verify, and legally endorse land title deeds.'
                            : 'Citizen Portal — Apply for title transfer and track application review stages.'}
                    </p>
                </div>

                {!isOfficer && (
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab('TRACK')}
                            className={cn(
                                "px-5 py-2 text-xs font-bold rounded-lg transition-all",
                                activeTab === 'TRACK' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            Track Status
                        </button>
                        <button
                            onClick={() => setActiveTab('APPLY')}
                            className={cn(
                                "px-5 py-2 text-xs font-bold rounded-lg transition-all",
                                activeTab === 'APPLY' ? "bg-[#1F4E79] text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            + New Application
                        </button>
                    </div>
                )}
            </div>

            {/* OFFICER VIEW: Pending Reviews */}
            {isOfficer ? (
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Pending Transfer Dossiers</h2>
                                <p className="text-xs text-gray-500">Awaiting official validation and title endorsement</p>
                            </div>
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-full">
                                {pendingTransfers.length} Under Review
                            </span>
                        </div>

                        {loadingPending ? (
                            <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center">
                                <Loader2 className="animate-spin mb-2" size={32} />
                                <p className="text-sm font-medium">Loading transfer queue from database...</p>
                            </div>
                        ) : pendingTransfers.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 bg-slate-50/50 rounded-2xl border border-dashed border-gray-200">
                                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                                <p className="font-bold text-gray-700">All transfer requests are processed</p>
                                <p className="text-xs text-gray-500 mt-1">No pending ownership transfer cases requiring officer decision.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                            <th className="px-6 py-4">Tracking ID</th>
                                            <th className="px-6 py-4">Parcel</th>
                                            <th className="px-6 py-4">Seller (Current Owner)</th>
                                            <th className="px-6 py-4">Buyer (Transferee)</th>
                                            <th className="px-6 py-4">Sale Price</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Officer Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {pendingTransfers.map((req) => (
                                            <tr key={req.requestId} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-6 py-4 font-mono font-bold text-xs text-[#1F4E79]">
                                                    {req.trackingId}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-900 text-sm">{req.parcel?.parcelNumber}</p>
                                                    <p className="text-xs text-gray-500">{req.parcel?.kebele} • {req.parcel?.sizeSqm} sqm</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-800 text-sm">{req.seller?.fullName}</p>
                                                    <p className="text-xs text-gray-400">ID: {req.seller?.nationalId}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-800 text-sm">{req.buyer?.fullName}</p>
                                                    <p className="text-xs text-gray-400">ID: {req.buyer?.nationalId}</p>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-sm text-gray-900">
                                                    {formatCurrency(req.salePrice)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full uppercase">
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right space-x-2">
                                                    <button
                                                        onClick={() => handleApprove(req.requestId)}
                                                        disabled={actionLoading === req.requestId}
                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                                                    >
                                                        <CheckCircle2 size={14} />
                                                        <span>Approve</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setRejectionModal({ open: true, requestId: req.requestId, reason: '' })}
                                                        disabled={actionLoading === req.requestId}
                                                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                                                    >
                                                        <XCircle size={14} />
                                                        <span>Reject</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* CITIZEN VIEW: Apply or Track */
                <div className="space-y-6">
                    {activeTab === 'APPLY' ? (
                        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm max-w-3xl mx-auto">
                            <h2 className="text-2xl font-black text-gray-900 mb-2">Transfer Application Form</h2>
                            <p className="text-sm text-gray-500 mb-6">Initiate legal change of ownership under Dire Dawa Land Administration Bureau.</p>

                            {formError && (
                                <div className="p-4 mb-6 bg-red-50 text-red-700 text-sm rounded-xl flex items-center gap-2 border border-red-100">
                                    <AlertCircle size={18} />
                                    <span>{formError}</span>
                                </div>
                            )}

                            <form onSubmit={handleApplyTransfer} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Select Parcel to Transfer *
                                    </label>
                                    {loadingParcels ? (
                                        <div className="text-sm text-gray-400">Loading your parcels...</div>
                                    ) : citizenParcels.length === 0 ? (
                                        <div className="p-4 bg-amber-50 text-amber-800 text-sm rounded-xl">
                                            You do not have any registered parcels available for transfer.
                                        </div>
                                    ) : (
                                        <select
                                            value={selectedParcelId}
                                            onChange={(e) => setSelectedParcelId(e.target.value)}
                                            className="w-full p-3.5 bg-slate-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                                        >
                                            {citizenParcels.map((p) => (
                                                <option key={p.parcelId} value={p.parcelId}>
                                                    {p.parcelNumber} — {p.kebele} ({p.sizeSqm} sqm, {p.landUseType})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Buyer National ID Number (FAN / Fayda) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. ET-DD-584920"
                                        value={buyerNationalId}
                                        onChange={(e) => setBuyerNationalId(e.target.value)}
                                        className="w-full p-3.5 bg-slate-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-[11px] text-gray-400 mt-1">The buyer must have an active registered DLPMS owner profile.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Agreed Sale Price (ETB) *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        placeholder="e.g. 1500000"
                                        value={salePrice}
                                        onChange={(e) => setSalePrice(e.target.value)}
                                        className="w-full p-3.5 bg-slate-50 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="p-4 bg-slate-50 rounded-2xl border border-gray-200">
                                    <p className="text-xs font-bold text-gray-700 mb-1">Supporting Documentation</p>
                                    <p className="text-xs text-gray-500">Sales agreement and Kebele clearance documents will be attached automatically in this prototype mode.</p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting || citizenParcels.length === 0}
                                    className="w-full py-4 bg-[#1F4E79] hover:bg-[#163a5a] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {submitting ? <Loader2 className="animate-spin" size={20} /> : <FileCheck size={20} />}
                                    <span>{submitting ? 'Submitting to Land Bureau...' : 'Submit Transfer Application'}</span>
                                </button>
                            </form>
                        </div>
                    ) : (
                        /* TRACKING VIEW */
                        <div className="space-y-6">
                            {submitSuccess && (
                                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl text-emerald-900 flex items-start gap-4">
                                    <CheckCircle2 size={28} className="text-emerald-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="font-bold text-lg">Application Successfully Filed!</h3>
                                        <p className="text-sm mt-0.5">
                                            Your tracking code is: <span className="font-mono font-black text-emerald-800">{submitSuccess.trackingId}</span>
                                        </p>
                                        <p className="text-xs text-emerald-700 mt-1">Keep this code to monitor officer review status.</p>
                                    </div>
                                </div>
                            )}

                            {/* Search Bar */}
                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Enter Tracking ID (e.g. TRK-98B2A1F0)..."
                                        value={trackingCode}
                                        onChange={(e) => setTrackingCode(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <button
                                    onClick={() => handleTrackLookup()}
                                    disabled={trackingLoading}
                                    className="px-6 py-3 bg-[#1F4E79] text-white font-bold rounded-xl hover:bg-[#163a5a] transition-all flex items-center justify-center gap-2"
                                >
                                    {trackingLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                                    <span>Track Status</span>
                                </button>
                            </div>

                            {/* Result Dossier */}
                            {trackingLoading ? (
                                <div className="p-12 text-center text-gray-400">
                                    <Loader2 className="animate-spin mx-auto mb-2" size={32} />
                                    <p className="text-sm font-medium">Checking Dire Dawa title records...</p>
                                </div>
                            ) : trackingError ? (
                                <div className="p-8 bg-red-50 border border-red-100 text-red-700 rounded-3xl text-center text-sm font-semibold">
                                    {trackingError}
                                </div>
                            ) : trackedTransfer ? (
                                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8">
                                    {/* Status Banner */}
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-gray-100">
                                        <div>
                                            <span className="text-xs font-mono font-bold text-gray-400">DOSSIER {trackedTransfer.trackingId}</span>
                                            <h2 className="text-2xl font-black text-gray-900 mt-1">Transfer Review Status</h2>
                                        </div>
                                        <span className={cn(
                                            "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider",
                                            trackedTransfer.status === 'APPROVED' ? "bg-emerald-100 text-emerald-800" :
                                                trackedTransfer.status === 'REJECTED' ? "bg-rose-100 text-rose-800" :
                                                    "bg-amber-100 text-amber-800"
                                        )}>
                                            ● {trackedTransfer.status?.replace('_', ' ')}
                                        </span>
                                    </div>

                                    {/* Progress Pipeline */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                                            <p className="text-[10px] font-black text-emerald-700 uppercase">Stage 1</p>
                                            <p className="font-bold text-gray-900 text-sm mt-1">Application Submitted</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Documents uploaded</p>
                                        </div>
                                        <div className={cn(
                                            "p-4 rounded-2xl border",
                                            trackedTransfer.status === 'UNDER_REVIEW' ? "bg-amber-50 border-amber-200" :
                                                trackedTransfer.status === 'APPROVED' ? "bg-emerald-50 border-emerald-100" :
                                                    "bg-slate-50 border-slate-200"
                                        )}>
                                            <p className="text-[10px] font-black text-amber-700 uppercase">Stage 2</p>
                                            <p className="font-bold text-gray-900 text-sm mt-1">Cadastral Legal Review</p>
                                            <p className="text-xs text-gray-500 mt-0.5">DDLA officer validation</p>
                                        </div>
                                        <div className={cn(
                                            "p-4 rounded-2xl border",
                                            trackedTransfer.status === 'APPROVED' ? "bg-emerald-50 border-emerald-200" :
                                                trackedTransfer.status === 'REJECTED' ? "bg-rose-50 border-rose-200" :
                                                    "bg-slate-50 border-slate-200"
                                        )}>
                                            <p className="text-[10px] font-black text-gray-500 uppercase">Stage 3</p>
                                            <p className="font-bold text-gray-900 text-sm mt-1">Title Endorsement</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Certificate generation</p>
                                        </div>
                                    </div>

                                    {/* Details Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/60 p-6 rounded-2xl">
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase">Parcel Details</p>
                                            <p className="font-black text-gray-900 text-base mt-1">{trackedTransfer.parcel?.parcelNumber}</p>
                                            <p className="text-xs text-gray-500">Location: {trackedTransfer.parcel?.kebele} • Size: {trackedTransfer.parcel?.sizeSqm} sqm</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase">Agreed Consideration</p>
                                            <p className="font-black text-gray-900 text-base mt-1">{formatCurrency(trackedTransfer.salePrice)}</p>
                                            <p className="text-xs text-gray-500">Recorded for title tax assessment</p>
                                        </div>
                                    </div>

                                    {trackedTransfer.officerComments && (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                                            <p className="text-xs font-bold text-amber-900">Officer Assessment Comments:</p>
                                            <p className="text-sm text-amber-800 mt-1">{trackedTransfer.officerComments}</p>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {/* REJECTION REASON MODAL */}
            {rejectionModal.open && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative">
                        <h3 className="text-xl font-black text-gray-900 mb-2">Specify Rejection Reason</h3>
                        <p className="text-xs text-gray-500 mb-4">Under Dire Dawa cadastral governance, officers must provide formal legal rationale.</p>

                        <form onSubmit={handleReject} className="space-y-4">
                            <textarea
                                required
                                rows={4}
                                placeholder="e.g. Outstanding tax lien unpaid on parcel; or boundary overlap detected in GIS survey."
                                value={rejectionModal.reason}
                                onChange={(e) => setRejectionModal({ ...rejectionModal, reason: e.target.value })}
                                className="w-full p-3.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                            />

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRejectionModal({ open: false, requestId: null, reason: '' })}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm"
                                >
                                    Confirm Rejection
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
