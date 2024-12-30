import { StandardPaginationResultType } from '#util/types/standard-pagination-result.type';

export const standardPagination = <T>(
  data: T[],
  total: number,
): StandardPaginationResultType<T> => {
  return {
    data,
    total: total,
  };
};
