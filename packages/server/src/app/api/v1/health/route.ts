import { NextRequest, NextResponse } from 'next/server';

export const GET = async (req: NextRequest) => {
    return NextResponse.json({
        status: 'ok',
        service: 'OpenClaw API',
        timestamp: Date.now(),
    });
};
