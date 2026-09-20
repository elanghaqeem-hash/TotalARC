export const DEFAULT_REGISTER_PAGE_SIZE = 50;
export const MAX_REGISTER_PAGE_SIZE = 100;

export type PaginationInput = {
  page: number;
  pageSize: number;
  search: string;
};

export function parsePaginationRequest(request: Request): PaginationInput {
  const url = new URL(request.url);
  const requestedPage = Number(url.searchParams.get('page') || '1');
  const requestedSize = Number(url.searchParams.get('pageSize') || DEFAULT_REGISTER_PAGE_SIZE);

  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = Number.isInteger(requestedSize)
    ? Math.min(Math.max(requestedSize, 10), MAX_REGISTER_PAGE_SIZE)
    : DEFAULT_REGISTER_PAGE_SIZE;

  return {
    page,
    pageSize,
    search: (url.searchParams.get('search') || '').trim().slice(0, 120)
  };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages
  };
}
