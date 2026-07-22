import { Router } from 'express'
import { pool } from '../db.js'
import { requirePerm, getUserInfo, safeError } from '../middleware.js'
import { writeLog } from '../utils/log.js'

const router = Router()

const LOG_TABLE = 'dt_data_request_ledger_log'

// 查询台账统计（按发起人汇总流程数量和数据总量）
router.get('/stats', requirePerm('ledger_view'), async (req, res) => {
  try {
    const { startDate, endDate, timeField } = req.query
    // 时间字段映射：request_time=申请时间, finish_time=完成时间, extraction_time=取数时间
    const timeFieldMap = {
      request_time: 'l.request_time',
      finish_time: 'l.finish_time',
      extraction_time: 'e.first_create_date',
    }
    const selectedTimeField = timeFieldMap[timeField] || 'l.create_date'
    const conditions = ['l.is_visible = true']
    const params = []
    let idx = 1
    if (startDate) {
      conditions.push(`${selectedTimeField} >= $${idx}`)
      params.push(startDate)
      idx++
    }
    if (endDate) {
      conditions.push(`${selectedTimeField} <= $${idx}`)
      params.push(endDate + ' 23:59:59')
      idx++
    }
    const where = 'WHERE ' + conditions.join(' AND ')
    const sql = `
      SELECT
        l.applicant,
        STRING_AGG(DISTINCT l.applicant_dept, '、') AS applicant_dept,
        COUNT(*) AS process_count,
        COALESCE(SUM(e.total_count), 0) AS total_data_volume
      FROM dt_data_request_ledger l
      LEFT JOIN (
        SELECT request_no, SUM(record_count) AS total_count, MIN(create_date) AS first_create_date
        FROM dt_data_extraction_records
        WHERE is_visible = true
        GROUP BY request_no
      ) e ON l.request_no = e.request_no
      ${where}
      GROUP BY l.applicant
      ORDER BY total_data_volume DESC
    `
    const result = await pool.query(sql, params)
    res.json(result.rows.map(r => ({
      applicant: r.applicant || '',
      applicantDept: r.applicant_dept || '',
      processCount: Number(r.process_count) || 0,
      totalDataVolume: Number(r.total_data_volume) || 0,
    })))
  } catch (err) {
    console.error('[GET /api/ledger/stats]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 查询某发起人在指定时间范围内的台账明细（按提取记录逐条展开）
router.get('/stats/detail', requirePerm('ledger_view'), async (req, res) => {
  try {
    const { applicant, startDate, endDate, timeField } = req.query
    if (!applicant) return res.status(400).json({ error: 'applicant is required' })
    const timeFieldMap = {
      request_time: 'l.request_time',
      finish_time: 'l.finish_time',
      extraction_time: 'ex.create_date',
    }
    const selectedTimeField = timeFieldMap[timeField] || 'l.create_date'
    const conditions = ['l.is_visible = true', 'l.applicant = $1']
    const params = [applicant]
    let idx = 2
    if (startDate) {
      conditions.push(`${selectedTimeField} >= $${idx}`)
      params.push(startDate)
      idx++
    }
    if (endDate) {
      conditions.push(`${selectedTimeField} <= $${idx}`)
      params.push(endDate + ' 23:59:59')
      idx++
    }
    const where = 'WHERE ' + conditions.join(' AND ')
    const sql = `
      SELECT l.id, l.request_no, l.request_time, l.applicant, l.applicant_dept,
             l.request_title, l.processor, l.finish_time, l.create_date,
             COALESCE(ex.record_count, 0) AS record_count,
             ex.extractor, ex.supervisor, ex.remark AS extraction_remark,
             ex.create_date AS extraction_time
      FROM dt_data_request_ledger l
      LEFT JOIN LATERAL (
        SELECT id, record_count, extractor, supervisor, remark, create_date
        FROM dt_data_extraction_records
        WHERE request_no = l.request_no AND is_visible = true
        ORDER BY create_date ASC
      ) ex ON true
      ${where}
      ORDER BY l.create_date DESC, ex.create_date ASC
    `
    const result = await pool.query(sql, params)
    res.json(result.rows.map((r, i) => ({
      id: r.id * 1000 + i,
      ledgerId: r.id,
      requestNo: r.request_no || '',
      requestTime: r.request_time || '',
      applicant: r.applicant || '',
      applicantDept: r.applicant_dept || '',
      requestTitle: r.request_title || '',
      processor: r.processor || '',
      finishTime: r.finish_time || '',
      createDate: r.create_date || '',
      recordCount: Number(r.record_count) || 0,
      extractor: r.extractor || '',
      supervisor: r.supervisor || '',
      extractionRemark: r.extraction_remark || '',
      extractionTime: r.extraction_time || '',
    })))
  } catch (err) {
    console.error('[GET /api/ledger/stats/detail]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 查询台账列表（可搜索分页）
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, pageSize = 20, sortBy, sortOrder } = req.query
    const offset = (Number(page) - 1) * Number(pageSize)
    let countSql = 'SELECT count(*) FROM dt_data_request_ledger WHERE is_visible = true'
    let dataSql = 'SELECT id, request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time, create_date, last_modified FROM dt_data_request_ledger WHERE is_visible = true'
    const params = []
    if (search) {
      const like = `%${search}%`
      const where = ' AND (request_no ILIKE $1 OR applicant ILIKE $1 OR applicant_dept ILIKE $1 OR request_title ILIKE $1 OR processor ILIKE $1)'
      countSql += where
      dataSql += where
      params.push(like)
    }
    const allowedSortFields = {
      requestNo: 'request_no', requestTime: 'request_time', applicant: 'applicant',
      applicantPhone: 'applicant_phone', applicantDept: 'applicant_dept',
      requestTitle: 'request_title', requestReason: 'request_reason',
      requestDataContent: 'request_data_content', processor: 'processor',
      finishTime: 'finish_time', createDate: 'create_date',
    }
    const sortField = allowedSortFields[sortBy]
    const sortDir = sortOrder === 'ascend' ? 'ASC' : 'DESC'
    dataSql += sortField ? ` ORDER BY ${sortField} ${sortDir} NULLS LAST` : ' ORDER BY id DESC'
    dataSql += ' LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    const [countResult, dataResult] = await Promise.all([
      pool.query(countSql, params),
      pool.query(dataSql, [...params, Number(pageSize), offset]),
    ])
    const total = Number(countResult.rows[0].count)
    res.json({
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.max(1, Math.ceil(total / Number(pageSize))),
      rows: dataResult.rows,
    })
  } catch (err) {
    console.error('[GET /api/ledger]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 检查台账单号是否已存在
router.get('/check/:requestNo', async (req, res) => {
  try {
    const { requestNo } = req.params
    const result = await pool.query(
      'SELECT id, request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time, is_visible FROM dt_data_request_ledger WHERE request_no = $1',
      [requestNo]
    )
    const visibleRow = result.rows.find(r => r.is_visible)
    const deletedRow = result.rows.find(r => !r.is_visible)

    const mapRow = (r) => ({
      id: r.id, requestNo: r.request_no || '', requestTime: r.request_time || '',
      applicant: r.applicant || '', applicantPhone: r.applicant_phone || '',
      applicantDept: r.applicant_dept || '', requestTitle: r.request_title || '',
      requestReason: r.request_reason || '', requestDataContent: r.request_data_content || '',
      processor: r.processor || '', finishTime: r.finish_time || '',
    })

    res.json({
      exists: !!visibleRow,
      record: visibleRow ? mapRow(visibleRow) : undefined,
      deletedRecord: deletedRow ? { ...mapRow(deletedRow), _dbId: deletedRow.id, _deleted: true } : undefined,
    })
  } catch (err) {
    console.error('[GET /api/ledger/check]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 新增台账记录
router.post('/', requirePerm('ledger_parse'), async (req, res) => {
  try {
    const { request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time } = req.body
    const useFinishTime = finish_time && finish_time.trim()
    const result = await pool.query(
      useFinishTime
        ? `INSERT INTO dt_data_request_ledger (request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time, create_date, last_modified)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING id`
        : `INSERT INTO dt_data_request_ledger (request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time, create_date, last_modified)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),NOW()) RETURNING id`,
      useFinishTime
        ? [request_no || null, request_time || null, applicant || null, applicant_phone || null, applicant_dept || null, request_title || null, request_reason || null, request_data_content || null, processor || null, finish_time]
        : [request_no || null, request_time || null, applicant || null, applicant_phone || null, applicant_dept || null, request_title || null, request_reason || null, request_data_content || null, processor || null]
    )
    await writeLog(LOG_TABLE, { operation: 'INSERT', recordId: result.rows[0].id, newValue: null, ...getUserInfo(req) })
    res.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('[POST /api/ledger]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 更新台账记录
router.put('/:id', requirePerm('ledger_edit'), async (req, res) => {
  try {
    const { id } = req.params
    const fields = req.body
    const sets = []
    const vals = []
    let idx = 1
    for (const [k, v] of Object.entries(fields)) {
      if (['request_no','request_time','applicant','applicant_phone','applicant_dept','request_title','request_reason','request_data_content','processor','finish_time'].includes(k)) {
        // finish_time 空值 → NOW()（与 POST 语义一致：空值=使用当前时间）
        if (k === 'finish_time' && !v) {
          sets.push(`finish_time = NOW()`)
        } else {
          sets.push(`${k} = $${idx}`)
          vals.push(k === 'finish_time' && v === '' ? null : (v ?? null))
          idx++
        }
      }
    }
    if (sets.length === 0) return res.json({ success: true, unchanged: true })
    const oldRec = await pool.query('SELECT * FROM dt_data_request_ledger WHERE id = $1', [id])
    const oldRow = oldRec.rows[0] || {}
    sets.push(`last_modified = NOW()`)
    vals.push(id)
    await pool.query(`UPDATE dt_data_request_ledger SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
    const labelMap = { request_no: '数据单号', request_time: '申请时间', applicant: '申请员工', applicant_phone: '申请员工电话', applicant_dept: '申请部门', request_title: '申请标题', request_reason: '申请事由', request_data_content: '申请数据内容', processor: '处理人', finish_time: '完成时间' }
    for (const k of Object.keys(fields)) {
      if (!labelMap[k]) continue
      let oldVal = String(oldRow[k] ?? '')
      let newVal = String(fields[k] ?? '')
      if (k === 'request_time' || k === 'finish_time') {
        const oldTs = oldRow[k] ? new Date(oldRow[k]).getTime() : NaN
        const newTs = fields[k] ? new Date(fields[k]).getTime() : NaN
        if (!isNaN(oldTs) && !isNaN(newTs) && oldTs === newTs) continue
        if (!isNaN(oldTs)) oldVal = new Date(oldTs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        if (!isNaN(newTs)) newVal = new Date(newTs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      }
      if (oldVal !== newVal) {
        await writeLog(LOG_TABLE, { operation: 'UPDATE', recordId: Number(id), fieldName: labelMap[k], oldValue: oldVal, newValue: newVal, ...getUserInfo(req) })
      }
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/ledger/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 删除台账记录（软删除）
router.delete('/:id', requirePerm('ledger_delete'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_data_request_ledger SET is_visible = false, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, { operation: 'DELETE', recordId: Number(id), newValue: null, ...getUserInfo(req) })
    res.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/ledger/:id]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 导出台账全部数据（不分页，专用于导出）
router.get('/export', requirePerm('ledger_view'), async (req, res) => {
  try {
    const { search } = req.query
    let sql = 'SELECT id, request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time, create_date FROM dt_data_request_ledger WHERE is_visible = true'
    const params = []
    if (search) {
      sql += ' AND (request_no ILIKE $1 OR applicant ILIKE $1 OR applicant_dept ILIKE $1 OR request_title ILIKE $1 OR processor ILIKE $1)'
      params.push(`%${search}%`)
    }
    sql += ' ORDER BY id DESC LIMIT 100000'
    const result = await pool.query(sql, params)
    res.json(result.rows)
  } catch (err) {
    console.error('[GET /api/ledger/export]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 查询已删除台账记录
router.get('/deleted', requirePerm('ledger_view'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, request_no, request_time, applicant, applicant_phone, applicant_dept, request_title, request_reason, request_data_content, processor, finish_time, create_date, last_modified FROM dt_data_request_ledger WHERE is_visible = false ORDER BY last_modified DESC LIMIT 500'
    )
    res.json(result.rows.map(r => ({
      id: r.id,
      requestNo: r.request_no || '',
      requestTime: r.request_time || '',
      applicant: r.applicant || '',
      applicantPhone: r.applicant_phone || '',
      applicantDept: r.applicant_dept || '',
      requestTitle: r.request_title || '',
      requestReason: r.request_reason || '',
      requestDataContent: r.request_data_content || '',
      processor: r.processor || '',
      finishTime: r.finish_time || '',
    })))
  } catch (err) {
    console.error('[GET /api/ledger/deleted]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 恢复已删除台账记录
router.put('/:id/restore', requirePerm('ledger_restore'), async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('UPDATE dt_data_request_ledger SET is_visible = true, last_modified = NOW() WHERE id = $1', [id])
    await writeLog(LOG_TABLE, { operation: 'RESTORE', recordId: Number(id), newValue: null, ...getUserInfo(req) })
    res.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/ledger/:id/restore]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

// 查询台账日志
router.get('/logs', requirePerm('ledger_log'), async (req, res) => {
  try {
    const { recordId, fieldName, page = 1, pageSize = 10 } = req.query
    const offset = (Number(page) - 1) * Number(pageSize)
    let countSql = 'SELECT count(*) FROM dt_data_request_ledger_log'
    let dataSql = 'SELECT id, operation, record_id, field_name, old_value, new_value, user_name, operation_date FROM dt_data_request_ledger_log'
    const params = []
    const conditions = []
    if (recordId) {
      conditions.push('record_id = $' + (params.length + 1))
      params.push(Number(recordId))
    }
    if (fieldName) {
      conditions.push('field_name = $' + (params.length + 1))
      params.push(String(fieldName))
    }
    if (conditions.length > 0) {
      const where = ' WHERE ' + conditions.join(' AND ')
      countSql += where; dataSql += where
    }
    dataSql += ' ORDER BY id DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    const [countResult, dataResult] = await Promise.all([
      pool.query(countSql, params),
      pool.query(dataSql, [...params, Number(pageSize), offset]),
    ])
    const total = Number(countResult.rows[0].count)
    res.json({
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.max(1, Math.ceil(total / Number(pageSize))),
      rows: dataResult.rows.map(r => ({
        id: r.id,
        operation: r.operation,
        recordId: r.record_id,
        fieldName: r.field_name,
        oldValue: r.old_value,
        newValue: r.new_value,
        userName: r.user_name || '',
        operationDate: r.operation_date,
      })),
    })
  } catch (err) {
    console.error('[GET /api/ledger/logs]', err)
    res.status(500).json({ error: safeError(err) })
  }
})

export default router
