/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sprout, 
  MapPin, 
  FileText, 
  Calendar, 
  Download, 
  BookOpen, 
  Layers, 
  User, 
  File, 
  AlertCircle,
  Clock,
  ArrowLeft,
  Briefcase,
  Filter,
  RotateCcw,
  X,
  Map,
  Plus,
  Trash2,
  Compass,
  Tag,
  Users,
  DollarSign,
  ChevronRight
} from 'lucide-react';
import { User as UserType, Farm, FarmPlot, FarmMapNote, FarmUpdate, Document, UserRole, PlotStatus } from '../types';
import CommentsSection from './CommentsSection';
import { getRelativeTime } from '../utils/time';

interface FarmDetailProps {
  user: UserType;
  token: string;
  farmId: string;
  onBack: () => void;
  onSelectInvestor?: (investorId: string) => void;
  refreshSignal: number;
}

export default function FarmDetail({ user, token, farmId, onBack, onSelectInvestor, refreshSignal }: FarmDetailProps) {
  const [data, setData] = useState<{
    farm: Farm;
    plots: FarmPlot[];
    updates: FarmUpdate[];
    documents: Document[];
    investorHoldings?: any[];
    farmInvestors?: any[];
    totalEstateInvestment?: number;
    mapNotes?: FarmMapNote[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'updates' | 'plots' | 'owners' | 'documents' | 'map'>('updates');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [clickedCoords, setClickedCoords] = useState<{ x: number, y: number } | null>(null);
  const [newPinNote, setNewPinNote] = useState<string>('');
  const [savingPin, setSavingPin] = useState<boolean>(false);
  const [selectedPin, setSelectedPin] = useState<FarmMapNote | null>(null);
  const [focusedPinId, setFocusedPinId] = useState<string | null>(null);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickedCoords || !newPinNote.trim()) return;

    try {
      setSavingPin(true);
      const res = await fetch(`/api/farms/${farmId}/map-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          x: clickedCoords.x,
          y: clickedCoords.y,
          note: newPinNote
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save pin');
      }

      await fetchFarmDetails(); // reload details
      setClickedCoords(null);
      setNewPinNote('');
    } catch (err: any) {
      alert(err.message || 'Error occurred saving pin');
    } finally {
      setSavingPin(false);
    }
  };

  const handleDeletePin = async (pinId: string) => {
    if (!window.confirm('Are you sure you want to delete this pinned note?')) return;

    try {
      const res = await fetch(`/api/farms/${farmId}/map-notes/${pinId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete pin');
      }

      setSelectedPin(null);
      await fetchFarmDetails(); // reload details
    } catch (err: any) {
      alert(err.message || 'Error occurred deleting pin');
    }
  };

  const fetchFarmDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/farms/${farmId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch details');
      }
      const val = await res.json();
      setData(val);
    } catch (err: any) {
      setError(err.message || 'Error occurred fetching details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFarmDetails();
  }, [farmId, token, refreshSignal]);

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Access clearance failure');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e: any) {
      alert(e.message || 'You do not have authorization to download this secure document.');
    }
  };

  const getStatusBadge = (status: PlotStatus) => {
    switch (status) {
      case PlotStatus.ACTIVE: return 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20';
      case PlotStatus.HARVESTING: return 'bg-amber-500/15 text-amber-600 border border-amber-500/20';
      case PlotStatus.DORMANT: return 'bg-gray-500/15 text-gray-500 border border-gray-500/20';
      case PlotStatus.AVAILABLE: return 'bg-blue-500/15 text-blue-600 border border-blue-500/20';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#1B4332] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border-l-4 border-red-500 rounded-xl space-y-4">
        <h3 className="text-sm font-bold text-red-800">Permission Check Issue</h3>
        <p className="text-xs text-red-700">{error || 'Access denied'}</p>
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-[#1B4332] text-white rounded text-xs cursor-pointer font-bold"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const { farm, plots, updates, documents, investorHoldings = [], farmInvestors = [], totalEstateInvestment = 0, mapNotes = [] } = data;

  // Filter updates by selected date-range
  const filteredUpdates = updates.filter(up => {
    if (!up.createdAt) return true;
    const upDate = new Date(up.createdAt);
    const yyyy = upDate.getFullYear();
    const mm = String(upDate.getMonth() + 1).padStart(2, '0');
    const dd = String(upDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (filterStartDate && dateStr < filterStartDate) return false;
    if (filterEndDate && dateStr > filterEndDate) return false;
    return true;
  });

  return (
    <div id="farm-detail-stage" className="space-y-8 animate-fade-in">
      
      {/* Back navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono font-bold text-[#1B4332] hover:underline cursor-pointer group"
      >
        <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
        <span>Return to Dashboard</span>
      </button>

      {/* Hero estate display card */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#2D6A4F]/15 shadow-premium">
        <div className="relative h-72 bg-gray-200">
          <img src={farm.coverImage} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F291E] via-[#1B4332]/45 to-transparent opacity-90" />
          <div className="absolute bottom-6 left-8 right-8 text-white text-left">
            <div className="flex items-center gap-2">
              <span className="bg-[#D4A017] text-white text-[9px] font-mono font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                Est. {new Date(farm.dateEstablished).toLocaleDateString([], {year: 'numeric', month: 'short'})}
              </span>
            </div>
            <h1 className="font-serif font-bold text-3xl text-white tracking-wide mt-3.5">{farm.name}</h1>
            <div className="flex items-center gap-1.5 text-[#52B788] text-xs mt-2 font-mono">
              <MapPin className="h-4 w-4 text-[#D4A017]" />
              <span className="font-bold">{farm.location}, {farm.state}</span>
            </div>
          </div>
        </div>

        <div className="p-8">
          <p className="text-gray-600 text-xs leading-relaxed max-w-4xl font-normal">{farm.description}</p>
          
          <div className="mt-6 flex flex-wrap gap-8 border-t border-gray-100 pt-6 text-xs font-mono text-gray-400 uppercase">
            <div>
              Total Plots: <b className="text-gray-800 font-bold ml-1">{plots.length} Deeded</b>
            </div>
            <div>
              Gross Acreage: <b className="text-gray-800 font-bold ml-1">{farm.totalHectares} acres/plots</b>
            </div>
            {(user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER) && (
              <button
                type="button"
                onClick={() => setActiveTab('owners')}
                className="text-left hover:text-[#1B4332] transition cursor-pointer"
                title="View farm owners list"
              >
                Farm Owners: <b className="text-[#1B4332] font-bold ml-1 underline decoration-[#2D6A4F]/40">{farmInvestors.length} Investors</b>
              </button>
            )}
            {user.role === UserRole.ADMIN && (
              <div>
                Total Received: <b className="text-emerald-700 font-bold ml-1">₦{totalEstateInvestment.toLocaleString()}</b>
              </div>
            )}
            {user.role === UserRole.INVESTOR && (
              <div>
                My Estate Investment: <b className="text-emerald-700 font-bold ml-1">₦{totalEstateInvestment.toLocaleString()}</b>
              </div>
            )}
            <div>
              Security Clearance: <b className="text-emerald-700 font-bold ml-1">AES-256</b>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar header */}
      <div className="flex flex-col lg:flex-row bg-white rounded-3xl lg:rounded-2xl shadow-premium p-2 lg:p-1.5 border border-[#2D6A4F]/10 gap-1.5 lg:gap-0">
        <button
          onClick={() => setActiveTab('updates')}
          className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'updates' ? 'bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white shadow shadow-[#1B4332]/30' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Activity Log ({updates.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('plots')}
          className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'plots' ? 'bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white shadow shadow-[#1B4332]/30' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Section Plots ({plots.length})</span>
        </button>

        {(user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER) && (
          <button
            onClick={() => setActiveTab('owners')}
            className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'owners' ? 'bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white shadow shadow-[#1B4332]/30' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Farm Owners ({farmInvestors.length})</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('map')}
          className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'map' ? 'bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white shadow shadow-[#1B4332]/30' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Map className="h-4 w-4" />
          <span>Interactive Map ({mapNotes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'documents' ? 'bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] text-white shadow shadow-[#1B4332]/30' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Document Vault ({documents.length})</span>
        </button>
      </div>

      {/* Tab contents */}
      <div className="space-y-6">
        
        {/* UPDATES FEED */}
        {activeTab === 'updates' && (
          <div className="space-y-6">
            {/* Filter Panel */}
            {updates.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#52B788]/10 text-[#1B4332] rounded-xl">
                    <Filter className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-800">Filter Field Chronicles</h4>
                    <p className="text-[10px] text-gray-500 font-mono">
                      {filterStartDate || filterEndDate ? (
                        <span className="text-emerald-600 font-semibold">Active filter: showing {filteredUpdates.length} of {updates.length} logs</span>
                      ) : (
                        `Displaying all ${updates.length} historic updates`
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-semibold text-gray-400 uppercase">From</span>
                    <input 
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-xs font-mono rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-semibold text-gray-400 uppercase">To</span>
                    <input 
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-xs font-mono rounded-lg px-2.5 py-1.5 text-gray-700 focus:outline-none focus:border-[#2D6A4F] focus:ring-1 focus:ring-[#2D6A4F] cursor-pointer"
                    />
                  </div>

                  {(filterStartDate || filterEndDate) && (
                    <button
                      onClick={() => {
                        setFilterStartDate('');
                        setFilterEndDate('');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 text-xs font-mono font-bold rounded-lg transition duration-200 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {updates.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-400">No field chronicle updates yet posted for this estate.</p>
              </div>
            ) : filteredUpdates.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-gray-200 space-y-3">
                <p className="text-xs text-gray-500">No operations updates match the selected date range.</p>
                <button
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1B4332] text-white text-xs font-mono font-bold rounded-lg cursor-pointer hover:bg-[#2D6A4F] transition shadow-sm"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Filters</span>
                </button>
              </div>
            ) : (
              filteredUpdates.map((up) => (
                <div key={up.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#52B788]/20 text-[#1B4332] text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                        {up.updateType}
                      </span>
                      {user.role !== UserRole.INVESTOR && up.targetInvestorIds && up.targetInvestorIds.length > 0 && (
                        <span className="bg-[#D8F3DC] text-[#1B4332] text-[9px] font-mono font-bold px-2 py-0.5 rounded-full select-none" title={`Visible to ${up.targetInvestorIds.length} select investors`}>
                          🔒 Targeted ({up.targetInvestorIds.length})
                        </span>
                      )}
                      {user.role !== UserRole.INVESTOR && (!up.targetInvestorIds || up.targetInvestorIds.length === 0) && (
                        <span className="bg-gray-100 text-gray-500 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full select-none">
                          🌍 Broadcast
                        </span>
                      )}
                      <h3 className="font-sans font-bold text-gray-800 text-sm">{up.title}</h3>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400 text-right">
                      <div className="font-bold text-[#1B4332]" title={new Date(up.createdAt).toLocaleString()}>{getRelativeTime(up.createdAt)}</div>
                      <div className="text-[9px] text-gray-400 mt-0.5 flex items-center gap-0.5 justify-end">
                        <Clock className="h-2.5 w-2.5 shrink-0 text-gray-400" />
                        <span>{new Date(up.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(up.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-600 text-xs leading-relaxed font-sans">{up.body}</p>

                  {up.photos && up.photos.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                      {up.photos.map((p) => (
                        <div key={p.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                          <img 
                            src={p.image} 
                            alt={p.caption} 
                            className="w-full h-36 object-cover object-center group-hover:scale-105 transition duration-300"
                            referrerPolicy="no-referrer"
                          />
                          {p.caption && (
                            <div className="p-2.5 bg-[#1B4332] text-white text-[10px] font-mono truncate">
                              {p.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[10px] font-mono text-gray-400 border-t border-gray-50">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      <span>Dispatched by Supervisor: <b className="text-gray-600">{up.postedByName}</b></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500 bg-gray-50 px-2.5 py-0.5 rounded-md border border-gray-100">
                      <Clock className="h-3.5 w-3.5 text-[#2D6A4F]" />
                      <span>Last Updated: <b className="text-[#1B4332]">{new Date(up.updatedAt || up.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</b></span>
                    </div>
                  </div>

                  <CommentsSection
                    updateId={up.id}
                    comments={up.comments}
                    currentUser={user}
                    token={token}
                    onCommentAdded={fetchFarmDetails}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {/* ASSOCIATED PLOT STATS */}
        {activeTab === 'plots' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-6">
            {plots.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 font-mono">
                No plots registered for this estate yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs bg-white rounded-xl">
                  <thead>
                    <tr className="border-b border-gray-150 text-gray-400 uppercase font-mono tracking-wider">
                      <th className="py-3 px-3 font-bold">Plot identifier</th>
                      <th className="py-3 px-3 font-bold text-center">Land Size</th>
                      <th className="py-3 px-3 font-bold">Cultivar Canopy</th>
                      <th className="py-3 px-3 font-bold">Active Status</th>
                      <th className="py-3 px-3 font-bold">Ownership profile</th>
                      {user.role !== UserRole.FARM_MANAGER && (
                        <th className="py-3 px-3 font-bold text-right">Investment</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {plots.map((p) => {
                      const plotHoldings = investorHoldings.filter((h: any) => h.plotId === p.id);
                      const plotTotalInvested = plotHoldings.reduce((s: number, h: any) => s + (Number(h.investmentAmount) || 0), 0);
                      return (
                        <tr key={p.id} className="border-b last:border-0 border-gray-50 hover:bg-gray-50/50 transition">
                          <td className="py-4 px-3 font-mono font-bold text-gray-800">{p.plotNumber}</td>
                          <td className="py-4 px-3 text-center font-mono text-gray-600">{p.sizeHectares} {p.sizeUnit || 'acre'}</td>
                          <td className="py-4 px-3 text-gray-600 font-medium">{p.cropType}</td>
                          <td className="py-4 px-3">
                            <span className={`inline-block px-2.5 py-0.5 text-[9px] font-bold font-mono uppercase rounded-full ${getStatusBadge(p.status)}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="py-4 px-3 font-mono text-gray-500">
                            {plotHoldings.length > 0 ? (
                              user.role === UserRole.INVESTOR ? (
                                <span className="text-emerald-700 font-bold">
                                  Your Deeded Plot ({plotHoldings[0]?.contractRef || 'CON-DEED'})
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {plotHoldings.map((h: any, idx: number) =>
                                    onSelectInvestor && user.role === UserRole.ADMIN && h.investorId ? (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => onSelectInvestor(h.investorId)}
                                        className="text-emerald-700 hover:text-[#1B4332] hover:underline font-bold cursor-pointer text-left"
                                      >
                                        {h.investorName || 'Allocated Investor'}
                                      </button>
                                    ) : (
                                      <span key={idx} className="text-emerald-700 font-bold">
                                        {h.investorName || 'Allocated Investor'}
                                      </span>
                                    )
                                  )}
                                </div>
                              )
                            ) : p.status === PlotStatus.DORMANT || p.status === PlotStatus.AVAILABLE ? (
                              <span className="text-gray-400">Available holding</span>
                            ) : (
                              <span className="text-emerald-700 font-bold">Allocated Investor</span>
                            )}
                          </td>
                          {user.role !== UserRole.FARM_MANAGER && (
                            <td className="py-4 px-3 text-right font-mono font-bold text-emerald-800">
                              {plotHoldings.length > 0 ? `₦${plotTotalInvested.toLocaleString()}` : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FARM OWNERS & ESTATE INVESTMENT TOTALS (Admin / Manager) */}
        {activeTab === 'owners' && (user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER) && (
          <div className="space-y-6 animate-fade-in">
            <div className={`grid grid-cols-1 ${user.role === UserRole.ADMIN ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
              <div className="bg-white p-5 rounded-2xl border border-[#2D6A4F]/10 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-[#1B4332]/10 text-[#1B4332] rounded-xl">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase font-bold text-gray-400 tracking-wider">Registered Farm Owners</div>
                  <div className="text-2xl font-serif font-bold text-[#1B4332] mt-0.5">{farmInvestors.length}</div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#2D6A4F]/10 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 text-[#D4A017] rounded-xl">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase font-bold text-gray-400 tracking-wider">Allocated Plots on Estate</div>
                  <div className="text-2xl font-serif font-bold text-gray-800 mt-0.5">
                    {farmInvestors.reduce((sum: number, inv: any) => sum + (Number(inv.plotsCount) || 0), 0)}
                  </div>
                </div>
              </div>

              {user.role === UserRole.ADMIN && (
                <div className="bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white p-5 rounded-2xl shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-white/15 text-[#D4A017] rounded-xl">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase font-bold text-emerald-100/80 tracking-wider">
                      Total Received From All Investors
                    </div>
                    <div className="text-2xl font-serif font-bold text-white mt-0.5">
                      ₦{totalEstateInvestment.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-sans font-bold text-sm text-[#1B4332]">Estate Farm Owners & Investors</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    All investors with active deeded plots or farm allocations in {farm.name}.
                  </p>
                </div>
                {user.role === UserRole.ADMIN && onSelectInvestor && (
                  <span className="text-[10px] font-mono text-[#2D6A4F] bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                    Click an investor name to view full profile & returns
                  </span>
                )}
              </div>

              {farmInvestors.length === 0 ? (
                <div className="p-10 text-center border border-dashed border-gray-200 rounded-xl">
                  <p className="text-xs text-gray-400 font-mono">No investors currently own plots in this estate.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs bg-white rounded-xl">
                    <thead>
                      <tr className="border-b border-gray-150 text-gray-400 uppercase font-mono tracking-wider">
                        <th className="py-3 px-3 font-bold">Farm Owner</th>
                        <th className="py-3 px-3 font-bold">Contact</th>
                        <th className="py-3 px-3 font-bold">Assigned Plots</th>
                        <th className="py-3 px-3 font-bold text-center">Total Area</th>
                        {user.role === UserRole.ADMIN && (
                          <th className="py-3 px-3 font-bold text-right">Amount Invested</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {farmInvestors.map((inv: any) => (
                        <tr key={inv.id} className="border-b last:border-0 border-gray-50 hover:bg-[#FBF9F4]/60 transition">
                          <td className="py-4 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center font-bold font-serif shrink-0">
                                {(inv.name || inv.username || 'I').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                {user.role === UserRole.ADMIN && onSelectInvestor ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelectInvestor(inv.id)}
                                    className="font-bold text-[#1B4332] hover:text-[#2D6A4F] hover:underline flex items-center gap-1 cursor-pointer text-left"
                                  >
                                    <span>{inv.name}</span>
                                    <ChevronRight className="h-3.5 w-3.5 text-[#D4A017]" />
                                  </button>
                                ) : (
                                  <div className="font-bold text-gray-800">{inv.name}</div>
                                )}
                                <div className="text-[10px] font-mono text-gray-400">@{inv.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-3 font-mono text-[11px] text-gray-600">
                            <div>{inv.email}</div>
                            {inv.phone && <div className="text-[10px] text-gray-400">{inv.phone}</div>}
                          </td>
                          <td className="py-4 px-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold text-[#1B4332] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                {inv.plotsCount} {inv.plotsCount === 1 ? 'Plot' : 'Plots'}
                              </span>
                              {(inv.plotNumbers || []).map((pn: string, i: number) => (
                                <span key={i} className="text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                  {pn}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-3 text-center font-mono text-gray-700 font-semibold">
                            {inv.totalSize} {inv.sizeUnit || 'acre'}
                          </td>
                          {user.role === UserRole.ADMIN && (
                            <td className="py-4 px-3 text-right font-mono font-extrabold text-emerald-800">
                              ₦{(Number(inv.totalInvested) || 0).toLocaleString()}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DOCUMENT SECURE DOWNLOAD */}
        {activeTab === 'documents' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.length === 0 ? (
              <div className="col-span-2 bg-white p-12 text-center rounded-2xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-400">No secure document deeds allocated to this estate.</p>
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-gray-600">
                        <FileText className="h-5 w-5" />
                      </div>
                      <span className="bg-gray-100 text-gray-700 text-[9px] font-bold font-mono px-2 py-0.5 rounded uppercase border border-gray-200">
                        {doc.category}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-sans font-bold text-gray-800 text-xs line-clamp-1">{doc.title}</h4>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5 mt-1 truncate">{doc.fileName}</p>
                    </div>

                    <p className="text-[11px] text-gray-500 leading-relaxed font-sans">{doc.description}</p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-[9px] text-gray-400 font-mono">
                      Security policy: {doc.visibility.toUpperCase()}
                    </span>
                    <button
                      onClick={() => handleDownload(doc.id, doc.fileName)}
                      className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 hover:text-[#1B4332] bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg cursor-pointer transition"
                    >
                      <Download className="h-3 w-3" />
                      <span>SECURE DOWNLOAD</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* INTERACTIVE PLOT ALLOCATION & OPERATIONAL MAP */}
        {activeTab === 'map' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* Map Canvas (Left 2 columns on lg) */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-premium flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-sans font-bold text-[#1B4332] text-sm">Estate Plot Allocation Map</h3>
                    <p className="text-[11px] text-gray-500 font-sans mt-0.5">
                      Visual parcel layout of {farm.name}. {(user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER) ? "Click anywhere on the map to pin a coordinate note." : "Hover or click pins to inspect field manager notes."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-150">
                      <Compass className="h-3.5 w-3.5 text-emerald-700 animate-spin-slow" />
                      <span>GPS ACCURACY: ±2.4m</span>
                    </span>
                  </div>
                </div>

                {/* Map Grid Arena */}
                <div 
                  id="farm-estate-map-canvas"
                  onClick={(e) => {
                    // Only allow admins and managers to place pins
                    if (user.role !== UserRole.ADMIN && user.role !== UserRole.FARM_MANAGER) return;
                    
                    // Prevent trigger if clicking on an existing pin or tooltip
                    const target = e.target as HTMLElement;
                    if (target.closest('.map-pin-element') || target.closest('.map-pin-tooltip')) {
                      return;
                    }

                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    // Select clicked coordinates to open the form
                    setClickedCoords({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
                    setNewPinNote('');
                    setSelectedPin(null);
                  }}
                  className={`relative h-[480px] w-full rounded-2xl overflow-hidden border border-gray-150 select-none shadow-inner bg-gradient-to-br from-emerald-50 via-sage-50 to-amber-50/30 ${
                    (user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER) ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                  style={{
                    backgroundImage: 'radial-gradient(#2d6a4f 0.65px, transparent 0.65px), radial-gradient(#d8f3dc 1px, transparent 1px)',
                    backgroundSize: '24px 24px, 48px 48px',
                    backgroundPosition: '0 0, 12px 12px'
                  }}
                >
                  
                  {/* Decorative grid dividing lines & natural features to simulate map visual representation */}
                  <div className="absolute inset-0 pointer-events-none opacity-40">
                    {/* Simulated access roads/paths */}
                    <div className="absolute top-[40%] left-0 right-0 h-4 bg-amber-100 border-y border-amber-200/50 transform -rotate-2 flex items-center justify-center">
                      <span className="text-[8px] text-amber-600/70 font-mono tracking-widest font-bold uppercase">Primary Access Dirt Road</span>
                    </div>
                    <div className="absolute top-0 bottom-0 left-[35%] w-3 bg-amber-100 border-x border-amber-200/50 transform rotate-12" />
                    
                    {/* Natural reserve river */}
                    <svg className="absolute bottom-4 left-4 w-48 h-24 text-sky-200/60" fill="none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M0,80 Q25,50 50,80 T100,80" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                      <text x="35" y="65" fill="#0369a1" className="text-[6px] font-mono uppercase tracking-widest font-bold opacity-60">Water Source Basin</text>
                    </svg>

                    {/* Tree canopies icons dotted */}
                    <div className="absolute top-6 left-12 flex gap-1 opacity-60">
                      <div className="w-5 h-5 rounded-full bg-emerald-800/30 border border-emerald-800/10 flex items-center justify-center text-[8px]">🌳</div>
                      <div className="w-4 h-4 rounded-full bg-emerald-800/30 border border-emerald-800/10 flex items-center justify-center text-[8px] -mt-2">🌳</div>
                      <div className="w-5 h-5 rounded-full bg-emerald-800/30 border border-emerald-800/10 flex items-center justify-center text-[8px] -ml-2">🌳</div>
                    </div>
                    <div className="absolute bottom-16 right-20 flex gap-1 opacity-60">
                      <div className="w-5 h-5 rounded-full bg-emerald-800/30 border border-emerald-800/10 flex items-center justify-center text-[8px]">🌳</div>
                      <div className="w-5 h-5 rounded-full bg-emerald-800/30 border border-emerald-800/10 flex items-center justify-center text-[8px] ml-1 -mt-1">🌳</div>
                    </div>
                  </div>

                  {/* Visual Render of Plots according to the farm's plot list */}
                  <div className="absolute inset-0 p-8 grid grid-cols-2 gap-4 pointer-events-none opacity-80">
                    {plots.map((plot, idx) => {
                      // Alternate background patterns or locations based on ID
                      const statusColor = 
                        plot.status === PlotStatus.ACTIVE ? 'bg-emerald-600/15 border-emerald-600/30 text-emerald-800' :
                        plot.status === PlotStatus.HARVESTING ? 'bg-amber-600/15 border-amber-600/30 text-amber-800' :
                        plot.status === PlotStatus.DORMANT ? 'bg-gray-600/15 border-gray-600/30 text-gray-800' :
                        'bg-blue-600/15 border-blue-600/30 text-blue-800';

                      return (
                        <div 
                          key={plot.id} 
                          className={`rounded-xl border border-dashed p-4 flex flex-col justify-between transition-all duration-300 ${statusColor}`}
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-[10px] font-mono font-bold tracking-wider uppercase bg-white/80 px-1.5 py-0.5 rounded border border-gray-200/30">
                              {plot.plotNumber}
                            </span>
                            <span className="text-[8px] font-mono font-bold uppercase tracking-widest opacity-70">
                              Sector {idx + 1}
                            </span>
                          </div>
                          <div className="mt-2">
                            <p className="text-[10px] font-bold tracking-tight line-clamp-1">{plot.cropType}</p>
                            <p className="text-[9px] font-mono opacity-85 mt-0.5">{plot.sizeHectares} {plot.sizeUnit || 'acre'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* RENDER ACTIVE PERSISTENT NOTE PINS */}
                  {mapNotes.map((note) => {
                    const isFocused = focusedPinId === note.id;
                    return (
                      <div
                        key={note.id}
                        className="map-pin-element absolute z-20 group -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                        style={{ left: `${note.x}%`, top: `${note.y}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPin(note);
                          setClickedCoords(null);
                        }}
                      >
                        {/* Halos for focused/highlighted state */}
                        {isFocused && (
                          <span className="absolute -inset-4 rounded-full bg-orange-500/30 animate-ping pointer-events-none" />
                        )}
                        <span className="absolute -inset-2 rounded-full bg-[#1B4332]/10 group-hover:scale-150 transition-transform duration-300 pointer-events-none" />
                        
                        {/* Pin marker wrapper */}
                        <div className={`p-1.5 rounded-full shadow border transition-all duration-300 ${
                          isFocused 
                            ? 'bg-orange-500 border-orange-600 text-white scale-125' 
                            : 'bg-white border-[#1B4332]/30 text-[#1B4332] hover:bg-emerald-50 hover:border-emerald-500 hover:scale-110'
                        }`}>
                          <MapPin className="h-4 w-4 fill-current" />
                        </div>
                      </div>
                    );
                  })}

                  {/* TEMPORARY PLACING CROSSHAIR / PIN INDICATOR */}
                  {clickedCoords && (
                    <div 
                      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 animate-pulse"
                      style={{ left: `${clickedCoords.x}%`, top: `${clickedCoords.y}%` }}
                    >
                      <div className="w-7 h-7 rounded-full border-2 border-orange-500 flex items-center justify-center bg-orange-100/40">
                        <Plus className="h-4 w-4 text-orange-600 font-bold" />
                      </div>
                      <span className="text-[8px] font-mono font-bold bg-orange-600 text-white px-1 rounded shadow">
                        X:{clickedCoords.x}% Y:{clickedCoords.y}%
                      </span>
                    </div>
                  )}

                  {/* ACTIVE PIN DETAILS OVERLAY TOOLTIP CARD */}
                  {selectedPin && (
                    <div 
                      className="map-pin-tooltip absolute z-40 bg-white rounded-xl shadow-xl border border-gray-150 p-4 w-72 max-w-[calc(100vw-2rem)] flex flex-col gap-2 -translate-x-1/2 transition-all duration-300"
                      style={{ 
                        left: `${selectedPin.x}%`, 
                        // Position above or below depending on coordinate
                        top: selectedPin.y > 60 ? `${selectedPin.y - 28}%` : `${selectedPin.y + 4}%`
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="p-1 bg-emerald-50 border border-emerald-100 rounded text-emerald-700">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-gray-800 leading-tight">{selectedPin.authorName}</p>
                            <p className="text-[8px] font-mono font-bold text-gray-400 uppercase tracking-wider mt-0.5">{selectedPin.authorRole}</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setSelectedPin(null)}
                          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="text-xs text-gray-700 font-sans leading-relaxed py-1 max-h-24 overflow-y-auto">
                        {selectedPin.note}
                      </div>

                      <div className="flex items-center justify-between border-t border-gray-50 pt-2 text-[9px] text-gray-400 font-mono">
                        <span>{getRelativeTime(selectedPin.createdAt)}</span>
                        
                        {(user.role === UserRole.ADMIN || selectedPin.authorId === user.id) && (
                          <button
                            type="button"
                            onClick={() => handleDeletePin(selectedPin.id)}
                            className="flex items-center gap-0.5 font-bold text-red-600 hover:text-red-800 hover:bg-red-50 px-1.5 py-0.5 rounded transition cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>DELETE</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CREATE PIN FLOATING CARD FORM */}
                  {clickedCoords && (
                    <form 
                      onSubmit={handleSavePin}
                      className="absolute bottom-4 left-4 right-4 z-40 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-150 p-4 flex flex-col sm:flex-row items-end gap-3"
                    >
                      <div className="flex-1 w-full space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono font-bold text-orange-700 uppercase tracking-wider flex items-center gap-1">
                            <Tag className="h-3.5 w-3.5" />
                            <span>DROP MANAGER PIN AT ({clickedCoords.x}%, {clickedCoords.y}%)</span>
                          </label>
                          <button 
                            type="button"
                            onClick={() => setClickedCoords(null)}
                            className="text-gray-400 hover:text-gray-600 p-0.5 hover:bg-gray-50 rounded"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <textarea
                          required
                          rows={2}
                          placeholder="Write agricultural details, irrigation instructions, soil treatment notes, or plot statuses..."
                          value={newPinNote}
                          onChange={(e) => setNewPinNote(e.target.value)}
                          className="w-full text-xs bg-white border border-gray-200 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none font-sans placeholder-gray-400"
                        />
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setClickedCoords(null)}
                          className="flex-1 sm:flex-initial px-3 py-2 border border-gray-200 text-gray-500 text-[10px] font-mono font-bold uppercase rounded-lg hover:bg-gray-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingPin}
                          className="flex-1 sm:flex-initial px-4 py-2 bg-orange-600 text-white text-[10px] font-mono font-bold uppercase rounded-lg hover:bg-orange-700 cursor-pointer flex items-center justify-center gap-1 shadow shadow-orange-600/30"
                        >
                          {savingPin ? 'Pinning...' : 'Drop Pin'}
                        </button>
                      </div>
                    </form>
                  )}

                </div>
              </div>
            </div>

            {/* Sidebar Pins List & Operational Map Legend (Right 1 column) */}
            <div className="flex flex-col gap-4">
              
              {/* Map Legend card */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-premium">
                <h4 className="font-sans font-bold text-gray-800 text-xs">Acreage & Canopy Legend</h4>
                <p className="text-[10px] text-gray-400 font-sans mt-0.5">Plot allocation operational indicators</p>
                
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border border-emerald-500/40 bg-emerald-500/10" />
                    <div>
                      <p className="text-[10px] font-bold text-emerald-800">ACTIVE CANOPY</p>
                      <p className="text-[9px] text-gray-400 leading-tight">Actively planted plots under contract.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border border-amber-500/40 bg-amber-500/10" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-800">HARVESTING STAGE</p>
                      <p className="text-[9px] text-gray-400 leading-tight">Crops undergoing harvest and processing.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border border-gray-500/40 bg-gray-500/10" />
                    <div>
                      <p className="text-[10px] font-bold text-gray-700">DORMANT FIELDS</p>
                      <p className="text-[9px] text-gray-400 leading-tight">Soil preparing, tilling, or resting.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border border-blue-500/40 bg-blue-500/10" />
                    <div>
                      <p className="text-[10px] font-bold text-blue-800">AVAILABLE PLOTS</p>
                      <p className="text-[9px] text-gray-400 leading-tight">Vacant parcels waiting for investor backing.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar list of pinned notes with hover pulse highlights! */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-premium flex-1 flex flex-col gap-3 min-h-[300px]">
                <div>
                  <h4 className="font-sans font-bold text-gray-800 text-xs">Supervisor Coordinates Feed</h4>
                  <p className="text-[10px] text-gray-400 font-sans mt-0.5">
                    {mapNotes.length} pinned agricultural status records
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 max-h-[380px] pr-1">
                  {mapNotes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-gray-100 rounded-xl">
                      <MapPin className="h-8 w-8 text-gray-300 stroke-1" />
                      <p className="text-[10px] text-gray-400 mt-2">No agricultural pins dropped on this estate yet.</p>
                    </div>
                  ) : (
                    mapNotes.map((note) => {
                      const isFocused = focusedPinId === note.id;
                      return (
                        <div 
                          key={note.id}
                          onMouseEnter={() => setFocusedPinId(note.id)}
                          onMouseLeave={() => setFocusedPinId(null)}
                          onClick={() => {
                            setSelectedPin(note);
                            setClickedCoords(null);
                            // Scroll map container to highlight if needed
                            const mapEl = document.getElementById('farm-estate-map-canvas');
                            if (mapEl) {
                              mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }
                          }}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-300 ${
                            isFocused 
                              ? 'border-orange-400 bg-orange-50/40 shadow-sm' 
                              : 'border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              Pin #{note.id.split('-')[2] || 'A'}
                            </span>
                            <span className="text-[9px] text-gray-400 font-mono">{getRelativeTime(note.createdAt)}</span>
                          </div>

                          <p className="text-xs text-gray-700 mt-2 line-clamp-2 leading-relaxed font-sans">{note.note}</p>

                          <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between text-[9px] text-gray-400 font-mono">
                            <span className="font-bold text-gray-600 truncate max-w-[120px]">{note.authorName}</span>
                            <span className="uppercase">{note.authorRole}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
