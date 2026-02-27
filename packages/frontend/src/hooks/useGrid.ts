import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';

export interface GridCell {
  id: string;
  index: number;
  color: string;
  label: string | null;
  ownerId: string | null;
  ownerAddr: string | null;
  price: string;
  payMethod: string | null;
  txHash: string | null;
}

export function useGrid() {
  const [cells, setCells] = useState<GridCell[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(getApiUrl('/api/v1/grid'));
      const data = await res.json();
      if (data.cells) setCells(data.cells);
    } catch (e) {
      console.error('Failed to fetch grid:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const purchaseCell = async (params: {
    cellIndex: number;
    payMethod: string;
    txHash: string;
    buyerAddress: string;
    label?: string;
    color?: string;
  }) => {
    const res = await fetch(getApiUrl('/api/v1/grid/purchase'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Purchase failed');
    await refresh();
    return data;
  };

  const owned = cells.filter((c) => c.ownerId).length;

  return { cells, loading, refresh, purchaseCell, owned, total: cells.length };
}
