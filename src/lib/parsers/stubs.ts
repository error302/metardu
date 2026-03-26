import type { ParsedInput, ExtractedBuildingData, BOQData } from './types'

export async function parseIFCFile(file: File): Promise<ParsedInput> {
  throw new Error('IFC parsing requires web-ifc. Install: npm install web-ifc')
}

export async function parsePDFContent(file: File): Promise<ParsedInput> {
  throw new Error('PDF parsing requires pdfjs-dist and AI vision integration')
}

export async function parseImageFile(file: File): Promise<ParsedInput> {
  throw new Error('Image parsing requires AI vision (Anthropic Claude)')
}

export async function parseGLTFFile(file: File): Promise<ParsedInput> {
  throw new Error('GLTF parsing requires three.js GLTFLoader')
}

export async function parseOBJFile(file: File): Promise<ParsedInput> {
  throw new Error('OBJ parsing requires three.js OBJLoader')
}

export async function parseBOQSpreadsheet(file: File): Promise<ParsedInput> {
  throw new Error('BOQ parsing requires xlsx library and AI parsing')
}