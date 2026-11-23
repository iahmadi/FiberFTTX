// Pure real-time search & filtering utilities for Tickets and Hardware lists

const PERSIAN_DIGIT_MAP: Record<string, string> = {
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

export function normalizeSearchText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_DIGIT_MAP[ch] ?? ch)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
}

export interface SearchableTicketLike {
  id: number;
  customer_name: string;
  address: string;
  status: string;
  installer_name: string | null;
  ffat_code?: string | null;
  fat_number?: number | null;
  olt_name?: string | null;
  kaf_name?: string | null;
  modem_serial?: string | null;
}

export function filterTicketsByQuery<T extends SearchableTicketLike>(
  tickets: T[],
  query: string,
  statusFilter: 'all' | 'pending' | 'assigned' | 'completed' = 'all',
): T[] {
  const q = normalizeSearchText(query);
  return tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (!q) return true;

    const haystacks = [
      String(t.id),
      `#${t.id}`,
      t.customer_name,
      t.address,
      t.installer_name || '',
      t.ffat_code || '',
      t.fat_number ? `fat ${t.fat_number}` : '',
      t.fat_number ? `fat${t.fat_number}` : '',
      t.olt_name || '',
      t.kaf_name || '',
      t.modem_serial || '',
    ];

    return haystacks.some((h) => normalizeSearchText(h).includes(q));
  });
}

export function matchesHardwareQuery(fields: Array<string | number | null | undefined>, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return fields.some((f) => {
    if (f === null || f === undefined) return false;
    return normalizeSearchText(String(f)).includes(q);
  });
}
