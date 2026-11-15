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
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { DataTable } from './ui/data-table';
import { formatNaira, useIsDark, chartTheme } from '../lib/utils';
import { User, FinancialStatus } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from './ui/sonner';

const periodOrder: Record<string, number> = {
  'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4,
  'JANUARY': 1, 'FEBRUARY': 2, 'MARCH': 3, 'APRIL': 4, 'MAY': 5, 'JUNE': 6,
  'JULY': 7, 'AUGUST': 8, 'SEPTEMBER': 9, 'OCTOBER': 10, 'NOVEMBER': 11, 'DECEMBER': 12,
  'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
};

/** Hover tooltip: text uses text colours, the swatch carries the series colour. */
const ChartTooltip = ({ active, payload, label, format }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-2 text-muted-foreground">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
        {p.name}: <span className="font-semibold text-foreground">{format(p.value)}</span>
      </p>
    </div>
  );
};

const compactNaira = (v: number) => `₦${v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : v}`;

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'default' | 'muted' }> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  partial: { label: 'Part paid', variant: 'default' }
};

interface FinancialsViewProps {
  user: User;
  token: string;
  refreshSignal: number;
}

export default function FinancialsView({ user, token, refreshSignal }: FinancialsViewProps) {
  const dark = useIsDark();
  const ct = chartTheme(dark);
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
        throw new Error(errJson.error || 'You do not have access to payout records.');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]" role="status" aria-label="Loading payouts">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/40">
        <h3 className="font-bold text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> We could not load payouts</h3>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </Card>
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
      'Period',
      ...(user.role === 'admin' ? ['Investor'] : []),
      'Plot',
      'Crop',
      'Payout (NGN)',
      'Return (%)',
      'Payout date',
      'Status',
      'Notes'
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
        title: 'Adubiaro Farms - Payout Statement',
        subject: 'Payout statement',
        author: 'Adubiaro Farms',
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
      doc.text('INVESTOR PORTAL • PAYOUT STATEMENT', 14, 25);

      // 3. Document Details & Stats
      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('STATEMENT', 14, 48);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(user.role === 'admin' ? 'All investors' : `Investor: ${user.name}`, 14, 55);
      doc.text(`Date of Issue: ${new Date().toLocaleDateString('en-GB')}`, 14, 61);
      doc.text('Figures as recorded in the investor portal on the date of issue.', 14, 67);

      // Investment totals Summary block
      doc.setFillColor(248, 248, 244); // Soft warm white/beige
      doc.rect(120, 42, 76, 28, 'F');
      doc.setDrawColor(212, 160, 23); // Accent gold border (#D4A017)
      doc.rect(120, 42, 76, 28, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(27, 67, 50);
      doc.text('SUMMARY', 125, 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Paid to date: NGN ${totalPaid.toLocaleString()}`, 125, 54);
      doc.text(`Pending: NGN ${totalPending.toLocaleString()}`, 125, 59);
      doc.text(`Average return: ${avgRoi.toFixed(1)}%`, 125, 64);

      // 4. Line divider
      doc.setDrawColor(230, 230, 230);
      doc.line(14, 76, 196, 76);

      // 5. Table Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(27, 67, 50);
      doc.text('PAYOUTS', 14, 84);

      // 6. Build autoTable
      const tableHeaders = [
        'Period',
        ...(user.role === 'admin' ? ['Investor'] : []),
        'Plot',
        'Crop',
        'Payout',
        'Return %',
        'Payout date',
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
            `Page ${data.pageNumber} • Adubiaro Farms payout statement`,
            14,
            doc.internal.pageSize.height - 10
          );
        }
      });

      // Save PDF
      doc.save(`adubiaro_payout_statement_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      toast.error('An error occurred during PDF generation. Please try again.');
    }
  };

  const columns: ColumnDef<any>[] = [
    { id: 'period', header: 'Period', accessorFn: f => (parseInt(f.year) || 0) * 100 + (periodOrder[String(f.period).toUpperCase()] || 0), cell: ({ row }) => <span className="font-semibold whitespace-nowrap">{row.original.period} {row.original.year}</span> },
    ...(user.role === 'admin' ? [{ accessorKey: 'investorName', header: 'Investor' } as ColumnDef<any>] : []),
    { accessorKey: 'plotNumber', header: 'Plot', cell: ({ getValue }) => <span className="font-mono text-xs whitespace-nowrap">{getValue() as string}</span> },
    { accessorKey: 'cropType', header: 'Crop' },
    { accessorKey: 'payoutAmount', header: 'Payout', cell: ({ getValue }) => <span className="font-semibold whitespace-nowrap">{formatNaira(getValue() as number)}</span> },
    { accessorKey: 'roiPercentage', header: 'Return', cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as number}%</span> },
    { accessorKey: 'payoutDate', header: 'Payout date', cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() ? new Date(getValue() as string).toLocaleDateString() : '—'}</span> },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const st = STATUS[getValue() as string] || { label: String(getValue()), variant: 'muted' as const };
        return <Badge variant={st.variant}>{st.label}</Badge>;
      }
    },
    { accessorKey: 'notes', header: 'Notes', enableSorting: false, cell: ({ getValue }) => <span className="block max-w-[260px] whitespace-normal text-muted-foreground">{(getValue() as string) || '—'}</span> }
  ];

  const axisProps = { stroke: ct.axis, fontSize: 12, tickLine: false, axisLine: false };

  return (
    <div id="financials-stage" className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl text-foreground">Payouts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user.role === 'admin' ? 'Returns paid and due to investors, by period.' : 'The returns paid and due to you, by period.'}
          </p>
        </div>
        {financials.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportToCSV}><Download /> Download CSV</Button>
            <Button onClick={handleExportToPDF}><FileDown /> Download PDF statement</Button>
          </div>
        )}
      </div>

      <section aria-label="Payout summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, label: 'Paid to date', value: formatNaira(totalPaid) },
          { icon: Calendar, label: 'Pending', value: formatNaira(totalPending) },
          { icon: TrendingUp, label: 'Average return', value: `${avgRoi.toFixed(1)}%` },
          { icon: Layers, label: 'Payout records', value: financials.length }
        ].map(s => (
          <Card key={s.label} className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary"><s.icon className="h-6 w-6" aria-hidden="true" /></div>
            <div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold text-foreground mt-0.5">{s.value}</div>
            </div>
          </Card>
        ))}
      </section>

      {financials.length > 0 && (
        <div id="financials-charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Payouts by period</CardTitle>
              <CardDescription>Total paid or due in each period (₦)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={ct.grid} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} width={56} tickFormatter={compactNaira} />
                    <Tooltip cursor={{ fill: ct.grid, opacity: 0.5 }} content={<ChartTooltip format={formatNaira} />} />
                    <Bar dataKey="payout" name="Payout" fill={ct.series} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Average return by period</CardTitle>
              <CardDescription>Return on investment for each period (%)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={ct.grid} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} width={44} tickFormatter={v => `${v}%`} />
                    <Tooltip cursor={{ stroke: ct.axis, strokeDasharray: '3 3' }} content={<ChartTooltip format={(v: number) => `${v}%`} />} />
                    <Line type="monotone" dataKey="roi" name="Average return" stroke={ct.series} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: ct.surface }} activeDot={{ r: 6, stroke: ct.surface, strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <section aria-labelledby="payout-table-heading" className="flex flex-col gap-3">
        <h2 id="payout-table-heading" className="font-bold text-lg">All payouts</h2>
        <DataTable columns={columns} data={financials} searchPlaceholder="Search payouts…" emptyMessage="No payouts have been recorded yet." />
      </section>
    </div>
  );
}
