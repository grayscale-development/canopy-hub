import type {
  ColumnDiscoverySummary,
  ColumnSummaryItem,
  HypercubeDataPage,
  QixLayout,
  RowRecord,
} from "./types.ts";

function pickFirst(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isPermutation(order: number[], size: number): boolean {
  if (order.length !== size) return false;

  const seen = new Set<number>();
  for (const rawValue of order) {
    if (!Number.isInteger(rawValue)) return false;
    const value = Math.trunc(rawValue);
    if (value < 0 || value >= size || seen.has(value)) return false;
    seen.add(value);
  }

  return seen.size === size;
}

export function deriveColumnsFromLayout(layout: QixLayout | null): ColumnSummaryItem[] {
  const hc = layout?.qHyperCube;
  if (!hc) return [];

  const dimensions = (hc.qDimensionInfo ?? []).map((d, index): ColumnSummaryItem => ({
    columnIndex: index,
    title: pickFirst(d.qFallbackTitle, d.qGroupFallbackTitles?.[0]),
    kind: "dimension",
    qType: d.qType ?? null,
    tags: d.qTags ?? [],
    numFormat: d.qNumFormat ?? null,
  }));

  const measures = (hc.qMeasureInfo ?? []).map((m, index): ColumnSummaryItem => ({
    columnIndex: dimensions.length + index,
    title: pickFirst(m.qFallbackTitle, m.qLabel),
    kind: "measure",
    qType: m.qType ?? null,
    tags: m.qTags ?? [],
    numFormat: m.qNumFormat ?? null,
  }));

  const baseColumns = [...dimensions, ...measures];
  if (baseColumns.length === 0) return baseColumns;

  const qColumnOrder = hc.qColumnOrder;
  if (Array.isArray(qColumnOrder) && isPermutation(qColumnOrder, baseColumns.length)) {
    return qColumnOrder.map((baseIndex) => baseColumns[baseIndex] as ColumnSummaryItem);
  }

  const qEffectiveOrder = hc.qEffectiveInterColumnSortOrder;
  if (Array.isArray(qEffectiveOrder) && isPermutation(qEffectiveOrder, baseColumns.length)) {
    return qEffectiveOrder.map((baseIndex) => baseColumns[baseIndex] as ColumnSummaryItem);
  }

  return baseColumns;
}

export function isHypercubeLayout(layout: QixLayout | null): boolean {
  return !!layout?.qHyperCube;
}

export function extractPreviewRowCount(dataPages: HypercubeDataPage[]): number | null {
  const firstPage = dataPages[0];
  const matrix = firstPage?.qMatrix;
  if (!Array.isArray(matrix)) return null;
  return matrix.length;
}

export function buildMetadataSummary(input: {
  appId: string;
  objectId: string;
  sourceKey: string;
  objectType: string | null;
  layout: QixLayout | null;
  dataPages: HypercubeDataPage[];
}): ColumnDiscoverySummary {
  const columns = deriveColumnsFromLayout(input.layout);
  return {
    appId: input.appId,
    objectId: input.objectId,
    sourceKey: input.sourceKey,
    objectType: input.objectType,
    isHypercube: isHypercubeLayout(input.layout),
    columnCount: columns.length,
    columns,
    previewRowCount: extractPreviewRowCount(input.dataPages),
  };
}

export function buildRowRecords(
  columns: ColumnSummaryItem[],
  dataPages: HypercubeDataPage[],
): RowRecord[] {
  const rows: RowRecord[] = [];

  for (const page of dataPages) {
    const matrix = page.qMatrix ?? [];
    for (const rowCells of matrix) {
      const row: RowRecord = {};
      columns.forEach((column, index) => {
        const key = column.title || `column_${column.columnIndex}`;
        row[key] = rowCells[index] ?? null;
      });
      rows.push(row);
    }
  }

  return rows;
}
