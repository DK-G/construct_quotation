import { NextRequest, NextResponse } from 'next/server';
import { filterProcessesWithLLM } from '../../../utils/llmFilter';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { processList, contextText } = body;

    if (!processList || !Array.isArray(processList)) {
      return NextResponse.json(
        { error: 'Input processList is required and must be an array' },
        { status: 400 }
      );
    }

    const decisions = await filterProcessesWithLLM(processList, contextText || '');

    return NextResponse.json({ decisions });
  } catch (error: any) {
    console.error('[API filter-processes] Error occurred:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
