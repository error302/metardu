/**
 * Project Database Queries
 * 
 * All project-related database operations with cache integration.
 */

import prisma from '../client';
import { projectCache, CacheKeys } from '../../cache/memory-cache';

// ─── Types ───────────────────────────────────────────────────────

export interface CreateProjectInput {
  name: string;
  description?: string;
  surveyType?: string;
  surveyOrder?: number;
  county?: string;
  subCounty?: string;
  lrNumber?: string;
  datum?: string;
  projection?: string;
  zone?: number;
  surveyorName: string;
  surveyorLicense: string;
}

// ─── Queries ─────────────────────────────────────────────────────

/**
 * Get a project by ID (with caching).
 */
export async function getProject(id: string) {
  return projectCache.getOrCompute(
    CacheKeys.project(id),
    async () => {
      return prisma.project.findUnique({
        where: { id },
        include: {
          surveys: {
            orderBy: { createdAt: 'desc' },
          },
          documents: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    },
    5 * 60 * 1000 // 5 min TTL
  );
}

/**
 * List projects for a surveyor (with caching).
 */
export async function listProjects(
  surveyorLicense: string,
  page: number = 1,
  pageSize: number = 20
) {
  return projectCache.getOrCompute(
    CacheKeys.projectList(surveyorLicense, page),
    async () => {
      const skip = (page - 1) * pageSize;
      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where: { surveyorLicense },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.project.count({
          where: { surveyorLicense },
        }),
      ]);
      return { projects, total, page, pageSize };
    },
    2 * 60 * 1000 // 2 min TTL
  );
}

/**
 * Create a new project.
 */
export async function createProject(input: CreateProjectInput) {
  const project = await prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      surveyType: (input.surveyType as any) ?? 'CADASTRAL',
      surveyOrder: input.surveyOrder ?? 3,
      county: input.county,
      subCounty: input.subCounty,
      lrNumber: input.lrNumber,
      datum: (input.datum as any) ?? 'ARC1960',
      projection: (input.projection as any) ?? 'UTM37S',
      zone: input.zone,
      surveyorName: input.surveyorName,
      surveyorLicense: input.surveyorLicense,
    },
  });
  
  // Invalidate project list cache
  projectCache.invalidatePattern(`projects:${input.surveyorLicense}:`);
  
  return project;
}

/**
 * Update a project.
 */
export async function updateProject(id: string, data: Partial<CreateProjectInput> & { status?: string }) {
  const project = await prisma.project.update({
    where: { id },
    data: data as any,
  });
  
  // Invalidate cache
  projectCache.invalidate(CacheKeys.project(id));
  
  return project;
}

/**
 * Delete a project and all related data.
 */
export async function deleteProject(id: string) {
  const project = await prisma.project.delete({
    where: { id },
  });
  
  // Invalidate cache
  projectCache.invalidate(CacheKeys.project(id));
  projectCache.invalidatePattern(`projects:${project.surveyorLicense}:`);
  
  return project;
}
