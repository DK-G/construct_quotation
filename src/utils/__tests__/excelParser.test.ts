import * as fs from 'fs';
import * as path from 'path';
import { parseExcelWorkbook } from '../excelParser';

describe('excelParser', () => {
  it('should parse finishing schedule Excel file successfully', () => {
    const excelPath = path.resolve(process.cwd(), 'test_finishing_schedule.xlsx');
    expect(fs.existsSync(excelPath)).toBe(true);

    const buffer = fs.readFileSync(excelPath);
    const rooms = parseExcelWorkbook(buffer);

    // Verify rooms are parsed
    expect(rooms.length).toBeGreaterThan(0);
    
    // We expect 5 rooms based on the test data details
    expect(rooms.map(r => r.roomName)).toContain('エントランス');
    expect(rooms.map(r => r.roomName)).toContain('リビング');
    expect(rooms.map(r => r.roomName)).toContain('洗面室');
    expect(rooms.map(r => r.roomName)).toContain('和室');
    expect(rooms.map(r => r.roomName)).toContain('洋室1');

    // Check specific fields of a room, e.g., リビング
    const living = rooms.find(r => r.roomName === 'リビング');
    expect(living).toBeDefined();
    if (living) {
      expect(living.floor).toContain('フローリング');
      expect(living.wall).toContain('クロス');
      expect(living.ceiling).toContain('クロス');
    }
  });

  it('should handle empty or fallback inputs gracefully', () => {
    // Empty buffer or invalid format handling check
    expect(() => {
      parseExcelWorkbook(Buffer.from([]));
    }).toThrow();
  });
});
