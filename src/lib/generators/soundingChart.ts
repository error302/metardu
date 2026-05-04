import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import db from '@/lib/db';

export async function generateSoundingChart(
  projectId: string
): Promise<Buffer> {
  const projectRes = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
  const project = projectRes.rows[0];
  if (!project) throw new Error('Project not found');

  const entriesRes = await db.query(
    'SELECT row_index, station, raw_data FROM project_fieldbook_entries WHERE project_id = $1 ORDER BY row_index ASC',
    [projectId]
  );
  const entries = entriesRes.rows;

  if (!entries || entries.length === 0) {
    throw new Error('No sounding data found.');
  }

  const soundingData = entries
    .map((e: any) => ({
      point: e.station || `S${e.row_index}`,
      easting: parseFloat(String(e.raw_data?.easting || e.raw_data?.e || 0)),
      northing: parseFloat(String(e.raw_data?.northing || e.raw_data?.n || 0)),
      depth: parseFloat(String(e.raw_data?.depth || e.raw_data?.sounding || 0)),
    }))
    .filter((s: any) => s.depth > 0);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('HYDROGRAPHIC SOUNDING CHART', 148, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Project: ${project.name}`, 14, 25);
  doc.text(`Date: ${new Date().toLocaleDateString('en-KE')}`, 250, 25, { align: 'right' });

  const tableData = soundingData.map((s: any) => [
    s.point,
    s.easting.toFixed(3),
    s.northing.toFixed(3),
    s.depth.toFixed(2),
  ]);

  autoTable(doc, {
    startY: 30,
    head: [['Point', 'Easting (m)', 'Northing (m)', 'Depth (m)']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [0, 0, 0], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 250] },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

