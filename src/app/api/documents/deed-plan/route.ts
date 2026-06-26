/**
 * Deed Plan Generation API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDeedPlan, type DeedPlanInput } from '@/lib/documents/deed-plan/generator';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const input = await request.json() as DeedPlanInput;
    
    if (!input.points || input.points.length < 3) {
      return NextResponse.json(
        { error: 'Need at least 3 points for a deed plan' },
        { status: 400 }
      );
    }
    
    // Generate the deed plan PDF
    const pdfBuffer = await generateDeedPlan(input);
    
    // Save to file
    const uploadDir = path.join(process.cwd(), 'download', 'deed-plans');
    await mkdir(uploadDir, { recursive: true });
    
    const filename = `deed-plan-${input.titleData.lrNumber || 'unknown'}-${Date.now()}.pdf`;
    const filePath = path.join(uploadDir, filename);
    
    // Write PDF to file
    const { writeFile } = await import('fs/promises');
    await writeFile(filePath, pdfBuffer);
    
    return NextResponse.json({
      success: true,
      filename,
      size: pdfBuffer.length,
      message: 'Deed plan generated successfully',
    });
  } catch (error) {
    console.error('Deed plan generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
