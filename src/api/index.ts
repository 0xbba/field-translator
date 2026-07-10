import dayjs from 'dayjs'
import { authHeaders, jsonHeaders } from '../utils/auth'
import type { MappingItem, LedgerRecord, LogEntry, RoleForm, UserForm, ExtractionRecord } from '../types'

const BASE = ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { ...options, headers: { ...options?.headers, ...authHeaders() } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  return res.json()
}

// ============ 数据映射：API 字段 → 前端字段 ============

function mapTranslation(r: any): MappingItem {
  return { original: r.original, chinese: r.chinese, _dbId: r.id ?? r._dbId, _deleted: r._deleted || false }
}

function mapTranslations(arr: any[]): MappingItem[] {
  return (arr || []).map(mapTranslation)
}

function mapLedgerRecord(r: any): LedgerRecord {
  const normalizeTime = (t: string) => { if (!t) return ''; const d = dayjs(t); return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : t }
  return {
    _dbId: r.id ?? r._dbId,
    _deleted: r._deleted || false,
    requestNo: r.requestNo ?? r.request_no ?? '',
    requestTime: normalizeTime(r.requestTime ?? r.request_time ?? ''),
    applicant: r.applicant ?? '',
    applicantPhone: r.applicantPhone ?? r.applicant_phone ?? '',
    applicantDept: r.applicantDept ?? r.applicant_dept ?? '',
    requestTitle: r.requestTitle ?? r.request_title ?? '',
    requestReason: r.requestReason ?? r.request_reason ?? '',
    requestDataContent: r.requestDataContent ?? r.request_data_content ?? '',
    processor: r.processor ?? '',
    finishTime: normalizeTime(r.finishTime ?? r.finish_time ?? ''),
    createDate: normalizeTime(r.createDate ?? r.create_date ?? ''),
  }
}

function mapLogEntry(r: any): LogEntry {
  return {
    id: r.id,
    operation: r.operation,
    recordId: r.recordId ?? r.record_id,
    fieldName: r.fieldName ?? r.field_name,
    oldValue: r.oldValue ?? r.old_value,
    newValue: r.newValue ?? r.new_value,
    userName: r.userName ?? r.user_name,
    operationDate: r.operationDate ?? r.operation_date ?? r.operationdate,
  }
}

// API 返回 {rows, total} 但前端期望 {data, total}
function mapPageResponse<T>(raw: any, mapper: (r: any) => T): { data: T[]; total: number } {
  const rows = raw.rows ?? raw.data ?? []
  return { data: rows.map(mapper), total: raw.total ?? 0 }
}

// ============ API ============

export const Api = {
  // ============ 认证 ============
  async test() { return request<{ status: string }>('/api/health') },
  async login(username: string, password: string) {
    return request<{ token: string; user: any }>('/api/auth/login', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ username, password }) })
  },
  async me() { return request<any>('/api/auth/me') },
  async changePassword(oldPwd: string, newPwd: string) {
    return request('/api/auth/password', { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }) })
  },

  // ============ 翻译对照 ============
  async list(search?: string): Promise<MappingItem[]> {
    const raw: any[] = await request('/api/translations' + (search ? `?search=${encodeURIComponent(search)}` : ''))
    return mapTranslations(raw)
  },
  async add(item: Omit<MappingItem, '_dbId' | '_deleted'>) { return request<MappingItem>('/api/translations', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(item) }) },
  async update(id: number, item: Partial<Pick<MappingItem, 'original' | 'chinese'>>) { return request(`/api/translations/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(item) }) },
  async delete(id: number) { return request(`/api/translations/${id}`, { method: 'DELETE' }) },
  async importItems(items: Omit<MappingItem, '_dbId' | '_deleted'>[]) { return request<{ inserted: number; skipped: number }>('/api/translations/import', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ items }) }) },
  async lookup(fields: string[]): Promise<MappingItem[]> {
    if (fields.length === 0) return []
    const raw: any[] = await request('/api/translations/lookup', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ fields }) })
    return mapTranslations(raw)
  },
  async logs(recordId?: number, fieldName?: string, page?: number): Promise<{ data: LogEntry[]; total: number }> {
    const raw = await request<any>('/api/logs' + `?page=${page || 1}&pageSize=5` + (recordId ? `&recordId=${recordId}` : '') + (fieldName ? `&fieldName=${encodeURIComponent(fieldName)}` : ''))
    return mapPageResponse(raw, mapLogEntry)
  },
  async listDeleted(): Promise<MappingItem[]> {
    const raw: any[] = await request('/api/translations/deleted')
    return raw.map((r: any) => ({ ...mapTranslation(r), _deleted: true }))
  },
  async restore(id: number) { return request(`/api/translations/${id}/restore`, { method: 'PUT' }) },

  // ============ 台账 ============
  async ledgerCheck(requestNo: string): Promise<{ exists: boolean; record?: LedgerRecord; deletedRecord?: LedgerRecord }> {
    const raw = await request<any>(`/api/ledger/check/${encodeURIComponent(requestNo)}`)
    return {
      exists: raw.exists,
      record: raw.record ? mapLedgerRecord(raw.record) : undefined,
      deletedRecord: raw.deletedRecord ? mapLedgerRecord(raw.deletedRecord) : undefined,
    }
  },
  async ledgerList(search?: string, page?: number, pageSize?: number, sortBy?: string, sortOrder?: string): Promise<{ data: LedgerRecord[]; total: number }> {
    let url = `/api/ledger?page=${page || 1}&pageSize=${pageSize || 10}`
    if (search) url += `&search=${encodeURIComponent(search)}`
    if (sortBy) url += `&sortBy=${encodeURIComponent(sortBy)}`
    if (sortOrder) url += `&sortOrder=${encodeURIComponent(sortOrder)}`
    const raw = await request<any>(url)
    return mapPageResponse(raw, mapLedgerRecord)
  },
  async ledgerExportAll(search?: string): Promise<LedgerRecord[]> {
    let url = '/api/ledger?page=1&pageSize=999999'
    if (search) url += `&search=${encodeURIComponent(search)}`
    const raw = await request<any>(url)
    return (raw.rows ?? raw.data ?? []).map(mapLedgerRecord)
  },
  async ledgerAdd(record: Omit<LedgerRecord, '_dbId' | '_deleted'>) {
    // API expects snake_case
    const body = {
      request_no: record.requestNo, request_time: record.requestTime,
      applicant: record.applicant, applicant_phone: record.applicantPhone,
      applicant_dept: record.applicantDept, request_title: record.requestTitle,
      request_reason: record.requestReason, request_data_content: record.requestDataContent,
      processor: record.processor,
      finish_time: record.finishTime || '',
    }
    return request('/api/ledger', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body) })
  },
  async ledgerUpdate(id: number, record: Partial<LedgerRecord>) {
    // Convert camelCase keys to snake_case
    const body: Record<string, any> = {}
    const keyMap: Record<string, string> = {
      requestNo: 'request_no', requestTime: 'request_time',
      applicantPhone: 'applicant_phone', applicantDept: 'applicant_dept',
      requestTitle: 'request_title', requestReason: 'request_reason',
      requestDataContent: 'request_data_content', finishTime: 'finish_time',
    }
    for (const [k, v] of Object.entries(record)) {
      if (keyMap[k]) body[keyMap[k]] = v
      else if (!k.startsWith('_')) body[k] = v
    }
    return request(`/api/ledger/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(body) })
  },
  async ledgerDelete(id: number) { return request(`/api/ledger/${id}`, { method: 'DELETE' }) },
  async ledgerLogs(recordId?: number, fieldName?: string, page?: number): Promise<{ data: LogEntry[]; total: number }> {
    const raw = await request<any>('/api/ledger/logs' + `?page=${page || 1}&pageSize=10` + (recordId ? `&recordId=${recordId}` : '') + (fieldName ? `&fieldName=${encodeURIComponent(fieldName)}` : ''))
    return mapPageResponse(raw, mapLogEntry)
  },
  async ledgerListDeleted(): Promise<LedgerRecord[]> {
    const raw: any[] = await request('/api/ledger/deleted')
    return raw.map((r: any) => ({ ...mapLedgerRecord(r), _deleted: true }))
  },
  async ledgerRestore(id: number) { return request(`/api/ledger/${id}/restore`, { method: 'PUT' }) },

  // ============ 提取记录 ============
  async extractionList(requestNo: string): Promise<ExtractionRecord[]> {
    const raw: any[] = await request(`/api/extraction/${encodeURIComponent(requestNo)}`)
    return raw.map(r => ({
      id: r.id,
      requestNo: r.requestNo ?? r.request_no ?? '',
      recordCount: r.recordCount ?? r.record_count ?? 0,
      extractor: r.extractor ?? '',
      supervisor: r.supervisor ?? '',
      remark: r.remark ?? '',
      createDate: r.createDate ?? r.create_date ?? '',
      isVisible: r.isVisible !== false,
    }))
  },
  async extractionAdd(requestNo: string, recordCount: number, extractor: string, supervisor: string, remark: string = '') {
    return request('/api/extraction', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ request_no: requestNo, record_count: recordCount, extractor, supervisor, remark }) })
  },
  async extractionUpdate(id: number, data: { record_count?: number; extractor?: string; supervisor?: string; remark?: string }) {
    return request(`/api/extraction/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) })
  },
  async extractionDelete(id: number) { return request(`/api/extraction/${id}`, { method: 'DELETE' }) },
  async extractionRestore(id: number) { return request(`/api/extraction/${id}/restore`, { method: 'PUT' }) },

  // ============ 用户列表 ============
  async userDisplayNames(): Promise<string[]> { return request('/api/users/display-names') },

  // ============ 用户管理 ============
  async usersList() { return request<any[]>('/api/users') },
  async userAdd(form: UserForm) { return request('/api/users', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(form) }) },
  async userUpdate(id: number, form: Partial<UserForm>) { return request(`/api/users/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(form) }) },
  async userDelete(id: number) { return request(`/api/users/${id}`, { method: 'DELETE' }) },

  // ============ 角色管理 ============
  async rolesList() { return request<any[]>('/api/roles') },
  async roleAdd(roleKey: string, roleName: string, permissions: string[]) { return request('/api/roles', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ roleKey, roleName, permissions }) }) },
  async roleUpdate(id: number, data: Partial<RoleForm>) { return request(`/api/roles/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) }) },
  async roleDelete(id: number) { return request(`/api/roles/${id}`, { method: 'DELETE' }) },
  async permissionsList() { return request<any[]>('/api/permissions') },
}
