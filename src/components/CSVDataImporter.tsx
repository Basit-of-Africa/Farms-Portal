import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, RefreshCw, Sparkles, Download, FileText } from 'lucide-react';

interface CSVDataImporterProps {
  token: string;
  onSuccess: () => void;
}

export default function CSVDataImporter({ token, onSuccess }: CSVDataImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<any | null>(null);

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

  return (
    <div id="csv-data-importer-component" className="space-y-6">
      <div className="bg-[#52B788]/5 border border-[#2D6A4F]/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-sans font-bold text-sm text-[#1B4332] flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#2D6A4F] animate-pulse" />
            CSV Dynamic Importer
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-lg">
            Rapidly provision investors, allocate customized plot numbers, and register new farm estates on-the-fly directly from a standard CSV format.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90 text-[10px] font-mono uppercase tracking-wider py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shrink-0 self-start sm:self-auto"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download CSV Template</span>
        </button>
      </div>

      {results && (
        <div className="p-4.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-3.5">
          <div className="flex items-center gap-2 text-[#1B4332] font-semibold text-xs">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
            <span>CSV Import Summary</span>
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
  );
}
