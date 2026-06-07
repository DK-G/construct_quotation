import { NextRequest, NextResponse } from 'next/server';
import { parseTextWithLLM } from '../../../utils/llmParser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Input text is required and must be a string' },
        { status: 400 }
      );
    }

    const rooms = await parseTextWithLLM(text);

    return NextResponse.json({ rooms });
  } catch (error: any) {
    console.error('[API parse-text] Error occurred:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
