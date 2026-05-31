/**
 * METARDU Project Data Store (Zustand)
 * ======================================
 * Manages survey project data: control points, observations, parcels,
 * field notes, traverse networks, etc.
 *
 * Heavy operations (bulk import, coordinate transforms) are offloaded
 * to Web Workers via the WorkerBridge. This store only holds references
 * and handles UI-reactive state updates.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────

export interface ControlPoint {
  id: string
  projectName: string
  pointName: string
  type: string // PSC, SSC, TSC, BM, TBM, etc.
  status: 'FOUND' | 'SET' | 'DESTROYED' | 'NOT_FOUND' | 'REFERENCED'
  latitude: number
  longitude: number
  northing: number
  easting: number
  elevation: number | null
  errorEllipse?: {
    majorAxis: number
    minorAxis: number
    orientation: number
  }
  description?: string
  timestamp: string
}

export interface Observation {
  id: string
  projectName: string
  fromStation: string
  toStation: string
  horizontalAngle: number | null
  verticalAngle: number | null
  slopeDistance: number | null
  instrumentHeight: number
  targetHeight: number
  face: 'FL' | 'FR'
  isBusted: boolean
  timestamp: string
}

export interface Parcel {
  id: string
  projectName: string
  parcelNumber: string
  coordinates: Array<{ lat: number; lng: number }>
  areaHa: number
  isRoadReserve: boolean
  affectedByRoad: boolean
}

export interface TraverseLeg {
  id: string
  projectName: string
  fromStation: string
  toStation: string
  angle: number
  distance: number
  meanAngle?: number
  adjustedAngle?: number
  adjustedDistance?: number
  misclosure?: number
}

export interface LevelReading {
  id: string
  projectName: string
  fromPoint: string
  toPoint: string
  backsight: number
  foresight: number
  intermediateSight: number | null
  reducedLevel: number
  instrumentHeight: number
}

export interface ProjectData {
  id: string
  name: string
  firmId?: string
  lrNumber?: string
  projectType: string // CADASTRAL, TOPOGRAPHIC, CONSTRUCTION, etc.
  crsEpsg: number
  status: 'DRAFT' | 'PROCESSING' | 'LOCKED'

  controlPoints: Record<string, ControlPoint>
  observations: Record<string, Observation>
  parcels: Record<string, Parcel>
  traverseLegs: Record<string, TraverseLeg>
  levelReadings: Record<string, LevelReading>
}

// ─── Store Interface ─────────────────────────────────────────────────────

export interface ProjectStoreState {
  currentProjectId: string | null
  projects: Record<string, ProjectData>
  dirtyProjects: string[]
  workerBusy: boolean
  workerProgress: number | null
  workerTaskName: string | null

  // ─── Project Management ───────────────────────────────────────────────

  loadProject: (project: ProjectData) => void
  unloadProject: (projectId: string) => void
  setCurrentProject: (projectId: string) => void

  // ─── Control Points ───────────────────────────────────────────────────

  addControlPoint: (projectId: string, point: ControlPoint) => void
  addControlPointsBulk: (projectId: string, points: ControlPoint[]) => void
  updateControlPoint: (projectId: string, pointId: string, updates: Partial<ControlPoint>) => void
  removeControlPoint: (projectId: string, pointId: string) => void

  // ─── Observations ────────────────────────────────────────────────────

  addObservation: (projectId: string, observation: Observation) => void
  addObservationsBulk: (projectId: string, observations: Observation[]) => void
  updateObservation: (projectId: string, obsId: string, updates: Partial<Observation>) => void
  removeObservation: (projectId: string, obsId: string) => void
  setObservationBusted: (projectId: string, obsId: string, busted: boolean) => void

  // ─── Parcels ─────────────────────────────────────────────────────────

  addParcel: (projectId: string, parcel: Parcel) => void
  updateParcel: (projectId: string, parcelId: string, updates: Partial<Parcel>) => void
  removeParcel: (projectId: string, parcelId: string) => void

  // ─── Traverse ────────────────────────────────────────────────────────

  addTraverseLeg: (projectId: string, leg: TraverseLeg) => void
  updateTraverseLeg: (projectId: string, legId: string, updates: Partial<TraverseLeg>) => void
  removeTraverseLeg: (projectId: string, legId: string) => void

  // ─── Level Readings ──────────────────────────────────────────────────

  addLevelReading: (projectId: string, reading: LevelReading) => void
  addLevelReadingsBulk: (projectId: string, readings: LevelReading[]) => void
  removeLevelReading: (projectId: string, readingId: string) => void

  // ─── Worker State ────────────────────────────────────────────────────

  setWorkerBusy: (busy: boolean, taskName?: string) => void
  setWorkerProgress: (progress: number | null) => void

  // ─── Dirty State ─────────────────────────────────────────────────────

  markDirty: (projectId: string) => void
  markClean: (projectId: string) => void

  // ─── Helpers ─────────────────────────────────────────────────────────

  getProject: (projectId: string) => ProjectData | undefined
  getControlPointsArray: (projectId: string) => ControlPoint[]
  getObservationsArray: (projectId: string) => Observation[]
  getParcelsArray: (projectId: string) => Parcel[]
}

// ─── Helper: Mark dirty (array-based, avoids Set spread) ────────────────

function markDirtyList(current: string[], projectId: string): string[] {
  return current.includes(projectId) ? current : [...current, projectId]
}

function markCleanList(current: string[], projectId: string): string[] {
  return current.filter(id => id !== projectId)
}

// ─── Store ───────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectStoreState>()(
  subscribeWithSelector((set, get) => ({
    currentProjectId: null,
    projects: {},
    dirtyProjects: [],
    workerBusy: false,
    workerProgress: null,
    workerTaskName: null,

    // ─── Project Management ────────────────────────────────────────────

    loadProject: (project) => set(s => ({
      projects: { ...s.projects, [project.id]: project }
    })),

    unloadProject: (projectId) => set(s => {
      const { [projectId]: _, ...rest } = s.projects
      return {
        projects: rest,
        currentProjectId: s.currentProjectId === projectId ? null : s.currentProjectId,
        dirtyProjects: markCleanList(s.dirtyProjects, projectId),
      }
    }),

    setCurrentProject: (projectId) => set({ currentProjectId: projectId }),

    // ─── Control Points ────────────────────────────────────────────────

    addControlPoint: (projectId, point) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            controlPoints: { ...project.controlPoints, [point.id]: point }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    addControlPointsBulk: (projectId, points) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const newPoints = { ...project.controlPoints }
      for (const p of points) {
        newPoints[p.id] = p
      }
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, controlPoints: newPoints }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    updateControlPoint: (projectId, pointId, updates) => set(s => {
      const project = s.projects[projectId]
      if (!project || !project.controlPoints[pointId]) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            controlPoints: {
              ...project.controlPoints,
              [pointId]: { ...project.controlPoints[pointId], ...updates }
            }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    removeControlPoint: (projectId, pointId) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const { [pointId]: _, ...rest } = project.controlPoints
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, controlPoints: rest }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    // ─── Observations ───────────────────────────────────────────────────

    addObservation: (projectId, observation) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            observations: { ...project.observations, [observation.id]: observation }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    addObservationsBulk: (projectId, observations) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const newObs = { ...project.observations }
      for (const o of observations) {
        newObs[o.id] = o
      }
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, observations: newObs }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    updateObservation: (projectId, obsId, updates) => set(s => {
      const project = s.projects[projectId]
      if (!project || !project.observations[obsId]) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            observations: {
              ...project.observations,
              [obsId]: { ...project.observations[obsId], ...updates }
            }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    removeObservation: (projectId, obsId) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const { [obsId]: _, ...rest } = project.observations
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, observations: rest }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    setObservationBusted: (projectId, obsId, busted) => {
      get().updateObservation(projectId, obsId, { isBusted: busted })
    },

    // ─── Parcels ────────────────────────────────────────────────────────

    addParcel: (projectId, parcel) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            parcels: { ...project.parcels, [parcel.id]: parcel }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    updateParcel: (projectId, parcelId, updates) => set(s => {
      const project = s.projects[projectId]
      if (!project || !project.parcels[parcelId]) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            parcels: {
              ...project.parcels,
              [parcelId]: { ...project.parcels[parcelId], ...updates }
            }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    removeParcel: (projectId, parcelId) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const { [parcelId]: _, ...rest } = project.parcels
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, parcels: rest }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    // ─── Traverse ───────────────────────────────────────────────────────

    addTraverseLeg: (projectId, leg) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            traverseLegs: { ...project.traverseLegs, [leg.id]: leg }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    updateTraverseLeg: (projectId, legId, updates) => set(s => {
      const project = s.projects[projectId]
      if (!project || !project.traverseLegs[legId]) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            traverseLegs: {
              ...project.traverseLegs,
              [legId]: { ...project.traverseLegs[legId], ...updates }
            }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    removeTraverseLeg: (projectId, legId) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const { [legId]: _, ...rest } = project.traverseLegs
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, traverseLegs: rest }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    // ─── Level Readings ────────────────────────────────────────────────

    addLevelReading: (projectId, reading) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      return {
        projects: {
          ...s.projects,
          [projectId]: {
            ...project,
            levelReadings: { ...project.levelReadings, [reading.id]: reading }
          }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    addLevelReadingsBulk: (projectId, readings) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const newReadings = { ...project.levelReadings }
      for (const r of readings) {
        newReadings[r.id] = r
      }
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, levelReadings: newReadings }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    removeLevelReading: (projectId, readingId) => set(s => {
      const project = s.projects[projectId]
      if (!project) return s
      const { [readingId]: _, ...rest } = project.levelReadings
      return {
        projects: {
          ...s.projects,
          [projectId]: { ...project, levelReadings: rest }
        },
        dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
      }
    }),

    // ─── Worker State ──────────────────────────────────────────────────

    setWorkerBusy: (busy, taskName) => set({
      workerBusy: busy,
      workerTaskName: busy ? (taskName || null) : null,
      workerProgress: busy ? 0 : null
    }),

    setWorkerProgress: (progress) => set({ workerProgress: progress }),

    // ─── Dirty State ───────────────────────────────────────────────────

    markDirty: (projectId) => set(s => ({
      dirtyProjects: markDirtyList(s.dirtyProjects, projectId)
    })),

    markClean: (projectId) => set(s => ({
      dirtyProjects: markCleanList(s.dirtyProjects, projectId)
    })),

    // ─── Helpers ───────────────────────────────────────────────────────

    getProject: (projectId) => get().projects[projectId],
    getControlPointsArray: (projectId) => Object.values(get().projects[projectId]?.controlPoints || {}),
    getObservationsArray: (projectId) => Object.values(get().projects[projectId]?.observations || {}),
    getParcelsArray: (projectId) => Object.values(get().projects[projectId]?.parcels || {}),
  }))
)
