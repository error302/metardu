'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Plus,
  Trash2,
  FileDown,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Loader2,
  Save,
  X,
  LayoutTemplate,
  Map,
  Navigation,
  Building2,
  Trees,
  Mountain,
  Factory,
  Waves,
  Users,
  Gem,
  FolderOpen,
  Search,
  ArrowUpRight,
  RotateCcw,
  CheckCircle2,
  Copy,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  survey_type?: string;
  location?: string;
}

interface RimSection {
  id: string;
  user_id: string;
  project_id: string;
  section_name: string;
  registry: string;
  district: string;
  map_sheet_number: string;
  scale: string;
  datum: string;
  projection: string;
  total_area: number;
  parcels_count: number;
  status: 'draft' | 'review' | 'approved';
  notes: string;
  created_at: string;
  updated_at: string;
  parcel_count?: number;
  beacon_count?: number;
}

interface RimParcel {
  id: string;
  rim_section_id: string;
  parcel_number: string;
  area: number;
  land_use: string;
  owner_name: string;
  beacon_count: number;
  northings: number[];
  eastings: number[];
  is_landmark: boolean;
}

interface RimBeacon {
  id: string;
  rim_section_id: string;
  beacon_number: string;
  easting: number;
  northing: number;
  description: string;
  type: string;
  survey_status: string;
}

interface RimTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  defaults: {
    datum: string;
    projection: string;
    scale: string;
    registry: string;
  };
  parcelCount: number;
  beaconCount: number;
  regulationReference: string;
}

// ────────────────────────────────────────────────────────────────
// Category config
// ────────────────────────────────────────────────────────────────

function getCategoryIcon(category: string) {
  const icons: Record<string, any> = {
    urban: Building2,
    agricultural: Trees,
    pastoral: Mountain,
    institutional: Users,
    coastal: Waves,
    special: Factory,
  };
  const Icon = icons[category] || Gem;
  return <Icon className="w-4 h-4" />;
}

const categoryColors: Record<string, string> = {
  urban: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  agricultural: 'bg-green-500/10 text-green-400 border-green-500/30',
  pastoral: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  institutional: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  coastal: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  special: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const statusStyles: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  review: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  approved: 'bg-green-500/10 text-green-400 border-green-500/30',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  review: 'In Review',
  approved: 'Approved',
};

const beaconTypes = ['Pillar', 'Pin', 'Mark', 'Pipe', 'Concrete Block'];
const surveyStatuses = ['Original', 'Found', 'Not Found', 'Replaced'];

// ────────────────────────────────────────────────────────────────
// Toast helper (inline, no external deps)
// ────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'success' | 'error' | 'info';
  onDismiss: () => void;
}) {
  const colors = {
    success: 'border-green-500/40 bg-green-500/10 text-green-300',
    error: 'border-red-500/40 bg-red-500/10 text-red-300',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  };
  const icons = {
    success: <CheckCircle2 className="w-4 h-4 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 shrink-0" />,
    info: <AlertCircle className="w-4 h-4 shrink-0" />,
  };
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${colors[type]}`}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Empty state component
// ────────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-4 rounded-2xl bg-[var(--accent-subtle)] mb-4 text-[var(--accent)]">
        {icon}
      </div>
      <h3 className="text-base font-medium text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] max-w-md mb-4">{description}</p>
      {action}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Confirmation modal
// ────────────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{message}</p>
        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            className="btn btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`btn text-white ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700 border-red-600'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-dim)] border-[var(--accent)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main Page Component
// ────────────────────────────────────────────────────────────────

export default function RimEditorPage() {
  const router = useRouter();

  // ── Auth ──
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ── Toast ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ── Projects ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectSearch, setProjectSearch] = useState('');

  // ── RIM Sections ──
  const [sections, setSections] = useState<RimSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);

  // ── Active section ──
  const [activeSection, setActiveSection] = useState<RimSection | null>(null);
  const [sectionForm, setSectionForm] = useState<Partial<RimSection>>({});
  const [sectionSaving, setSectionSaving] = useState(false);

  // ── Parcels ──
  const [parcels, setParcels] = useState<RimParcel[]>([]);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [showAddParcel, setShowAddParcel] = useState(false);
  const [newParcel, setNewParcel] = useState({
    parcel_number: '',
    area: '',
    land_use: '',
    owner_name: '',
    beacon_count: '',
  });

  // ── Beacons ──
  const [beacons, setBeacons] = useState<RimBeacon[]>([]);
  const [beaconsLoading, setBeaconsLoading] = useState(false);
  const [showAddBeacon, setShowAddBeacon] = useState(false);
  const [newBeacon, setNewBeacon] = useState({
    beacon_number: '',
    easting: '',
    northing: '',
    description: '',
    type: 'Pillar',
    survey_status: 'Original',
  });

  // ── Templates ──
  const [templates, setTemplates] = useState<RimTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // ── Confirm dialog ──
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'primary';
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    variant: 'danger',
    onConfirm: () => {},
  });

  // ── PDF Generation ──
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // ── Auth check ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setIsAuthenticated(true);
          } else {
            router.push('/login');
            return;
          }
        } else {
          router.push('/login');
          return;
        }
      } catch {
        router.push('/login');
        return;
      }
      setAuthChecked(true);
    })();
  }, [router]);

  // ── Toast helper ──
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  }, []);

  // ── Load projects ──
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        setProjectsLoading(true);
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to load projects');
        const data = await res.json();
        setProjects(data.data || []);
      } catch (err) {
        showToast('Failed to load projects', 'error');
      } finally {
        setProjectsLoading(false);
      }
    })();
  }, [isAuthenticated, showToast]);

  // ── Load sections when project changes ──
  const loadSections = useCallback(async (projectId: string) => {
    if (!projectId) {
      setSections([]);
      return;
    }
    try {
      setSectionsLoading(true);
      const res = await fetch(`/api/rim?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to load RIM sections');
      const data = await res.json();
      setSections(data.data || []);
    } catch {
      showToast('Failed to load RIM sections', 'error');
    } finally {
      setSectionsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSections(selectedProjectId);
  }, [selectedProjectId, loadSections]);

  // ── Load templates ──
  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const res = await fetch('/api/rim-templates');
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data.data || []);
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setTemplatesLoading(false);
    }
  }, [showToast]);

  // ── Select project ──
  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveSection(null);
    setParcels([]);
    setBeacons([]);
  };

  // ── Create blank section ──
  const handleCreateSection = async () => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch('/api/rim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_section',
          data: {
            project_id: selectedProjectId,
            section_name: '',
            registry: '',
            district: '',
            map_sheet_number: '',
            scale: '1:2500',
            datum: 'Arc 1960',
            projection: 'UTM Zone 37S',
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create section');
      }
      const data = await res.json();
      const newSection = data.data;
      showToast('RIM section created', 'success');
      await loadSections(selectedProjectId);
      handleSelectSection(newSection);
    } catch (err: any) {
      showToast(err.message || 'Failed to create section', 'error');
    }
  };

  // ── Create from template ──
  const handleCreateFromTemplate = async (templateId: string) => {
    if (!selectedProjectId) return;
    try {
      // Get template data from the API
      const tplRes = await fetch('/api/rim-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, customizations: {} }),
      });
      if (!tplRes.ok) throw new Error('Failed to apply template');
      const tplData = await tplRes.json();
      const tpl = tplData.data;

      // Create the section with template defaults
      const res = await fetch('/api/rim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_section',
          data: {
            project_id: selectedProjectId,
            section_name: tpl.section?.section_name || '',
            registry: tpl.defaults?.registry || '',
            district: '',
            map_sheet_number: '',
            scale: tpl.defaults?.scale || '1:2500',
            datum: tpl.defaults?.datum || 'Arc 1960',
            projection: tpl.defaults?.projection || 'UTM Zone 37S',
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to create section');
      const data = await res.json();
      const newSection = data.data;

      // Add sample parcels
      if (tpl.sampleParcels?.length) {
        for (const p of tpl.sampleParcels) {
          await fetch('/api/rim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_parcel',
              data: {
                rimSectionId: newSection.id,
                parcel_number: p.parcelNumber || '',
                area: p.area || 0,
                land_use: p.landUse || '',
                owner_name: p.ownerName || '',
                beacon_count: 0,
              },
            }),
          });
        }
      }

      // Add sample beacons
      if (tpl.sampleBeacons?.length) {
        for (const b of tpl.sampleBeacons) {
          await fetch('/api/rim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_beacon',
              data: {
                rimSectionId: newSection.id,
                beacon_number: b.beaconNumber || '',
                easting: b.easting || 0,
                northing: b.northing || 0,
                description: b.description || '',
                type: b.type || 'Pillar',
                survey_status: 'Original',
              },
            }),
          });
        }
      }

      setShowTemplates(false);
      showToast('RIM section created from template', 'success');
      await loadSections(selectedProjectId);
      handleSelectSection(newSection);
    } catch (err: any) {
      showToast(err.message || 'Failed to create from template', 'error');
    }
  };

  // ── Select a section ──
  const handleSelectSection = async (section: RimSection) => {
    setActiveSection(section);
    setSectionForm({
      section_name: section.section_name,
      registry: section.registry,
      district: section.district,
      map_sheet_number: section.map_sheet_number,
      scale: section.scale,
      datum: section.datum,
      projection: section.projection,
      total_area: section.total_area,
      status: section.status,
      notes: section.notes,
    });

    // Load parcels and beacons
    setParcelsLoading(true);
    setBeaconsLoading(true);
    try {
      // Parcels: fetch via separate logic (API returns section list, not parcels inline)
      // The parcels/beacons for a section are added via POST, so we track them locally
      // We need to use the API to get them — but the GET endpoint only returns sections with counts
      // For now, we'll store them in local state as they're added
      setParcels([]);
      setBeacons([]);
    } finally {
      setParcelsLoading(false);
      setBeaconsLoading(false);
    }
  };

  // ── Update section ──
  const handleUpdateSection = async () => {
    if (!activeSection) return;
    try {
      setSectionSaving(true);
      const res = await fetch('/api/rim', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_section',
          id: activeSection.id,
          data: {
            section_name: sectionForm.section_name || '',
            registry: sectionForm.registry || '',
            district: sectionForm.district || '',
            map_sheet_number: sectionForm.map_sheet_number || '',
            scale: sectionForm.scale || '1:2500',
            datum: sectionForm.datum || 'Arc 1960',
            projection: sectionForm.projection || 'UTM Zone 37S',
            total_area: sectionForm.total_area || 0,
            status: sectionForm.status || 'draft',
            notes: sectionForm.notes || '',
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to update section');
      }
      const data = await res.json();
      setActiveSection(data.data);
      showToast('Section updated', 'success');
      await loadSections(selectedProjectId);
    } catch (err: any) {
      showToast(err.message || 'Failed to update section', 'error');
    } finally {
      setSectionSaving(false);
    }
  };

  // ── Delete section ──
  const handleDeleteSection = (section: RimSection) => {
    setConfirmDialog({
      open: true,
      title: 'Delete RIM Section',
      message: `Are you sure you want to delete "${section.section_name || 'Untitled Section'}"? This will permanently remove the section and all its parcels and beacons.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          const res = await fetch(`/api/rim?rimSectionId=${section.id}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error?.message || 'Failed to delete section');
          }
          showToast('Section deleted', 'success');
          if (activeSection?.id === section.id) {
            setActiveSection(null);
            setParcels([]);
            setBeacons([]);
          }
          await loadSections(selectedProjectId);
        } catch (err: any) {
          showToast(err.message || 'Failed to delete section', 'error');
        }
      },
    });
  };

  // ── Add parcel ──
  const handleAddParcel = async () => {
    if (!activeSection || !newParcel.parcel_number.trim()) {
      showToast('Parcel number is required', 'error');
      return;
    }
    try {
      const res = await fetch('/api/rim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_parcel',
          data: {
            rimSectionId: activeSection.id,
            parcel_number: newParcel.parcel_number.trim(),
            area: parseFloat(newParcel.area) || 0,
            land_use: newParcel.land_use.trim(),
            owner_name: newParcel.owner_name.trim(),
            beacon_count: parseInt(newParcel.beacon_count) || 0,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to add parcel');
      }
      const data = await res.json();
      setParcels((prev) => [...prev, data.data]);
      setNewParcel({ parcel_number: '', area: '', land_use: '', owner_name: '', beacon_count: '' });
      setShowAddParcel(false);
      showToast('Parcel added', 'success');
      await loadSections(selectedProjectId);
    } catch (err: any) {
      showToast(err.message || 'Failed to add parcel', 'error');
    }
  };

  // ── Add beacon ──
  const handleAddBeacon = async () => {
    if (!activeSection || !newBeacon.beacon_number.trim()) {
      showToast('Beacon number is required', 'error');
      return;
    }
    try {
      const res = await fetch('/api/rim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_beacon',
          data: {
            rimSectionId: activeSection.id,
            beacon_number: newBeacon.beacon_number.trim(),
            easting: parseFloat(newBeacon.easting) || 0,
            northing: parseFloat(newBeacon.northing) || 0,
            description: newBeacon.description.trim(),
            type: newBeacon.type,
            survey_status: newBeacon.survey_status,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to add beacon');
      }
      const data = await res.json();
      setBeacons((prev) => [...prev, data.data]);
      setNewBeacon({
        beacon_number: '',
        easting: '',
        northing: '',
        description: '',
        type: 'Pillar',
        survey_status: 'Original',
      });
      setShowAddBeacon(false);
      showToast('Beacon added', 'success');
      await loadSections(selectedProjectId);
    } catch (err: any) {
      showToast(err.message || 'Failed to add beacon', 'error');
    }
  };

  // ── Generate PDF ──
  const handleGeneratePdf = async () => {
    if (!activeSection) return;
    try {
      setPdfGenerating(true);
      const res = await fetch('/api/rim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_pdf',
          rimSectionId: activeSection.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to generate PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || `RIM_${activeSection.section_name || 'draft'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('PDF generated and downloaded', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate PDF', 'error');
    } finally {
      setPdfGenerating(false);
    }
  };

  // ── Open templates modal ──
  const handleOpenTemplates = async () => {
    setShowTemplates(true);
    if (templates.length === 0) {
      await loadTemplates();
    }
  };

  // ── Filtered projects ──
  const filteredProjects = projectSearch
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
          p.survey_type?.toLowerCase().includes(projectSearch.toLowerCase()) ||
          p.location?.toLowerCase().includes(projectSearch.toLowerCase())
      )
    : projects;

  // ── Filtered templates ──
  const filteredTemplates = templateSearch
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
          t.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
          t.category.toLowerCase().includes(templateSearch.toLowerCase()) ||
          t.tags.some((tag) => tag.toLowerCase().includes(templateSearch.toLowerCase()))
      )
    : templates;

  // ── Loading state ──
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">RIM Editor</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Resurvey and Index Map — Kenya Cadastral Document System
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Survey Act Cap 299 · Survey Regulations L.N. 168/1994
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedProjectId && (
            <button onClick={handleOpenTemplates} className="btn btn-secondary">
              <LayoutTemplate className="w-4 h-4" />
              <span className="hidden sm:inline">From Template</span>
            </button>
          )}
          {selectedProjectId && (
            <button onClick={handleCreateSection} className="btn btn-primary">
              <Plus className="w-4 h-4" />
              New Section
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Project Selection */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
            <FolderOpen className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Select Project</h2>
          {selectedProjectId && (
            <button
              onClick={() => handleSelectProject('')}
              className="ml-auto flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Change
            </button>
          )}
        </div>

        {projectsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading projects...
          </div>
        ) : !selectedProjectId ? (
          <>
            {projects.length > 5 && (
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="input pl-9"
                />
              </div>
            )}
            {filteredProjects.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  {projectSearch ? 'No matching projects found.' : 'No projects yet. Create one first.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/40 hover:bg-[var(--bg-tertiary)] transition-all text-left group"
                  >
                    <MapPin className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0 transition-colors" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">{project.name}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {[
                          project.survey_type,
                          project.location,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Survey Project'}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-subtle)]">
            <MapPin className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {projects.find((p) => p.id === selectedProjectId)?.name || 'Selected Project'}
            </span>
          </div>
        )}
      </div>

      {/* Step 2: Sections List */}
      {selectedProjectId && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
                <Map className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">RIM Sections</h2>
              <span className="text-xs text-[var(--text-muted)]">({sections.length})</span>
            </div>
          </div>

          {sectionsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading sections...
            </div>
          ) : sections.length === 0 ? (
            <EmptyState
              icon={<Gem className="w-6 h-6" />}
              title="No RIM sections yet"
              description="Create a new blank section or start from one of 10 Kenya-specific templates to get started quickly."
              action={
                <div className="flex items-center gap-2">
                  <button onClick={handleOpenTemplates} className="btn btn-secondary">
                    <LayoutTemplate className="w-4 h-4" />
                    From Template
                  </button>
                  <button onClick={handleCreateSection} className="btn btn-primary">
                    <Plus className="w-4 h-4" />
                    Blank Section
                  </button>
                </div>
              }
            />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sections.map((section) => {
                const isActive = activeSection?.id === section.id;
                return (
                  <div
                    key={section.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${
                      isActive
                        ? 'border-[var(--accent)]/40 bg-[var(--accent-subtle)]'
                        : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                    onClick={() => !isActive && handleSelectSection(section)}
                  >
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isActive ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                      }`}
                    >
                      <Gem className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {section.section_name || 'Untitled Section'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            statusStyles[section.status] || statusStyles.draft
                          }`}
                        >
                          {statusLabels[section.status] || section.status}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {[
                          section.map_sheet_number && `MS ${section.map_sheet_number}`,
                          section.scale && `Scale ${section.scale}`,
                          section.registry && `Reg: ${section.registry}`,
                          `${section.parcel_count ?? 0} parcels`,
                          `${section.beacon_count ?? 0} beacons`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isActive ? (
                        <ChevronLeft className="w-4 h-4 text-[var(--text-muted)]" />
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSection(section);
                            }}
                            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                            title="Delete section"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Section Editor */}
      {activeSection && (
        <div className="space-y-4">
          {/* Editor Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setActiveSection(null);
                  setParcels([]);
                  setBeacons([]);
                }}
                className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {activeSection.section_name || 'Untitled Section'}
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Editing RIM section details, parcels, and beacons
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGeneratePdf}
                disabled={pdfGenerating}
                className="btn btn-secondary"
              >
                {pdfGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                {pdfGenerating ? 'Generating...' : 'Export PDF'}
              </button>
              <button
                onClick={handleUpdateSection}
                disabled={sectionSaving}
                className="btn btn-primary"
              >
                {sectionSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {sectionSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => handleDeleteSection(activeSection)}
                className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                title="Delete section"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Section Metadata */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
                <Navigation className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Section Metadata</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Section Name */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Section Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. LR 123/456 Section II"
                  value={sectionForm.section_name || ''}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, section_name: e.target.value }))}
                />
              </div>

              {/* Registry */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Registry
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Machakos"
                  value={sectionForm.registry || ''}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, registry: e.target.value }))}
                />
              </div>

              {/* District */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  District / County
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Machakos County"
                  value={sectionForm.district || ''}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, district: e.target.value }))}
                />
              </div>

              {/* Map Sheet Number */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Map Sheet Number
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. MS 1234"
                  value={sectionForm.map_sheet_number || ''}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, map_sheet_number: e.target.value }))}
                />
              </div>

              {/* Scale */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Scale
                </label>
                <select
                  className="input"
                  value={sectionForm.scale || '1:2500'}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, scale: e.target.value }))}
                >
                  {['1:500', '1:1000', '1:1250', '1:2500', '1:5000', '1:10000', '1:25000', '1:50000'].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Datum */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Datum
                </label>
                <select
                  className="input"
                  value={sectionForm.datum || 'Arc 1960'}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, datum: e.target.value }))}
                >
                  {['Arc 1960', 'WGS 84', 'Clarke 1880 (RGS)', 'Clarke 1880 (Modified)', 'Cape Datum', 'Adindan'].map(
                    (d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Projection */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Projection
                </label>
                <select
                  className="input"
                  value={sectionForm.projection || 'UTM Zone 37S'}
                  onChange={(e) => setSectionForm((prev) => ({ ...prev, projection: e.target.value }))}
                >
                  {[
                    'UTM Zone 36S',
                    'UTM Zone 36N',
                    'UTM Zone 37S',
                    'UTM Zone 37N',
                    'UTM Zone 38S',
                    'UTM Zone 38N',
                    'UTM Zone 35S',
                    'UTM Zone 35N',
                    'Kenya Modified UTM',
                    'Local Grid',
                  ].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Total Area */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Total Area (Ha)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  className="input"
                  placeholder="0.0000"
                  value={sectionForm.total_area || ''}
                  onChange={(e) =>
                    setSectionForm((prev) => ({
                      ...prev,
                      total_area: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Status
                </label>
                <select
                  className="input"
                  value={sectionForm.status || 'draft'}
                  onChange={(e) =>
                    setSectionForm((prev) => ({
                      ...prev,
                      status: e.target.value as 'draft' | 'review' | 'approved',
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="review">In Review</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Notes
              </label>
              <textarea
                className="input min-h-[72px] resize-y"
                placeholder="Additional notes, surveyor remarks, or references..."
                value={sectionForm.notes || ''}
                onChange={(e) => setSectionForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          {/* Tabs: Parcels & Beacons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Parcels Table */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Map className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Parcels
                    <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                      ({parcels.length})
                    </span>
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddParcel(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>

              {/* Add Parcel Form */}
              {showAddParcel && (
                <div className="mb-4 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      New Parcel
                    </span>
                    <button
                      onClick={() => setShowAddParcel(false)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Parcel No. *"
                      value={newParcel.parcel_number}
                      onChange={(e) => setNewParcel((prev) => ({ ...prev, parcel_number: e.target.value }))}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      className="input text-xs"
                      placeholder="Area (Ha)"
                      value={newParcel.area}
                      onChange={(e) => setNewParcel((prev) => ({ ...prev, area: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Land Use"
                      value={newParcel.land_use}
                      onChange={(e) => setNewParcel((prev) => ({ ...prev, land_use: e.target.value }))}
                    />
                    <input
                      type="number"
                      className="input text-xs"
                      placeholder="Beacon Count"
                      value={newParcel.beacon_count}
                      onChange={(e) => setNewParcel((prev) => ({ ...prev, beacon_count: e.target.value }))}
                    />
                  </div>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="Owner Name"
                    value={newParcel.owner_name}
                    onChange={(e) => setNewParcel((prev) => ({ ...prev, owner_name: e.target.value }))}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowAddParcel(false);
                        setNewParcel({ parcel_number: '', area: '', land_use: '', owner_name: '', beacon_count: '' });
                      }}
                      className="btn btn-secondary text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                    <button onClick={handleAddParcel} className="btn btn-primary text-xs py-1.5 px-3">
                      Add Parcel
                    </button>
                  </div>
                </div>
              )}

              {/* Parcels List */}
              {parcels.length === 0 && !showAddParcel ? (
                <div className="py-8 text-center">
                  <Map className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-xs text-[var(--text-muted)]">No parcels added yet</p>
                  <button
                    onClick={() => setShowAddParcel(true)}
                    className="mt-2 text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add first parcel
                  </button>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border-color)]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Parcel No.
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Area (Ha)
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hidden sm:table-cell">
                          Land Use
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hidden lg:table-cell">
                          Owner
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcels.map((parcel) => (
                        <tr
                          key={parcel.id}
                          className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--glass-bg)] transition-colors"
                        >
                          <td className="px-3 py-2 text-xs font-medium text-[var(--text-primary)]">
                            {parcel.parcel_number || '—'}
                            {parcel.is_landmark && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/30">
                                LMK
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)] tabular-nums">
                            {parcel.area > 0 ? parcel.area.toFixed(4) : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)] hidden sm:table-cell">
                            {parcel.land_use || '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)] hidden lg:table-cell truncate max-w-[140px]">
                            {parcel.owner_name || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Beacons Table */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Beacons
                    <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                      ({beacons.length})
                    </span>
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddBeacon(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>

              {/* Add Beacon Form */}
              {showAddBeacon && (
                <div className="mb-4 p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      New Beacon
                    </span>
                    <button
                      onClick={() => setShowAddBeacon(false)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      className="input text-xs"
                      placeholder="Beacon No. *"
                      value={newBeacon.beacon_number}
                      onChange={(e) => setNewBeacon((prev) => ({ ...prev, beacon_number: e.target.value }))}
                    />
                    <select
                      className="input text-xs"
                      value={newBeacon.type}
                      onChange={(e) => setNewBeacon((prev) => ({ ...prev, type: e.target.value }))}
                    >
                      {beaconTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.001"
                      className="input text-xs"
                      placeholder="Easting"
                      value={newBeacon.easting}
                      onChange={(e) => setNewBeacon((prev) => ({ ...prev, easting: e.target.value }))}
                    />
                    <input
                      type="number"
                      step="0.001"
                      className="input text-xs"
                      placeholder="Northing"
                      value={newBeacon.northing}
                      onChange={(e) => setNewBeacon((prev) => ({ ...prev, northing: e.target.value }))}
                    />
                    <select
                      className="input text-xs"
                      value={newBeacon.survey_status}
                      onChange={(e) => setNewBeacon((prev) => ({ ...prev, survey_status: e.target.value }))}
                    >
                      {surveyStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="Description"
                    value={newBeacon.description}
                    onChange={(e) => setNewBeacon((prev) => ({ ...prev, description: e.target.value }))}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowAddBeacon(false);
                        setNewBeacon({
                          beacon_number: '',
                          easting: '',
                          northing: '',
                          description: '',
                          type: 'Pillar',
                          survey_status: 'Original',
                        });
                      }}
                      className="btn btn-secondary text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                    <button onClick={handleAddBeacon} className="btn btn-primary text-xs py-1.5 px-3">
                      Add Beacon
                    </button>
                  </div>
                </div>
              )}

              {/* Beacons List */}
              {beacons.length === 0 && !showAddBeacon ? (
                <div className="py-8 text-center">
                  <Navigation className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="text-xs text-[var(--text-muted)]">No beacons added yet</p>
                  <button
                    onClick={() => setShowAddBeacon(true)}
                    className="mt-2 text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add first beacon
                  </button>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border-color)]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Beacon
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hidden sm:table-cell">
                          Type
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          E / N
                        </th>
                        <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hidden lg:table-cell">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {beacons.map((beacon) => (
                        <tr
                          key={beacon.id}
                          className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--glass-bg)] transition-colors"
                        >
                          <td className="px-3 py-2">
                            <div className="text-xs font-medium text-[var(--text-primary)]">
                              {beacon.beacon_number || '—'}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
                              {beacon.description}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)] hidden sm:table-cell">
                            {beacon.type}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)] tabular-nums">
                            <span className="text-[var(--text-muted)]">E:</span>{' '}
                            {(beacon.easting || 0).toFixed(3)}
                            <br />
                            <span className="text-[var(--text-muted)]">N:</span>{' '}
                            {(beacon.northing || 0).toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-xs hidden lg:table-cell">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                beacon.survey_status === 'Original'
                                  ? 'bg-green-500/10 text-green-400'
                                  : beacon.survey_status === 'Found'
                                  ? 'bg-blue-500/10 text-blue-400'
                                  : beacon.survey_status === 'Replaced'
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-red-500/10 text-red-400'
                              }`}
                            >
                              {beacon.survey_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Regulation Reference */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] mt-0.5">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">Regulatory Reference</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                  RIM documents are prepared under <strong className="text-[var(--text-secondary)]">Survey Act Cap 299</strong>,{' '}
                  <strong className="text-[var(--text-secondary)]">Survey Regulations L.N. 168/1994</strong>, and the{' '}
                  <strong className="text-[var(--text-secondary)]">Land Registration Act 2012</strong>.
                  Section data must be verified against the official cadastral records before submission.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* Template Selection Modal */}
      {/* ────────────────────────────────────────────────────────── */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] shrink-0">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">RIM Templates</h2>
                <span className="text-xs text-[var(--text-muted)]">
                  ({templates.length} Kenya-specific templates)
                </span>
              </div>
              <button
                onClick={() => setShowTemplates(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search templates by name, category, or tag..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="input pl-9"
                />
              </div>
            </div>

            {/* Template Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading templates...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No matching templates found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="group p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer"
                      onClick={() => handleCreateFromTemplate(template.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg border shrink-0 ${
                            categoryColors[template.category] || categoryColors.special
                          }`}
                        >
                          {getCategoryIcon(template.category) || <Gem className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                              {template.name}
                            </h4>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-2">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                            <span className="capitalize">{template.category}</span>
                            <span>{template.parcelCount} parcels</span>
                            <span>{template.beaconCount} beacons</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {template.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                              >
                                {tag}
                              </span>
                            ))}
                            {template.tags.length > 4 && (
                              <span className="text-[9px] text-[var(--text-muted)]">
                                +{template.tags.length - 4}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-[var(--border-color)] shrink-0">
              <button
                onClick={() => {
                  setShowTemplates(false);
                  handleCreateSection();
                }}
                className="btn btn-secondary text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Blank Instead
              </button>
              <button
                onClick={() => setShowTemplates(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* Confirm Dialog */}
      {/* ────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
