import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  PlusCircle,
  MapPin,
  ArrowRight,
  CreditCard,
  FileCheck,
  FileText,
  Calendar,
  AlertCircle,
  Loader2,
  Layers,
  ExternalLink
} from 'lucide-react';
import { cn, formatCurrency } from '../utils/utils';

const StatCard = ({ label, value, subtext, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <h3 className="text-2xl font-black text-gray-900">{value}</h3>
      <p className="text-xs text-gray-400 mt-1">{subtext}</p>
    </div>
    <div className={cn("p-3 rounded-xl", color)}>
      <Icon size={24} className="text-white" />
    </div>
  </div>
);

export default function CitizenDashboard() {
  const navigate = useNavigate();
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchParcels = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const res = await axios.get('http://localhost:5000/api/citizen/parcels', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setParcels(res.data || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching citizen parcels:', err);
        setError('Failed to load registered parcels from database.');
      } finally {
        setLoading(false);
      }
    };

    fetchParcels();
  }, []);

  // Compute live statistics from database records
  const totalParcelsCount = parcels.length;
  const totalAreaSqm = parcels.reduce((sum, p) => sum + (Number(p.sizeSqm) || 0), 0);

  let currentTaxDue = 0;
  parcels.forEach(p => {
    if (p.taxRecords && Array.isArray(p.taxRecords)) {
      p.taxRecords.forEach(t => {
        if (t.status === 'UNPAID') {
          currentTaxDue += (Number(t.totalAmount) - Number(t.paidAmount || 0));
        }
      });
    }
  });

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Registered Parcels"
          value={loading ? '-' : totalParcelsCount.toString()}
          subtext="Verified Land Registry"
          icon={MapPin}
          color="bg-blue-600"
        />
        <StatCard
          label="Total Land Area"
          value={loading ? '-' : `${totalAreaSqm.toLocaleString()} sqm`}
          subtext="DDLA Cadastral Footprint"
          icon={FileCheck}
          color="bg-emerald-600"
        />
        <StatCard
          label="Outstanding Property Tax"
          value={loading ? '-' : formatCurrency(currentTaxDue)}
          subtext={currentTaxDue > 0 ? "Tax Due - Action Required" : "All Accounts Up to Date"}
          icon={CreditCard}
          color={currentTaxDue > 0 ? "bg-red-500" : "bg-emerald-500"}
        />
        <StatCard
          label="Active Services"
          value={loading ? '-' : "Digital Ready"}
          subtext="Online Transfers & Certs"
          icon={Layers}
          color="bg-indigo-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <h2 className="text-xl font-bold text-gray-800">Direct Citizen Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => navigate('/transfers')}
              className="flex items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group text-left"
            >
              <div className="p-3 bg-indigo-50 text-[#1F4E79] rounded-xl group-hover:bg-[#1F4E79] group-hover:text-white transition-colors">
                <PlusCircle size={22} />
              </div>
              <div className="ml-3">
                <p className="font-bold text-gray-900 text-sm">Land Transfer</p>
                <p className="text-xs text-gray-500">Apply or track transfer</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/tax')}
              className="flex items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-100 transition-all group text-left"
            >
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <CreditCard size={22} />
              </div>
              <div className="ml-3">
                <p className="font-bold text-gray-900 text-sm">Property Tax</p>
                <p className="text-xs text-gray-500">Pay via Telebirr</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/gis')}
              className="flex items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group text-left"
            >
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <MapPin size={22} />
              </div>
              <div className="ml-3">
                <p className="font-bold text-gray-900 text-sm">GIS Cadastral Map</p>
                <p className="text-xs text-gray-500">View parcel boundaries</p>
              </div>
            </button>
          </div>

          {/* Registered Parcels List */}
          <div className="flex justify-between items-center pt-4">
            <h2 className="text-xl font-bold text-gray-800">My Registered Land Parcels</h2>
            <button
              onClick={() => navigate('/parcels')}
              className="text-xs font-bold text-[#1F4E79] hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ExternalLink size={12} />
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin mb-2" size={28} />
                <p className="text-sm">Fetching verified parcel records...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center text-red-500 text-sm font-semibold">{error}</div>
            ) : parcels.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="font-bold">No registered parcels found for this profile.</p>
                <p className="text-xs text-gray-400 mt-1">Visit DDLA or contact a Land Officer to link your cadastral records.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {parcels.map((parcel) => (
                  <div key={parcel.parcelId} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-[#1F4E79] rounded-xl flex items-center justify-center shrink-0">
                        <Layers size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black text-gray-900 text-base">{parcel.parcelNumber}</p>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black rounded uppercase">
                            {parcel.landUseType}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {parcel.kebele || 'Dire Dawa'} • Area: <span className="font-bold text-gray-700">{parcel.sizeSqm} sqm</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                        parcel.status === 'ACTIVE' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {parcel.status}
                      </span>

                      <button
                        onClick={() => navigate('/transfers', { state: { selectedParcelId: parcel.parcelId } })}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-[#1F4E79] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-colors"
                      >
                        Initiate Transfer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-[#1F4E79] p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-2">Need In-Person Support?</h3>
              <p className="text-sm text-white/80 mb-4">Book a consultation with a DDLA Land Officer for document verification and cadastral surveys.</p>
              <button
                onClick={() => navigate('/appointments')}
                className="w-full py-3 bg-white text-[#1F4E79] rounded-xl font-bold text-sm hover:bg-white/90 transition-all flex items-center justify-center gap-2"
              >
                <Calendar size={16} />
                <span>Book Appointment</span>
              </button>
            </div>
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-500" />
              <span>Dire Dawa Land Directives</span>
            </h3>
            <div className="space-y-4">
              <div className="flex space-x-3">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 shrink-0"></div>
                <p className="text-xs text-gray-600">Ensure annual property tax clearance before applying for ownership transfer.</p>
              </div>
              <div className="flex space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0"></div>
                <p className="text-xs text-gray-600">Digital ownership certificates include cryptographically verified SHA-256 signatures.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
