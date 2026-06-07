import * as XLSX from 'xlsx';

export interface ParsedRoom {
  roomName: string;
  floor: string;
  baseboard: string;
  wall: string;
  ceiling: string;
  remarks: string;
}

/**
 * Parses an Excel or CSV file (as ArrayBuffer or Buffer) and extracts room finishing schedules.
 */
export function parseExcelWorkbook(data: ArrayBuffer | Buffer): ParsedRoom[] {
  if (!data || data.byteLength === 0) {
    throw new Error('Input data is empty');
  }
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('No sheets found in the workbook');
  }
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert worksheet to a 2D array of strings
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
  
  let headerIndex = -1;
  let colIndices = {
    roomName: -1,
    floor: -1,
    baseboard: -1,
    wall: -1,
    ceiling: -1,
    remarks: -1
  };

  // 1. Scan rows to find the header row containing key Japanese architectural terms
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    let hasRoom = false;
    let hasFloor = false;
    let hasWall = false;
    let hasCeiling = false;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellValue = String(row[colIdx] || '').trim();
      
      if (cellValue.includes('室名') || cellValue.includes('部屋')) {
        colIndices.roomName = colIdx;
        hasRoom = true;
      } else if (cellValue === '床') {
        colIndices.floor = colIdx;
        hasFloor = true;
      } else if (cellValue === '壁') {
        colIndices.wall = colIdx;
        hasWall = true;
      } else if (cellValue === '天井') {
        colIndices.ceiling = colIdx;
        hasCeiling = true;
      } else if (cellValue === '巾木') {
        colIndices.baseboard = colIdx;
      } else if (cellValue.includes('備考') || cellValue.includes('特記')) {
        colIndices.remarks = colIdx;
      }
    }

    if (hasRoom && (hasFloor || hasWall || hasCeiling)) {
      headerIndex = i;
      break;
    }
  }

  // Fallback if no header found: Map to first columns
  if (headerIndex === -1) {
    colIndices = {
      roomName: 0,
      floor: 1,
      baseboard: 2,
      wall: 3,
      ceiling: 4,
      remarks: 5
    };
    headerIndex = -1; // Start from the very first row
  }

  const results: ParsedRoom[] = [];

  // 2. Parse data rows following the header
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const getValue = (idx: number) => {
      if (idx === -1 || idx >= row.length) return '';
      return String(row[idx] || '').trim();
    };

    const roomName = getValue(colIndices.roomName);
    // Skip empty lines or header repetitions
    if (!roomName || roomName === '室名' || roomName === '部屋名') continue;

    results.push({
      roomName,
      floor: getValue(colIndices.floor),
      baseboard: getValue(colIndices.baseboard),
      wall: getValue(colIndices.wall),
      ceiling: getValue(colIndices.ceiling),
      remarks: getValue(colIndices.remarks)
    });
  }

  return results;
}
