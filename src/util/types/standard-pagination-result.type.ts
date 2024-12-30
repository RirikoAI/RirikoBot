export type StandardPaginationResultType<T> = Readonly<{
  data: T[];
  total: number;
}>;
