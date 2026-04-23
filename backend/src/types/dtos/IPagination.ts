interface IPagination {
  limit: number;
  cursor?: number;
}

interface IPaginatedResult<T> {
  items: T[];
  nextCursor: number | null;
}

export type { IPagination, IPaginatedResult };