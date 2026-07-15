// ============ 工具函数 ============
function $(id) { return document.getElementById(id) }

function showMsg(containerId, text, type = 'info') {
  // settings-msg-area 仍用内联方式
  if (containerId === 'settings-msg-area') {
    const el = $(containerId)
    el.innerHTML = `<div class="msg ${type}">${text}</div>`
    if (type !== 'error') setTimeout(() => { if (el.querySelector('.msg')?.textContent === text) el.innerHTML = '' }, 5000)
    return
  }

  // 其他区域用 toast 浮层，不占空间
  const old = document.getElementById('toast-msg')
  if (old) old.remove()

  const toast = document.createElement('div')
  toast.id = 'toast-msg'
  toast.className = `toast ${type}`
  toast.textContent = text
  document.body.appendChild(toast)

  const duration = type === 'error' ? 6000 : 4000
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0'
      toast.style.transition = 'opacity 0.3s'
      setTimeout(() => toast.remove(), 300)
    }
  }, duration)
}

// ============ 设置管理 ============
const DEFAULT_API_URL = 'http://localhost:3456'
const TARGET_URL_PATTERN = 'scitsmpro.paas.sc.ctc.com/aiops/app/form/'

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiUrl', 'apiToken', 'userInfo'], (r) => {
      resolve({
        apiUrl: r.apiUrl || DEFAULT_API_URL,
        apiToken: r.apiToken || '',
        userInfo: r.userInfo || null,
      })
    })
  })
}

async function saveSettings(data) {
  return new Promise(resolve => {
    chrome.storage.local.set(data, resolve)
  })
}

// ============ API 调用 ============
async function apiRequest(path, options = {}) {
  const { apiUrl, apiToken } = await getSettings()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`
  const res = await fetch(`${apiUrl}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  return res.json()
}

// ============ 页面数据提取 ============
// 优先使用 DOM 结构化提取，回退到 innerText 解析
async function extractPageData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) throw new Error('无法获取当前标签页')

  // 方法1：尝试 DOM 结构化提取（content script 的 EXTRACT_DOM 消息）
  const isOA = tab.url?.includes(TARGET_URL_PATTERN)
  if (!isOA) {
    throw new Error('当前页面不是OA数据需求页面，无法解析')
  }
  if (isOA) {
    try {
      // 先尝试发消息，确认 content script 是否已注入
      let response = null
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DOM' })
      } catch (e) {
        // content script 未注入，手动注入一次
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
          // 注入后再发消息
          response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DOM' })
        } catch (e2) {
          console.warn('content script 注入失败:', e2)
        }
      }
      if (response?.data) {
        return { record: response.data, method: 'DOM' }
      }
    } catch (e) {
      console.warn('DOM提取失败，回退到文本解析:', e)
    }
  }

  // 方法2：使用 scripting API 从所有 frame 提取 innerText，再用 parseLedgerText 解析
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        let text = document.body?.innerText || ''
        try {
          const iframes = document.querySelectorAll('iframe')
          for (const iframe of iframes) {
            if (iframe.contentDocument?.body) {
              text += '\n' + iframe.contentDocument.body.innerText
            }
          }
        } catch (e) {}
        return text
      }
    })
    let allText = ''
    let bestText = ''
    for (const r of results) {
      const t = r.result || ''
      allText += t + '\n'
      if (t.length > bestText.length) bestText = t
    }
    const text = bestText || allText
    const record = parseLedgerText(text)
    return { record, method: 'text' }
  } catch (e) {
    // scripting API 失败，回退到 content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' })
      const text = response?.text || ''
      const record = parseLedgerText(text)
      return { record, method: 'text' }
    } catch (e2) {
      throw new Error('无法提取页面数据，请确认已授予所需权限')
    }
  }
}

// 判断当前页面是否为目标OA页面
async function isTargetPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url?.includes(TARGET_URL_PATTERN) || false
}

// 判断当前标签页URL是否匹配（同步版本，用于 extractPageData）
async function isOATab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url?.includes(TARGET_URL_PATTERN)) return false
  return true
}

// ============ 渲染解析结果 ============
let currentParsed = null
let currentExistingRecord = null // 解析后查询到的已存在台账记录

// 字段定义：[label, key, type]  type: 'input' | 'textarea' | 'finishTime'
const PARSE_FIELDS = [
  ['数据单号', 'requestNo', 'input'],
  ['申请时间', 'requestTime', 'input'],
  ['申请员工', 'applicant', 'input'],
  ['员工电话', 'applicantPhone', 'input'],
  ['申请部门', 'applicantDept', 'input'],
  ['申请标题', 'requestTitle', 'textarea'],
  ['申请事由', 'requestReason', 'textarea'],
  ['数据内容', 'requestDataContent', 'textarea'],
  ['处理人', 'processor', 'input'],
  ['完成时间', 'finishTime', 'finishTime'],
]

function renderParsed(record) {
  currentParsed = record
  const container = $('parse-result')
  const status = $('parse-status')

  if (!record) {
    container.innerHTML = '<div class="empty">未能识别出台账信息</div>'
    status.className = 'badge error'
    status.textContent = '失败'
    status.style.display = ''
    $('btn-write').disabled = true
    $('extraction-section').style.display = 'none'
    $('extraction-records-section').style.display = 'none'
    $('ledger-status-badge').style.display = 'none'
    currentExistingRecord = null
    return
  }

  status.className = 'badge'
  status.textContent = '成功'
  status.style.display = ''

  container.innerHTML = PARSE_FIELDS.map(([label, key, type]) => {
    const value = record[key] || ''
    if (type === 'textarea') {
      return `<div class="field-row"><span class="field-label">${label}</span><textarea class="field-textarea" data-key="${key}" rows="2">${escHtml(value)}</textarea></div>`
    }
    if (type === 'finishTime') {
      if (value) {
        return `<div class="field-row"><span class="field-label">${label}</span><input class="field-input" data-key="${key}" value="${escAttr(value)}"></div>`
      }
      return `<div class="field-row"><span class="field-label">${label}</span><input class="field-input" data-key="${key}" disabled placeholder="当前时间"></div>`
    }
    return `<div class="field-row"><span class="field-label">${label}</span><input class="field-input" data-key="${key}" value="${escAttr(value)}"></div>`
  }).join('')

  $('btn-write').disabled = false
  $('extraction-section').style.display = ''
}

// ============ 台账存在状态查询与渲染 ============
async function checkAndRenderLedgerStatus(requestNo) {
  const badge = $('ledger-status-badge')
  if (!requestNo) {
    badge.style.display = 'none'
    currentExistingRecord = null
    return
  }

  try {
    const check = await apiRequest(`/api/ledger/check/${encodeURIComponent(requestNo)}`)
    currentExistingRecord = check.exists ? check.record : null

    if (check.exists) {
      const rec = check.record
      const processor = rec.processor || '-'
      const finishTime = rec.finishTime ? formatLocalTime(rec.finishTime) : '进行中'
      badge.className = 'badge ledger-badge'
      badge.textContent = '已存在'
      badge.innerHTML = `已存在<div class="tooltip"><div class="tip-row"><span class="tip-label">处理人</span><span class="tip-value">${escHtml(processor)}</span></div><div class="tip-row"><span class="tip-label">完成时间</span><span class="tip-value">${escHtml(finishTime)}</span></div></div>`
      badge.style.display = ''
    } else if (check.deletedRecord) {
      badge.className = 'badge deleted ledger-badge'
      badge.innerHTML = `已删除<div class="tooltip"><div class="tip-row"><span class="tip-value">台账记录已被删除，写入时将恢复</span></div></div>`
      badge.style.display = ''
    } else {
      badge.className = 'badge info ledger-badge'
      badge.innerHTML = `新单号<div class="tooltip"><div class="tip-row"><span class="tip-value">尚未录入台账</span></div></div>`
      badge.style.display = ''
    }
  } catch (e) {
    console.warn('台账状态查询失败:', e)
    badge.style.display = 'none'
    currentExistingRecord = null
  }
}

// ============ 提取记录查询与渲染 ============
async function fetchAndRenderExtractionRecords(requestNo) {
  const section = $('extraction-records-section')
  const listEl = $('extraction-records-list')
  const badge = $('ext-count-badge')

  if (!requestNo) {
    section.style.display = 'none'
    return
  }

  try {
    const records = await apiRequest(`/api/extraction/${encodeURIComponent(requestNo)}`)
    // 只展示未删除的提取记录
    const visibleRecords = records.filter(r => r.isVisible !== false)

    section.style.display = ''

    if (visibleRecords.length === 0) {
      listEl.innerHTML = '<div class="empty">暂无提取记录</div>'
      badge.style.display = 'none'
      return
    }

    badge.textContent = `${visibleRecords.length}条`
    badge.className = 'badge'
    badge.style.display = ''

    let html = ''
    for (const r of visibleRecords) {
      html += renderExtCard(r)
    }
    listEl.innerHTML = html
    // 如果当前处于展开状态，更新 maxHeight
    const body = $('ext-records-body')
    if (!body.classList.contains('collapsed')) {
      body.style.maxHeight = body.scrollHeight + 'px'
    }
  } catch (e) {
    console.warn('提取记录查询失败:', e)
    section.style.display = 'none'
  }
}

function renderExtCard(r, isDeleted = false) {
  const date = r.createDate ? new Date(r.createDate).toLocaleString('zh-CN', { hour12: false }) : '-'
  const cls = isDeleted ? 'ext-card deleted' : 'ext-card'
  const tag = isDeleted ? ' <span style="color:#ff4d4f;font-size:10px;">[已删除]</span>' : ''
  return `
    <div class="${cls}">
      <div class="ext-card-header">
        <span class="ext-card-count">${r.recordCount || 0} 条${tag}</span>
        <span class="ext-card-date">${escHtml(date)}</span>
      </div>
      <div class="ext-card-detail">
        取数人: ${escHtml(r.extractor || '-')} | 监督人: ${escHtml(r.supervisor || '-')}
        ${r.remark ? '<br>备注: ' + escHtml(r.remark) : ''}
      </div>
    </div>
  `
}

// 辅助：HTML 转义
function escHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function escAttr(s) { return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;') }

// 辅助：时间字符串转本地可读格式（处理UTC/ISO格式）
function formatLocalTime(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 从当前 input/textarea 读取最新解析值
function getCurrentParsedValues() {
  if (!currentParsed) return null
  const record = { ...currentParsed }
  document.querySelectorAll('#parse-result [data-key]').forEach(el => {
    const key = el.dataset.key
    if (key && !el.disabled) {
      record[key] = el.value
    }
  })
  return record
}

// ============ 解析按钮 ============
$('btn-parse').addEventListener('click', async () => {
  try {
    $('btn-parse').disabled = true
    const { record, method } = await extractPageData()
    renderParsed(record)
    if (record) {
      // 解析成功后，查台账状态和提取记录
      if (record.requestNo) {
        checkAndRenderLedgerStatus(record.requestNo)
        fetchAndRenderExtractionRecords(record.requestNo)
      }
    } else {
      showMsg('msg-area', '未能识别出台账信息，请确认页面内容', 'error')
    }
  } catch (e) {
    showMsg('msg-area', `解析失败：${e.message}`, 'error')
    renderParsed(null)
  } finally {
    $('btn-parse').disabled = false
  }
})

// ============ 变更对比与确认 ============
// 统一用 camelCase 键名，确保与 parsed / existingRecord 一致
const DIFF_FIELDS = [
  { key: 'requestNo', label: '数据单号' },
  { key: 'requestTime', label: '申请时间' },
  { key: 'applicant', label: '申请员工' },
  { key: 'applicantPhone', label: '员工电话' },
  { key: 'applicantDept', label: '申请部门' },
  { key: 'requestTitle', label: '申请标题' },
  { key: 'requestReason', label: '申请事由' },
  { key: 'requestDataContent', label: '数据内容' },
  { key: 'processor', label: '处理人' },
  { key: 'finishTime', label: '完成时间' },
]

function buildDiffDisplay(existing, parsed) {
  const diffs = []
  for (const { key, label } of DIFF_FIELDS) {
    const oldVal = String(existing[key] ?? '').trim()
    let newVal = String(parsed[key] ?? '').trim()

    // finishTime：空值=用当前时间不覆盖；数据库已有值=不覆盖（避免NOW()与实际完成时间差几秒反复提示变更）
    if (key === 'finishTime' && (!newVal || oldVal)) continue

    // 时间字段：比较时间戳，相同则跳过（数据库存UTC，解析出本地时间，字符串不同但时刻相同）
    if ((key === 'requestTime' || key === 'finishTime') && oldVal && newVal) {
      const oldTs = new Date(oldVal).getTime()
      const newTs = new Date(newVal).getTime()
      if (!isNaN(oldTs) && !isNaN(newTs) && oldTs === newTs) continue
    }

    if (oldVal === newVal) continue
    diffs.push({ key, label, oldVal: oldVal || '空', newVal: newVal || '空', checked: true })
  }
  return diffs
}

function showConfirmDialog(diffs, onConfirm, onCancel) {
  const old = document.getElementById('confirm-dialog')
  if (old) old.remove()

  const overlay = document.createElement('div')
  overlay.id = 'confirm-dialog'
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 10000;
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background: #fff; border-radius: 10px; padding: 16px; width: 100%; max-width: 360px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.15); max-height: 80vh; overflow-y: auto;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size: 14px; font-weight: 600; margin-bottom: 10px; color: rgba(0,0,0,0.88);'
  title.textContent = `检测到 ${diffs.length} 处变更，勾选需要更新的项`
  box.appendChild(title)

  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i]
    const row = document.createElement('div')
    row.style.cssText = 'margin-bottom: 8px; font-size: 12px; display: flex; gap: 6px; align-items: flex-start;'

    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.dataset.idx = i
    cb.style.cssText = 'margin-top: 3px; flex-shrink: 0; width: 14px; height: 14px; cursor: pointer;'

    const content = document.createElement('div')
    content.style.cssText = 'flex: 1; min-width: 0;'
    content.innerHTML = `
      <div style="color:rgba(0,0,0,0.65);font-weight:500;margin-bottom:2px;">${d.label}</div>
      <div style="color:#ff4d4f;text-decoration:line-through;word-break:break-all;">${escHtml(d.oldVal.length > 80 ? d.oldVal.slice(0, 80) + '...' : d.oldVal)}</div>
      <div style="color:#52c41a;word-break:break-all;">${escHtml(d.newVal.length > 80 ? d.newVal.slice(0, 80) + '...' : d.newVal)}</div>
    `

    row.appendChild(cb)
    row.appendChild(content)
    box.appendChild(row)
  }

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;'

  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'btn-default'
  cancelBtn.textContent = '取消'
  cancelBtn.style.flex = '1'
  cancelBtn.onclick = () => { overlay.remove(); onCancel?.() }

  const confirmBtn = document.createElement('button')
  confirmBtn.className = 'btn-primary'
  confirmBtn.textContent = '确认更新'
  confirmBtn.style.flex = '1'
  confirmBtn.onclick = () => {
    // 收集勾选状态
    const checkboxes = box.querySelectorAll('input[type=checkbox]')
    checkboxes.forEach(cb => {
      diffs[cb.dataset.idx].checked = cb.checked
    })
    overlay.remove()
    onConfirm(diffs)
  }

  btnRow.appendChild(cancelBtn)
  btnRow.appendChild(confirmBtn)
  box.appendChild(btnRow)
  overlay.appendChild(box)
  document.body.appendChild(overlay)
}

// ============ 写入台账按钮 ============
$('btn-write').addEventListener('click', async () => {
  const parsed = getCurrentParsedValues()
  if (!parsed) return
  const recordCount = parseInt($('record-count').value, 10)
  const extractor = $('extractor').value.trim()
  const supervisor = $('supervisor').value.trim()
  const remark = $('remark').value.trim()
  // 取数条数和取数人都不为空才插入提取记录（0条也是有效条数）
  const hasExtraction = ($('record-count').value.trim() !== '' && !isNaN(recordCount)) && !!extractor

  try {
    $('btn-write').disabled = true

    const requestNo = parsed.requestNo
    let ledgerId = null
    let needUpdate = false
    let existingRecord = null

    if (requestNo) {
      const check = await apiRequest(`/api/ledger/check/${encodeURIComponent(requestNo)}`)
      if (check.exists) {
        ledgerId = check.record._dbId || check.record.id
        needUpdate = true
        existingRecord = check.record
      }
    }

    // 更新模式：显示变更对比，用户选择后写入
    if (needUpdate && existingRecord) {
      const diffs = buildDiffDisplay(existingRecord, parsed)

      if (diffs.length === 0) {
        // 无变更，检查是否有提取记录要登记
        if (hasExtraction && requestNo) {
          await apiRequest('/api/extraction', {
            method: 'POST',
            body: JSON.stringify({
              request_no: requestNo,
              record_count: recordCount || 0,
              extractor: extractor || undefined,
              supervisor: supervisor || undefined,
              remark: remark || undefined,
            })
          })
          showMsg('msg-area', `台账无变化，提取记录已登记`, 'success')
          $('record-count').value = ''
          $('remark').value = ''
          // 刷新提取记录列表
          await fetchAndRenderExtractionRecords(requestNo)
        } else {
          showMsg('msg-area', '数据无变化，无需更新', 'info')
        }
        $('btn-write').disabled = false
        return
      }

      // 等待用户确认选择
      const selectedDiffs = await new Promise((resolve) => {
        showConfirmDialog(diffs, (result) => resolve(result), () => resolve(null))
      })

      if (!selectedDiffs) {
        $('btn-write').disabled = false
        return
      }

      // 检查是否有勾选项
      const checkedDiffs = selectedDiffs.filter(d => d.checked)

      if (checkedDiffs.length === 0) {
        // 没有勾选任何变更，检查是否有提取记录要登记
        if (hasExtraction && requestNo) {
          await apiRequest('/api/extraction', {
            method: 'POST',
            body: JSON.stringify({
              request_no: requestNo,
              record_count: recordCount || 0,
              extractor: extractor || undefined,
              supervisor: supervisor || undefined,
              remark: remark || undefined,
            })
          })
          showMsg('msg-area', `未选择任何变更，提取记录已登记`, 'success')
          $('record-count').value = ''
          $('remark').value = ''
          // 刷新提取记录列表
          await fetchAndRenderExtractionRecords(requestNo)
        } else {
          showMsg('msg-area', '未选择任何变更', 'info')
        }
        $('btn-write').disabled = false
        return
      }

      showMsg('msg-area', '正在写入...', 'info')

      // 只提交勾选的字段
      const camelToSnake = {
        requestNo: 'request_no', requestTime: 'request_time', applicant: 'applicant',
        applicantPhone: 'applicant_phone', applicantDept: 'applicant_dept',
        requestTitle: 'request_title', requestReason: 'request_reason',
        requestDataContent: 'request_data_content', processor: 'processor',
        finishTime: 'finish_time',
      }
      const body = {}
      for (const d of checkedDiffs) {
        const snakeKey = camelToSnake[d.key]
        if (snakeKey) {
          // 空值 finishTime 不放入 body（由后端 DEFAULT NOW() 处理）
          if (d.key === 'finishTime' && !parsed.finishTime) continue
          body[snakeKey] = parsed[d.key]
        }
      }

      if (needUpdate && ledgerId) {
        await apiRequest(`/api/ledger/${ledgerId}`, { method: 'PUT', body: JSON.stringify(body) })
      }
    } else {
      showMsg('msg-area', '正在写入...', 'info')
      // 新增模式：提交全部字段
      const body = {
        request_no: parsed.requestNo,
        request_time: parsed.requestTime,
        applicant: parsed.applicant,
        applicant_phone: parsed.applicantPhone,
        applicant_dept: parsed.applicantDept,
        request_title: parsed.requestTitle,
        request_reason: parsed.requestReason,
        request_data_content: parsed.requestDataContent,
        processor: parsed.processor,
      }
      // finishTime 有值才传，空值由后端 DEFAULT NOW() 处理
      if (parsed.finishTime) body.finish_time = parsed.finishTime

      const addResult = await apiRequest('/api/ledger', { method: 'POST', body: JSON.stringify(body) })
      ledgerId = addResult.id
    }

    let msg = needUpdate ? '台账已更新' : '台账已写入'

    if (hasExtraction && requestNo) {
      await apiRequest('/api/extraction', {
        method: 'POST',
        body: JSON.stringify({
          request_no: requestNo,
          record_count: recordCount || 0,
          extractor: extractor || undefined,
          supervisor: supervisor || undefined,
          remark: remark || undefined,
        })
      })
      msg += `，提取记录已登记（${recordCount}条）`
    }

    showMsg('msg-area', msg, 'success')
    // 写入成功后清空数据条数、备注，避免重复提交
    $('record-count').value = ''
    $('remark').value = ''
    // 写入成功后刷新状态和提取记录
    if (requestNo) {
      await checkAndRenderLedgerStatus(requestNo)
      await fetchAndRenderExtractionRecords(requestNo)
    }
  } catch (e) {
    if (e.message !== '__CANCELLED__') {
      showMsg('msg-area', `写入失败：${e.message}`, 'error')
    }
  } finally {
    $('btn-write').disabled = false
  }
})

// ============ 折叠切换 ============
$('ext-records-toggle').addEventListener('click', () => {
  const body = $('ext-records-body')
  const icon = $('ext-records-toggle').querySelector('.collapse-icon')
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed')
    body.style.maxHeight = body.scrollHeight + 'px'
    icon.classList.remove('collapsed')
  } else {
    body.classList.add('collapsed')
    icon.classList.add('collapsed')
  }
})

// ============ Tab 切换 ============
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    tab.classList.add('active')
    $(`tab-${tab.dataset.tab}`).classList.add('active')
    // 设置页隐藏底部操作栏
    $('sticky-bar').style.display = tab.dataset.tab === 'parse' ? '' : 'none'
  })
})

// ============ 设置页逻辑 ============
async function loadSettings() {
  const { apiUrl, apiToken, userInfo } = await getSettings()
  $('api-url').value = apiUrl
  $('api-token').value = apiToken
  updateConnectionStatus(userInfo, apiToken)
  // 自动填充取数人
  if (userInfo && !$('extractor').value) {
    $('extractor').value = userInfo.displayName || userInfo.username || ''
  }
}

function updateConnectionStatus(userInfo, token) {
  const el = $('connection-status')
  if (token && userInfo) {
    el.innerHTML = `<span style="color:#52c41a">&#10003; 已连接：${userInfo.displayName || userInfo.username} (${userInfo.roleName || userInfo.role || ''})</span>`
  } else if (token) {
    el.innerHTML = `<span style="color:#faad14">&#9888; Token已配置，但验证失败</span>`
  } else {
    el.innerHTML = `<span style="color:#ff4d4f">&#10007; 未配置 Token</span>`
  }
}

$('btn-save-settings').addEventListener('click', async () => {
  const apiUrl = $('api-url').value.trim() || DEFAULT_API_URL
  const apiToken = $('api-token').value.trim()
  if (!apiToken) {
    showMsg('settings-msg-area', '请输入 Token', 'error')
    return
  }
  if (!apiToken.startsWith('dtt_')) {
    showMsg('settings-msg-area', 'Token 应以 dtt_ 开头，请在主应用「API Token」中创建', 'error')
    return
  }
  await saveSettings({ apiUrl, apiToken })
  // 验证token
  try {
    const user = await apiRequest('/api/auth/me')
    await saveSettings({ userInfo: user })
    updateConnectionStatus(user, apiToken)
    if (user && !$('extractor').value) $('extractor').value = user.displayName || user.username || ''
    showMsg('settings-msg-area', `连接成功：${user.displayName || user.username}`, 'success')
  } catch (e) {
    await saveSettings({ userInfo: null })
    updateConnectionStatus(null, apiToken)
    showMsg('settings-msg-area', `验证失败：${e.message}`, 'error')
  }
})

$('btn-clear-token').addEventListener('click', async () => {
  await saveSettings({ apiToken: '', userInfo: null })
  $('api-token').value = ''
  updateConnectionStatus(null, '')
  showMsg('settings-msg-area', 'Token 已清除', 'success')
})

// ============ 初始化 ============
async function init() {
  await loadSettings()

  // 如果当前页面是目标OA页面，自动解析
  const isOA = await isTargetPage()
  if (isOA) {
    // 稍等页面加载完成后自动解析
    setTimeout(() => {
      $('btn-parse').click()
    }, 1000)
  }

  // 获取监督人候选列表
  try {
    const names = await apiRequest('/api/users/display-names')
    if (names && names.length > 0) {
      const datalist = $('supervisor-list')
      datalist.innerHTML = names.map(n => `<option value="${n}">`).join('')
    }
  } catch {}
}

init()
