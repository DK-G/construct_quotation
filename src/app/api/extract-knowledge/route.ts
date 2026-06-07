import { NextRequest, NextResponse } from 'next/server';
import { extractAndSaveKnowledge } from '../../../utils/extractKnowledge';

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

    const result = await extractAndSaveKnowledge(text);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API extract-knowledge] Error occurred:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
