import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { FinishTrigger } from '../../../dictionary/types';

export async function GET() {
  try {
    const dictionaryDir = path.join(process.cwd(), 'src', 'dictionary', 'data');
    
    // ディレクトリが存在しない場合は空のレコードを返す
    try {
      await fs.access(dictionaryDir);
    } catch {
      return NextResponse.json({ dictionaries: {} });
    }

    const files = await fs.readdir(dictionaryDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const dictionaries: Record<string, FinishTrigger> = {};

    for (const file of jsonFiles) {
      const filePath = path.join(dictionaryDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      try {
        const dictData = JSON.parse(content) as FinishTrigger;
        if (dictData.finish_trigger) {
          dictionaries[dictData.finish_trigger] = dictData;
        }
      } catch (e) {
        console.error(`[API get-dictionaries] Failed to parse JSON file: ${file}`, e);
      }
    }

    return NextResponse.json({ dictionaries });
  } catch (error: any) {
    console.error('[API get-dictionaries] Error occurred:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
