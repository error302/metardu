import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    if (os.platform() === 'win32') {
      await execAsync(`where ${command}`);
    } else {
      await execAsync(`which ${command}`);
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let tmpDir: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dwg-convert-'));
    const inputPath = path.join(tmpDir, 'input.dwg');
    const outputPath = path.join(tmpDir, 'output.dxf');

    await writeFile(inputPath, buffer);

    let stderrOut = '';

    // 1. Check for ODAFileConverter
    // ODAFileConverter Usage: ODAFileConverter <Input Directory> <Output Directory> <Version> <Output Format> <Recurse> <Audit>
    if (await isCommandAvailable('ODAFileConverter')) {
      try {
        await execAsync(`ODAFileConverter "${tmpDir}" "${tmpDir}" "ACAD2018" "DXF" "0" "1"`);
        // ODAFileConverter outputs the file with the same name as the input file
        const odaOutputPath = path.join(tmpDir, 'input.dxf');
        const dxfContent = await readFile(odaOutputPath, 'utf-8');
        return new NextResponse(dxfContent, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      } catch (err: unknown) {
        stderrOut += `ODAFileConverter failed: ${err instanceof Error ? err.message : 'Unknown converter error'}\n`;
      }
    }

    // 2. Check for dwg2dxf (LibreDWG)
    if (await isCommandAvailable('dwg2dxf')) {
      try {
        await execAsync(`dwg2dxf -o "${outputPath}" "${inputPath}"`);
        const dxfContent = await readFile(outputPath, 'utf-8');
        return new NextResponse(dxfContent, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      } catch (err: unknown) {
        stderrOut += `dwg2dxf failed: ${err instanceof Error ? err.message : 'Unknown converter error'}\n`;
      }
    }

    // 3. Check for qcad
    if (await isCommandAvailable('qcad')) {
      try {
        // qcad -no-gui -autostart scripts/Pro/Tools/Dwg2Dxf/Dwg2Dxf.js input.dwg -o output.dxf
        await execAsync(`qcad -no-gui -autostart scripts/Pro/Tools/Dwg2Dxf/Dwg2Dxf.js "${inputPath}" -o "${outputPath}"`);
        const dxfContent = await readFile(outputPath, 'utf-8');
        return new NextResponse(dxfContent, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      } catch (err: unknown) {
        stderrOut += `qcad failed: ${err instanceof Error ? err.message : 'Unknown converter error'}\n`;
      }
    }

    // If we reach here and have errors from attempted conversions
    if (stderrOut) {
      return NextResponse.json({ error: 'Conversion failed', details: stderrOut }, { status: 422 });
    }

    // If no converters are installed
    return NextResponse.json({ 
      error: 'No DWG converter installed on the server. Please install one of the following:\n1. ODA File Converter (https://www.opendesign.com/guestfiles/oda_file_converter)\n2. LibreDWG (https://www.gnu.org/software/libredwg/)\n3. QCAD (https://qcad.org/)'
    }, { status: 501 });

  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  } finally {
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch (e) {
        logger.error('Failed to clean up DWG conversion temporary directory', { error: e });
      }
    }
  }
}
