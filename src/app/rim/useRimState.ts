'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPut, apiDelete, apiInvalidate, ApiError } from '@/lib/api/client';
import {
  authSessionSchema,
  projectsListSchema,
  rimListSchema,
  rimTemplatesListSchema,
  rimMutationSchema,
  rimTemplateApplySchema,
  type Project,
  type RimSection,
  type RimParcel,
  type RimBeacon,
  type RimTemplate,
} from './types';

// ────────────────────────────────────────────────────────────────
// ConfirmDialog state shape (shared with page)
// ────────────────────────────────────────────────────────────────

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  variant: 'danger' | 'primary';
  onConfirm: () => void;
}

// ────────────────────────────────────────────────────────────────
// useRimState — encapsulates all state + handlers for the RIM page
// ────────────────────────────────────────────────────────────────

export function useRimState(initialProjectId: string) {
  const router = useRouter();

  // ── Auth ──
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ── Toast ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ── Projects ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const projectRef = useRef(initialProjectId);
  const sectionRef = useRef('');
  const sectionRequest = useRef(0);
  const sectionListRequest = useRef(0);
  const inFlight = useRef(false);
  const [mutating, setMutating] = useState(false);
  const [detailError, setDetailError] = useState('');
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
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
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
        const data = await apiGet('/api/auth/session', authSessionSchema, { ttlMs: 0 })
        if (data?.user) {
          setIsAuthenticated(true);
        } else {
          router.push('/login');
          return;
        }
      } catch (err) {
        if (err instanceof ApiError && err.isUnauthorized) {
          router.push('/login');
          return;
        }
        // Other errors (server hiccup, etc.) — also bail to login
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
        const data = await apiGet('/api/projects', projectsListSchema, { ttlMs: 30_000 })
        setProjects((data.data || []) as Project[]);
      } catch (err) {
        showToast(err instanceof ApiError ? (err as Error).message : 'Failed to load projects', 'error');
      } finally {
        setProjectsLoading(false);
      }
    })();
  }, [isAuthenticated, showToast]);

  // ── Load sections when project changes ──
  const loadSections = useCallback(async (projectId: string) => {
    const request = ++sectionListRequest.current;
    if (!projectId) {
      setSections([]);
      return;
    }
    try {
      setSectionsLoading(true);
      const data = await apiGet(`/api/rim?projectId=${projectId}`, rimListSchema, { ttlMs: 0 })
      if (projectRef.current === projectId && sectionListRequest.current === request) setSections((data.data || []) as RimSection[]);
    } catch (err) {
      if (projectRef.current === projectId && sectionListRequest.current === request) showToast(err instanceof ApiError ? err.message : 'Failed to load RIM registers', 'error');
    } finally {
      if (projectRef.current === projectId && sectionListRequest.current === request) setSectionsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated) void loadSections(selectedProjectId);
  }, [isAuthenticated, selectedProjectId, loadSections]);

  // ── Load templates ──
  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const data = await apiGet('/api/rim-templates', rimTemplatesListSchema, { ttlMs: 300_000 })
      setTemplates((data.data || []) as RimTemplate[]);
    } catch (err) {
      showToast(err instanceof ApiError ? (err as Error).message : 'Failed to load templates', 'error');
    } finally {
      setTemplatesLoading(false);
    }
  }, [showToast]);

  // ── Select project ──
  const handleSelectProject = (id: string) => {
    projectRef.current = id;
    sectionRef.current = '';
    sectionRequest.current += 1;
    setSelectedProjectId(id);
    setSections([]);
    setSectionsLoading(Boolean(id));
    setDetailError('');
    setActiveSection(null);
    setParcels([]);
    setBeacons([]);
  };

  // ── Select a section ──
  const handleSelectSection = async (section: RimSection) => {
    if (projectRef.current !== section.project_id) return;
    const request = ++sectionRequest.current;
    sectionRef.current = section.id;
    setDetailError('');
    setParcels([]);
    setBeacons([]);
    setShowAddParcel(false);
    setShowAddBeacon(false);
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
      const result = await apiGet('/api/rim?rimSectionId=' + encodeURIComponent(section.id), rimMutationSchema, { ttlMs: 0 });
      if (sectionRequest.current !== request) return;
      const saved = result.data as { parcels: RimParcel[]; beacons: RimBeacon[] };
      setParcels(saved.parcels);
      setBeacons(saved.beacons);
    } catch (error) {
      if (sectionRequest.current === request) setDetailError(error instanceof Error ? error.message : 'Unable to open the register.');
    } finally {
      if (sectionRequest.current === request) {
        setParcelsLoading(false);
        setBeaconsLoading(false);
      }
    }
  };

  // ── Create blank section ──
  const handleCreateSection = async () => {
    if (!selectedProjectId) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setMutating(true);
    try {
      const result = await apiPost(
        '/api/rim',
        rimMutationSchema,
        {
          action: 'create_section',
          data: {
            project_id: selectedProjectId,
            section_name: '',
            registry: '',
            district: '',
            map_sheet_number: '',
            scale: '1:2500',
            datum: '',
            projection: '',
          },
        },
      );
      apiInvalidate(`/api/rim?projectId=${selectedProjectId}`)
      const newSection = result.data as RimSection;
      showToast('RIM section created', 'success');
      await loadSections(selectedProjectId);
      handleSelectSection(newSection);
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? (err as Error).message : ((err as Error).message || 'Failed to create section'), 'error');
    } finally {
      inFlight.current = false;
      setMutating(false);
    }
  };

  // ── Create from template ──
  const handleCreateFromTemplate = async (templateId: string) => {
    if (!selectedProjectId) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setMutating(true);
    try {
      // Get template data from the API
      const tplData = await apiPost(
        '/api/rim-templates',
        rimTemplateApplySchema,
        { templateId, customizations: {} },
      );
      const tpl = tplData.data as {
        section?: Partial<RimSection>
      }

      // Create the section with template defaults
      const result = await apiPost(
        '/api/rim',
        rimMutationSchema,
        {
          action: 'create_section',
          data: {
            project_id: selectedProjectId,
            section_name: tpl.section?.section_name || '',
            registry: tpl.section?.registry || '',
            district: '',
            map_sheet_number: '',
            scale: tpl.section?.scale || '1:2500',
            datum: tpl.section?.datum || '',
            projection: tpl.section?.projection || '',
          },
        },
      );
      const newSection = result.data as RimSection;

      apiInvalidate(`/api/rim?projectId=${selectedProjectId}`)
      setShowTemplates(false);
      showToast('RIM section created from template', 'success');
      await loadSections(selectedProjectId);
      handleSelectSection(newSection);
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? (err as Error).message : ((err as Error).message || 'Failed to create from template'), 'error');
    } finally {
      inFlight.current = false;
      setMutating(false);
    }
  };

  // ── Update section ──
  const handleUpdateSection = async () => {
    if (!activeSection) return;
    try {
      setSectionSaving(true);
      const result = await apiPut(
        '/api/rim',
        rimMutationSchema,
        {
          action: 'update_section',
          id: activeSection.id,
          data: {
            section_name: sectionForm.section_name || '',
            registry: sectionForm.registry || '',
            district: sectionForm.district || '',
            map_sheet_number: sectionForm.map_sheet_number || '',
            scale: sectionForm.scale || '1:2500',
            datum: sectionForm.datum || '',
            projection: sectionForm.projection || '',
            total_area: sectionForm.total_area || 0,
            status: sectionForm.status || 'draft',
            notes: sectionForm.notes || '',
          },
        },
      );
      apiInvalidate(`/api/rim?projectId=${selectedProjectId}`)
      if (sectionRef.current === activeSection.id) setActiveSection(result.data as RimSection);
      showToast('Section updated', 'success');
      await loadSections(selectedProjectId);
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? (err as Error).message : ((err as Error).message || 'Failed to update section'), 'error');
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
          await apiDelete(`/api/rim?rimSectionId=${section.id}`);
          apiInvalidate(`/api/rim?projectId=${selectedProjectId}`)
          showToast('Section deleted', 'success');
          if (sectionRef.current === section.id) {
            sectionRef.current = '';
            sectionRequest.current += 1;
            setActiveSection(null);
            setParcels([]);
            setBeacons([]);
          }
          await loadSections(selectedProjectId);
        } catch (err: unknown) {
          showToast(err instanceof ApiError ? (err as Error).message : ((err as Error).message || 'Failed to delete section'), 'error');
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
    if (inFlight.current) return;
    inFlight.current = true;
    setMutating(true);
    try {
      const result = await apiPost(
        '/api/rim',
        rimMutationSchema,
        {
          action: 'add_parcel',
          data: {
            rimSectionId: activeSection.id,
            parcel_number: newParcel.parcel_number.trim(),
            area: parseFloat(newParcel.area) || 0,
            land_use: newParcel.land_use.trim(),
            owner_name: newParcel.owner_name.trim(),
            beacon_count: parseInt(newParcel.beacon_count) || 0,
          },
        },
      );
      apiInvalidate(`/api/rim?projectId=${selectedProjectId}`)
      if (sectionRef.current !== activeSection.id) return;
      setParcels((prev) => [...prev, result.data as RimParcel]);
      setNewParcel({ parcel_number: '', area: '', land_use: '', owner_name: '', beacon_count: '' });
      setShowAddParcel(false);
      showToast('Parcel added', 'success');
      await loadSections(selectedProjectId);
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? (err as Error).message : ((err as Error).message || 'Failed to add parcel'), 'error');
    } finally {
      inFlight.current = false;
      setMutating(false);
    }
  };

  // ── Add beacon ──
  const handleAddBeacon = async () => {
    if (!activeSection || !newBeacon.beacon_number.trim()) {
      showToast('Beacon number is required', 'error');
      return;
    }
    if (!newBeacon.easting.trim() || !newBeacon.northing.trim() || !Number.isFinite(Number(newBeacon.easting)) || !Number.isFinite(Number(newBeacon.northing))) {
      showToast('Enter a numeric easting and northing.', 'error');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setMutating(true);
    try {
      const result = await apiPost(
        '/api/rim',
        rimMutationSchema,
        {
          action: 'add_beacon',
          data: {
            rimSectionId: activeSection.id,
            beacon_number: newBeacon.beacon_number.trim(),
            easting: Number(newBeacon.easting),
            northing: Number(newBeacon.northing),
            description: newBeacon.description.trim(),
            type: newBeacon.type,
            survey_status: newBeacon.survey_status,
          },
        },
      );
      apiInvalidate(`/api/rim?projectId=${selectedProjectId}`)
      if (sectionRef.current !== activeSection.id) return;
      setBeacons((prev) => [...prev, result.data as RimBeacon]);
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
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? (err as Error).message : ((err as Error).message || 'Failed to add beacon'), 'error');
    } finally {
      inFlight.current = false;
      setMutating(false);
    }
  };

  // ── Generate PDF ──
  const handleGeneratePdf = async () => {
    if (!activeSection || pdfGenerating || inFlight.current || sectionSaving) return;
    try {
      setPdfGenerating(true);
      // ponytail: binary download bypasses typed client
      const res = await fetch('/api/rim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_pdf',
          rimSectionId: activeSection.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string | { message?: string } } | null;
        throw new Error((typeof data?.error === 'string' ? data.error : data?.error?.message) || 'Failed to generate PDF');
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
    } catch (err: unknown) {
      showToast((err as Error).message || 'Failed to generate PDF', 'error');
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

  return {
    // state
    authChecked,
    isAuthenticated,
    toast,
    setToast,
    projects,
    selectedProjectId,
    projectsLoading,
    projectSearch,
    setProjectSearch,
    sections,
    sectionsLoading,
    activeSection,
    setActiveSection,
    sectionForm,
    setSectionForm,
    sectionSaving,
    parcels,
    parcelsLoading,
    setParcels,
    showAddParcel,
    setShowAddParcel,
    newParcel,
    setNewParcel,
    beacons,
    beaconsLoading,
    setBeacons,
    showAddBeacon,
    setShowAddBeacon,
    newBeacon,
    setNewBeacon,
    templates,
    showTemplates,
    setShowTemplates,
    templateSearch,
    setTemplateSearch,
    templatesLoading,
    confirmDialog,
    setConfirmDialog,
    pdfGenerating,
    // derived
    filteredProjects,
    filteredTemplates,
    // handlers
    showToast,
    detailError,
    mutating,
    loadSections,
    loadTemplates,
    handleSelectProject,
    handleCreateSection,
    handleCreateFromTemplate,
    handleSelectSection,
    handleUpdateSection,
    handleDeleteSection,
    handleAddParcel,
    handleAddBeacon,
    handleGeneratePdf,
    handleOpenTemplates,
  };
}

export type RimState = ReturnType<typeof useRimState>;
