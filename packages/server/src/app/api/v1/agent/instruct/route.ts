import { NextResponse } from 'next/server';
import { emitAgentEvent } from '@/lib/agent-events';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, text } = body;

    if (!userId || text == null || String(text).trim() === '') {
      return NextResponse.json(
        { error: 'Missing userId or text' },
        { status: 400 }
      );
    }

    emitAgentEvent(userId, {
      type: 'instruct',
      text: String(text).trim(),
      at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Instruction received; agent will process when running.',
    });
  } catch (error) {
    console.error('Instruct error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
