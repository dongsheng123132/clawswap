import { NextRequest, NextResponse } from 'next/server';

export const GET = async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get('token');

    // Mock price
    return NextResponse.json({
        token,
        price: '1.05', // Mock price in USDC
        timestamp: Date.now(),
    });
};
