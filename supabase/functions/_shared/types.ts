export type RunStatus = "running" | "success" | "failed" | "partial";

export type PayloadType =
  | "layout"
  | "data"
  | "combined"
  | "error"
  | "metadata_summary";

export type RowAction = "inserted" | "updated" | "unchanged" | "failed";

export type TargetTableName =
  | "production_data"
  | "divisions"
  | "branches"
  | "employees"
  | "corporate_turn_times"
  | "file_quality_data"
  | "specialist_points_old"
  | "specialist_points_new"
  | "processing_assistant_orgs"
  | "underwriting_orgs";

export interface SourceConfigRow {
  id: string;
  source_key: string;
  source_type: string;
  description: string | null;
  config: Record<string, unknown>;
  target_table: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface QixDimensionInfo {
  qFallbackTitle?: string;
  qGroupFallbackTitles?: string[];
  qType?: string;
  qTags?: string[];
  qNumFormat?: unknown;
  qCardinal?: number;
}

export interface QixMeasureInfo {
  qFallbackTitle?: string;
  qLabel?: string;
  qType?: string;
  qTags?: string[];
  qNumFormat?: unknown;
  qMin?: number;
  qMax?: number;
}

export interface QixHyperCube {
  qDimensionInfo?: QixDimensionInfo[];
  qMeasureInfo?: QixMeasureInfo[];
  qSize?: { qcx?: number; qcy?: number };
  qMode?: string;
  qColumnOrder?: number[];
  qEffectiveInterColumnSortOrder?: number[];
}

export interface QixLayout {
  qHyperCube?: QixHyperCube;
  [key: string]: unknown;
}

export interface ColumnSummaryItem {
  columnIndex: number;
  title: string | null;
  kind: "dimension" | "measure";
  qType: string | null;
  tags: string[];
  numFormat: unknown | null;
}

export interface ColumnDiscoverySummary {
  appId: string;
  objectId: string;
  sourceKey: string;
  objectType: string | null;
  isHypercube: boolean;
  columnCount: number;
  columns: ColumnSummaryItem[];
  previewRowCount: number | null;
}

export interface HypercubeRowCell {
  qText?: string;
  qNum?: number;
  qIsNull?: boolean;
  qElemNumber?: number;
  [key: string]: unknown;
}

export interface HypercubeDataPage {
  qMatrix?: HypercubeRowCell[][];
}

export interface HypercubeDataResult {
  qDataPages?: HypercubeDataPage[];
}

export interface QixFetchResult {
  objectType: string | null;
  layout: QixLayout | null;
  dataPages: HypercubeDataPage[];
  rawLayoutResponse: unknown;
  rawDataResponses: unknown[];
  dataError: string | null;
  dataTruncated: boolean;
  totalRows: number;
  startAt: number;
  fetchedRows: number;
  hasMore: boolean;
  nextStartAt: number | null;
}

export interface RowRecord {
  [key: string]: unknown;
}

export interface TransformedRowResult {
  external_row_key: string;
  source_record_hash: string;
  row: Record<string, unknown>;
}

export interface SyncOutcomeCounters {
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

export interface DispatchFailure {
  sourceConfigId: string;
  sourceKey: string;
  error: string;
  status?: number;
}
