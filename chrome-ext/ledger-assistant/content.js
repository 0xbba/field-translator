// Content script: 在OA页面注入浮动按钮 + 响应文本提取请求
// 防重复注入：已注入则跳过所有逻辑
if (window.__ledgerAssistantInjected) {
  // 已注入过，不重复注册监听器和浮动按钮
} else {
  window.__ledgerAssistantInjected = true

const TARGET_HOST = 'scitsmpro.paas.sc.ctc.com'

// 判断是否在目标OA页面（精确匹配到表单路径）
function isTargetPage() {
  return location.href.includes('scitsmpro.paas.sc.ctc.com/aiops/app/form/')
}

// ============ DOM 结构化提取（优先于 innerText） ============
function extractFromDOM() {
  const result = {}

  // 1. 基本信息：从 el-form-item 提取标签+值
  const formItems = document.querySelectorAll('.el-form-item')
  for (const item of formItems) {
    let labelEl = item.querySelector('.el-form-item__label span.title')
    if (!labelEl) labelEl = item.querySelector('.el-form-item__label')
    const label = labelEl?.textContent?.trim()
    if (!label) continue

    const input = item.querySelector('input[disabled], textarea[disabled]')
    if (input && input.value) {
      result[label] = input.value.trim()
      continue
    }

    const selectText = item.querySelector('.el-select .el-input__inner')
    if (selectText) {
      const t = selectText.textContent?.trim()
      if (t) { result[label] = t; continue }
    }

    const tagText = item.querySelector('.el-tag .el-select__tags-text')
    if (tagText) {
      const t = tagText.textContent?.trim()
      if (t) { result[label] = t; continue }
    }

    const radioText = item.querySelector('.el-radio-group .el-radio.is-checked .el-radio__label')
    if (radioText) {
      result[label] = radioText.textContent?.trim() || ''
      continue
    }
  }

  // 2. 顶部信息：单号（可能是 span/div 等任意标签）
  const allEls = document.querySelectorAll('*')
  for (const el of allEls) {
    // 只看没有子元素的叶子节点，避免匹配到父容器
    if (el.children.length > 0) continue
    const text = el.textContent?.trim()
    if (text && /^DATA_\d+_\d+$/.test(text)) {
      result['单号'] = text
      break
    }
  }
  // 备用：从 innerHTML 正则提取
  if (!result['单号']) {
    const m = document.body.innerHTML.match(/DATA_\d+_\d+/)
    if (m) result['单号'] = m[0]
  }

  // 3. 顶部信息：申请时间
  const bodyText = document.body.innerText
  const timeMatch = bodyText.match(/申请时间[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
  if (timeMatch) result['申请时间'] = timeMatch[1]

  // 4. 顶部信息：申请人
  const applicantMatch = bodyText.match(/([^\s(（_]+_[^\s(（(]+[\(（]\d{7,15}[,，][^)]+\))/)
  if (applicantMatch) {
    const full = applicantMatch[1]
    const m = full.match(/^([^\s(（_]+)_[^\s(（(]+[\(（](\d{7,15})[,，]\s*(.+?)[\)）]$/)
    if (m) {
      result['applicant'] = m[1]
      result['applicantPhone'] = m[2]
      result['applicantDept'] = m[3]
    }
  }

  // 5. 审核过程：从表格提取所有环节
  const approvalStages = []
  const tables = document.querySelectorAll('table')
  for (const table of tables) {
    const rows = table.querySelectorAll('tbody tr')
    if (rows.length === 0) continue
    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      if (cells.length < 6) continue
      const stepName = cells[0]?.textContent?.trim()
      const handlerRaw = cells[1]?.textContent?.trim()
      // 提取处理人姓名：匹配 "姓名_xx市" 格式（姓名可能含数字，如"王波6"）
      const nameMatch = handlerRaw?.match(/([^\s(（_]+_[^\s(（_]+)/)
      const personFull = nameMatch?.[1] || ''
      const person = personFull.replace(/_[^\s(（_]+$/, '') // 去掉 _xx市 后缀
      // 完成时间
      const finishTimeRaw = cells[5]?.textContent?.trim()?.replace(/\s+/g, ' ')
      const ftMatch = finishTimeRaw?.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/)
      const completedAt = ftMatch ? `${ftMatch[1]} ${ftMatch[2]}` : ''
      const isUnfinished = !finishTimeRaw || finishTimeRaw.includes('未处理') || !completedAt

      approvalStages.push({
        name: stepName,
        person,
        personFull,
        completedAt: isUnfinished ? '' : completedAt,
        isUnfinished,
      })
    }
    // 只取第一个有数据的表格（审核过程可能有两个 table，一个 thead 一个 tbody）
    if (approvalStages.length > 0) break
  }

  // 6. 处理人逻辑
  let processor = ''
  let finishTime = ''

  // 找到当前环节（最后一个未完成的环节）
  const currentIdx = approvalStages.findIndex(s => s.isUnfinished)

  if (currentIdx >= 0) {
    const currentStage = approvalStages[currentIdx]
    const prevStage = currentIdx > 0 ? approvalStages[currentIdx - 1] : null

    const isAcceptor = (name) => name?.includes('数据需求承接') || name?.includes('数据承接') || name?.includes('数据统计人员')
    const isCoordinator = (name) => name?.includes('数据需求统筹') || name?.includes('需求统筹')

    if (isAcceptor(currentStage.name)) {
      // 规则1：当前环节是数据需求承接人 → 取该环节人员，完成时间=当前时间
      processor = currentStage.person
      finishTime = '' // 传空，服务端写入时用服务器时间
    } else if (prevStage && isAcceptor(prevStage.name)) {
      // 规则2：上一环节是数据需求承接人 → 取上一环节人员，完成时间=上一环节完成时间
      processor = prevStage.person
      finishTime = prevStage.completedAt
    } else if (isCoordinator(currentStage.name)) {
      // 规则3：上一环节不是承接人 且 当前环节是数据需求统筹 → 取该环节人员，完成时间=当前时间
      processor = currentStage.person
      finishTime = '' // 传空，服务端写入时用服务器时间
    }
  } else {
    // 所有环节都已完成，取最后一个环节的处理人
    const lastStage = approvalStages[approvalStages.length - 1]
    if (lastStage && lastStage.completedAt) {
      processor = lastStage.person
      finishTime = lastStage.completedAt
    }
  }

  // 构建结果
  const mapField = (keys) => {
    for (const k of keys) { if (result[k]) return result[k] }
    return ''
  }

  const requestNo = mapField(['单号', '数据单号', '需求单号', '编号', '申请单号'])
  const requestTime = mapField(['申请时间', '需求时间', '时间', '创建时间'])
  const applicant = mapField(['applicant', '申请人', '申请人姓名', '姓名'])
  const applicantPhone = mapField(['applicantPhone', '联系电话', '电话'])
  const applicantDept = mapField(['applicantDept', '申请部门', '部门'])
  const requestTitle = mapField(['标题', '需求标题', '主题'])
  const requestReason = mapField(['申请事由', '需求原因', '原因', '事由', '说明'])
  const requestDataContent = mapField(['数据内容', '数据需求内容', '数据需求', '需求内容'])

  const hasAnyField = requestNo || requestTime || applicant || applicantDept || requestTitle || requestReason || requestDataContent
  if (!hasAnyField) return null

  return {
    requestNo: requestNo || '',
    requestTime: requestTime || '',
    applicant: applicant || '',
    applicantPhone: applicantPhone || '',
    applicantDept: applicantDept || '',
    requestTitle: requestTitle || '',
    requestReason: requestReason || '',
    requestDataContent: requestDataContent || '',
    processor,
    finishTime,
  }
}

// 检测扩展上下文是否仍有效（扩展更新/重载后旧脚本会失效）
function isContextValid() {
  try {
    return !!chrome.runtime?.id
  } catch {
    return false
  }
}

// ============ 消息响应 ============
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isContextValid()) {
    sendResponse({ error: 'Extension context invalidated' })
    return true
  }

  if (msg.type === 'GET_PAGE_TEXT') {
    let text = document.body?.innerText || ''
    try {
      const iframes = document.querySelectorAll('iframe')
      for (const iframe of iframes) {
        if (iframe.contentDocument?.body) {
          text += '\n' + iframe.contentDocument.body.innerText
        }
      }
    } catch (e) {}
    sendResponse({ text, url: location.href })
    return true
  }

  if (msg.type === 'EXTRACT_DOM') {
    const data = extractFromDOM()
    sendResponse({ data, url: location.href })
    return true
  }
})

// ============ 浮动按钮 ============
if (isTargetPage() && window.self === window.top) {
  if (!document.getElementById('__ledger-assistant-btn')) {
    const btn = document.createElement('div')
    btn.id = '__ledger-assistant-btn'
    btn.innerHTML = '台账'
    btn.style.cssText = `
      position: fixed; right: 16px; top: 50%; transform: translateY(-50%);
      width: 36px; height: 36px; border-radius: 50%;
      background: #1677ff; color: #fff; display: flex; align-items: center;
      justify-content: center; font-size: 12px; font-weight: 700;
      cursor: pointer; z-index: 999999; box-shadow: 0 2px 8px rgba(22,119,255,0.4);
      transition: transform 0.2s; user-select: none;
    `
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-50%) scale(1.15)' })
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'translateY(-50%) scale(1)' })
    btn.addEventListener('click', () => {
      if (!isContextValid()) {
        // 扩展已更新/重载，旧脚本上下文失效，提示用户刷新
        const tip = document.createElement('div')
        tip.textContent = '插件已更新，请刷新页面后再试'
        tip.style.cssText = `
          position: fixed; right: 60px; top: 50%; transform: translateY(-50%);
          background: #faad14; color: #fff; padding: 8px 14px; border-radius: 6px;
          font-size: 12px; z-index: 999999; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          white-space: nowrap; pointer-events: none;
        `
        document.body.appendChild(tip)
        setTimeout(() => tip.remove(), 3000)
        // 同时移除失效的浮动按钮，避免反复点击
        btn.remove()
        return
      }
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })
    })
    document.body.appendChild(btn)
  }
}

} // end of __ledgerAssistantInjected guard
