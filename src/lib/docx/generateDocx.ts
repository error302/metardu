/**
 * Server-side DOCX generation using docx package
 * Generates professional Word documents for survey reports
 * Supports survey-type-specific templates
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  TableOfContents,
  AlignmentType,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx'
import { readReportBlocks } from '@/lib/compute/reportExportBlocks'
import type { SectionContent } from '@/types/surveyReport'
import type { SurveyType } from '@/types/project'

export interface DocxGenerationOptions {
  title: string
  reportNumber?: string
  sections?: SectionContent[]
  surveyType?: SurveyType
  clientName?: string
  projectName?: string
  projectLocation?: string
  areaHectares?: number
  date?: string
  useTemplate?: boolean
}

export async function generateDocx(options: DocxGenerationOptions): Promise<Buffer> {
  const {
    title,
    reportNumber,
    sections: inputSections,
    clientName = '',
    projectName = '',
    date = new Date().toLocaleDateString('en-GB'),
    useTemplate = true,
  } = options

  // Use template-based sections if available, otherwise use input sections
  const sections = useTemplate
    ? inputSections || []
    : inputSections || []

  const docSections: (Paragraph | Table | TableOfContents)[] = []

  // Title Page
  docSections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: 48,
          break: 1,
        }),
        ...(reportNumber
          ? [
              new TextRun({
                text: `\n${reportNumber}`,
                size: 28,
                italics: true,
              }),
            ]
          : []),
        new TextRun({ text: 'Draft for review', size: 24, break: 1 }),
        ...(clientName
          ? [
              new TextRun({
                text: `Client: ${clientName}`,
                size: 28,
              }),
              new TextRun({ text: '\n', size: 24 }),
            ]
          : []),
        ...(projectName
          ? [
              new TextRun({
                text: `Project: ${projectName}`,
                size: 28,
              }),
              new TextRun({ text: '\n', size: 24 }),
            ]
          : []),
        new TextRun({
          text: `\n\n${date}`,
          size: 24,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: 200,
      },
    })
  )

  // Page break after title
  docSections.push(
    new Paragraph({
      children: [new TextRun({ text: '' })],
      pageBreakBefore: true,
    })
  )

  // Table of Contents
  docSections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'TABLE OF CONTENTS',
          bold: true,
          size: 28,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: {
        before: 200,
        after: 200,
      },
    })
  )

  docSections.push(
    new TableOfContents('1-3')
  )

  docSections.push(
    new Paragraph({
      children: [new TextRun({ text: '' })],
      pageBreakBefore: true,
    })
  )

  // Add each section
  for (const section of sections) {
    if (section.section === 'TITLE_PAGE' || section.section === 'TABLE_OF_CONTENTS') continue

    // Section heading
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${section.sectionNumber}. ${section.title}`,
            bold: true,
            size: 32,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: {
          before: 400,
          after: 200,
        },
      })
    )

    // Section content
    for (const block of readReportBlocks(section.content)) {
      if (block.kind === 'text') {
        docSections.push(new Paragraph({ text: block.text, spacing: { after: 120 } }))
        continue
      }
      const columns = Math.max(...[...block.head, ...block.body].map(row => row.length))
      docSections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [...block.head, ...block.body].map((row, index) => new TableRow({
          tableHeader: index < block.head.length,
          children: Array.from({ length: columns }, (_, column) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: row[column] ?? '', bold: index < block.head.length })] })],
          })),
        })),
      }))
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docSections,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return buffer
}
