import React, { useState, useEffect } from 'react';
import { 
  Search, 
  UserPlus, 
  Edit2, 
  Trash2, 
  Mail, 
  Phone, 
  X, 
  Check, 
  ShieldAlert, 
  Loader2, 
  MessageSquare, 
  Clock, 
  User, 
  Briefcase, 
  ToggleLeft, 
  ToggleRight,
  AlertCircle,
  Paperclip,
  FileVideo,
  Download,
  Upload,
  FileText,
  CheckSquare,
  Square,
  Undo,
  RotateCcw,
  LayoutGrid,
  Table as TableIcon,
  KeyRound
} from 'lucide-react';
import { User as UserType, UserRole } from '../types';
import { parseCsvRecords, INVESTOR_IMPORT_CSV_TEMPLATE } from '../utils/csvParser';
import { useImportReview } from './ImportReviewModal';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './ui/data-table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useConfirm } from './ui/confirm';

interface InvestorsViewProps {
  user: UserType;
  token: string;
  refreshSignal: number;
  triggerRefreshSignal?: () => void;
  onSelectInvestor?: (investorId: string) => void;
}

export default function InvestorsView({ user, token, refreshSignal, triggerRefreshSignal, onSelectInvestor }: InvestorsViewProps) {
  const confirmDialog = useConfirm();
  const { reviewImport, reviewModal } = useImportReview(token);

  const [investors, setInvestors] = useState<UserType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    const saved = localStorage.getItem('investors_view_mode');
    return saved === 'table' ? 'table' : 'grid';
  });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleViewModeChange = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('investors_view_mode', mode);
  };

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Bulk upload & export states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedInvestors, setParsedInvestors] = useState<any[]>([]);
  const [bulkUploading, setBulkUploading] = useState<boolean>(false);
  const [isDraggingCsv, setIsDraggingCsv] = useState<boolean>(false);
  const [bulkResults, setBulkResults] = useState<{
    successCount: number;
    failCount: number;
    total: number;
    errors: any[];
  } | null>(null);

  // Active investor being edited/deleted/messaged
  const [selectedInvestor, setSelectedInvestor] = useState<UserType | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    role: UserRole.INVESTOR
  });

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    username: '',
    isActive: true,
    role: UserRole.INVESTOR,
    password: ''
  });

  const [messageForm, setMessageForm] = useState({
    subject: '',
    body: ''
  });

  const [messageAttachment, setMessageAttachment] = useState<File | null>(null);
  const [messageAttachmentPreview, setMessageAttachmentPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Batch edit states
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isBulkMessageModalOpen, setIsBulkMessageModalOpen] = useState<boolean>(false);
  const [isMarketingBulk, setIsMarketingBulk] = useState(false);
  const [bulkMessageForm, setBulkMessageForm] = useState({
    subject: '',
    body: ''
  });
  const [bulkMessageAttachment, setBulkMessageAttachment] = useState<File | null>(null);
  const [bulkMessageAttachmentPreview, setBulkMessageAttachmentPreview] = useState<string | null>(null);
  const [bulkMessageLoading, setBulkMessageLoading] = useState<boolean>(false);
  const [isBulkDragging, setIsBulkDragging] = useState<boolean>(false);

  // Recent Action Toast State (for Undo support)
  const [recentActionToast, setRecentActionToast] = useState<{
    message: string;
    previousStates: Array<{ id: string; role: UserRole; isActive: boolean }>;
    actionLabel: string;
  } | null>(null);
  const [undoLoading, setUndoLoading] = useState<boolean>(false);

  // Toggle selection of a single investor
  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Select or Deselect all investors currently shown/filtered
  const toggleSelectAll = () => {
    const visibleIds = filteredInvestors.map(inv => inv.id);
    const allVisibleSelected = visibleIds.every(id => selectedUserIds.includes(id));
    if (allVisibleSelected) {
      // Remove visible ones
      setSelectedUserIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      // Add all visible ones, keeping any already selected outside the current visible set
      setSelectedUserIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkAction = async (action: 'update-role' | 'disable-account' | 'enable-account' | 'send-login-details', value?: string) => {
    if (selectedUserIds.length === 0) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userIds: selectedUserIds,
          action,
          value
        })
      });

      if (res.ok) {
        const data = await res.json();
        showSuccess(action === 'send-login-details'
          ? `Login details emailed to ${data.count} investor(s). Each must choose a new password at first sign-in.`
          : `Bulk action completed successfully! Updated ${data.count} investor accounts.`);
        
        // Save to Recent Actions Toast for Undo functionality
        if (data.previousStates && data.previousStates.length > 0) {
          let actionLabel = 'bulk operation';
          if (action === 'update-role') actionLabel = `Updated Role to ${value}`;
          else if (action === 'disable-account') actionLabel = 'Disabled Accounts';
          else if (action === 'enable-account') actionLabel = 'Enabled Accounts';

          setRecentActionToast({
            message: `Batch action "${actionLabel}" affected ${data.count} investor accounts.`,
            previousStates: data.previousStates,
            actionLabel
          });
        } else {
          setRecentActionToast(null);
        }

        setSelectedUserIds([]); // Clear selection
        fetchInvestors(); // Refresh list
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Bulk action failed.');
      }
    } catch (err) {
      setError('Failed to execute bulk action.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUndoBulkAction = async () => {
    if (!recentActionToast || recentActionToast.previousStates.length === 0) return;
    setUndoLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users/bulk-undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          previousStates: recentActionToast.previousStates
        })
      });

      if (res.ok) {
        const data = await res.json();
        showSuccess(`Reverted batch change! Successfully restored ${data.count} investor accounts to their previous states.`);
        setRecentActionToast(null); // Clear toast after successful undo
        fetchInvestors(); // Refresh list
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to revert the batch operation.');
      }
    } catch (err) {
      setError('Failed to execute bulk undo operation.');
    } finally {
      setUndoLoading(false);
    }
  };

  // Bulk attachment handlers
  const handleBulkFileChange = (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setError("File size exceeds 50MB limit. Please choose a file smaller than 50MB.");
      return;
    }
    setBulkMessageAttachment(file);
    const previewUrl = URL.createObjectURL(file);
    setBulkMessageAttachmentPreview(previewUrl);
  };

  const handleBulkDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsBulkDragging(true);
  };

  const handleBulkDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsBulkDragging(false);
  };

  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsBulkDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleBulkFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveBulkAttachment = () => {
    setBulkMessageAttachment(null);
    if (bulkMessageAttachmentPreview) {
      if (bulkMessageAttachmentPreview.startsWith('blob:')) {
        URL.revokeObjectURL(bulkMessageAttachmentPreview);
      }
      setBulkMessageAttachmentPreview(null);
    }
  };

  const handleSendBulkNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserIds.length === 0 || !bulkMessageForm.subject || !bulkMessageForm.body) return;
    setBulkMessageLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('recipientIds', selectedUserIds.join(','));
      formData.append('subject', bulkMessageForm.subject);
      formData.append('body', bulkMessageForm.body);
      formData.append('isMarketing', String(isMarketingBulk));
      if (bulkMessageAttachment) {
        formData.append('attachment', bulkMessageAttachment);
      }

      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setIsBulkMessageModalOpen(false);
        setBulkMessageForm({ subject: '', body: '' });
        setBulkMessageAttachment(null);
        if (bulkMessageAttachmentPreview) {
          if (bulkMessageAttachmentPreview.startsWith('blob:')) {
            URL.revokeObjectURL(bulkMessageAttachmentPreview);
          }
          setBulkMessageAttachmentPreview(null);
        }
        showSuccess(`Message sent to ${data.count} selected investor(s).${data.skippedNoConsent ? ` ${data.skippedNoConsent} skipped (no marketing consent).` : ''}`);
        setSelectedUserIds([]); // Clear selection
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to dispatch bulk notification.');
      }
    } catch (err) {
      setError('Failed to send bulk notification.');
    } finally {
      setBulkMessageLoading(false);
    }
  };

  // Fetch investors list
  const fetchInvestors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data: UserType[] = await res.json();
        setInvestors(data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch investors list.');
      }
    } catch (err) {
      setError('Network error: Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestors();
  }, [refreshSignal, token]);

  // Auto-dismiss recent action toast after 15 seconds
  useEffect(() => {
    if (!recentActionToast) return;
    const timer = setTimeout(() => {
      setRecentActionToast(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [recentActionToast]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Create Investor handler
  const handleCreateInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username || !createForm.name || !createForm.email) {
      setError('Please fill in all required fields.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(createForm)
      });

      if (res.ok) {
        const created = await res.json();
        setIsCreateModalOpen(false);
        setCreateForm({ username: '', name: '', email: '', phone: '', password: '', role: UserRole.INVESTOR });
        showSuccess(`Account created. Temporary password: ${created.temporaryPassword} (also sent in the welcome email; must be changed at first sign-in).`);
        fetchInvestors();
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to create investor profile.');
      }
    } catch (err) {
      setError('Failed to reach server.');
    } finally {
      setActionLoading(false);
    }
  };

  // Edit Investor handler
  const handleEditInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestor) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedInvestor.id}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        showSuccess(`Investor "${editForm.name}" updated successfully!`);
        fetchInvestors();
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to update investor profile.');
      }
    } catch (err) {
      setError('Failed to update investor.');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle active directly
  const handleToggleActive = async (investor: UserType) => {
    try {
      const res = await fetch(`/api/admin/users/${investor.id}/toggle-active`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        showSuccess(`Status toggled for ${investor.name}`);
        fetchInvestors();
        if (triggerRefreshSignal) triggerRefreshSignal();
      }
    } catch (err) {
      console.error('Failed to toggle user status', err);
    }
  };

  // Delete Investor handler
  const handleDeleteInvestor = async () => {
    if (!selectedInvestor) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedInvestor.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setIsDeleteModalOpen(false);
        showSuccess(`Investor "${selectedInvestor.name}" has been permanently removed.`);
        fetchInvestors();
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to delete investor.');
      }
    } catch (err) {
      setError('Failed to complete delete request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileChange = (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setError("File size exceeds 50MB limit. Please choose a file smaller than 50MB.");
      return;
    }
    setMessageAttachment(file);
    const previewUrl = URL.createObjectURL(file);
    setMessageAttachmentPreview(previewUrl);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveAttachment = () => {
    setMessageAttachment(null);
    if (messageAttachmentPreview) {
      if (messageAttachmentPreview.startsWith('blob:')) {
        URL.revokeObjectURL(messageAttachmentPreview);
      }
      setMessageAttachmentPreview(null);
    }
  };

  // Send Direct Message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestor || !messageForm.subject || !messageForm.body) return;
    setActionLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('subject', messageForm.subject);
      formData.append('body', messageForm.body);
      if (messageAttachment) {
        formData.append('attachment', messageAttachment);
      }

      const res = await fetch(`/api/admin/users/${selectedInvestor.id}/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        setIsMessageModalOpen(false);
        setMessageForm({ subject: '', body: '' });
        setMessageAttachment(null);
        if (messageAttachmentPreview) {
          if (messageAttachmentPreview.startsWith('blob:')) {
            URL.revokeObjectURL(messageAttachmentPreview);
          }
          setMessageAttachmentPreview(null);
        }
        showSuccess(`Mailing successfully sent to ${selectedInvestor.name}!`);
        if (triggerRefreshSignal) triggerRefreshSignal();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to dispatch mailing.');
      }
    } catch (err) {
      setError('Failed to send mailing.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open modals with pre-populated data
  const openEditModal = (investor: UserType) => {
    setSelectedInvestor(investor);
    setEditForm({
      name: investor.name,
      email: investor.email,
      phone: investor.phone || '',
      username: investor.username,
      isActive: investor.isActive !== false,
      role: investor.role,
      password: ''
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (investor: UserType) => {
    setSelectedInvestor(investor);
    setIsDeleteModalOpen(true);
  };

  const openMessageModal = (investor: UserType) => {
    setSelectedInvestor(investor);
    setMessageForm({
      subject: `Adubiaro Estates update for ${investor.name}`,
      body: `Dear ${investor.name},\n\nWe wanted to share an update regarding your investment holdings at Adubiaro Farm Estates...`
    });
    setIsMessageModalOpen(true);
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (investors.length === 0) {
      setError('No investor data available to export.');
      return;
    }

    const headers = ['ID', 'Username', 'Name', 'Email', 'Phone', 'Status'];
    const rows = investors.map(inv => [
      inv.id,
      inv.username,
      inv.name,
      inv.email,
      inv.phone || '',
      inv.isActive !== false ? 'Active' : 'Inactive'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `adubiaro_investors_directory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess('Investors directory exported successfully!');
  };

  // Download Import Template
  const handleDownloadSampleCsv = () => {
    const csvContent = 
      INVESTOR_IMPORT_CSV_TEMPLATE;
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'adubiaro_investors_bulk_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Select/parse CSV file
  const handleCsvSelect = (file: File) => {
    if (!file) return;
    setCsvFile(file);
    setBulkResults(null);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      try {
        const { headers, records } = parseCsvRecords(text);
        if (headers.length === 0) {
          setError('CSV file is empty.');
          return;
        }
        
        // Usernames are optional: they are created from email addresses when missing
        const hasName = headers.some(h => h === 'name' || h === 'fullname' || h === 'investorname');
        const hasEmail = headers.some(h => h === 'email' || h === 'emailaddress');
        
        if (!hasName || !hasEmail) {
          setError('CSV file must have at least "name" and "email" columns.');
          return;
        }
        
        setParsedInvestors(records);
      } catch (err) {
        console.error(err);
        setError('Failed to parse CSV file. Ensure it is a valid comma-separated format.');
      }
    };
    reader.readAsText(file);
  };

  // Run Bulk Upload
  const handleBulkUploadInvestors = async () => {
    if (parsedInvestors.length === 0) {
      setError('No parsed investor records to upload.');
      return;
    }
    
    try {
      setBulkUploading(true);
      setBulkResults(null);
      setError(null);
      
      const data = await reviewImport(parsedInvestors);
      if (!data) return;
      
      setBulkResults(data);
      if (data.successCount > 0) {
        setCsvFile(null);
        setParsedInvestors([]);
        fetchInvestors();
        if (triggerRefreshSignal) triggerRefreshSignal();
        showSuccess(`Imported ${data.successCount} holding(s) for ${data.usersCreatedCount} new and ${data.existingUsersMatchedCount} existing investor(s).`);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during bulk import.');
    } finally {
      setBulkUploading(false);
    }
  };

  // Filtered investors
  const filteredInvestors = investors.filter(inv => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      inv.name.toLowerCase().includes(q) ||
      inv.username.toLowerCase().includes(q) ||
      inv.email.toLowerCase().includes(q) ||
      (inv.phone && inv.phone.includes(q))
    );
    const matchesRole = roleFilter === 'ALL' || inv.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Columns for the table view (sortable; selection is shared with the grid view)
  const roleLabel = (role: UserRole) => (role === UserRole.ADMIN ? 'Admin' : role === UserRole.FARM_MANAGER ? 'Farm manager' : 'Investor');
  const investorColumns: ColumnDef<UserType>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const inv = row.original;
        const initials = inv.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
        const body = (
          <span className="flex items-center gap-3 min-w-[180px]">
            <span className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0">{initials}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground truncate">{inv.name}</span>
              <span className="block text-xs text-muted-foreground truncate">@{inv.username}</span>
            </span>
          </span>
        );
        return user.role === UserRole.ADMIN && onSelectInvestor && inv.role === UserRole.INVESTOR ? (
          <button type="button" onClick={() => onSelectInvestor(inv.id)} className="text-left hover:underline cursor-pointer" title={`View ${inv.name}'s portfolio`}>
            {body}
          </button>
        ) : (
          body
        );
      }
    },
    {
      accessorKey: 'email',
      header: 'Contact',
      cell: ({ row }) => (
        <div className="min-w-[180px] space-y-0.5">
          <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate max-w-[240px]">{row.original.email}</span></div>
          {row.original.phone && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" />{row.original.phone}</div>}
        </div>
      )
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => {
        const role = getValue() as UserRole;
        return <Badge variant={role === UserRole.INVESTOR ? 'success' : role === UserRole.ADMIN ? 'default' : 'outline'}>{roleLabel(role)}</Badge>;
      }
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: inv => (inv.isActive !== false ? 'Active' : 'Disabled'),
      cell: ({ row }) => {
        const inv = row.original;
        const active = inv.isActive !== false;
        return (
          <button
            type="button"
            onClick={() => handleToggleActive(inv)}
            className="inline-flex items-center gap-1.5 cursor-pointer"
            title={active ? 'Disable this account' : 'Enable this account'}
            aria-label={`${active ? 'Disable' : 'Enable'} ${inv.name}`}
          >
            {active ? <ToggleRight className="h-5 w-5 text-success" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
            <Badge variant={active ? 'success' : 'muted'}>{active ? 'Active' : 'Disabled'}</Badge>
          </button>
        );
      }
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openMessageModal(inv)} aria-label={`Message ${inv.name}`} title="Send a message"><Mail /></Button>
            <Button variant="ghost" size="icon" onClick={() => openEditModal(inv)} aria-label={`Edit ${inv.name}`} title="Edit details"><Edit2 /></Button>
            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => openDeleteModal(inv)} aria-label={`Delete ${inv.name}`} title="Delete account"><Trash2 /></Button>
          </div>
        );
      }
    }
  ];


  return (
    <div className={`space-y-6 ${selectedUserIds.length > 0 ? 'pb-56 md:pb-36' : ''}`}>
      {reviewModal}
      
      {/* Banner Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl flex items-center gap-3 animate-fade-in text-xs font-semibold shadow-premium">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 rounded-2xl flex items-start gap-3 animate-fade-in text-xs">
          <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Execution Warning:</span>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Control Header & Actions bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-card border border-border p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="p-2.5 bg-[#52B788]/10 rounded-2xl text-[#1B4332] dark:text-[#52B788]">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif font-extrabold text-base text-[#1B4332] dark:text-[#52B788]">
              {roleFilter === 'ALL'
                ? 'All accounts'
                : roleFilter === 'INVESTOR'
                ? 'Investors'
                : roleFilter === 'FARM_MANAGER'
                ? 'Farm Managers'
                : 'Administrators'}
            </h2>
            <p className="text-[10px] font-mono text-gray-400">
              {roleFilter === 'ALL'
                ? 'Investors, farm managers and administrators'
                : roleFilter === 'INVESTOR'
                ? 'People who hold plots'
                : roleFilter === 'FARM_MANAGER'
                ? 'Staff who run the farms'
                : 'People who manage the portal'}
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full xl:w-auto">
          <div className="flex items-center gap-2 flex-1 sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-[#FBF9F4] dark:bg-stone-800 border border-gray-150 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] transition text-gray-800 dark:text-stone-100"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setSelectedUserIds([]); // Clear selection on filter change
              }}
              className="px-3.5 py-2.5 text-xs bg-[#FBF9F4] dark:bg-stone-800 border border-gray-150 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100 font-bold cursor-pointer shrink-0 outline-none shadow-sm"
            >
              <option value="ALL">All Roles</option>
              <option value="INVESTOR">Investors</option>
              <option value="FARM_MANAGER">Managers</option>
              <option value="ADMIN">Admins</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-gray-700 dark:text-stone-300 rounded-xl text-xs font-bold cursor-pointer transition shrink-0"
              title="Export all investors as CSV"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => {
                setCsvFile(null);
                setParsedInvestors([]);
                setBulkResults(null);
                setIsImportModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-gray-700 dark:text-stone-300 rounded-xl text-xs font-bold cursor-pointer transition shrink-0"
              title="Bulk import investors via CSV"
            >
              <Upload className="h-4 w-4" />
              <span>Bulk Import</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-[#FBF9F4] hover:text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* Select All Bar & View Mode Switcher */}
      {!loading && filteredInvestors.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 dark:bg-stone-900/70 border border-stone-200/50 dark:border-stone-800 px-4.5 py-3 rounded-2xl text-xs">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-750 font-semibold text-gray-700 dark:text-stone-300 transition cursor-pointer"
            >
              {filteredInvestors.length > 0 && filteredInvestors.every(inv => selectedUserIds.includes(inv.id)) ? (
                <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Square className="h-4 w-4 text-gray-400 dark:text-stone-500" />
              )}
              <span>
                {filteredInvestors.length > 0 && filteredInvestors.every(inv => selectedUserIds.includes(inv.id))
                  ? 'Deselect All'
                  : 'Select All'}
              </span>
            </button>
            <span className="text-gray-300 dark:text-stone-700 font-mono">|</span>
            <span className="text-gray-500 dark:text-stone-400">
              Showing <strong>{filteredInvestors.length}</strong> investors
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {selectedUserIds.length > 0 && (
              <div className="flex items-center gap-1.5 text-[#2D6A4F] dark:text-[#52B788] font-bold font-mono">
                <span className="h-2 w-2 rounded-full bg-[#52B788] animate-pulse" />
                <span>{selectedUserIds.length} selected for batch operations</span>
              </div>
            )}

            {/* Grid / Table View Toggle */}
            <div
              className="inline-flex items-center bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-1 shadow-xs"
              role="group"
              aria-label="Investors display layout"
            >
              <button
                type="button"
                onClick={() => handleViewModeChange('grid')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#1B4332] text-white shadow-xs dark:bg-[#52B788] dark:text-stone-950'
                    : 'text-gray-500 dark:text-stone-400 hover:text-gray-800 dark:hover:text-stone-200'
                }`}
                title="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#1B4332] text-white shadow-xs dark:bg-[#52B788] dark:text-stone-950'
                    : 'text-gray-500 dark:text-stone-400 hover:text-gray-800 dark:hover:text-stone-200'
                }`}
                title="Table view"
                aria-pressed={viewMode === 'table'}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Investors List (Grid or Table View) */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 text-[#52B788] animate-spin" />
          <p className="text-xs font-mono text-gray-400">Saving…</p>
        </div>
      ) : filteredInvestors.length === 0 ? (
        <div className="py-20 bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/10 dark:border-stone-800 text-center flex flex-col items-center justify-center p-6">
          <User className="h-10 w-10 text-gray-300 dark:text-stone-700 mb-2" />
          <h3 className="font-sans font-bold text-gray-700 dark:text-stone-300 text-sm">No Investors Found</h3>
          <p className="text-xs text-gray-400 max-w-sm mt-1">
            We couldn't find any investor profiles matching your criteria or currently registered.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          columns={investorColumns}
          data={filteredInvestors}
          hideSearch
          pageSize={50}
          getRowId={inv => inv.id}
          selectedIds={selectedUserIds}
          onSelectedIdsChange={setSelectedUserIds}
          emptyMessage="No accounts match your filters."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInvestors.map((inv) => {
            const isSelected = selectedUserIds.includes(inv.id);
            return (
              <div 
                key={inv.id}
                className={`bg-white dark:bg-stone-900 border rounded-3xl p-5 hover:shadow-premium transition-all duration-300 flex flex-col justify-between group relative min-w-0 overflow-hidden ${
                  isSelected
                    ? 'border-[#52B788] bg-emerald-50/30 dark:bg-emerald-950/10 ring-2 ring-[#52B788]/30 shadow-md scale-[1.015]'
                    : 'border-gray-150 dark:border-stone-800'
                }`}
              >
                <div className="min-w-0">
                  {/* Header info */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectUser(inv.id);
                      }}
                      className="p-1 text-[#2D6A4F] hover:text-[#1B4332] dark:text-[#52B788] transition cursor-pointer shrink-0"
                      title={isSelected ? "Deselect user" : "Select user for batch operations"}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="h-5 w-5 text-gray-300 dark:text-stone-700 shrink-0" />
                      )}
                    </button>

                    {user.role === UserRole.ADMIN && onSelectInvestor && inv.role === UserRole.INVESTOR ? (
                      <button
                        type="button"
                        onClick={() => onSelectInvestor(inv.id)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left group/profile cursor-pointer"
                        title={`View ${inv.name}'s portfolio & returns`}
                      >
                        <div className="w-10 h-10 rounded-full bg-[#52B788]/10 group-hover/profile:bg-[#1B4332] text-[#1B4332] dark:text-[#52B788] group-hover/profile:text-white flex items-center justify-center font-bold text-xs shrink-0 transition-colors">
                          {inv.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-sans font-bold text-sm text-gray-800 dark:text-stone-100 group-hover/profile:text-[#2D6A4F] dark:group-hover/profile:text-[#52B788] group-hover/profile:underline transition-colors truncate">
                            {inv.name}
                          </h4>
                          <p className="text-[10px] font-mono text-gray-400 truncate">@{inv.username}</p>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-[#52B788]/10 text-[#1B4332] dark:text-[#52B788] flex items-center justify-center font-bold text-xs shrink-0">
                          {inv.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-sans font-bold text-sm text-gray-800 dark:text-stone-100 group-hover:text-[#2D6A4F] dark:group-hover:text-[#52B788] transition-colors truncate">
                            {inv.name}
                          </h4>
                          <p className="text-[10px] font-mono text-gray-400 truncate">@{inv.username}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Role & Status Badges */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    <span className={`text-[8.5px] font-mono font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap max-w-full truncate ${
                      inv.role === UserRole.ADMIN
                        ? 'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/40'
                        : inv.role === UserRole.FARM_MANAGER
                        ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40'
                        : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40'
                    }`}>
                      {inv.role.toUpperCase()}
                    </span>
                    <span className={`text-[8px] font-mono font-extrabold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      inv.isActive !== false
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/20'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700'
                    }`}>
                      {inv.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                {/* Body details */}
                <div className="mt-4 space-y-2.5 text-xs text-gray-500 dark:text-stone-400 border-t border-dashed border-gray-100 dark:border-stone-800 pt-4">
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="truncate text-gray-700 dark:text-stone-300">{inv.email}</span>
                  </div>
                  {inv.phone && (
                    <div className="flex items-center gap-2.5">
                      <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-700 dark:text-stone-300">{inv.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="text-[10px] font-mono text-gray-400">ID: {inv.id}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-gray-50 dark:border-stone-800 flex items-center justify-between">
                
                {/* Active Toggle Switch */}
                <button
                  onClick={() => handleToggleActive(inv)}
                  title={inv.isActive !== false ? "Deactivate Profile" : "Activate Profile"}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-[#52B788] transition text-[10px] font-mono"
                >
                  {inv.isActive !== false ? (
                    <ToggleRight className="h-6 w-6 text-emerald-500 cursor-pointer" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-gray-400 cursor-pointer" />
                  )}
                  <span>Status</span>
                </button>

                {/* Operational actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openMessageModal(inv)}
                    className="p-2 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-xl transition cursor-pointer"
                    title="Message / Mail Investor"
                  >
                    <Mail className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => openEditModal(inv)}
                    className="p-2 bg-[#52B788]/10 text-[#1B4332] dark:text-[#52B788] hover:bg-[#52B788]/20 rounded-xl transition cursor-pointer"
                    title="Modify Details"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => openDeleteModal(inv)}
                    className="p-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-xl transition cursor-pointer"
                    title="Permanently Remove Profile"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );})}
        </div>
      )}

      {/* 1. Create Investor Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/20 dark:border-stone-800 max-w-md w-full shadow-premium p-6 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#2D6A4F] dark:text-[#52B788]" />
                <h3 className="font-serif font-extrabold text-sm text-[#1B4332] dark:text-[#52B788]">Add System Account & Role</h3>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInvestor} className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alaba Michael"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. alaba_m"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                    Temporary Password
                  </label>
                  <input
                    type="password"
                    placeholder="Auto generated if blank"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. alaba@example.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. +234 801 234 5678"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  System Role / Permission Tier
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                  className="w-full text-xs px-3.5 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100 font-bold outline-none"
                >
                  <option value={UserRole.INVESTOR}>Investor (Default)</option>
                  <option value={UserRole.FARM_MANAGER}>Farm Manager</option>
                  <option value={UserRole.ADMIN}>Super Admin</option>
                </select>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-stone-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B4332] text-white hover:bg-[#2D6A4F] rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                >
                  {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Edit/Modify Investor Modal */}
      {isEditModalOpen && selectedInvestor && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/20 dark:border-stone-800 max-w-md w-full shadow-premium p-6 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-[#2D6A4F] dark:text-[#52B788]" />
                <h3 className="font-serif font-extrabold text-sm text-[#1B4332] dark:text-[#52B788]">Modify Details</h3>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditInvestor} className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  System Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className="w-full text-xs px-3.5 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100 font-bold outline-none"
                >
                  <option value={UserRole.INVESTOR}>Investor</option>
                  <option value={UserRole.FARM_MANAGER}>Farm Manager</option>
                  <option value={UserRole.ADMIN}>Super Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Set New Password
                </label>
                <input
                  type="password"
                  placeholder="Leave blank to keep current"
                  value={editForm.password || ''}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div className="flex items-center justify-between bg-stone-50 dark:bg-stone-800/60 p-3 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-[#1B4332] dark:text-stone-200">Account Authorization Status</h4>
                  <p className="text-[9px] text-gray-400">Controls whether investor is permitted to log in</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                  className="text-gray-400 hover:text-[#52B788]"
                >
                  {editForm.isActive ? (
                    <ToggleRight className="h-7 w-7 text-emerald-500 cursor-pointer" />
                  ) : (
                    <ToggleLeft className="h-7 w-7 text-gray-400 cursor-pointer" />
                  )}
                </button>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-stone-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B4332] text-white hover:bg-[#2D6A4F] rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                >
                  {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedInvestor && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-red-100 dark:border-stone-800 max-w-sm w-full shadow-premium p-6 overflow-hidden animate-fade-in">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-50 text-red-600 mb-4">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-stone-100">Permanently Remove Profile?</h3>
              <p className="text-xs text-gray-500 mt-2">
                Are you absolutely sure you want to remove <strong>{selectedInvestor.name}</strong> from your estates investor registry? This action is non-reversible.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 border border-gray-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-50 cursor-pointer"
              >
                No, Keep Profile
              </button>
              <button
                type="button"
                onClick={handleDeleteInvestor}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-1"
              >
                {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Message / Direct Mail Modal */}
      {isMessageModalOpen && selectedInvestor && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/20 dark:border-stone-800 max-w-lg w-full shadow-premium p-6 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[#2D6A4F] dark:text-[#52B788]" />
                <h3 className="font-serif font-extrabold text-sm text-[#1B4332] dark:text-[#52B788]">Send Private Message</h3>
              </div>
              <button 
                onClick={() => setIsMessageModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 p-3 bg-stone-50 dark:bg-stone-800 border border-gray-100 dark:border-stone-800 rounded-2xl flex items-center justify-between text-[11px] text-gray-500">
              <span>Sending communication to:</span>
              <span className="font-bold text-[#1B4332] dark:text-[#52B788]">{selectedInvestor.name} ({selectedInvestor.email})</span>
            </div>

            <form onSubmit={handleSendMessage} className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Mailing Subject
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Adubiaro Farm Update Q3"
                  value={messageForm.subject}
                  onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Message Body
                </label>
                <textarea
                  required
                  rows={6}
                  value={messageForm.body}
                  onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100 font-sans leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-extrabold text-[#1B4332] dark:text-stone-300 uppercase tracking-wider mb-1">
                  Attachment (Image or Video)
                </label>
                {messageAttachmentPreview ? (
                  <div className="relative border border-stone-200 dark:border-stone-800 rounded-2xl p-2 bg-[#FBF9F4] dark:bg-stone-800 flex items-center gap-3">
                    {messageAttachment?.type.startsWith('video/') ? (
                      <div className="h-14 w-14 bg-stone-100 dark:bg-stone-700 rounded-xl flex items-center justify-center text-[#2D6A4F] shrink-0">
                        <FileVideo className="h-6 w-6" />
                      </div>
                    ) : (
                      <img
                        src={messageAttachmentPreview}
                        alt="Attachment preview"
                        className="h-14 w-14 object-cover rounded-xl border border-stone-200 dark:border-stone-700 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">{messageAttachment?.name}</p>
                      <p className="text-[10px] text-stone-500 font-mono">
                        {(messageAttachment ? (messageAttachment.size / (1024 * 1024)).toFixed(2) : '0')} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveAttachment}
                      className="p-1.5 hover:bg-stone-150 dark:hover:bg-stone-700 rounded-lg text-red-500 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('message-attachment-input')?.click()}
                    className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-[#2D6A4F] bg-[#2D6A4F]/5 dark:border-[#52B788] dark:bg-[#52B788]/5'
                        : 'border-stone-200 hover:border-[#2D6A4F] bg-[#FBF9F4] hover:bg-stone-50/50 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-[#52B788]'
                    }`}
                  >
                    <input
                      type="file"
                      id="message-attachment-input"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileChange(e.target.files[0]);
                        }
                      }}
                    />
                    <Paperclip className="h-5 w-5 mx-auto text-stone-400 mb-1" />
                    <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                      Drag & drop an image or video, or browse
                    </p>
                    <p className="text-[9px] text-stone-400 mt-0.5">
                      Supports PNG, JPG, WEBP, MP4, MOV up to 50MB
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-stone-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsMessageModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#1B4332] text-white hover:bg-[#2D6A4F] rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1"
                >
                  {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Send message</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Bulk Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/20 dark:border-stone-800 max-w-lg w-full shadow-premium p-6 overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-stone-800 shrink-0">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-[#2D6A4F] dark:text-[#52B788]" />
                <h3 className="font-serif font-extrabold text-sm text-[#1B4332] dark:text-[#52B788]">Bulk Import Investors</h3>
              </div>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-stone-300 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Instructions and Template Download */}
              <div className="p-4 bg-stone-50 dark:bg-stone-800 border border-gray-150 dark:border-stone-800 rounded-2xl text-xs space-y-2.5">
                <p className="font-semibold text-gray-700 dark:text-stone-300">How the CSV upload works:</p>
                <p className="text-gray-500 dark:text-stone-400 leading-relaxed">
                  Import multiple investors at once by uploading a standard comma-separated values (CSV) file. 
                  The CSV header must strictly contain <code className="bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded text-red-700 dark:text-red-400 font-mono">username</code>, 
                  <code className="bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded text-red-700 dark:text-red-400 font-mono">name</code>, and 
                  <code className="bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded text-red-700 dark:text-red-400 font-mono">email</code> columns.
                </p>
                <p className="text-gray-500 dark:text-stone-400 leading-relaxed text-[11px] bg-white dark:bg-stone-900 p-2.5 rounded-xl border border-stone-200/40">
                  ⚡ <b>Register User & Link Plot</b>:<br />
                  Optionally supply <code className="font-mono text-[10px] text-emerald-700 dark:text-[#52B788]">farmEstate</code>, <code className="font-mono text-[10px] text-emerald-700 dark:text-[#52B788]">plotNumber</code>, <code className="font-mono text-[10px] text-emerald-700 dark:text-[#52B788]">sizeHectares</code>, <code className="font-mono text-[10px] text-emerald-700 dark:text-[#52B788]">sizeUnit</code>, <code className="font-mono text-[10px] text-emerald-700 dark:text-[#52B788]">cropType</code>, and <code className="font-mono text-[10px] text-emerald-700 dark:text-[#52B788]">investmentAmount</code> columns to automatically create and allocate a deeded plot inside the designated farm.
                </p>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] text-gray-400 font-mono">Optional: phone, password, plot fields</span>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="text-[10px] font-mono text-[#2D6A4F] hover:text-[#1B4332] dark:text-[#52B788] dark:hover:text-[#40916C] flex items-center gap-1.5 bg-[#52B788]/10 hover:bg-[#52B788]/20 px-3 py-1.5 rounded-lg transition duration-200 cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Download CSV Template
                  </button>
                </div>
              </div>

              {/* File Dropzone */}
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
                    setError('Please drop a valid CSV file.');
                  }
                }}
                onClick={() => document.getElementById('investor-bulk-csv-input')?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 ${
                  isDraggingCsv
                    ? 'border-[#2D6A4F] bg-emerald-50/20 dark:border-[#52B788] dark:bg-stone-800/40'
                    : 'border-stone-200 hover:border-[#2D6A4F] bg-[#FBF9F4] hover:bg-stone-50/50 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-[#52B788]'
                }`}
              >
                <input
                  id="investor-bulk-csv-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvSelect(file);
                  }}
                />
                <Upload className={`h-8 w-8 mx-auto mb-2 transition-transform duration-300 ${isDraggingCsv ? 'scale-110 text-[#2D6A4F]' : 'text-stone-400'}`} />
                <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  {csvFile ? `Selected: ${csvFile.name}` : 'Drag & drop your investor CSV file here, or browse'}
                </p>
                <p className="text-[10px] text-stone-400 mt-1 font-mono">
                  {csvFile ? `${(csvFile.size / 1024).toFixed(1)} KB` : 'Supports standard .csv file format'}
                </p>
              </div>

              {/* Parse preview table */}
              {parsedInvestors.length > 0 && (
                <div className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-inner bg-stone-50/40 dark:bg-stone-800 p-3 space-y-2">
                  <div className="flex justify-between items-center border-b border-stone-250 dark:border-stone-800 pb-2">
                    <h4 className="font-sans font-bold text-xs text-stone-800 dark:text-stone-200">
                      File Preview ({parsedInvestors.length} records parsed)
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvFile(null);
                        setParsedInvestors([]);
                        setBulkResults(null);
                      }}
                      className="text-[10px] text-red-600 hover:underline cursor-pointer"
                    >
                      Clear File
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto text-[11px] divide-y divide-stone-100 dark:divide-stone-800 font-mono">
                    {parsedInvestors.slice(0, 5).map((p, i) => (
                      <div key={i} className="py-2 flex items-center justify-between text-stone-600 dark:text-stone-400">
                        <div className="truncate pr-3">
                          <span className="font-bold text-stone-800 dark:text-stone-200 font-sans">{p.name}</span>
                          <span className="text-[9px] font-mono text-stone-400 ml-1.5">@{p.username}</span>
                        </div>
                        <span className="font-mono text-stone-500 shrink-0">{p.email}</span>
                      </div>
                    ))}
                    {parsedInvestors.length > 5 && (
                      <div className="text-center py-1 text-[10px] font-mono text-stone-400">
                        And {parsedInvestors.length - 5} more records...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bulk Results Overview */}
              {bulkResults && (
                <div className="p-4 bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl text-xs space-y-2">
                  <p className="font-bold text-emerald-800 dark:text-emerald-300">Import Session Summary:</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/40 rounded-xl">
                      <div className="text-emerald-800 dark:text-emerald-300">{bulkResults.total}</div>
                      <div className="text-[9px] text-emerald-600 dark:text-emerald-400">Processed</div>
                    </div>
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-850 rounded-xl">
                      <div className="text-emerald-800 dark:text-emerald-200">{bulkResults.successCount}</div>
                      <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">Imported</div>
                    </div>
                    <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded-xl">
                      <div className="text-rose-800 dark:text-rose-400">{bulkResults.failCount}</div>
                      <div className="text-[9px] text-rose-500 dark:text-rose-400 font-bold">Failed</div>
                    </div>
                  </div>

                  {bulkResults.errors && bulkResults.errors.length > 0 && (
                    <div className="mt-2 text-[10px] space-y-1">
                      <p className="font-bold text-rose-700 dark:text-rose-400">Errors encountered:</p>
                      <div className="max-h-24 overflow-y-auto p-2 bg-rose-50/50 dark:bg-rose-950/20 rounded-lg border border-rose-100 dark:border-rose-900 divide-y divide-rose-100/55">
                        {bulkResults.errors.map((err, i) => (
                          <p key={i} className="py-1 text-rose-800 dark:text-rose-300 font-mono">
                            Line {err.row}: {err.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-stone-800 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-gray-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={bulkUploading || parsedInvestors.length === 0}
                onClick={handleBulkUploadInvestors}
                className="px-4 py-2 bg-[#1B4332] hover:bg-[#2D6A4F] text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
              >
                {bulkUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Import Profiles</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Actions Bar */}
      {selectedUserIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-4 animate-slide-up">
          <div className="bg-[#1B4332] dark:bg-stone-900 text-white rounded-3xl shadow-premium border border-[#52B788]/35 p-4.5 flex flex-col md:flex-row items-center justify-between gap-4.5 backdrop-blur-md bg-opacity-95 dark:bg-opacity-95">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-[#52B788]/20 text-[#52B788] rounded-xl flex items-center justify-center font-bold text-xs font-mono">
                {selectedUserIds.length}
              </div>
              <div>
                <p className="text-xs font-bold leading-none">Batch Actions Active</p>
                <p className="text-[10px] text-emerald-300/80 mt-1 font-mono">{selectedUserIds.length} selected investors</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Send Bulk Notification */}
              <button
                onClick={() => {
                  setBulkMessageForm({
                    subject: 'Estate Portal Announcement - Adubiaro Farms',
                    body: 'Dear Valued Investor,\n\nWe are writing to provide a standard update regarding Adubiaro Farm Estates. Below are the status details...'
                  });
                  setIsBulkMessageModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#52B788] hover:bg-[#40916C] text-[#1B4332] hover:text-white rounded-xl text-xs font-bold transition duration-200 cursor-pointer"
                title="Broadcast notification to selected investors"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Send Bulk Notification</span>
              </button>

              {/* Email fresh login details (e.g. after an import without welcome emails) */}
              {user.role === UserRole.ADMIN && (
                <button
                  onClick={async () => {
                    if (await confirmDialog({ title: `Send login details to ${selectedUserIds.length} user(s)?`, description: 'Each person gets a new temporary password by email. Any password they use now stops working.', confirmText: 'Send login details' })) {
                      handleBulkAction('send-login-details');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-[#1B4332] rounded-xl text-xs font-bold transition duration-200 cursor-pointer"
                  title="Email new temporary passwords to the selected users"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Send login details</span>
                </button>
              )}

              {/* Disable Accounts */}
              <button
                onClick={async () => {
                  if (await confirmDialog({ title: `Disable ${selectedUserIds.length} account(s)?`, description: 'They will not be able to sign in until re-enabled.', confirmText: 'Disable', destructive: true })) {
                    handleBulkAction('disable-account');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-bold transition duration-200 cursor-pointer border border-stone-700"
                title="Disable selected investor accounts"
              >
                <ToggleLeft className="h-4 w-4 text-stone-400" />
                <span>Disable</span>
              </button>

              {/* Enable Accounts */}
              <button
                onClick={() => {
                  handleBulkAction('enable-account');
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1B4332] hover:bg-[#2D6A4F] text-[#52B788] hover:text-[#74C69D] rounded-xl text-xs font-bold transition duration-200 cursor-pointer border border-[#52B788]/20"
                title="Enable selected investor accounts"
              >
                <ToggleRight className="h-4 w-4 text-emerald-400" />
                <span>Enable</span>
              </button>

              {/* Update Role Select/Dropdown */}
              <div className="relative">
                <select
                  onChange={async (e) => {
                    const select = e.target;
                    const selectedRole = select.value;
                    if (selectedRole) {
                      select.value = '';
                      if (await confirmDialog({ title: `Change role for ${selectedUserIds.length} user(s)?`, description: `Their role becomes "${selectedRole.replace('_', ' ')}".`, confirmText: 'Change role' })) {
                        handleBulkAction('update-role', selectedRole);
                      }
                      e.target.value = ''; // Reset select dropdown
                    }
                  }}
                  className="bg-[#2D6A4F] dark:bg-stone-800 hover:bg-emerald-800 border border-[#52B788]/20 text-white rounded-xl text-xs font-bold px-3 py-2 outline-none cursor-pointer transition duration-200"
                  defaultValue=""
                >
                  <option value="" disabled>Update Role</option>
                  <option value={UserRole.ADMIN}>Super Admin</option>
                  <option value={UserRole.FARM_MANAGER}>Farm Manager</option>
                  <option value={UserRole.INVESTOR}>Investor</option>
                </select>
              </div>

              {/* Clear selection */}
              <button
                onClick={() => setSelectedUserIds([])}
                className="text-xs text-emerald-300 hover:text-white px-2 py-1 font-mono cursor-pointer transition duration-200"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Notification Modal */}
      {isBulkMessageModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/20 dark:border-stone-800 max-w-lg w-full shadow-premium p-6 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-stone-800 shrink-0">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[#2D6A4F] dark:text-[#52B788]" />
                <div>
                  <h3 className="font-serif font-extrabold text-sm text-[#1B4332] dark:text-[#52B788]">Send Bulk Notification</h3>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">Recipient Group: {selectedUserIds.length} investors</p>
                </div>
              </div>
              <button 
                onClick={() => setIsBulkMessageModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-stone-300 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendBulkNotification} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-stone-300 mb-1.5">
                  Notification Subject
                </label>
                <input
                  type="text"
                  required
                  value={bulkMessageForm.subject}
                  onChange={(e) => setBulkMessageForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g. Q3 Farm Estate Yield Distribution Update"
                  className="w-full px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-stone-300 mb-1.5">
                  Message Body (Markdown/Text)
                </label>
                <textarea
                  required
                  rows={6}
                  value={bulkMessageForm.body}
                  onChange={(e) => setBulkMessageForm(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Write the broadcast message content here..."
                  className="w-full px-3 py-2.5 bg-[#FBF9F4] dark:bg-stone-800 border border-gray-200 dark:border-stone-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#52B788] text-gray-800 dark:text-stone-100 font-sans"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-stone-300 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={isMarketingBulk} onChange={(e) => setIsMarketingBulk(e.target.checked)} />
                <span>Promotional / marketing message (only sent to people who opted in to marketing)</span>
              </label>

              {/* Drag & Drop Attachment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-stone-300 mb-1.5">
                  Optional Document or Media Attachment
                </label>
                <div
                  onDragOver={handleBulkDragOver}
                  onDragLeave={handleBulkDragLeave}
                  onDrop={handleBulkDrop}
                  onClick={() => document.getElementById('bulk-msg-attachment-input')?.click()}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-300 ${
                    isBulkDragging
                      ? 'border-[#2D6A4F] bg-emerald-50/20 dark:border-[#52B788] dark:bg-stone-800/40'
                      : 'border-stone-200 hover:border-[#2D6A4F] bg-[#FBF9F4] hover:bg-stone-50/50 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-[#52B788]'
                  }`}
                >
                  <input
                    id="bulk-msg-attachment-input"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBulkFileChange(file);
                    }}
                  />
                  <Paperclip className={`h-6 w-6 mx-auto mb-1.5 transition-transform duration-300 ${isBulkDragging ? 'scale-110 text-[#2D6A4F]' : 'text-stone-400'}`} />
                  <p className="text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                    {bulkMessageAttachment ? `Selected: ${bulkMessageAttachment.name}` : 'Drag & drop any PDF, image or spreadsheet here, or click to browse'}
                  </p>
                  <p className="text-[9px] text-stone-400 mt-0.5 font-mono">
                    {bulkMessageAttachment ? `${(bulkMessageAttachment.size / 1024).toFixed(1)} KB` : 'Supports images, documents and media up to 50MB'}
                  </p>
                </div>

                {bulkMessageAttachmentPreview && (
                  <div className="mt-3 p-3 bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-200/50 dark:border-stone-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="h-4 w-4 text-[#2D6A4F] shrink-0" />
                      <span className="text-[11px] font-mono text-gray-600 dark:text-stone-300 truncate">{bulkMessageAttachment?.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveBulkAttachment();
                      }}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg cursor-pointer transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-stone-800 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBulkMessageModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-stone-300 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkMessageLoading || selectedUserIds.length === 0}
                  className="px-4 py-2 bg-[#1B4332] hover:bg-[#2D6A4F] text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {bulkMessageLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Broadcast Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recent Action Undo Toast */}
      {recentActionToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white dark:bg-stone-900 border border-emerald-200 dark:border-stone-800 rounded-3xl shadow-2xl p-5 animate-slide-up transition-all duration-300">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-2xl shrink-0">
              <RotateCcw className="h-4 w-4 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-extrabold font-mono tracking-widest text-emerald-700 dark:text-emerald-400 uppercase">
                  Recent Bulk Action
                </span>
                <button
                  onClick={() => setRecentActionToast(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
                  title="Dismiss toast"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs font-bold text-gray-800 dark:text-stone-100 mt-2 leading-relaxed">
                {recentActionToast.message}
              </p>
              
              <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-dashed border-gray-100 dark:border-stone-800">
                <span className="text-[10px] text-gray-400 dark:text-stone-500 font-medium">
                  revert bulk changes
                </span>
                <button
                  onClick={handleUndoBulkAction}
                  disabled={undoLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1B4332] hover:bg-[#2D6A4F] dark:bg-stone-800 dark:hover:bg-stone-750 text-white dark:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer shadow-md active:scale-98"
                >
                  {undoLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Undo className="h-3.5 w-3.5" />
                  )}
                  <span>Undo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
