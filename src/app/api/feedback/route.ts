import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { actionType, processList, excludedIndices, contextText } = body;

    if (!processList || !Array.isArray(processList)) {
      return NextResponse.json(
        { error: 'processList is required and must be an array' },
        { status: 400 }
      );
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      actionType: actionType || 'export',
      contextText: contextText || '',
      totalSteps: processList.length,
      excludedCount: excludedIndices ? excludedIndices.length : 0,
      details: processList.map((step: any) => {
        const id = `${step.roomName}-${step.location}-${step.finishTriggerId}-${step.step}`;
        const isExcluded = excludedIndices ? excludedIndices.includes(id) : false;
        return {
          stepId: id,
          roomName: step.roomName,
          location: step.location,
          finishTriggerId: step.finishTriggerId,
          finishDisplayName: step.finishDisplayName,
          processName: step.process_name,
          confidence: step.confidence,
          isExcluded,
          excludeReason: step.excludeReason || ''
        };
      })
    };

    // Write to a local feedback log file
    const logFilePath = path.join(process.cwd(), 'feedback_logs.jsonl');
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n', 'utf-8');

    return NextResponse.json({ success: true, loggedAt: logEntry.timestamp });
  } catch (error: any) {
    console.error('[API feedback] Error writing feedback log:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
