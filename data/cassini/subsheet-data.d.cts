interface SubsheetCorner {
  cassX: number
  cassY: number
  utmE: number
  utmN: number
}
declare const corners: Record<string, Record<string, SubsheetCorner[]>>
export = corners
