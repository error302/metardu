export const dynamic = 'force-dynamic'

/**
 * Deed Plan Generation API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateDeedPlan, type DeedPlanInput } from '@/lib/documents/deed-plan/generator';
import { DeedPlanInputSchema } from '@/lib/validation/apiSchemas';
import { mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = DeedPlanInputSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    const input = parsed.data as unknown as DeedPlanInput

    // Generate the deed plan PDF
    const pdfBuffer = await generateDeedPlan(input);

    // Save to file
    const uploadDir = path.join(process.cwd(), 'download', 'deed-plans');
    await mkdir(uploadDir, { recursive: true });

    const filename = `deed-plan-${input.titleData?.lrNumber || 'unknown'}-${Date.now()}.pdf`;
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
