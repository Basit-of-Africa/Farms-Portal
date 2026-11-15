/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Sprout, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  FileText, 
  PlusCircle, 
  RefreshCw, 
  UserPlus, 
  Briefcase, 
  CheckCircle2, 
  ShieldAlert,
  ArrowRight,
  Edit,
  Layers,
  UploadCloud,
  Sparkles,
  Settings,
  Database,
  Clock,
  HardDrive,
  Eye,
  EyeOff,
  ArrowLeft,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Landmark,
  Award
} from 'lucide-react';
import { User, Farm, FarmPlot, UserRole, DocumentCategory, DocumentVisibility, FinancialStatus } from '../types';
import DashboardStats from './DashboardStats';
import CSVDataImporter from './CSVDataImporter';
import { parseCsvRecords, INVESTOR_IMPORT_CSV_TEMPLATE } from '../utils/csvParser';
import { useImportReview } from './ImportReviewModal';
import { toast } from './ui/sonner';
import { useConfirm } from './ui/confirm';

interface AdminDashboardProps {
  user: User;
  token: string;
  onSelectFarm: (farmId: string) => void;
  onSelectInvestor?: (investorId: string) => void;
  triggerRefreshSignal: () => void;
  refreshSignal: number;
}

export default function AdminDashboard({ user, token, onSelectFarm, onSelectInvestor, triggerRefreshSignal, refreshSignal }: AdminDashboardProps) {
  const confirmDialog = useConfirm();
  const { reviewImport, reviewModal } = useImportReview(token);

  // Stats
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subView, setSubView] = useState<'default' | 'investors' | 'managers'>('default');

  // Lists
  const [farms, setFarms] = useState<Farm[]>([]);
  const [systemUsers, setSystemUsers] = useState<User[]>([]);
  const [systemPlots, setSystemPlots] = useState<any[]>([]);

  // Form states
  const [activeFormTab, setActiveFormTab] = useState<'payout' | 'document' | 'user' | 'plot' | 'assign' | 'farms' | 'settings' | 'wizard'>('wizard');

  // Backups and Maintenance Settings state
  const [backups, setBackups] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState<boolean>(false);
  const [triggeringBackup, setTriggeringBackup] = useState<boolean>(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [backupsSuccessMessage, setBackupsSuccessMessage] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState<boolean>(false);

  // Administrative Control & Feature custom-styling states
  const [sysSettings, setSysSettings] = useState<any>(null);
  const [loadingSysSettings, setLoadingSysSettings] = useState<boolean>(false);
  const [saveSysSuccess, setSaveSysSuccess] = useState<string | null>(null);
  const [saveSysError, setSaveSysError] = useState<string | null>(null);
  const [newCropTag, setNewCropTag] = useState<string>('');

  // 6. Manage Farm Estates (Add/Edit)
  const [selectedFarmToEdit, setSelectedFarmToEdit] = useState<string>('new'); // 'new' or specific farm.id
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [farmState, setFarmState] = useState('');
  const [farmCoverImage, setFarmCoverImage] = useState('');
  const [farmDescription, setFarmDescription] = useState('');
  const [farmDateEstablished, setFarmDateEstablished] = useState('');
  const [farmIsActive, setFarmIsActive] = useState(true);
  const [farmSuccessMessage, setFarmSuccessMessage] = useState<string | null>(null);
  const [isDraggingEstateImage, setIsDraggingEstateImage] = useState(false);

  // 1. Create User
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('investor');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userSuccessMessage, setUserSuccessMessage] = useState<string | null>(null);

  // 1b. Bulk CSV Import States
  const [userCreateMode, setUserCreateMode] = useState<'single' | 'bulk'>('single');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedInvestors, setParsedInvestors] = useState<any[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any | null>(null);
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);

  // 1c. Unified Import/Export Wizard States
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [parsedWizardRecords, setParsedWizardRecords] = useState<any[]>([]);
  const [wizardUploading, setWizardUploading] = useState(false);
  const [wizardResults, setWizardResults] = useState<any | null>(null);
  const [isDraggingWizard, setIsDraggingWizard] = useState(false);

  // 2. Allocate Plot
  const [allocFarmId, setAllocFarmId] = useState('');
  const [allocPlotNumber, setAllocPlotNumber] = useState('');
  const [allocSize, setAllocSize] = useState('');
  const [allocSizeUnit, setAllocSizeUnit] = useState<'acre' | 'plot'>('acre');
  const [allocCrop, setAllocCrop] = useState('Oil Palm (Tenera Hybrid)');
  const [allocInvestorId, setAllocInvestorId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [plotSuccessMessage, setPlotSuccessMessage] = useState<string | null>(null);

  // 3. Assign Manager
  const [assignFarmId, setAssignFarmId] = useState('');
  const [assignManagerId, setAssignManagerId] = useState('');
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null);

  // 4. Upload Financial Record
  const [finPlotId, setFinPlotId] = useState('');
  const [finPeriod, setFinPeriod] = useState('Q1');
  const [finYear, setFinYear] = useState('2026');
  const [finRoi, setFinRoi] = useState('');
  const [finAmount, setFinAmount] = useState('');
  const [finDate, setFinDate] = useState('');
  const [finNotes, setFinNotes] = useState('');
  const [finStatus, setFinStatus] = useState('pending');
  const [finSuccessMessage, setFinSuccessMessage] = useState<string | null>(null);

  // 5. Upload document
  const [docFarmId, setDocFarmId] = useState('');
  const [docPlotId, setDocPlotId] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('contract');
  const [docVisibility, setDocVisibility] = useState('farm');
  const [docDescription, setDocDescription] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docSuccessMessage, setDocSuccessMessage] = useState<string | null>(null);

  const fetchStatsAndLists = async () => {
    try {
      setLoading(true);
      setError(null);

      // Stats
      const statsRes = await fetch('/api/admin/system-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!statsRes.ok) {
        const body = await statsRes.json().catch(() => ({}));
        if (statsRes.status === 401) throw new Error('Your session has expired. Please sign in again.');
        throw new Error(`${body.error || 'The server could not load the dashboard'} (error ${statsRes.status}). Refresh the page to try again.`);
      }
      const statsData = await statsRes.json();
      setStats(statsData);

      // Farms
      const farmsRes = await fetch('/api/farms', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const farmsData = await farmsRes.json();
      setFarms(farmsData);
      if (farmsData.length > 0) {
        setAllocFarmId(farmsData[0].id);
        setAssignFarmId(farmsData[0].id);
        setDocFarmId(farmsData[0].id);
      }

      // Users
      const usersRes = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const usersData = await usersRes.json();
      setSystemUsers(usersData);
      
      const managers = usersData.filter((u: any) => u.role === 'farm_manager');
      if (managers.length > 0) setAssignManagerId(managers[0].id);

      const investors = usersData.filter((u: any) => u.role === 'investor');
      if (investors.length > 0) setAllocInvestorId(investors[0].id);

      // Plot ownership options for financials
      if (farmsData.length > 0) {
        const detailsRes = await fetch(`/api/farms/${farmsData[0].id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const detailsData = await detailsRes.json();
        setSystemPlots(detailsData.plots || []);
        if (detailsData.plots?.length > 0) {
          setFinPlotId(detailsData.plots[0].id);
          setDocPlotId(detailsData.plots[0].id);
        }
      }

    } catch (err: any) {
      setError(err.message || 'Stats retrieval error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserActive = async (targetUser: User) => {
    if (targetUser.id === user.id) {
      toast.error('You cannot deactivate your own super admin account.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/toggle-active`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to toggle account activation status');
      }

      await res.json();
      fetchStatsAndLists();
      if (triggerRefreshSignal) triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message || 'Error updating account status.');
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    if (targetUser.id === user.id) {
      toast.error('You cannot delete your own super admin account.');
      return;
    }

    if (!(await confirmDialog({ title: `Delete ${targetUser.name}?`, description: 'This permanently removes the account and cannot be undone. To erase personal data while keeping legally required records, use Privacy & Data instead.', confirmText: 'Delete user', destructive: true }))) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete account');
      }

      fetchStatsAndLists();
      if (triggerRefreshSignal) triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message || 'Error deleting user.');
    }
  };

  useEffect(() => {
    fetchStatsAndLists();
  }, [token, refreshSignal]);

  const fetchBackups = async () => {
    try {
      setLoadingBackups(true);
      setBackupsError(null);
      const res = await fetch('/api/admin/backups', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not load system backups');
      const data = await res.json();
      setBackups(data);
    } catch (err: any) {
      setBackupsError(err.message || 'Error fetching backups');
    } finally {
      setLoadingBackups(false);
    }
  };

  const fetchDbStatus = async () => {
    try {
      setLoadingDbStatus(true);
      const res = await fetch('/api/admin/db-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch (err) {
      console.warn('Failed to load DB status:', err);
    } finally {
      setLoadingDbStatus(false);
    }
  };

  const fetchSysSettings = async () => {
    try {
      setLoadingSysSettings(true);
      setSaveSysError(null);
      const res = await fetch('/api/admin/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not load system settings');
      const data = await res.json();
      setSysSettings(data);
    } catch (err: any) {
      setSaveSysError(err.message || 'Error occurred fetching configurations.');
    } finally {
      setLoadingSysSettings(false);
    }
  };

  const handleSaveSettings = async (updatedSettings: any) => {
    try {
      setSaveSysSuccess(null);
      setSaveSysError(null);
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedSettings)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update system settings');
      }
      const data = await res.json();
      setSysSettings(data);
      setSaveSysSuccess('System configurations updated successfully. Branding themes & features have been synchronized.');
      if (triggerRefreshSignal) {
        triggerRefreshSignal();
      }
      setTimeout(fetchDbStatus, 1500);
    } catch (err: any) {
      setSaveSysError(err.message || 'Error occurred while saving configurations.');
    }
  };

  const handleTriggerBackup = async () => {
    if (triggeringBackup) return;
    try {
      setTriggeringBackup(true);
      setBackupsError(null);
      setBackupsSuccessMessage(null);
      const res = await fetch('/api/admin/backups/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Backup failed to compile');
      const data = await res.json();
      setBackups(data.logs);
      setBackupsSuccessMessage('System state snapshotted & archived successfully. Timestamp logged.');
    } catch (err: any) {
      setBackupsError(err.message || 'Error occurred during backup extraction.');
    } finally {
      setTriggeringBackup(false);
    }
  };

  useEffect(() => {
    if (activeFormTab === 'settings') {
      fetchBackups();
      fetchDbStatus();
      fetchSysSettings();
    }
  }, [activeFormTab]);

  useEffect(() => {
    if (sysSettings?.allowedCrops && sysSettings.allowedCrops.length > 0) {
      setAllocCrop(sysSettings.allowedCrops[0]);
    }
  }, [sysSettings]);

  // Handle farm change in doc upload or plot allocations to fetch appropriate plot numbers
  const handleDocFarmChange = async (fId: string) => {
    setDocFarmId(fId);
    try {
      const detailsRes = await fetch(`/api/farms/${fId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const detailsData = await detailsRes.json();
      setSystemPlots(detailsData.plots || []);
      if (detailsData.plots?.length > 0) {
        setDocPlotId(detailsData.plots[0].id);
      } else {
        setDocPlotId('');
      }
    } catch {}
  };

  // Submit User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSuccessMessage(null);
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername,
          name: newName,
          email: newEmail,
          phone: newPhone,
          role: newRole,
          password: newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'User setup error');

      setUserSuccessMessage(`Account for ${data.name} (${data.role.toUpperCase()}) provisioned. Temporary password: ${data.temporaryPassword} (also sent in the welcome email; the user must change it at first sign-in).`);
      setNewUsername('');
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Handle CSV file processing and parsing
  const handleCsvSelect = (file: File) => {
    if (!file) return;
    setCsvFile(file);
    setBulkResults(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      try {
        const { headers, records } = parseCsvRecords(text);
        if (headers.length === 0) {
          toast.error('CSV file is empty.');
          return;
        }
        
        // Usernames are optional: they are created from email addresses when missing
        const hasName = headers.some(h => ['name', 'fullname', 'investorname'].includes(h));
        const hasEmail = headers.some(h => ['email', 'emailaddress'].includes(h));
        
        if (!hasName || !hasEmail) {
          toast.error('CSV file must have at least "name" and "email" columns.');
          return;
        }
        
        setParsedInvestors(records);
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse CSV file. Ensure it is a valid comma-separated format.');
      }
    };
    reader.readAsText(file);
  };

  const handleBulkUploadInvestors = async () => {
    if (parsedInvestors.length === 0) {
      toast.error('No parsed investor records to upload.');
      return;
    }
    
    try {
      setBulkUploading(true);
      setBulkResults(null);
      
      const data = await reviewImport(parsedInvestors);
      if (!data) return;
      
      setBulkResults(data);
      if (data.successCount > 0) {
        setCsvFile(null);
        setParsedInvestors([]);
        triggerRefreshSignal();
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred during bulk import.');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = 
      "username,name,email,phone,password\n" +
      "benson_oil,Olumide Benson,benson@oilpalm.com,+2348031111111,BensonSecret2026\n" +
      "chioma_farm,Chioma Adeleke,chioma@realestate.com,+2348052222222,ChiomaPass99\n" +
      "dan_investor,Daniel Yusuf,daniel@agroworld.com,+2348123333333,\n" +
      "funmi_peaks,Funmilayo Alao,funmi@estatemanager.com,,\n";
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'adubiaro_investors_bulk_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadWizardCsvTemplate = () => {
    const csvContent = 
      INVESTOR_IMPORT_CSV_TEMPLATE;
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'unified_setup_wizard_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadWizardJsonTemplate = () => {
    const jsonContent = JSON.stringify([
      {
        "username": "benson_oil",
        "name": "Olumide Benson",
        "email": "benson@oilpalm.com",
        "phone": "+2348031111111",
        "password": "BensonSecret2026",
        "farmEstate": "Adubiaro Oil Palm Estate",
        "farmLocation": "Adubiaro City",
        "farmState": "Ondo",
        "farmDescription": "Premium oil palm cultivation estate",
        "farmDateEstablished": "2025-01-15",
        "plotNumber": "P-101",
        "sizeHectares": 2.5,
        "sizeUnit": "acre",
        "cropType": "Oil Palm",
        "investmentAmount": 5000000
      },
      {
        "username": "chioma_farm",
        "name": "Chioma Adeleke",
        "email": "chioma@realestate.com",
        "phone": "+2348052222222",
        "password": "ChiomaPass99",
        "farmEstate": "Ondo Cocoa Hills",
        "farmLocation": "Ondo Rural",
        "farmState": "Ondo",
        "farmDescription": "Organic high-yield cocoa farm estate",
        "farmDateEstablished": "2024-11-01",
        "plotNumber": "",
        "sizeHectares": 1.2,
        "sizeUnit": "plot",
        "cropType": "Cocoa",
        "investmentAmount": 1800000
      }
    ], null, 2);

    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'unified_setup_wizard_template.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleWizardFileSelect = (file: File) => {
    if (!file) return;
    setWizardFile(file);
    setWizardResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          const records = Array.isArray(parsed) ? parsed : (parsed.investors || parsed.records || []);
          if (!Array.isArray(records)) {
            toast.error('JSON must be an array of objects or contain a "records"/"investors" list.');
            return;
          }
          setParsedWizardRecords(records);
        } else {
          const { headers, records } = parseCsvRecords(text);
          if (headers.length === 0) {
            toast.error('CSV file is empty.');
            return;
          }
          setParsedWizardRecords(records);
        }
      } catch (err: any) {
        console.error(err);
        toast.error('Failed to parse file. Please verify format.');
      }
    };
    reader.readAsText(file);
  };

  const handleWizardSubmit = async () => {
    if (parsedWizardRecords.length === 0) {
      toast.error('No parsed records to import.');
      return;
    }

    try {
      setWizardUploading(true);
      setWizardResults(null);

      const data = await reviewImport(parsedWizardRecords, { rowOffset: wizardFile?.name.toLowerCase().endsWith('.json') ? 0 : 1 });
      if (!data) return;

      setWizardResults(data);
      if (data.successCount > 0) {
        setWizardFile(null);
        setParsedWizardRecords([]);
        triggerRefreshSignal();
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred during wizard import.');
    } finally {
      setWizardUploading(false);
    }
  };

  // Submit Plot
  const handleAllocatePlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlotSuccessMessage(null);
    try {
      const res = await fetch('/api/admin/plots/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          farmId: allocFarmId,
          plotNumber: allocPlotNumber,
          sizeHectares: allocSize,
          sizeUnit: allocSizeUnit,
          cropType: allocCrop,
          InvestorId: allocInvestorId,
          investmentAmount: allocAmount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Plot allotment error');

      setPlotSuccessMessage(`Plot ${allocPlotNumber} allocated successfully to investor.`);
      setAllocPlotNumber('');
      setAllocSize('');
      setAllocAmount('');
      triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Assign Manager
  const handleAssignManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignSuccessMessage(null);
    try {
      const res = await fetch('/api/admin/assignments/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          managerId: assignManagerId,
          farmId: assignFarmId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assignment error');

      setAssignSuccessMessage(`Farm Manager successfuly linked and registered for updates.`);
      triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Submit Financials
  const handleCreateFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    setFinSuccessMessage(null);
    try {
      const res = await fetch('/api/financials/upload', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plotId: finPlotId,
          period: finPeriod,
          year: finYear,
          roiPercentage: finRoi,
          payoutAmount: finAmount,
          payoutDate: finDate,
          notes: finNotes,
          status: finStatus
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payout ledger filing error');

      setFinSuccessMessage(`Financial ledger record for ${finPeriod} ${finYear} published. Soil signals emailed investor.`);
      setFinRoi('');
      setFinAmount('');
      setFinNotes('');
      triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Document Upload Submit Form
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocSuccessMessage(null);
    if (!docFile) {
      toast.error('Attach a valid legal file.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', docFile);
      formData.append('title', docTitle);
      formData.append('category', docCategory);
      formData.append('visibility', docVisibility);
      formData.append('description', docDescription);
      if (docVisibility === 'plot') {
        formData.append('plotId', docPlotId);
      }

      const res = await fetch(`/api/documents/farm/${docFarmId}/upload`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server file upload error');

      setDocSuccessMessage(`Document "${data.title}" successfully loaded and encrypted.`);
      setDocTitle('');
      setDocDescription('');
      setDocFile(null);
      triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const parseAndSetCoverPhoto = (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is customly large. Please select an image under 5MB for optimized storage.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setFarmCoverImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle select farm to edit changes or load initial values
  const handleSelectFarmToEditChange = (farmId: string) => {
    setSelectedFarmToEdit(farmId);
    setFarmSuccessMessage(null);
    if (farmId === 'new') {
      setFarmName('');
      setFarmLocation('');
      setFarmState('');
      setFarmCoverImage('');
      setFarmDescription('');
      setFarmDateEstablished(new Date().toISOString().split('T')[0]);
      setFarmIsActive(true);
    } else {
      const farm = farms.find(f => f.id === farmId);
      if (farm) {
        setFarmName(farm.name);
        setFarmLocation(farm.location);
        setFarmState(farm.state);
        setFarmCoverImage(farm.coverImage || '');
        setFarmDescription(farm.description || '');
        setFarmDateEstablished(farm.dateEstablished || '');
        setFarmIsActive(farm.isActive);
      }
    }
  };

  // Submit Farm addition or edit
  const handleSaveFarmEstate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFarmSuccessMessage(null);

    try {
      const isNew = selectedFarmToEdit === 'new';
      const endpoint = isNew ? '/api/admin/farms/create' : `/api/admin/farms/${selectedFarmToEdit}/update`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: farmName,
          location: farmLocation,
          state: farmState,
          coverImage: farmCoverImage,
          description: farmDescription,
          dateEstablished: farmDateEstablished,
          isActive: farmIsActive
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save estate details');

      if (isNew) {
        setFarmSuccessMessage(`New Farm Estate "${data.name}" added successfully!`);
        // Reset state
        setFarmName('');
        setFarmLocation('');
        setFarmState('');
        setFarmCoverImage('');
        setFarmDescription('');
        setFarmDateEstablished('');
      } else {
        setFarmSuccessMessage(`Farm Estate "${data.name}" updated successfully!`);
      }

      triggerRefreshSignal();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleQuickEditFarm = (farm: Farm, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent clicking cards to also explore
    setActiveFormTab('farms');
    setSelectedFarmToEdit(farm.id);
    setFarmName(farm.name);
    setFarmLocation(farm.location);
    setFarmState(farm.state);
    setFarmCoverImage(farm.coverImage || '');
    setFarmDescription(farm.description || '');
    setFarmDateEstablished(farm.dateEstablished || '');
    setFarmIsActive(farm.isActive);
    setFarmSuccessMessage(null);
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#1B4332] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-6 bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 rounded-xl flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-bold text-red-800 dark:text-red-300">The dashboard could not load</h3>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
        </div>
        <div>
          <button onClick={fetchStatsAndLists} className="px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold cursor-pointer hover:bg-[#2D6A4F]">Try again</button>
        </div>
      </div>
    );
  }

  if (subView === 'investors') {
    const investorsList = systemUsers.filter(usr => usr.role === UserRole.INVESTOR);

    return (
      <div className="space-y-8 animate-fade-in">
        {/* Breadcrumb Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-premium">
          <div>
            <button 
              onClick={() => setSubView('default')}
              className="flex items-center gap-1 text-xs font-mono font-bold text-[#2D6A4F] hover:text-primary transition cursor-pointer mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Admin Dashboard</span>
            </button>
            <h1 className="font-serif font-extrabold text-2xl text-primary tracking-wide">Investor Directory</h1>
            <p className="text-xs text-muted-foreground font-mono mt-1 font-bold">
              {investorsList.length} registered investors & their active holding portfolios
            </p>
          </div>
          <div>
            <button 
              onClick={() => {
                setActiveFormTab('user');
                setNewRole('investor');
                setSubView('default');
                setTimeout(() => {
                  const el = document.getElementById('admin-actions-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-xl text-xs font-mono font-bold cursor-pointer shadow-sm transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Add New Investor</span>
            </button>
          </div>
        </div>

        {/* Investors Cards List */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {investorsList.map((usr) => {
            // Find owned plots
            const holdings = stats?.investorPlots?.filter((ip: any) => ip.investorId === usr.id && ip.isActive) || [];
            const totalInvestedAmount = holdings.reduce((sum: number, ip: any) => sum + ip.investmentAmount, 0);

            return (
              <div 
                key={usr.id} 
                className={`bg-card rounded-3xl border ${usr.isActive !== false ? 'border-border' : 'border-red-200/45 bg-red-50/10'} p-6 shadow-premium transition duration-300 hover:shadow-lg`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border pb-4">
                  {onSelectInvestor ? (
                    <button
                      type="button"
                      onClick={() => onSelectInvestor(usr.id)}
                      className="flex items-center gap-3 text-left group/profile cursor-pointer"
                      title={`View ${usr.name}'s portfolio & returns`}
                    >
                      <div className="h-12 w-12 bg-[#52B788]/10 group-hover/profile:bg-[#1B4332] rounded-full flex items-center justify-center font-bold text-primary group-hover/profile:text-white text-sm shrink-0 border border-[#52B788]/20 transition-colors">
                        {usr.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-serif font-bold text-base text-primary group-hover/profile:text-[#2D6A4F] group-hover/profile:underline flex items-center gap-2 transition-colors">
                          {usr.name}
                          {usr.isActive === false && (
                            <span className="text-[9px] font-mono font-extrabold bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200 uppercase">
                              Inactive
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-muted-foreground font-mono">@{usr.username} • {usr.id}</p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 bg-[#52B788]/10 rounded-full flex items-center justify-center font-bold text-primary text-sm shrink-0 border border-[#52B788]/20">
                        {usr.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-serif font-bold text-base text-primary flex items-center gap-2">
                          {usr.name}
                          {usr.isActive === false && (
                            <span className="text-[9px] font-mono font-extrabold bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200 uppercase">
                              Inactive
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-muted-foreground font-mono">@{usr.username} • {usr.id}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Administrative Controls */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      onClick={() => handleToggleUserActive(usr)}
                      disabled={usr.id === user.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg border cursor-pointer transition ${
                        usr.isActive !== false
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          : 'text-muted-foreground bg-muted/50 border-border hover:bg-muted'
                      } ${usr.id === user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={usr.isActive !== false ? 'Deactivate investor' : 'Activate investor'}
                    >
                      {usr.isActive !== false ? (
                        <>
                          <ToggleRight className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>ACTIVE</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">INACTIVE</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteUser(usr)}
                      disabled={usr.id === user.id}
                      className={`p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer ${
                        usr.id === user.id ? 'opacity-30 cursor-not-allowed' : ''
                      }`}
                      title="Permanently delete user"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-border text-xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">Email Address</span>
                    <span className="font-medium text-foreground block mt-0.5">{usr.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">Phone Number</span>
                    <span className="font-medium text-foreground block mt-0.5">{usr.phone || 'N/A'}</span>
                  </div>
                </div>

                {/* Portfolio Holdings */}
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase text-[#2D6A4F]/80 font-bold tracking-wider flex items-center gap-1">
                      <Landmark className="h-3.5 w-3.5 text-amber-500" />
                      <span>Allocated Holdings ({holdings.length})</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-primary">
                      Total Invested: ₦{totalInvestedAmount.toLocaleString()}
                    </span>
                  </div>

                  {holdings.length === 0 ? (
                    <div className="p-4 bg-muted/50 rounded-2xl border border-border text-center">
                      <p className="text-[11px] text-muted-foreground italic">No plots active or allocated to this investor.</p>
                      <button
                        onClick={() => {
                          setActiveFormTab('plot');
                          setAllocInvestorId(usr.id);
                          setSubView('default');
                          setTimeout(() => {
                            const el = document.getElementById('admin-actions-section');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        className="text-[10px] font-mono font-extrabold text-emerald-600 hover:text-primary mt-1 hover:underline cursor-pointer"
                      >
                        + Allocate Plot Record
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {holdings.map((h: any) => {
                        const plotDetail = stats?.plots?.find((p: any) => p.id === h.plotId);
                        const farmName = farms.find(f => f.id === plotDetail?.farmId)?.name || 'Adubiaro Estate';

                        return (
                          <div 
                            key={h.id} 
                            className="bg-muted/40 hover:bg-muted/60 p-3 rounded-xl border border-border flex items-center justify-between text-xs transition"
                          >
                            <div>
                              <div className="font-bold text-foreground">Plot {plotDetail?.plotNumber || 'Unspecified'}</div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{farmName}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold text-primary">₦{h.investmentAmount?.toLocaleString()}</div>
                              <div className="text-[9px] font-mono text-muted-foreground">{h.ownershipPercentage}% Ownership • Ref: {h.contractRef}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (subView === 'managers') {
    const managersList = systemUsers.filter(usr => usr.role === UserRole.FARM_MANAGER);

    return (
      <div className="space-y-8 animate-fade-in">
        {/* Breadcrumb Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-premium">
          <div>
            <button 
              onClick={() => setSubView('default')}
              className="flex items-center gap-1 text-xs font-mono font-bold text-[#2D6A4F] hover:text-primary transition cursor-pointer mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Admin Dashboard</span>
            </button>
            <h1 className="font-serif font-extrabold text-2xl text-primary tracking-wide">Farm Managers Directory</h1>
            <p className="text-xs text-muted-foreground font-mono mt-1 font-bold">
              {managersList.length} field supervisors & their active estate supervisor assignments
            </p>
          </div>
          <div>
            <button 
              onClick={() => {
                setActiveFormTab('user');
                setNewRole('farm_manager');
                setSubView('default');
                setTimeout(() => {
                  const el = document.getElementById('admin-actions-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-xl text-xs font-mono font-bold cursor-pointer shadow-sm transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Add New Manager</span>
            </button>
          </div>
        </div>

        {/* Managers Cards List */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {managersList.map((usr) => {
            // Find manager assignments
            const managerAssignments = stats?.assignments?.filter((a: any) => a.managerId === usr.id && a.isActive) || [];

            return (
              <div 
                key={usr.id} 
                className={`bg-card rounded-3xl border ${usr.isActive !== false ? 'border-border' : 'border-red-200/45 bg-red-50/10'} p-6 shadow-premium transition duration-300 hover:shadow-lg`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 bg-[#52B788]/10 rounded-full flex items-center justify-center font-bold text-primary text-sm shrink-0 border border-[#52B788]/20">
                      {usr.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-serif font-bold text-base text-primary flex items-center gap-2">
                        {usr.name}
                        {usr.isActive === false && (
                          <span className="text-[9px] font-mono font-extrabold bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200 uppercase">
                            Inactive
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-muted-foreground font-mono">@{usr.username} • {usr.id}</p>
                    </div>
                  </div>
                  
                  {/* Administrative Controls */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      onClick={() => handleToggleUserActive(usr)}
                      disabled={usr.id === user.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg border cursor-pointer transition ${
                        usr.isActive !== false
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          : 'text-muted-foreground bg-muted/50 border-border hover:bg-muted'
                      } ${usr.id === user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={usr.isActive !== false ? 'Deactivate manager' : 'Activate manager'}
                    >
                      {usr.isActive !== false ? (
                        <>
                          <ToggleRight className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>ACTIVE</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">INACTIVE</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteUser(usr)}
                      disabled={usr.id === user.id}
                      className={`p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer ${
                        usr.id === user.id ? 'opacity-30 cursor-not-allowed' : ''
                      }`}
                      title="Permanently delete user"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-border text-xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">Email Address</span>
                    <span className="font-medium text-foreground block mt-0.5">{usr.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold block">Phone Number</span>
                    <span className="font-medium text-foreground block mt-0.5">{usr.phone || 'N/A'}</span>
                  </div>
                </div>

                {/* Supervisor Assignments */}
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase text-[#2D6A4F]/80 font-bold tracking-wider flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Supervising Estates ({managerAssignments.length})</span>
                    </span>
                  </div>

                  {managerAssignments.length === 0 ? (
                    <div className="p-4 bg-muted/50 rounded-2xl border border-border text-center">
                      <p className="text-[11px] text-muted-foreground italic">No farm estates currently assigned to this manager.</p>
                      <button
                        onClick={() => {
                          setActiveFormTab('assign');
                          setAssignManagerId(usr.id);
                          setSubView('default');
                          setTimeout(() => {
                            const el = document.getElementById('admin-actions-section');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        className="text-[10px] font-mono font-extrabold text-emerald-600 hover:text-primary mt-1 hover:underline cursor-pointer"
                      >
                        + Assign Farm Estate
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {managerAssignments.map((a: any) => {
                        const farmDetail = farms.find(f => f.id === a.farmId);

                        return (
                          <div 
                            key={a.id} 
                            className="bg-muted/40 hover:bg-muted/60 p-3 rounded-xl border border-border flex items-center justify-between text-xs transition"
                          >
                            <div>
                              <div className="font-bold text-foreground">{farmDetail?.name || 'Adubiaro Estate'}</div>
                              <div className="text-[10px] text-muted-foreground">{farmDetail?.location || 'Unknown Location'}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-[10px] text-muted-foreground">Assigned: {new Date(a.assignedDate).toLocaleDateString()}</div>
                              <div className="text-[9px] font-mono text-emerald-600 font-bold">Active Supervisor</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div id="admin-dashboard-container" className="space-y-8 animate-fade-in">
      {reviewModal}
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <h1 className="font-bold text-2xl text-foreground">Admin overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Investors, farms, payouts and documents at a glance. Database reset and go-live are under System Settings → Danger zone.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={fetchStatsAndLists}
            className="flex items-center gap-2 px-4 py-2 border border-border text-foreground/80 rounded-xl text-xs font-mono font-bold cursor-pointer hover:bg-muted/60 transition shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#2D6A4F]" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* New 'Dashboard Stats' Key Performance Indicators Grid */}
      <div id="admin-dashboard-stats-section" className="space-y-4">
        <h2 className="font-sans font-extrabold text-xs text-muted-foreground uppercase tracking-wider font-mono">
          Summary
        </h2>
        <DashboardStats stats={stats} loading={loading} />
      </div>

      {/* Stats KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => setSubView('investors')}
          className="bg-card p-4.5 rounded-2xl border border-border shadow-premium flex items-center justify-between gap-3 cursor-pointer hover:border-[#2D6A4F]/35 hover:shadow-lg hover:shadow-[#2D6A4F]/5 transition-all duration-300 transform hover:-translate-y-0.5 group active:scale-95"
          title="Click to view full Investor Directory"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#52B788]/10 rounded-2xl text-primary group-hover:bg-[#52B788]/20 transition-all duration-300">
              <Users className="h-5.5 w-5.5 text-[#2D6A4F] group-hover:scale-105 transition duration-300" />
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase text-muted-foreground font-bold tracking-wider group-hover:text-[#2D6A4F] transition duration-300">Total Investors</div>
              <div className="text-xl font-bold text-primary font-serif mt-0.5 flex items-center gap-1.5">
                <span>{stats?.totalInvestors}</span>
                <span className="text-[10px] font-mono font-bold text-emerald-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition duration-300">→ VIEW</span>
              </div>
            </div>
          </div>
        </div>

        <div 
          onClick={() => setSubView('managers')}
          className="bg-card p-4.5 rounded-2xl border border-border shadow-premium flex items-center justify-between gap-3 cursor-pointer hover:border-[#2D6A4F]/35 hover:shadow-lg hover:shadow-[#2D6A4F]/5 transition-all duration-300 transform hover:-translate-y-0.5 group active:scale-95"
          title="Click to view full Farm Managers Directory"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#52B788]/10 rounded-2xl text-primary group-hover:bg-[#52B788]/20 transition-all duration-300">
              <Briefcase className="h-5.5 w-5.5 text-[#2D6A4F] group-hover:scale-105 transition duration-300" />
            </div>
            <div>
              <div className="text-[9px] font-mono uppercase text-muted-foreground font-bold tracking-wider group-hover:text-[#2D6A4F] transition duration-300">Farm Managers</div>
              <div className="text-xl font-bold text-primary font-serif mt-0.5 flex items-center gap-1.5">
                <span>{stats?.totalManagers}</span>
                <span className="text-[10px] font-mono font-bold text-emerald-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition duration-300">→ VIEW</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card p-4.5 rounded-2xl border border-border shadow-premium flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-2xl text-[#D4A017]">
            <Sprout className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="text-[9px] font-mono uppercase text-muted-foreground font-bold tracking-wider">Allocated plots</div>
            <div className="text-lg font-bold text-primary font-serif mt-0.5">{stats?.totalPlotsCount} <span className="text-xs text-muted-foreground">/ {stats?.totalFarms} Farms</span></div>
          </div>
        </div>

        <div className="bg-card p-4.5 rounded-2xl border border-border shadow-premium flex items-center gap-3">
          <div className="p-2.5 bg-[#D4A017]/10 rounded-2xl text-[#D4A017]">
            <DollarSign className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="text-[9px] font-mono uppercase text-muted-foreground font-bold tracking-wider">Invested Capital</div>
            <div className="text-lg font-bold text-primary font-serif mt-0.5">₦{stats?.totalInvestment?.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Farms Section */}
      <div className="space-y-4">
        <h2 className="font-sans font-extrabold text-xs text-muted-foreground uppercase tracking-wider font-mono">Farms</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {farms.map(farm => (
              <div 
                key={farm.id}
                onClick={() => onSelectFarm(farm.id)}
                className="bg-card rounded-3xl overflow-hidden border border-border shadow-premium hover:shadow-[#2D6A4F]/15 hover:border-[#2D6A4F]/25 transition-all duration-300 cursor-pointer group"
              >
                <div className="relative h-40 bg-muted overflow-hidden">
                  <img src={farm.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                  <div className="absolute top-3 left-3 z-10">
                    <button
                      onClick={(e) => handleQuickEditFarm(farm, e)}
                      className="bg-white/95 hover:bg-white text-primary py-1 px-2 rounded-lg shadow-md border border-[#1B4332]/10 cursor-pointer transition flex items-center gap-1 text-[9px] font-bold font-sans"
                    >
                      <Edit className="h-2.5 w-2.5 text-[#2D6A4F]" />
                      <span>Edit Estate</span>
                    </button>
                  </div>
                  <div className="absolute top-3 right-3 bg-[#1B4332] text-white text-[9px] uppercase font-bold font-mono px-3 py-1 rounded-full border border-[#52B788]/20 shadow-sm">
                    Active
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-serif font-bold text-primary text-base group-hover:text-[#2D6A4F] transition">{farm.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 font-sans">{farm.location}, {farm.state}</p>
                  
                  <div className="mt-4 pt-3 border-t border-border space-y-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground font-bold">Plots: <b className="text-foreground">{farm.totalPlots}</b></span>
                      <span className="text-muted-foreground font-bold">Owners: <b className="text-foreground">{farm.investorCount ?? 0}</b></span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                      <span className="text-muted-foreground font-bold">
                        Invested: <b className="text-success">₦{(farm.totalInvestmentReceived ?? 0).toLocaleString()}</b>
                      </span>
                      <span className="text-[#2D6A4F] font-bold flex items-center gap-1 group-hover:underline">
                        Open farm <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
          ))}
        </div>
      </div>

      {/* Administrative Controls Tab Area */}
      <div className="bg-card rounded-3xl border border-border shadow-premium overflow-hidden">
          
          {/* Internal tab selector */}
          <div className="flex border-b border-border bg-muted/40 overflow-x-auto">
            <button
              onClick={() => setActiveFormTab('wizard')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'wizard' 
                  ? 'border-[#2D6A4F] text-emerald-800 bg-emerald-50/40 font-black' 
                  : 'border-transparent text-emerald-600/70 hover:text-primary'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
              <span>Import investors</span>
            </button>

            <button
              onClick={() => setActiveFormTab('payout')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'payout' 
                  ? 'border-[#1B4332] text-primary bg-card font-black' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Financial summary</span>
            </button>

            <button
              onClick={() => setActiveFormTab('document')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'document' 
                  ? 'border-[#1B4332] text-primary bg-card font-black' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Upload document</span>
            </button>

            <button
              onClick={() => setActiveFormTab('user')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'user' 
                  ? 'border-[#2D6A4F] text-[#2D6A4F] bg-emerald-50/40 font-black' 
                  : 'border-transparent text-muted-foreground hover:text-[#2D6A4F] hover:border-[#2D6A4F]/30'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
              <span>Add account</span>
            </button>

            <button
              onClick={() => setActiveFormTab('plot')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'plot' 
                  ? 'border-[#1B4332] text-primary bg-card font-black' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sprout className="h-3.5 w-3.5" />
              <span>Add plot</span>
            </button>

            <button
              onClick={() => setActiveFormTab('assign')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'assign' 
                  ? 'border-[#1B4332] text-primary bg-card font-black' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Assign Managers</span>
            </button>

            <button
              onClick={() => setActiveFormTab('farms')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'farms' 
                  ? 'border-[#1B4332] text-primary bg-card font-black' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Manage Estates</span>
            </button>

            <button
              id="tab-sys-settings"
              onClick={() => setActiveFormTab('settings')}
              className={`px-4 py-3.5 text-[11px] font-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shrink-0 ${
                activeFormTab === 'settings' 
                  ? 'border-[#1B4332] text-primary bg-card font-black' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Settings className="h-3.5 w-3.5 text-[#2D6A4F]" />
              <span>System Settings</span>
            </button>
          </div>

          <div className="p-6">
            
            {/* UNIFIED SETUP WIZARD */}
            {activeFormTab === 'wizard' && (
              <CSVDataImporter token={token} onSuccess={triggerRefreshSignal} />
            )}

            {/* PAYOUT FORM */}
            {activeFormTab === 'payout' && (
              <form onSubmit={handleCreateFinancials} className="space-y-4">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                  <TrendingUp className="text-[#D4A017] h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">Publish Financial Payout Summary</h3>
                </div>

                {finSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{finSuccessMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Select plot</label>
                    <select
                      value={finPlotId}
                      onChange={(e) => setFinPlotId(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                    >
                      {systemPlots.map(p => (
                        <option key={p.id} value={p.id}>Plot {p.plotNumber} ({p.cropType})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Quarter Period</label>
                    <select
                      value={finPeriod}
                      onChange={(e) => setFinPeriod(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                    >
                      <option value="Q1">Q1</option>
                      <option value="Q2">Q2</option>
                      <option value="Q3">Q3</option>
                      <option value="Q4">Q4</option>
                      <option value="Annual">Annual Statement</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Financial year</label>
                    <input
                      type="number"
                      required
                      value={finYear}
                      onChange={(e) => setFinYear(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Audited ROI %</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 12.5"
                      value={finRoi}
                      onChange={(e) => setFinRoi(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Amount (₦)</label>
                    <input
                      type="number"
                      required
                      placeholder="payout volume"
                      value={finAmount}
                      onChange={(e) => setFinAmount(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground"> payout Date</label>
                    <input
                      type="date"
                      required
                      value={finDate}
                      onChange={(e) => setFinDate(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Payout status</label>
                    <select
                      value={finStatus}
                      onChange={(e) => setFinStatus(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="partial">Partial</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Audit notes / remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Provide description..."
                    value={finNotes}
                    onChange={(e) => setFinNotes(e.target.value)}
                    className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Publish & notify investor</span>
                </button>
              </form>
            )}

            {/* DOCUMENT UPLOAD FORM */}
            {activeFormTab === 'document' && (
              <form onSubmit={handleUploadDocument} className="space-y-4">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                  <FileText className="text-primary h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">Upload a document</h3>
                </div>

                {docSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{docSuccessMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Target farm</label>
                    <select
                      value={docFarmId}
                      onChange={(e) => handleDocFarmChange(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                    >
                      {farms.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Document title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Deed of Custom Plot Land"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Document category</label>
                    <select
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    >
                      <option value="contract">Contract (Deed)</option>
                      <option value="certificate">Certificate</option>
                      <option value="report">Operational Report</option>
                      <option value="financial">Financial Report</option>
                      <option value="legal">Legal document</option>
                      <option value="other">Other / Support</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Visibility policy</label>
                    <select
                      value={docVisibility}
                      onChange={(e) => setDocVisibility(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    >
                      <option value="farm">Farm (Visible to ALL plot owners on farm)</option>
                      <option value="plot">Plot (Visible ONLY to a single plot holder)</option>
                    </select>
                  </div>
                </div>

                {docVisibility === 'plot' && (
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Target Specific Plot</label>
                    <select
                      value={docPlotId}
                      onChange={(e) => setDocPlotId(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                    >
                      {systemPlots.map(p => (
                        <option key={p.id} value={p.id}>Plot {p.plotNumber} ({p.cropType})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Attachment file</label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="w-full text-xs border border-dashed border-border rounded-lg p-4 bg-muted/50 focus:outline-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">Supports real docs over local fallback securely</p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Document Description</label>
                  <textarea
                    rows={2}
                    placeholder="Provide overview of contents..."
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Upload secure document</span>
                </button>
              </form>
            )}

            {/* CREATE USER USER_PLUS FORM & BULK CSV IMPORT */}
            {activeFormTab === 'user' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="text-emerald-700 h-4 w-4" />
                    <h3 className="font-sans font-bold text-sm text-foreground">Create investor or staff accounts</h3>
                  </div>
                  
                  {/* Mode Toggles */}
                  <div className="flex bg-muted rounded-lg p-0.5 text-xs font-mono border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setUserCreateMode('single');
                        setBulkResults(null);
                      }}
                      className={`px-3 py-1 rounded-md transition duration-200 cursor-pointer ${
                        userCreateMode === 'single' 
                          ? 'bg-card text-primary font-bold shadow-sm' 
                          : 'text-muted-foreground hover:text-stone-800'
                      }`}
                    >
                      Single Account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserCreateMode('bulk');
                        setUserSuccessMessage(null);
                      }}
                      className={`px-3 py-1 rounded-md transition duration-200 cursor-pointer ${
                        userCreateMode === 'bulk' 
                          ? 'bg-card text-primary font-bold shadow-sm' 
                          : 'text-muted-foreground hover:text-stone-800'
                      }`}
                    >
                      Bulk Import (CSV)
                    </button>
                  </div>
                </div>

                {userCreateMode === 'single' ? (
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    {userSuccessMessage && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>{userSuccessMessage}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Full Account Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Olumide Benson"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Primary Username</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. mbenson"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="benson@email.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Primary Telephone</label>
                        <input
                          type="tel"
                          required
                          placeholder="+234..."
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">System Permission Role</label>
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                        >
                          <option value="investor">Investor (Read-Only Portfolio Client)</option>
                          <option value="farm_manager">Farm Manager (Updates & Documents Supervisor)</option>
                          <option value="admin">Super Admin (Full Root Access)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Account Access Password (Defined by Admin)</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="e.g. FarmManager2026!"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full text-xs border border-border rounded-lg p-2.5 pr-10 bg-muted/50 focus:outline-[#1B4332]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-600 focus:outline-none p-1 cursor-pointer"
                            title={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 shadow-sm"
                    >
                      <PlusCircle className="h-4 w-4" />
                      <span>Register Account Profile</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {/* Drag and Drop Zone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingCsv(true);
                      }}
                      onDragLeave={() => setIsDraggingCsv(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingCsv(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.name.endsWith('.csv')) {
                          handleCsvSelect(file);
                        } else {
                          toast.error('Please drop a valid CSV file.');
                        }
                      }}
                      className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer ${
                        isDraggingCsv 
                          ? 'border-[#2D6A4F] bg-emerald-50/40' 
                          : 'border-border bg-muted/50 hover:bg-stone-100/50'
                      }`}
                      onClick={() => {
                        const input = document.getElementById('bulk-csv-input');
                        if (input) input.click();
                      }}
                    >
                      <UploadCloud className={`h-10 w-10 mb-2 transition-transform duration-300 ${isDraggingCsv ? 'scale-110 text-[#2D6A4F]' : 'text-primary'}`} />
                      <p className="text-xs text-foreground/80 font-medium text-center">
                        Drag & Drop investor CSV file here, or{' '}
                        <span className="text-[#2D6A4F] hover:underline font-bold cursor-pointer">
                          browse files
                        </span>
                      </p>
                      <input
                        id="bulk-csv-input"
                        type="file"
                        accept=".csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCsvSelect(file);
                        }}
                        className="hidden"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        Requires columns: <span className="text-foreground/80 font-bold">name, email</span> (usernames are created from emails if blank; you review everything before it is saved)
                      </p>
                    </div>

                    {/* Download Sample Template */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        className="text-[10px] font-mono text-[#2D6A4F] hover:text-primary flex items-center gap-1 bg-[#52B788]/10 hover:bg-[#52B788]/20 px-2.5 py-1.5 rounded-md transition duration-200 cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Download template (CSV)
                      </button>
                    </div>

                    {/* Parsed List Preview */}
                    {parsedInvestors.length > 0 && (
                      <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-inner">
                        <div className="flex justify-between items-center border-b border-border pb-2">
                          <h4 className="font-sans font-bold text-xs text-stone-800">
                            Parsed File Preview ({parsedInvestors.length} records ready)
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setCsvFile(null);
                              setParsedInvestors([]);
                              setBulkResults(null);
                            }}
                            className="text-[10px] font-mono text-rose-600 hover:underline cursor-pointer font-bold"
                          >
                            Clear Selection
                          </button>
                        </div>

                        <div className="overflow-x-auto max-h-[160px] overflow-y-auto border border-border rounded-lg">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border text-[10px] uppercase font-mono text-muted-foreground">
                                <th className="p-2">Row</th>
                                <th className="p-2">Username</th>
                                <th className="p-2">Full Name</th>
                                <th className="p-2">Email</th>
                                <th className="p-2">Farm Estate</th>
                                <th className="p-2">Plot</th>
                                <th className="p-2">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsedInvestors.slice(0, 10).map((p: any, idx) => (
                                <tr key={idx} className="border-b border-stone-50 text-xs text-foreground/80 hover:bg-stone-50/50">
                                  <td className="p-2 font-mono text-muted-foreground">{idx + 1}</td>
                                  <td className="p-2 font-bold font-mono text-primary">{p.username}</td>
                                  <td className="p-2 font-medium">{p.name}</td>
                                  <td className="p-2 text-muted-foreground font-mono">{p.email}</td>
                                  <td className="p-2 text-foreground/80 font-mono">{p.farmEstate || p.farmLocation || '-'}</td>
                                  <td className="p-2 text-muted-foreground font-mono">
                                    {p.plotNumber ? p.plotNumber : (p.farmEstate || p.farmLocation ? 'Auto-assigned' : '-')}
                                  </td>
                                  <td className="p-2 text-emerald-700 font-mono font-bold">
                                    {p.investmentAmount && !isNaN(parseFloat(p.investmentAmount))
                                      ? `₦${parseFloat(p.investmentAmount).toLocaleString()}`
                                      : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {parsedInvestors.length > 10 && (
                            <p className="p-2 bg-stone-50/50 text-[10px] text-center text-muted-foreground italic font-mono border-t border-border">
                              Showing first 10 of {parsedInvestors.length} records.
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={bulkUploading}
                          onClick={handleBulkUploadInvestors}
                          className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] disabled:bg-stone-300 text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200"
                        >
                          {bulkUploading ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>Uploading & configuring {parsedInvestors.length} accounts...</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="h-4 w-4" />
                              <span>Process & Provision {parsedInvestors.length} Investors</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Bulk results report block */}
                    {bulkResults && (
                      <div className="border rounded-xl p-4 space-y-3 bg-card shadow-sm border-border animate-fade-in">
                        <div className="flex items-center gap-2 border-b border-border pb-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          <h4 className="font-sans font-bold text-sm text-stone-800">
                            Bulk Import Complete
                          </h4>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                            <p className="text-[10px] text-emerald-600 font-mono uppercase font-bold">Imported</p>
                            <p className="text-xl font-mono font-bold text-emerald-800">{bulkResults.successCount}</p>
                          </div>
                          <div className="bg-rose-50/60 p-2.5 rounded-lg border border-rose-100">
                            <p className="text-[10px] text-rose-500 font-mono uppercase font-bold">Warnings</p>
                            <p className="text-xl font-mono font-bold text-rose-800">{bulkResults.failCount}</p>
                          </div>
                          <div className="bg-muted/50 p-2.5 rounded-lg border border-border">
                            <p className="text-[10px] text-muted-foreground font-mono uppercase font-bold">Total Scanned</p>
                            <p className="text-xl font-mono font-bold text-stone-800">{bulkResults.total}</p>
                          </div>
                        </div>

                        {bulkResults.errors && bulkResults.errors.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase font-mono font-bold text-rose-600">Import Warnings & Skips</p>
                            <div className="max-h-[140px] overflow-y-auto border border-border rounded-lg p-2.5 space-y-1.5 bg-muted/50 shadow-inner">
                              {bulkResults.errors.map((err: any, idx: number) => (
                                <div key={idx} className="text-xs text-foreground/80 flex items-start gap-1.5 font-mono">
                                  <span className="text-rose-600 font-bold">[Row {err.row}]</span>
                                  <span>
                                    {err.username ? `(${err.username}) ` : ''}
                                    {err.error}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {bulkResults.successCount > 0 && (
                          <p className="text-[10px] font-mono text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
                            ✓ Welcome letters & portals registration logs loaded into the dispatch outbox queue.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ALLOCATE PLOT FORM */}
            {activeFormTab === 'plot' && (
              <form onSubmit={handleAllocatePlot} className="space-y-4">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                  <Sprout className="text-amber-600 h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">Add plot & Link to Investor</h3>
                </div>

                {plotSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{plotSuccessMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Select estate farm</label>
                    <select
                      value={allocFarmId}
                      onChange={(e) => setAllocFarmId(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    >
                      {farms.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Plot number catalog</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. C-04"
                      value={allocPlotNumber}
                      onChange={(e) => setAllocPlotNumber(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Plot size & unit</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="e.g. 1.8"
                        value={allocSize}
                        onChange={(e) => setAllocSize(e.target.value)}
                        className="flex-1 text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332]"
                      />
                      <select
                        value={allocSizeUnit}
                        onChange={(e) => setAllocSizeUnit(e.target.value as 'acre' | 'plot')}
                        className="w-28 text-xs border border-border rounded-lg p-2.5 bg-muted/50 focus:outline-[#1B4332] cursor-pointer font-semibold text-foreground"
                      >
                        <option value="acre">acre</option>
                        <option value="plot">plot</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Crop Type Cultivar</label>
                    {sysSettings?.allowedCrops && sysSettings.allowedCrops.length > 0 ? (
                      <select
                        value={allocCrop}
                        onChange={(e) => setAllocCrop(e.target.value)}
                        className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50 cursor-pointer"
                      >
                        {sysSettings.allowedCrops.map((c: string) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={allocCrop}
                        onChange={(e) => setAllocCrop(e.target.value)}
                        placeholder="e.g. Oil Palm Tenera Hybrid"
                        className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Link to Investor</label>
                    <select
                      value={allocInvestorId}
                      onChange={(e) => setAllocInvestorId(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    >
                      <option value="">-- No Assignment (Available) --</option>
                      {systemUsers.filter(u => u.role === 'investor').map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Investment amount (₦)</label>
                    <input
                      type="number"
                      placeholder="e.g. 24000"
                      value={allocAmount}
                      onChange={(e) => setAllocAmount(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Allocate and update estate plots</span>
                </button>
              </form>
            )}

            {/* ASSIGN FARM MANAGERS FORM */}
            {activeFormTab === 'assign' && (
              <form onSubmit={handleAssignManager} className="space-y-4">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                  <Briefcase className="text-primary h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">Assign Supervisor to Farm</h3>
                </div>

                {assignSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{assignSuccessMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Select Manager</label>
                  <select
                    value={assignManagerId}
                    onChange={(e) => setAssignManagerId(e.target.value)}
                    className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                  >
                    {systemUsers.filter(u => u.role === 'farm_manager').map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Assign To Farm Estate</label>
                  <select
                    value={assignFarmId}
                    onChange={(e) => setAssignFarmId(e.target.value)}
                    className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                  >
                    {farms.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Map manager assignment</span>
                </button>
              </form>
            )}

            {/* MANAGE FARM ESTATES */}
            {activeFormTab === 'farms' && (
              <form onSubmit={handleSaveFarmEstate} className="space-y-4">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                  <Layers className="text-primary h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">Configure & Manage Farm Estates</h3>
                </div>

                {farmSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{farmSuccessMessage}</span>
                  </div>
                )}

                <div className="bg-muted/40 p-3 rounded-xl border border-border mb-2">
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Operation Mode</label>
                  <select
                    value={selectedFarmToEdit}
                    onChange={(e) => handleSelectFarmToEditChange(e.target.value)}
                    className="w-full text-xs font-sans font-semibold border border-[#1B4332]/25 rounded-lg p-2.5 bg-card text-primary focus:outline-[#1B4332]"
                  >
                    <option value="new">🆕 [+ Add New Farm Estate]</option>
                    {farms.map(f => (
                      <option key={f.id} value={f.id}>✏️ [Modify] {f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Estate name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Adubiaro Cocoa Estate"
                      value={farmName}
                      onChange={(e) => setFarmName(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Date established</label>
                    <input
                      type="date"
                      required
                      value={farmDateEstablished}
                      onChange={(e) => setFarmDateEstablished(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Location city / area</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Owo"
                      value={farmLocation}
                      onChange={(e) => setFarmLocation(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">State region</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ondo State"
                      value={farmState}
                      onChange={(e) => setFarmState(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>
                </div>
                           <div className="space-y-3">
                  <span className="block text-[10px] uppercase font-mono font-bold text-muted-foreground">Estate Cover Image</span>
                  
                  {/* Drag-and-drop container */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingEstateImage(true);
                    }}
                    onDragLeave={() => setIsDraggingEstateImage(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingEstateImage(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) parseAndSetCoverPhoto(file);
                    }}
                    onClick={() => document.getElementById('estate-cover-file-input')?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition duration-200 flex flex-col items-center justify-center gap-2 ${
                      isDraggingEstateImage 
                        ? 'border-[#52B788] bg-[#52B788]/10 text-primary' 
                        : 'border-border hover:border-[#1B4332] bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <input
                      id="estate-cover-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) parseAndSetCoverPhoto(file);
                      }}
                      className="hidden"
                    />
                    <UploadCloud className="h-8 w-8 text-[#2D6A4F]" />
                    <div className="font-sans font-bold text-xs text-primary">
                      Click to upload cover image or drag & drop here
                    </div>
                    <p className="text-[10px] text-muted-foreground font-sans">
                      Supports JPG, PNG or WEBP (optimized automatic system resizing)
                    </p>
                  </div>

                  {/* Preview if image is present */}
                  {farmCoverImage && (
                    <div className="flex items-center gap-3 bg-card p-3.5 rounded-2xl border border-border relative overflow-hidden group">
                      <img 
                        src={farmCoverImage} 
                        alt="Preview" 
                        className="h-14 w-20 object-cover rounded-xl border border-border"
                        onError={(e) => {
                          // Fallback to placeholder if url loads incorrectly
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=800';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-muted-foreground font-bold uppercase tracking-wider">Active Image Preview</div>
                        <div className="text-xs text-primary font-semibold truncate max-w-xs">
                          {farmCoverImage.startsWith('data:') ? 'Custom Base64 Upload File' : farmCoverImage}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFarmCoverImage('')}
                        className="text-red-500 hover:text-red-700 text-[10px] font-sans font-bold hover:underline cursor-pointer select-none"
                      >
                        Reset / Clear
                      </button>
                    </div>
                  )}

                  {/* Fallback Direct Link URL */}
                  <div>
                    <label className="block text-[9px] uppercase font-mono font-bold mb-1 text-muted-foreground">Or Option B: Provide Direct Image Web URL</label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={farmCoverImage.startsWith('data:') ? '' : farmCoverImage}
                      onChange={(e) => setFarmCoverImage(e.target.value)}
                      className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                    />
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-[9px] text-muted-foreground font-mono font-bold self-center">Presets:</span>
                    <button
                      type="button"
                      onClick={() => setFarmCoverImage('https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=800')}
                      className="bg-muted hover:bg-gray-200 text-[9px] text-foreground/80 px-2 py-1 rounded cursor-pointer border border-border"
                    >
                      🌱 Palm Nursery
                    </button>
                    <button
                      type="button"
                      onClick={() => setFarmCoverImage('https://images.unsplash.com/photo-1516253593875-bd7ba052fbc5?auto=format&fit=crop&q=80&w=800')}
                      className="bg-muted hover:bg-gray-200 text-[9px] text-foreground/80 px-2 py-1 rounded cursor-pointer border border-border"
                    >
                      🌴 Mature Oil Palm
                    </button>
                    <button
                      type="button"
                      onClick={() => setFarmCoverImage('https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&q=80&w=800')}
                      className="bg-muted hover:bg-gray-200 text-[9px] text-foreground/80 px-2 py-1 rounded cursor-pointer border border-border"
                    >
                      🚜 Cocoa Farms
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Estate description & scope</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Introduce physical crop capabilities, yield expectations, and infrastructural configurations..."
                    value={farmDescription}
                    onChange={(e) => setFarmDescription(e.target.value)}
                    className="w-full text-xs border border-border rounded-lg p-2.5 bg-muted/50"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-sans font-bold text-foreground">Estate active status</span>
                    <span className="text-[9px] text-muted-foreground font-sans">Active estates enable interactive tracking logs</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={farmIsActive}
                      onChange={(e) => setFarmIsActive(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#52B788]"></div>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold p-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>{selectedFarmToEdit === 'new' ? 'Register New Farm Estate' : 'Commit Modified Farm Details'}</span>
                </button>
              </form>
            )}

            {/* SYSTEM MAINTENANCE AND BACKUPS */}
            {activeFormTab === 'settings' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                  <Settings className="text-primary h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">Super Admin Core Control Console</h3>
                </div>

                {/* 1. INTERACTIVE CONTROL CENTER */}
                <div className="bg-card p-6 rounded-3xl border border-border space-y-6">
                  <div>
                    <h4 className="text-sm font-extrabold uppercase font-mono text-primary tracking-wider mb-1">Interactive System Admin Consoles</h4>
                    <p className="text-[11px] text-muted-foreground">Configure global business rules, toggle background simulation features, adapt brand looks/feel, and crop validation presets.</p>
                  </div>

                  {loadingSysSettings || !sysSettings ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#1B4332] border-t-transparent" />
                      <span className="text-[10px] font-mono text-muted-foreground">Loading system configurations...</span>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Success / Error Alerts */}
                      {saveSysSuccess && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-medium">
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                          <span>{saveSysSuccess}</span>
                        </div>
                      )}
                      {saveSysError && (
                        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-medium">
                          <ShieldAlert className="h-4.5 w-4.5 text-red-600 shrink-0" />
                          <span>{saveSysError}</span>
                        </div>
                      )}

                      {/* Config Form Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Box 1: Core Engines */}
                        <div className="space-y-4 bg-muted/40 p-5 rounded-2xl border border-border">
                          <h5 className="text-[11px] font-mono font-bold uppercase text-primary tracking-widest border-b border-border pb-1.5">1. Business rules</h5>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Database Connection Target</label>
                              <select
                                value={sysSettings.databaseMode}
                                onChange={(e) => handleSaveSettings({ ...sysSettings, databaseMode: e.target.value })}
                                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-ring cursor-pointer"
                              >
                                <option value="auto">Automatic (Postgres with Server Fallback)</option>
                                <option value="local_json">Forced Local db.json mode (Offline Safe)</option>
                                <option value="postgres_forced">Forced PostgreSQL Mode (Raise Error if Down)</option>
                              </select>
                              <span className="text-[9.5px] font-mono text-muted-foreground mt-1 block leading-tight">
                                Controls routing to PostgreSQL. Switching to Forced Local will immediately drop the cloud instance connection cleanly.
                              </span>
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Artificial delay for testing (ms)</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="range"
                                  min="0"
                                  max="3000"
                                  step="250"
                                  value={sysSettings.simulatedLatency || 0}
                                  onChange={(e) => setSysSettings({ ...sysSettings, simulatedLatency: parseInt(e.target.value) })}
                                  onMouseUp={() => handleSaveSettings({ ...sysSettings, simulatedLatency: sysSettings.simulatedLatency })}
                                  onTouchEnd={() => handleSaveSettings({ ...sysSettings, simulatedLatency: sysSettings.simulatedLatency })}
                                  className="flex-1 accent-[#1B4332]"
                                />
                                <span className="text-xs font-mono font-bold text-foreground w-12 text-right">{sysSettings.simulatedLatency || 0}ms</span>
                              </div>
                              <span className="text-[9.5px] font-mono text-muted-foreground mt-1 block leading-tight">
                                Delays server API replies. Use to inspect visual skeleton state transitions, loaders, and network thresholds.
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Box 2: Feature & Business Controls */}
                        <div className="space-y-4 bg-muted/40 p-5 rounded-2xl border border-border">
                          <h5 className="text-[11px] font-mono font-bold uppercase text-primary tracking-widest border-b border-border pb-1.5">2. Feature Permissions & Rules</h5>
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded-xl">
                              <div>
                                <span className="text-xs font-bold text-foreground block">User Push Notifications</span>
                                <span className="text-[9.5px] font-mono text-muted-foreground block max-w-[200px]">System-wide dynamic alerts bell module.</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sysSettings.enableNotifications}
                                  onChange={(e) => handleSaveSettings({ ...sysSettings, enableNotifications: e.target.checked })}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#52B788]"></div>
                              </label>
                            </div>

                            <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded-xl">
                              <div>
                                <span className="text-xs font-bold text-foreground block">Simulate emails (no real sending)</span>
                                <span className="text-[9.5px] font-mono text-muted-foreground block max-w-[200px]">Logs all Welcome & Payout alerts to outbox.</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sysSettings.enableEmailSimulation}
                                  onChange={(e) => handleSaveSettings({ ...sysSettings, enableEmailSimulation: e.target.checked })}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#52B788]"></div>
                              </label>
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Active Minimum ROI limit (%)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={sysSettings.minimumPayoutRoi || ''}
                                  onChange={(e) => setSysSettings({ ...sysSettings, minimumPayoutRoi: parseFloat(e.target.value) || 0 })}
                                  onBlur={() => handleSaveSettings({ ...sysSettings, minimumPayoutRoi: sysSettings.minimumPayoutRoi })}
                                  className="w-full bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                                />
                              </div>
                              <span className="text-[9.5px] font-mono text-muted-foreground mt-1 block leading-tight">
                                Rejects any transaction record attempts below this value. Prevents human data entry mistakes.
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Box 3: Branding & Custom Looks */}
                        <div className="space-y-4 bg-muted/40 p-5 rounded-2xl border border-border md:col-span-2">
                          <h5 className="text-[11px] font-mono font-bold uppercase text-primary tracking-widest border-b border-border pb-1.5">3. Appearance Branding & Broadcast Banners</h5>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Client Portal Title Name</label>
                              <input
                                type="text"
                                value={sysSettings.portalName || ''}
                                onChange={(e) => setSysSettings({ ...sysSettings, portalName: e.target.value })}
                                onBlur={() => handleSaveSettings({ ...sysSettings, portalName: sysSettings.portalName })}
                                className="w-full bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                                placeholder="Adubiaro Farm Portal"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Header Icon Logo text</label>
                              <input
                                type="text"
                                value={sysSettings.logoText || ''}
                                onChange={(e) => setSysSettings({ ...sysSettings, logoText: e.target.value })}
                                onBlur={() => handleSaveSettings({ ...sysSettings, logoText: sysSettings.logoText })}
                                className="w-full bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                                placeholder="ADUBIARO"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Accent Brand Color Theme</label>
                              <select
                                value={sysSettings.accentColor}
                                onChange={(e) => handleSaveSettings({ ...sysSettings, accentColor: e.target.value })}
                                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-ring cursor-pointer"
                              >
                                <option value="emerald">Emerald Green (Brand Standard)</option>
                                <option value="forest">Forest Green (Deep High-Contrast)</option>
                                <option value="amber">Amber Gold (Premium Harvest)</option>
                                <option value="slate">Slate Obsidian (Executive Editorial)</option>
                              </select>
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Announcement Broadcast Message</label>
                              <input
                                type="text"
                                value={sysSettings.announcementBanner || ''}
                                onChange={(e) => setSysSettings({ ...sysSettings, announcementBanner: e.target.value })}
                                onBlur={() => handleSaveSettings({ ...sysSettings, announcementBanner: sysSettings.announcementBanner })}
                                className="w-full bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                                placeholder="Enter announcement text to broadcast systemwide..."
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-mono font-bold mb-1 text-muted-foreground">Banner Alert Type</label>
                              <select
                                value={sysSettings.bannerType}
                                onChange={(e) => handleSaveSettings({ ...sysSettings, bannerType: e.target.value })}
                                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-ring cursor-pointer"
                              >
                                <option value="none">Disabled (No Banner Layout)</option>
                                <option value="info">Info Alert (Sky Blue Theme)</option>
                                <option value="warning">Critical Warning (Amber Gold Theme)</option>
                                <option value="success">Success Broadcast (Emerald Green Theme)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Box 4: Supported Culturable Crops */}
                        <div className="space-y-4 bg-muted/40 p-5 rounded-2xl border border-border md:col-span-2">
                          <h5 className="text-[11px] font-mono font-bold uppercase text-primary tracking-widest border-b border-border pb-1.5">4. Dynamic Validation Presets (Cultivated Crop Breeds)</h5>
                          
                          <div className="space-y-3">
                            <span className="text-[10.5px] font-sans text-muted-foreground block leading-tight">
                              These crop seeds and breed categories are dynamically enforced across land plot definitions and investment tracking profiles.
                            </span>

                            <div className="flex flex-wrap gap-2">
                              {(sysSettings.allowedCrops || []).map((crop: string, idx: number) => (
                                <span key={idx} className="bg-emerald-50 text-primary border border-emerald-100 text-[10.5px] px-3 py-1 rounded-full flex items-center gap-1.5 font-medium select-none animate-fade-in">
                                  <span>{crop}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedList = sysSettings.allowedCrops.filter((c: string) => c !== crop);
                                      handleSaveSettings({ ...sysSettings, allowedCrops: updatedList });
                                    }}
                                    className="hover:text-red-600 font-bold transition text-xs select-none cursor-pointer"
                                    title={`Remove ${crop}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              {(!sysSettings.allowedCrops || sysSettings.allowedCrops.length === 0) && (
                                <span className="text-xs text-muted-foreground italic">No custom crops whitelist declared.</span>
                              )}
                            </div>

                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!newCropTag.trim()) return;
                                const originalCrops = sysSettings.allowedCrops || [];
                                if (originalCrops.includes(newCropTag.trim())) {
                                  setSaveSysError('Crop breed is already declared in custom whitelists.');
                                  return;
                                }
                                const updatedCrops = [...originalCrops, newCropTag.trim()];
                                setNewCropTag('');
                                handleSaveSettings({ ...sysSettings, allowedCrops: updatedCrops });
                              }}
                              className="flex gap-2 max-w-md"
                            >
                              <input
                                type="text"
                                value={newCropTag}
                                onChange={(e) => setNewCropTag(e.target.value)}
                                className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-ring"
                                placeholder="e.g. Kola Nut (Cola Acuminata)"
                              />
                              <button
                                type="submit"
                                className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                              >
                                + Add Crop Whitelist
                              </button>
                            </form>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-8 mb-4 border-b border-border pb-2">
                  <Database className="text-primary h-4 w-4" />
                  <h3 className="font-sans font-bold text-sm text-foreground">System Infrastructure Status & Backups</h3>
                </div>

                <div className="bg-muted/40 p-4.5 rounded-2xl border border-border flex gap-4">
                  <div className="p-3 bg-[#52B788]/10 rounded-xl text-primary shrink-0 self-start">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase font-mono">Active Database Maintenance Policy</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      To operationalize absolute transparency and resilient business continuity, the Adubiaro Portal executes automatic daily scheduled maintenance backups at 02:15 AM (UTC/GMT). Hot backups preserve complete state snapshots across farms, land plot records, investor allocations, and financial payout ledger audits.
                    </p>
                  </div>
                </div>

                {/* Database Connectivity Diagnostics Card */}
                {dbStatus && (
                  <div className="bg-card p-5 rounded-2xl border border-border space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className={`h-5 w-5 ${dbStatus.usePostgres ? 'text-emerald-600' : dbStatus.configured ? 'text-rose-600' : 'text-amber-500'}`} />
                        <h4 className="text-xs font-extrabold uppercase font-mono text-foreground">Database Engine Core Diagnostics</h4>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        dbStatus.usePostgres 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                          : dbStatus.configured 
                            ? 'bg-rose-50 text-rose-800 border border-rose-200 font-bold' 
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {dbStatus.usePostgres ? 'POSTGRESQL CONNECTED' : dbStatus.configured ? 'CONNECTION REFUSED (FALLBACK ACTIVE)' : 'LOCAL DB.JSON MODE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-mono font-bold text-muted-foreground block">DATABASE ENGINE</span>
                        <span className="text-xs font-bold text-foreground block mt-0.5">
                          {dbStatus.usePostgres ? 'Relational PostgreSQL' : 'Fallback File-based JSON'}
                        </span>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-mono font-bold text-muted-foreground block">HOST & PORT</span>
                        <span className="text-xs font-bold text-foreground block mt-0.5 font-mono truncate" title={`${dbStatus.dbHost}:${dbStatus.dbPort}`}>
                          {dbStatus.configured ? `${dbStatus.dbHost}:${dbStatus.dbPort}` : 'Local File Storage'}
                        </span>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-mono font-bold text-muted-foreground block">SCHEMA CATALOG</span>
                        <span className="text-xs font-bold text-foreground block mt-0.5 font-mono">
                          {dbStatus.configured ? dbStatus.dbName : 'data/db.json'}
                        </span>
                      </div>
                    </div>

                    {/* Explanatory status card when error occurs */}
                    {dbStatus.configured && !dbStatus.usePostgres && (
                      <div className="p-3.5 bg-rose-50/80 border border-rose-200 text-rose-950 rounded-xl space-y-2">
                        <div className="flex gap-2 items-center">
                          <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                          <span className="text-xs font-extrabold font-mono uppercase tracking-wide">PostgreSQL Connection Refused (ECONNREFUSED)</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-800">
                          The portal received a connection refusal at host <b className="font-mono">{dbStatus.dbHost}:{dbStatus.dbPort}</b>. This typically means the host server is currently offline, bound to a different interface, or protected behind firewall access rules that reject outbound requests from Cloud Run.
                        </p>
                        <div className="bg-rose-950/5 p-2.5 rounded-lg border border-rose-200/40">
                          <span className="text-[9.5px] font-mono font-bold text-rose-900 block uppercase tracking-wider mb-1">Diagnostic Log Trace:</span>
                          <span className="text-[10px] font-mono block text-rose-700 break-all leading-normal whitespace-pre-wrap">
                            {dbStatus.postgresError || `connect ECONNREFUSED ${dbStatus.dbHost}:${dbStatus.dbPort}`}
                          </span>
                        </div>
                        <p className="text-[10.5px] font-sans text-rose-700/90 leading-tight">
                          💡 <b>Administrator Action:</b> Verify you have completed your Postgres or Cloud SQL configurations, or that your database's IP address whitelist includes the application's runtime. The system has automatically booted into <b>Safe-State Local JSON Backup File Mode</b> to protect and persist records securely in local container storage without downtime.
                        </p>
                      </div>
                    )}

                    {!dbStatus.configured && (
                      <div className="p-3 bg-amber-50/80 border border-amber-200 text-amber-950 rounded-xl flex gap-2 items-start">
                        <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-[11px] leading-relaxed font-sans text-amber-800">
                          <span className="font-bold">Database URL unassigned:</span> The <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">DATABASE_URL</code> environment variable has not been configured. The system is operating in persistent local file backup mode. To synchronize data securely to a shared Postgres database, assign the postgresql connection details in Settings.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual trigger section */}
                <div className="bg-card p-5 rounded-2xl border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-left w-full sm:w-auto">
                    <h5 className="text-xs font-bold text-foreground">Trigger Custom Manual Backup Point</h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Generates immediate physical snapshot of current database state on archival filesystem storage.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerBackup}
                    disabled={triggeringBackup}
                    className="w-full sm:w-auto bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-mono font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${triggeringBackup ? 'animate-spin' : ''}`} />
                    <span>{triggeringBackup ? 'Archiving Snapshot...' : 'Run Database Backup Now'}</span>
                  </button>
                </div>

                {backupsSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{backupsSuccessMessage}</span>
                  </div>
                )}

                {backupsError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
                    <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                    <span>{backupsError}</span>
                  </div>
                )}

                {/* Backup logs display */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <Clock className="text-muted-foreground h-3.5 w-3.5" />
                      <span className="text-[10px] font-mono uppercase font-bold text-muted-foreground tracking-wider">
                        Last 5 Verified Archival Runs
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                      SYSTEM STATUS: ONLINE
                    </span>
                  </div>

                  {loadingBackups ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 border border-border rounded-2xl bg-muted/40">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#1B4332] border-t-transparent" />
                      <span className="text-[10px] font-mono text-muted-foreground">Fetching backup logs...</span>
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-xs border border-dashed border-border rounded-2xl font-sans">
                      No system backups found in directories.
                    </div>
                  ) : (
                    <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border bg-card">
                      {backups.slice(0, 5).map((bk, idx) => (
                        <div key={bk.id} className="p-4 hover:bg-muted/60 transition duration-150 flex items-start gap-4">
                          <div className="p-2 bg-muted text-muted-foreground rounded-lg shrink-0 mt-0.5">
                            <HardDrive className="h-4.5 w-4.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-1.5 font-sans font-bold">
                              <span className="text-xs font-mono text-foreground">
                                {new Date(bk.timestamp).toLocaleString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  timeZoneName: 'short'
                                })}
                              </span>
                              <span className={`text-[8.5px] font-mono font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                bk.backupType === 'scheduled' 
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200/50' 
                                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200/50'
                              }`}>
                                {bk.backupType === 'scheduled' ? 'Scheduled Log' : 'Manual Run'}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-gray-300 font-normal">File:</span>
                                <span className="text-muted-foreground font-semibold truncate hover:underline hover:text-foreground" title={bk.fileName}>
                                  {bk.fileName}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-muted-foreground">Size: <b className="text-foreground">{bk.fileSize}</b></span>
                                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  VERIFIED
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Verification Checkpoint Note */}
                <p className="text-[10.5px] font-sans text-muted-foreground italic text-center leading-normal">
                  Note: Archival system backups store double-encrypted checksum indexes. These timestamps provide manual administrative proof of hot system maintenance compliance protocols.
                </p>
              </div>
            )}

          </div>
        </div>

    </div>
  );
}
