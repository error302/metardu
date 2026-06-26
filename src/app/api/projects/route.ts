/**
 * Projects API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject, listProjects, createProject, updateProject, deleteProject } from '@/lib/db/queries/projects';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const surveyorLicense = searchParams.get('surveyorLicense');
    const page = parseInt(searchParams.get('page') ?? '1');
    
    if (id) {
      const project = await getProject(id);
      if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(project);
    }
    
    if (surveyorLicense) {
      const result = await listProjects(surveyorLicense, page);
      return NextResponse.json(result);
    }
    
    return NextResponse.json({ error: 'Provide id or surveyorLicense' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || !body.surveyorName || !body.surveyorLicense) {
      return NextResponse.json({ error: 'name, surveyorName, surveyorLicense required' }, { status: 400 });
    }
    const project = await createProject(body);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const body = await request.json();
    const project = await updateProject(id, body);
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
