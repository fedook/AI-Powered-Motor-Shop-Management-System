export interface PaginationInput {
  page: number;
  pageSize: number;
  offset: number;
}

export function paginate(input: { page?: number; pageSize?: number }, maxPageSize = 100): PaginationInput {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.trunc(input.pageSize ?? 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function parseDateRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(to) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range");
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    end.setUTCHours(23, 59, 59, 999);
  }
  return { from: start, to: end };
}
