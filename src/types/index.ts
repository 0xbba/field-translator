// ============ 翻译对照记录 ============
export interface MappingItem {
  original: string
  chinese: string
  _dbId?: number
  _deleted?: boolean
}

// ============ 数据需求台账 ============
export interface LedgerRecord {
  _dbId?: number
  _deleted?: boolean
  requestNo: string
  requestTime: string
  applicant: string
  applicantPhone: string
  applicantDept: string
  requestTitle: string
  requestReason: string
  requestDataContent: string
  processor: string
  finishTime?: string
  createDate?: string
}

// ============ 提取记录 ============
export interface ExtractionRecord {
  id?: number
  requestNo: string
  recordCount: number
  extractor: string
  supervisor: string
  remark: string
  createDate?: string
  isVisible?: boolean
}

// ============ 翻译列数据 ============
export interface ColumnData {
  original: string
  translated: string
  alternatives: MappingItem[]
  selectedAlt: number
}

// ============ 操作日志 ============
export interface LogEntry {
  id: number
  operation: string
  recordId: number | null
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  userName: string | null
  operationDate: string
}

// ============ INSERT 字段配置 ============
export interface InsertField {
  name: string
  quoted: boolean
  enabled: boolean
}

export type InsertDialect = 'pg' | 'hive'

// ============ 批量翻译解析项 ============
export interface BatchParseItem {
  original: string
  chinese: string
  matchedIdx: number
}

// ============ 导入冲突项 ============
export interface ImportConflict {
  original: string
  existing: string
  incoming: string
}

// ============ 多账期选择器类型 ============
export type MdPicker = 'date' | 'month' | 'year'

// ============ 标签页项 ============
export interface TabItem {
  key: string
  label: string
}

// ============ 用户/角色表单 ============
export interface UserForm {
  username: string
  password: string
  role: string
  displayName: string
  isActive: boolean
}

export interface RoleForm {
  roleKey: string
  roleName: string
  permissions: string[]
}
