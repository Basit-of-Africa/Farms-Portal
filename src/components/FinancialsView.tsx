/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  Calendar,
  Layers,
  ArrowRight,
  Download,
  FileDown
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { User, FinancialStatus } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const periodOrder: Record<string, number> = {
  'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4,
  'JANUARY': 1, 'FEBRUARY': 2, 'MARCH': 3, 'APRIL': 4, 'MAY': 5, 'JUNE': 6,
  'JULY': 7, 'AUGUST': 8, 'SEPTEMBER': 9, 'OCTOBER': 10, 'NOVEMBER': 11, 'DECEMBER': 12,
  'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-stone-900 border border-[#2D6A4F]/20 p-4 rounded-xl shadow-xl font-sans text-xs space-y-1.5">
        <p className="font-bold text-[#1B4332] dark:text-emerald-400 font-mono mb-1">{label}</p>
        {payload.map((pld: any, index: number) => {
          const isNaira = pld.name.toLowerCase().includes('payout') || pld.name.toLowerCase().includes('returns') || pld.name.toLowerCase().includes('cumulative');
          const valueStr = isNaira 
            ? `₦${Number(pld.value).toLocaleString()}` 
            : `${pld.value}%`;
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400 font-medium">{pld.name}:</span>
              <span className="font-extrabold font-mono" style={{ color: pld.color }}>{valueStr}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

interface FinancialsViewProps {
  user: User;
  token: string;
  refreshSignal: number;
}

export default function FinancialsView({ user, token, refreshSignal }: FinancialsViewProps) {
  const [financials, setFinancials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinancials = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/financials/my', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Access boundary triggered');
      }
      const data = await res.json();
      setFinancials(data);
    } catch (e: any) {
      setError(e.message || 'Error occurred loading financials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancials();
  }, [token, refreshSignal]);

  const getStatusBadgeClass = (status: FinancialStatus) => {
    switch (status) {
      case FinancialStatus.PAID: 
        return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25';
      case FinancialStatus.PENDING: 
        return 'bg-amber-500/15 text-amber-600 border-amber-500/25';
      case FinancialStatus.OVERDUE: 
        return 'bg-rose-500/15 text-rose-500 border-rose-500/25';
      case FinancialStatus.PARTIAL: 
        return 'bg-blue-500/15 text-blue-500 border-blue-500/25';
      default: 
        return 'bg-gray-500/15 text-gray-500 border-gray-500/25';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#1B4332] border-t-transparent animate-fade-in" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border-l-4 border-red-500 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-red-500 h-5 w-5 shrink-0" />
          <h3 className="font-sans font-bold text-sm text-red-800">Operational Security Violation</h3>
        </div>
        <p className="text-xs text-red-700 leading-relaxed max-w-xl">
          {error}. Under regulatory security policies, farm manager assignment operations are restricted from auditing financials. Please request assistance from administrative supervisors.
        </p>
      </div>
    );
  }

  // Math summary stats
  const totalPaid = financials.filter(f => f.status === 'paid').reduce((s, f) => s + f.payoutAmount, 0);
  const totalPending = financials.filter(f => f.status === 'pending').reduce((s, f) => s + f.payoutAmount, 0);
  const totalRoiCombined = financials.reduce((sum, f) => sum + (f.roiPercentage || 0), 0);
  const avgRoi = financials.length > 0 ? (totalRoiCombined / financials.length) : 0;

  // Process data for charts
  const aggregatedMap: Record<string, { label: string; payout: number; roi: number; count: number; sortKey: number }> = {};
  financials.forEach(f => {
    const yearVal = parseInt(f.year) || 2026;
    const p = String(f.period).toUpperCase();
    const order = periodOrder[p] || 0;
    const key = `${yearVal}-${p}`;
    const label = `${f.period} ${f.year}`;

    if (!aggregatedMap[key]) {
      aggregatedMap[key] = {
        label,
        payout: 0,
        roi: 0,
        count: 0,
        sortKey: yearVal * 100 + order
      };
    }
    
    aggregatedMap[key].payout += (f.payoutAmount || 0);
    aggregatedMap[key].roi += (f.roiPercentage || 0);
    aggregatedMap[key].count += 1;
  });

  const chartData = Object.values(aggregatedMap)
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(item => ({
      label: item.label,
      payout: item.payout,
      roi: item.count > 0 ? Number((item.roi / item.count).toFixed(1)) : 0,
    }));

  let cumulativeSum = 0;
  const trendData = chartData.map(item => {
    cumulativeSum += item.payout;
    return {
      ...item,
      cumulativePayout: cumulativeSum
    };
  });

  const handleExportToCSV = () => {
    if (financials.length === 0) return;

    // Helper to escape values for CSV formulation
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    };

    const headers = [
      'Billing Cycle',
      ...(user.role === 'admin' ? ['Investor Client'] : []),
      'Plot ID',
      'Crop Cultivar',
      'Net Payout (₦)',
      'Yield ROI (%)',
      'Ledger Date',
      'Status',
      'Auditor Remarks'
    ];

    const rows = financials.map(fin => [
      `${fin.period} ${fin.year}`,
      ...(user.role === 'admin' ? [fin.investorName || ''] : []),
      fin.plotNumber || '',
      fin.cropType || '',
      fin.payoutAmount || 0,
      fin.roiPercentage || 0,
      fin.payoutDate || '',
      fin.status || '',
      fin.notes || ''
    ]);

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `adubiaro_investment_payouts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportToPDF = () => {
    if (financials.length === 0) return;

    try {
      const doc = new jsPDF();

      // Set document properties
      doc.setProperties({
        title: 'Adubiaro Farms - Investment Statement',
        subject: 'Audited Financial Statement',
        author: 'Adubiaro Farms Admin Portal',
      });

      // 1. Header decoration banner
      doc.setFillColor(27, 67, 50); // Dark Green (#1B4332)
      doc.rect(0, 0, 210, 35, 'F');

      // 2. Header text
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('ADUBIARO FARMS', 14, 18);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(173, 223, 173); // Muted green-ish text
      doc.text('PRIVATE INVESTMENT PORTAL • AUDITED FINANCIAL STATEMENTS', 14, 25);

      // 3. Document Details & Stats
      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('STATEMENT DETAILS', 14, 48);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Generated By: ${user.role === 'admin' ? 'System Administrator' : 'Investor Client'}`, 14, 55);
      doc.text(`Date of Issue: ${new Date().toLocaleDateString('en-GB')}`, 14, 61);
      doc.text(`Database Authority: Verified Firestore Cloud Engine`, 14, 67);

      // Investment totals Summary block
      doc.setFillColor(248, 248, 244); // Soft warm white/beige
      doc.rect(120, 42, 76, 28, 'F');
      doc.setDrawColor(212, 160, 23); // Accent gold border (#D4A017)
      doc.rect(120, 42, 76, 28, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(27, 67, 50);
      doc.text('PORTFOLIO SUMMARY', 125, 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Total Payout Distributed: NGN ${totalPaid.toLocaleString()}`, 125, 54);
      doc.text(`Pending Disbursements:  NGN ${totalPending.toLocaleString()}`, 125, 59);
      doc.text(`Average Yield Performance:  ${avgRoi.toFixed(1)}%`, 125, 64);

      // 4. Line divider
      doc.setDrawColor(230, 230, 230);
      doc.line(14, 76, 196, 76);

      // 5. Table Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(27, 67, 50);
      doc.text('INVESTMENT LEDGER TRANSACTIONS', 14, 84);

      // 6. Build autoTable
      const tableHeaders = [
        'Billing Cycle',
        ...(user.role === 'admin' ? ['Investor Client'] : []),
        'Plot ID',
        'Crop Cultivar',
        'Net Payout',
        'ROI %',
        'Ledger Date',
        'Status'
      ];

      const tableRows = financials.map(fin => [
        `${fin.period} ${fin.year}`,
        ...(user.role === 'admin' ? [fin.investorName || ''] : []),
        fin.plotNumber || '',
        fin.cropType || '',
        `NGN ${Number(fin.payoutAmount || 0).toLocaleString()}`,
        `${fin.roiPercentage}%`,
        fin.payoutDate || '',
        String(fin.status).toUpperCase()
      ]);

      autoTable(doc, {
        startY: 90,
        head: [tableHeaders],
        body: tableRows,
        theme: 'grid',
        headStyles: {
          fillColor: [27, 67, 50], // Brand dark green
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [50, 50, 50]
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold' },
          1: user.role === 'admin' ? { halign: 'left' } : { halign: 'center' },
          2: user.role === 'admin' ? { halign: 'center' } : { halign: 'left' },
          3: { halign: 'left' },
          4: { halign: 'right' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: [250, 250, 248]
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
          // Footer
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(
            `Page ${data.pageNumber} • Adubiaro Farms Private Portal Statement`,
            14,
            doc.internal.pageSize.height - 10
          );
        }
      });

      // Save PDF
      doc.save(`adubiaro_financial_statement_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('An error occurred during PDF generation. Please try again.');
    }
  };

  return (
    <div id="financials-stage" className="space-y-8 animate-fade-in">
      
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-[#2D6A4F]/10 shadow-premium flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-serif font-extrabold text-2xl text-[#1B4332] tracking-wide">Investment Ledger Statements</h1>
          <p className="text-xs text-[#2c3e35]/60 font-mono mt-1">Notarized statements, audits & historical ROI payout records</p>
        </div>
        {financials.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportToCSV}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-50 hover:bg-stone-100 text-[#1B4332] rounded-xl text-xs font-bold transition duration-300 shadow-sm border border-stone-200 cursor-pointer"
            >
              <Download className="h-4 w-4 text-[#2D6A4F]" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleExportToPDF}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-[#52B788] hover:text-white rounded-xl text-xs font-bold transition duration-300 shadow-sm border border-[#52B788]/20 cursor-pointer"
            >
              <FileDown className="h-4 w-4 text-[#52B788] hover:text-white" />
              <span>Export PDF Statement</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <div className="bg-white p-6 rounded-2xl border border-[#2D6A4F]/10 shadow-premium hover:shadow-premium-hover transition duration-300 flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-[#1B4332] rounded-xl">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider">Distributed Payouts</div>
            <div className="text-xl font-extrabold text-[#1B4332] font-sans mt-1">₦{totalPaid?.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#2D6A4F]/10 shadow-premium hover:shadow-premium-hover transition duration-300 flex items-center gap-4">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider">Pending Disburse</div>
            <div className="text-xl font-extrabold text-gray-800 font-sans mt-1">₦{totalPending?.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#2D6A4F]/10 shadow-premium hover:shadow-premium-hover transition duration-300 flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider">Mean ROI Performance</div>
            <div className="text-xl font-extrabold text-[#1B4332] font-sans mt-1">{avgRoi?.toFixed(1)}%</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#2D6A4F]/10 shadow-premium hover:shadow-premium-hover transition duration-300 flex items-center gap-4">
          <div className="p-3.5 bg-stone-50 text-stone-600 rounded-xl">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider">Total Settlements</div>
            <div className="text-xl font-extrabold text-gray-800 font-sans mt-1">{financials.length} cycles</div>
          </div>
        </div>

      </div>

      {/* Charts Section */}
      {financials.length > 0 && (
        <div id="financials-charts" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Chart 1: ROI & Payouts */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-[#2D6A4F]/10 dark:border-stone-800 shadow-premium">
            <div className="flex flex-col mb-6">
              <h3 className="font-serif font-extrabold text-base text-[#1B4332] dark:text-emerald-400">Quarterly ROI & Payout Performance</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-1">Comparison of net payout amounts (₦) against yield ROI percentages</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-stone-800" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#888888" 
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="#1B4332" 
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                    tickLine={false}
                    tickFormatter={(value) => `₦${value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#D4A017" 
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                    tickLine={false}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif', paddingTop: '10px' }}
                    verticalAlign="bottom"
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="payout" 
                    name="Quarter Payout" 
                    stroke="#1B4332" 
                    strokeWidth={3} 
                    activeDot={{ r: 6 }} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="roi" 
                    name="Yield ROI %" 
                    stroke="#D4A017" 
                    strokeWidth={2} 
                    dot={{ r: 3, strokeWidth: 1, fill: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Investment Growth Trend */}
          <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-[#2D6A4F]/10 dark:border-stone-800 shadow-premium">
            <div className="flex flex-col mb-6">
              <h3 className="font-serif font-extrabold text-base text-[#1B4332] dark:text-emerald-400">Cumulative Investment Growth</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-1">Growth progression of cumulative ROI returns across billing cycles</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-stone-800" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#888888" 
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#2D6A4F" 
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                    tickLine={false}
                    tickFormatter={(value) => `₦${value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif', paddingTop: '10px' }}
                    verticalAlign="bottom"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cumulativePayout" 
                    name="Cumulative Returns" 
                    stroke="#2D6A4F" 
                    strokeWidth={4} 
                    activeDot={{ r: 7 }} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-[#2D6A4F]/10 shadow-premium overflow-hidden p-6">
        {financials.length === 0 ? (
          <div className="text-center p-12 text-gray-400 font-mono text-xs">
            No audited financial summaries found for your target plot allocations.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs bg-white rounded-xl">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 uppercase font-mono tracking-wider">
                  <th className="py-4 px-3 font-bold select-none">Billing Cycle</th>
                  {user.role === 'admin' && <th className="py-4 px-3 font-bold select-none">Investor Client</th>}
                  <th className="py-4 px-3 font-bold text-center select-none">Plot ID</th>
                  <th className="py-4 px-3 font-bold select-none">Crop cultivar</th>
                  <th className="py-4 px-3 font-bold text-right select-none">Net Payout</th>
                  <th className="py-4 px-3 font-bold text-center select-none">Yield ROI %</th>
                  <th className="py-4 px-3 font-bold select-none">Ledger Date</th>
                  <th className="py-4 px-3 font-bold text-center select-none">Status</th>
                  <th className="py-4 px-3 font-bold max-w-[200px] select-none">Auditor Remarks</th>
                </tr>
              </thead>
              <tbody>
                {financials.map((fin) => (
                  <tr key={fin.id} className="border-b last:border-0 border-gray-50 hover:bg-[#FBF9F4]/40 transition">
                    <td className="py-5 px-3 font-sans font-bold text-[#1B4332]">{fin.period} {fin.year}</td>
                    {user.role === 'admin' && (
                      <td className="py-5 px-3 font-semibold text-[#2c3e35] font-sans">{fin.investorName}</td>
                    )}
                    <td className="py-5 px-3 text-center font-mono text-[#1B4332] font-extrabold">{fin.plotNumber}</td>
                    <td className="py-5 px-3 text-[#2c3e35]/80 font-medium font-mono text-[11px] truncate">{fin.cropType}</td>
                    <td className="py-5 px-3 text-right font-sans font-extrabold text-[#1B4332]">₦{fin.payoutAmount?.toLocaleString()}</td>
                    <td className="py-5 px-3 text-center font-mono font-extrabold text-[#D4A017]">{fin.roiPercentage}%</td>
                    <td className="py-5 px-3 text-gray-400 font-mono text-[11px] font-semibold">{fin.payoutDate}</td>
                    <td className="py-5 px-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase rounded-full border ${getStatusBadgeClass(fin.status)}`}>
                        {fin.status}
                      </span>
                    </td>
                    <td className="py-5 px-3 text-gray-500 font-normal leading-relaxed font-sans max-w-[250px] truncate" title={fin.notes}>
                      {fin.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
