import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Sparkles, 
  Download, 
  FileText, 
  Search, 
  Database, 
  FileSpreadsheet, 
  Filter 
} from 'lucide-react';

interface CSVDataImporterProps {
  token: string;
  onSuccess: () => void;
}

export default function CSVDataImporter({ token, onSuccess }: CSVDataImporterProps) {
  // Navigation tab State
  const [activeSubTab, setActiveSubTab] = useState<'import' | 'export'>('import');

  // ==================== IMPORT WIZARD STATE ====================
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<any | null>(null);

  // ==================== EXPORT WIZARD STATE ====================
  const [exportPreviewData, setExportPreviewData] = useState<any[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch system data for export preview
  const fetchExportData = async () => {
    try {
      setExportLoading(true);
      const res = await fetch('/api/export/data', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to retrieve system export data');
      const data = await res.json();
      setExportPreviewData(data);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error loading system records for export');
    } finally {
      setExportLoading(false);
    }
  };

  // Automatically fetch export preview when switching to the export tab
  useEffect(() => {
    if (activeSubTab === 'export') {
      fetchExportData();
    }
  }, [activeSubTab]);

  // Helper to convert array of objects to CSV formatted string safely
  const convertToCSV = (objArray: any[]) => {
    if (objArray.length === 0) return '';
    
    // Headers are consistent with the Import format
    const headers = [
      'username',
      'name',
      'email',
      'phone',
      'password',
      'farmEstate',
      'farmLocation',
      'farmState',
      'farmDescription',
      'farmDateEstablished',
      'plotNumber',
      'sizeHectares',
      'sizeUnit',
      'cropType',
      'investmentAmount'
    ];

    let str = headers.join(',') + '\r\n';

    for (let i = 0; i < objArray.length; i++) {
      let line = '';
      for (let j = 0; j < headers.length; j++) {
        if (line !== '') line += ',';
        
        const key = headers[j];
        let val = objArray[i][key];
        
        if (val === undefined || val === null) {
          val = '';
        } else {
          val = String(val).replace(/"/g, '""'); // escape double quotes
          // If value contains comma, quotes or newline, wrap in quotes
          if (val.search(/("|,|\n)/g) >= 0) {
            val = `"${val}"`;
          }
        }
        line += val;
      }
      str += line + '\r\n';
    }
    return str;
  };

  // Perform client-side filtering on preview data
  const getFilteredExportData = () => {
    let list = [...exportPreviewData];
    if (roleFilter !== 'ALL') {
      list = list.filter(item => String(item.role).toUpperCase() === roleFilter.toUpperCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        String(item.name).toLowerCase().includes(q) ||
        String(item.email).toLowerCase().includes(q) ||
        String(item.username).toLowerCase().includes(q) ||
        String(item.farmEstate).toLowerCase().includes(q)
      );
    }
    return list;
  };

  const handleExecuteExport = () => {
    const dataToExport = getFilteredExportData();
    if (dataToExport.length === 0) {
      alert('No system data matched the current filter and search query.');
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `adubiaro_estates_export_${dateStr}`;

    if (exportFormat === 'json') {
      const jsonContent = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const csvContent = convertToCSV(dataToExport);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Import functions
  const handleDownloadTemplate = () => {
    const csvContent = 
      "username,name,email,phone,password,farmEstate,farmLocation,farmState,farmDescription,farmDateEstablished,plotNumber,sizeHectares,sizeUnit,cropType,investmentAmount\n" +
      "benson_oil,Olumide Benson,benson@oilpalm.com,+2348031111111,BensonSecret2026,Adubiaro Oil Palm Estate,Adubiaro City,Ondo,Premium oil palm cultivation estate,2025-01-15,P-101,2.5,acre,Oil Palm,5000000\n" +
      "chioma_farm,Chioma Adeleke,chioma@realestate.com,+2348052222222,ChiomaPass99,Ondo Cocoa Hills,Ondo Rural,Ondo,Organic high-yield cocoa farm estate,2024-11-01,P-102,1.2,plot,Cocoa,1800000\n" +
      "dan_investor,Daniel Yusuf,daniel@agroworld.com,+2348123333333,,Adubiaro Oil Palm Estate,Adubiaro City,Ondo,,,P-103,3.0,acre,Oil Palm,6000000\n";
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'unified_setup_wizard_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (selectedFile: File) => {
    setFile(selectedFile);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) {
          alert('CSV file is empty.');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, '').replace(/_/g, ''));
        const parsed: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Parse commas correctly considering quotes
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const char = line[charIndex];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());

          const record: any = {};
          headers.forEach((header, index) => {
            const val = values[index] ? values[index].replace(/^["']|["']$/g, '').trim() : '';
            if (header === 'username') record.username = val;
            if (header === 'name') record.name = val;
            if (header === 'email') record.email = val;
            if (header === 'phone' || header === 'telephone') record.phone = val;
            if (header === 'password') record.password = val;
            
            if (header === 'farmestate' || header === 'farm' || header === 'estate') record.farmEstate = val;
            if (header === 'farmlocation' || header === 'location' || header === 'farmcity') record.farmLocation = val;
            if (header === 'farmstate' || header === 'state') record.farmState = val;
            if (header === 'farmdescription' || header === 'description') record.farmDescription = val;
            if (header === 'farmdateestablished' || header === 'dateestablished') record.farmDateEstablished = val;
            
            if (header === 'plotnumber' || header === 'plotno') record.plotNumber = val;
            if (header === 'sizehectares' || header === 'plotsize' || header === 'size') record.sizeHectares = val;
            if (header === 'sizeunit' || header === 'unit' || header === 'plotunit') record.sizeUnit = val;
            if (header === 'croptype' || header === 'crop') record.cropType = val;
            if (header === 'investmentamount' || header === 'investment' || header === 'amount') record.investmentAmount = val;
          });

          if (record.username || record.name || record.email) {
            parsed.push(record);
          }
        }
        setRecords(parsed);
      } catch (err: any) {
        console.error(err);
        alert('Failed to parse CSV. Please make sure the format is valid.');
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleSubmit = async () => {
    if (records.length === 0) {
      alert('No valid records found in the CSV file.');
      return;
    }

    try {
      setUploading(true);
      setResults(null);

      const res = await fetch('/api/import/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ investors: records })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import CSV data');

      setResults(data);
      if (data.successCount > 0) {
        setFile(null);
        setRecords([]);
        onSuccess();
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred during CSV data import.');
    } finally {
      setUploading(false);
    }
  };

  const filteredExportData = getFilteredExportData();

  return (
    <div id="unified-data-console" className="space-y-6 text-left">
      {/* Console Sub-header Navigation */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-wrap gap-4">
        <div>
          <h3 className="font-sans font-extrabold text-base text-gray-800 flex items-center gap-2">
            <Database className="h-5 w-5 text-[#2D6A4F] shrink-0" />
            Unified Data Migration Wizard
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Perform bulk CSV imports or extract real-time system states atomically.
          </p>
        </div>

        {/* Custom Tab Switcher */}
        <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setActiveSubTab('import')}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'import' 
                ? 'bg-[#1B4332] text-white shadow-sm font-bold' 
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Import Wizard
          </button>
          <button
            onClick={() => setActiveSubTab('export')}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'export' 
                ? 'bg-[#1B4332] text-white shadow-sm font-bold' 
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Export Wizard
          </button>
        </div>
      </div>

      {/* ==================== IMPORT TAB INTERFACE ==================== */}
      {activeSubTab === 'import' && (
        <div className="space-y-6">
          <div className="bg-[#52B788]/5 border border-[#2D6A4F]/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-sans font-bold text-sm text-[#1B4332] flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#2D6A4F] animate-pulse" />
                CSV Bulk Importer
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5 max-w-lg">
                Onboard new investors, establish associated farm estates, and assign land plots atomically using a pre-formatted CSV template.
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 text-[10px] font-mono uppercase tracking-wider py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shrink-0 self-start sm:self-auto"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Import Template</span>
            </button>
          </div>

          {results && (
            <div className="p-4.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-3.5">
              <div className="flex items-center gap-2 text-[#1B4332] font-semibold text-xs">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                <span>CSV Import Completed!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 bg-white rounded-xl border border-emerald-100/50">
                  <span className="block text-[9px] uppercase font-mono text-gray-400">Total Rows</span>
                  <span className="text-base font-black font-mono text-gray-800">{results.total || 0}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-100/50">
                  <span className="block text-[9px] uppercase font-mono text-emerald-500">Users Registered</span>
                  <span className="text-base font-black font-mono text-emerald-600">{results.successCount || 0}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-100/50">
                  <span className="block text-[9px] uppercase font-mono text-amber-500">Estates Formed</span>
                  <span className="text-base font-black font-mono text-amber-600">{results.farmsCreatedCount || 0}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-100/50">
                  <span className="block text-[9px] uppercase font-mono text-blue-500">Plots Mapped</span>
                  <span className="text-base font-black font-mono text-blue-600">{results.plotsCreatedCount || 0}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-emerald-100/50">
                  <span className="block text-[9px] uppercase font-mono text-rose-400">Skipped / Failed</span>
                  <span className="text-base font-black font-mono text-rose-500">{results.failCount || 0}</span>
                </div>
              </div>

              {results.errors && results.errors.length > 0 && (
                <div className="bg-rose-50/50 border border-rose-100/60 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <span className="block text-[9px] uppercase font-mono font-bold text-rose-700 mb-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Errors & Skip Warning Logs
                  </span>
                  <ul className="space-y-1 text-xs text-rose-800 font-mono">
                    {results.errors.map((err: any, idx: number) => (
                      <li key={idx} className="border-b border-rose-100/30 pb-1 last:border-0">
                        Row {err.row}: <strong className="text-rose-900">{err.username || 'unknown'}</strong> - {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-12">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile && droppedFile.name.endsWith('.csv')) {
                    parseCSV(droppedFile);
                  } else {
                    alert('Please upload a valid CSV file.');
                  }
                }}
                className={`border-2 border-dashed rounded-3xl p-8 transition-all duration-300 text-center relative ${
                  isDragging 
                    ? 'border-[#2D6A4F] bg-emerald-50/40' 
                    : file 
                      ? 'border-emerald-200 bg-emerald-50/10' 
                      : 'border-gray-200 hover:border-[#2D6A4F]/20 bg-white'
                }`}
              >
                <input
                  type="file"
                  id="csv-file-importer-input"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <label htmlFor="csv-file-importer-input" className="cursor-pointer block space-y-2.5">
                  <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <UploadCloud className="h-5.5 w-5.5 text-[#2D6A4F]" />
                  </div>
                  {file ? (
                    <div>
                      <p className="text-xs font-mono font-bold text-gray-700 flex items-center justify-center gap-1">
                        <FileText className="h-4 w-4 text-emerald-600" />
                        {file.name}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB • Click or drop a new file to replace</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-sans font-bold text-gray-700">Drag & drop your customized CSV template here</p>
                      <p className="text-[10px] text-gray-400 mt-1">or click to browse local files</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {records.length > 0 && (
              <div className="md:col-span-12 bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="bg-gray-50/60 px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
                  <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider">CSV Data Content Preview ({records.length} records parsed)</span>
                  <span className="text-[9px] bg-emerald-100 text-[#1B4332] px-2 py-0.5 rounded-full font-bold uppercase font-mono border border-emerald-200/50">Validation Passed</span>
                </div>

                <div className="max-h-60 overflow-y-auto px-4">
                  <table className="w-full text-[11px] font-mono text-left">
                    <thead className="bg-gray-100/80 text-gray-400 sticky top-0 uppercase text-[9px] tracking-wider">
                      <tr>
                        <th className="p-2">User details</th>
                        <th className="p-2">Farm estate</th>
                        <th className="p-2">Land plot size</th>
                        <th className="p-2">Investment (NGN)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {records.map((rec, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="p-2">
                            <div className="font-bold text-gray-700">{rec.name || rec.username}</div>
                            <div className="text-[10px] text-gray-400">{rec.email}</div>
                          </td>
                          <td className="p-2 text-gray-600">
                            {rec.farmEstate ? (
                              <div>
                                <span className="font-semibold text-gray-800">{rec.farmEstate}</span>
                                {rec.farmLocation && <div className="text-[9px] text-gray-400">{rec.farmLocation}, {rec.farmState || 'Ondo'}</div>}
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="p-2 text-gray-600">
                            {rec.plotNumber || rec.sizeHectares ? (
                              <div>
                                Plot No: <span className="font-semibold text-gray-800">{rec.plotNumber || 'Auto'}</span>
                                <div>{rec.sizeHectares} {rec.sizeUnit || 'acre'} ({rec.cropType || 'Oil Palm'})</div>
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="p-2 font-bold text-emerald-700">
                            {rec.investmentAmount ? `₦${parseFloat(rec.investmentAmount).toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-gray-50/30 border-t border-gray-100 flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => { setFile(null); setRecords([]); }}
                    className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-[10px] font-mono uppercase tracking-wider py-2 px-4 rounded-xl cursor-pointer"
                  >
                    Clear File
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={uploading}
                    className="bg-[#2D6A4F] text-white hover:bg-[#1B4332] text-[10px] font-mono uppercase tracking-wider py-2 px-5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Importing to system...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Upload & Execute CSV</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== EXPORT TAB INTERFACE ==================== */}
      {activeSubTab === 'export' && (
        <div className="space-y-6">
          {/* Top Info & Format Selector */}
          <div className="bg-amber-50/40 border border-amber-100 rounded-3xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-sans font-bold text-sm text-amber-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-amber-700" />
                  Extract & Export System Data
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Download a snapshot of users, estates, and plot structures in either standardized CSV or structured JSON formats.
                </p>
              </div>

              {/* Format selection toggles */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setExportFormat('csv')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border cursor-pointer transition-all ${
                    exportFormat === 'csv' 
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm' 
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  CSV Format
                </button>
                <button
                  onClick={() => setExportFormat('json')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border cursor-pointer transition-all ${
                    exportFormat === 'json' 
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm' 
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  JSON Format
                </button>
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 pt-1.5">
              {/* Role filter */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Role Classification
                </label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All System Roles</option>
                  <option value="INVESTOR">Investors Only</option>
                  <option value="FARM_MANAGER">Farm Managers</option>
                  <option value="ADMIN">Super Admins</option>
                </select>
              </div>

              {/* Text Search filter */}
              <div className="sm:col-span-5 space-y-1">
                <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Search className="h-3 w-3" /> Live Query Filtering
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name, username, email, or estate..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-amber-500"
                  />
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                </div>
              </div>

              {/* Actions */}
              <div className="sm:col-span-3 flex items-end gap-2">
                <button
                  onClick={fetchExportData}
                  disabled={exportLoading}
                  className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 p-2 rounded-xl cursor-pointer shrink-0"
                  title="Reload Latest Data"
                >
                  <RefreshCw className={`h-4 w-4 ${exportLoading ? 'animate-spin' : ''}`} />
                </button>
                
                <button
                  onClick={handleExecuteExport}
                  disabled={exportLoading || filteredExportData.length === 0}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-mono uppercase tracking-wider text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span>Download File ({filteredExportData.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Export Records Preview Table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider">
                System Export Preview ({filteredExportData.length} matches out of {exportPreviewData.length} records)
              </span>
              <span className="text-[9px] bg-amber-100 text-amber-800 font-mono font-bold px-2 py-0.5 rounded-full border border-amber-200">
                Live Data Sandbox
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto px-4">
              {exportLoading ? (
                <div className="py-12 text-center space-y-2">
                  <RefreshCw className="h-8 w-8 text-amber-500 animate-spin mx-auto" />
                  <p className="text-xs text-gray-400 font-mono">Syncing system database schema records...</p>
                </div>
              ) : filteredExportData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-mono text-xs">
                  No matches found for your current filtering parameters.
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono text-left">
                  <thead className="bg-gray-100 text-gray-400 sticky top-0 uppercase text-[9px] tracking-wider">
                    <tr>
                      <th className="p-2">User / Role</th>
                      <th className="p-2">Contact details</th>
                      <th className="p-2">Farm & Plot details</th>
                      <th className="p-2">Investment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredExportData.map((rec, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="p-2">
                          <div className="font-bold text-gray-700">{rec.name}</div>
                          <div className="text-[10px] text-[#2D6A4F] font-semibold">{rec.username}</div>
                          <span className="inline-block text-[8px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase mt-0.5 font-mono">
                            {rec.role || 'INVESTOR'}
                          </span>
                        </td>
                        <td className="p-2 text-gray-600">
                          <div>{rec.email}</div>
                          <div className="text-[10px] text-gray-400">{rec.phone || '—'}</div>
                        </td>
                        <td className="p-2 text-gray-600">
                          {rec.farmEstate ? (
                            <div>
                              <span className="font-bold text-gray-800">{rec.farmEstate}</span>
                              <div className="text-[10px] text-gray-400">
                                {rec.plotNumber ? `Plot: ${rec.plotNumber}` : 'Unassigned'} • {rec.sizeHectares || '0'} {rec.sizeUnit || 'acre'} ({rec.cropType || 'Oil Palm'})
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300">No linked plot</span>
                          )}
                        </td>
                        <td className="p-2 font-black text-[#1B4332]">
                          {rec.investmentAmount ? `₦${parseFloat(rec.investmentAmount).toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
