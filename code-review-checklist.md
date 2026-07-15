---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '74485f16-d9d9-46c0-bf9e-e0edb391b6a7'
  PropagateID: '74485f16-d9d9-46c0-bf9e-e0edb391b6a7'
  ReservedCode1: '0bcded6c-387e-4e27-b5b7-ad9da8e65504'
  ReservedCode2: '0bcded6c-387e-4e27-b5b7-ad9da8e65504'
---

# data-team-tools 代码审查清单

> 审查日期：2026-07-15 | 总计 48 项

## P0 - 必须立即修复

- [x] 1. **[安全/XSS]** `sidebar.js:747` 监督人列表 `names.map(n => '<option value="${n}">')` 未转义，API返回恶意用户名可执行任意脚本
- [x] 2. **[安全/XSS]** `sidebar.js:8,686` settings消息区域和连接状态用 `innerHTML` 拼接 userInfo 未转义
- [x] 3. **[Bug]** `useLedger.tsx:284,365` `Api.extractionAdd` 两处调用缺少 `extractionRemark` 参数，备注被静默丢弃
- [x] 4. **[Bug]** `useLedger.tsx:384,402` 直接变异 React 状态 `record._deleted = true/false`，违反不可变原则，可能跳过重渲染
- [x] 5. **[Bug]** `useMapping.tsx:151` 直接变异 React 状态 `mappingData[existing].chinese = item.chinese`
- [x] 6. **[Bug]** `LedgerManagePage.tsx:405` `recordCount || ''` 在值为0时显示空白，应改为 `?? ''`
- [x] 7. **[Bug]** `sidebar.js` 缺少已删除记录恢复功能，写入时若单号在已删除记录中存在，会违反"每单号唯一可见记录"约束
- [x] 8. **[性能/安全]** `routes/tokens.js:96` `apiTokenMiddleware` 全表遍历 + 同步 `bcrypt.compareSync`，Token增长后事件循环阻塞导致服务不可用

## P1 - 近期应修复

- [x] 9. **[Bug]** `useLedger.tsx:377` `addLedgerRecord` 依赖数组缺少 `extractionRemark` 和 `showDeletedLedger`，闭包捕获过时值
- [x] 10. **[Bug]** `LedgerManagePage.tsx:186` `Math.random()` 作为 rowKey 兜底，每次渲染行身份变化，触发整表重渲染
- [x] 11. **[Bug]** `LedgerParsePage.tsx:120` finishTime 空字符串是 falsy，用户清空完成时间后输入框变禁用态不可重输
- [x] 12. **[Bug]** `LedgerParsePage.tsx:36` useEffect 依赖数组仅 `[ledgerParsed]`，闭包中 `extractionExtractor`/`currentUser` 可能过时
- [x] 13. **[安全]** `middleware.js:28` `requirePerm` 未校验 `is_active`，禁用用户的 JWT 在有效期内仍可访问
- [x] 14. **[Bug]** `routes/users.js:80` 用户硬删除与 `dt_api_tokens` 外键冲突（无 ON DELETE CASCADE），删有Token的用户报500
- [x] 15. **[Bug]** `routes/tokens.js:25` `expires_at` 存入时间用了 `toISOString()`（UTC），过期判断比预期早8小时
- [x] 16. **[同步]** `sidebar.js` vs `content.js` DOM提取与文本解析的处理人逻辑完全不同：DOM有 `isCoordinator` 分支，文本解析没有
- [x] 17. **[同步]** `parser.js` vs `ledger.ts` 整个 parser.js 是 ledger.ts 的手动移植拷贝，无自动化同步机制，极易遗漏
- [x] 18. **[Bug]** `utils/log.js:11` `oldValue || null` 和 `newValue || null` 在值为0或空字符串时误转为null，应用 `?? null`
- [x] 19. **[Bug]** `routes/extraction.js:53` UPDATE 未校验 `is_visible`，可修改已软删除的提取记录

## P2 - 应该修复

- [x] 20. **[架构]** `useLedger.tsx` 457行hook承载20+state和35+返回值，严重违反单一职责，应拆分
- [x] 21. **[规范]** `useLedger.tsx:187,259` diff比较逻辑完全重复（已删除记录路径和更新路径），应抽取 `computeDiff` 函数
- [x] 22. **[安全]** `manifest.json:34` `host_permissions` 对所有站点开放请求权限
- [x] 23. **[安全]** `server.js:22` CORS 全开放 `cors()`，生产应限制 Origin
- [x] 24. **[架构]** `routes/translations.js:167` 导入事务内日志与 `writeLog` 不兼容（不同连接无法回滚），writeLog 应支持传入 client
- [x] 25. **[一致性]** `init.js:311` 每次启动强制覆盖内置角色权限，管理员自定义权限重启后丢失
- [x] 26. **[安全]** `db.js:37,init.js:13` `pgSchema` 直接拼入 DDL/连接参数，应加白名单校验
- [x] 27. **[安全]** 全局多处 `res.status(500).json({ error: err.message })` 泄露 SQL 语句等内部信息
- [x] 28. **[类型]** `api/index.ts` `login`/`me`/`usersList`/`rolesList` 等返回 `any`，缺少 `User`/`Role`/`Permission` 类型定义
- [x] 29. **[UX]** 多处组件 写入台账/导入/删除等操作无 loading 状态反馈，用户可能重复点击
- [x] 30. **[规范]** `LedgerManagePage.tsx:336-369` 5列提取记录重复相同删除样式判断，应抽取 helper
- [x] 31. **[性能]** `ManagePage.tsx:179` `filteredData.indexOf(record)` 在多列渲染中反复 O(n) 查找
- [x] 32. **[一致性]** `AnnouncementsPage.tsx` 删除样式 `color:'#999'` 和 LedgerManagePage 的 `rgba(0,0,0,0.25)` 不统一
- [x] 33. **[样式]** 全局多处 大量硬编码颜色 `#1677ff`/`rgba(0,0,0,0.45)` 等，未用 antd theme token

## P3 - 可以后续优化

- [ ] 34. **[Bug]** `useLedger.tsx:418` `fetchDeletedL` 不是 `useCallback`，每次渲染新引用
- [ ] 35. **[Bug]** `useLedger.tsx:284,365` 多处 `fetchLedger()` 未 await
- [ ] 36. **[规范]** `api/index.ts:118` `pageSize=999999` 硬编码导出全部，应专设导出API
- [ ] 37. **[Bug]** `api/index.ts:18` `request` 函数无 try-catch 包裹，网络断开时 `fetch` 抛 TypeError 无友好提示
- [ ] 38. **[Bug]** `storage.ts` `JSON.parse` 结果无结构校验，`localStorage.setItem` 无错误处理，无数据迁移机制
- [ ] 39. **[Bug]** `useMapping.tsx:117` 实时查找 useEffect 无防抖无 AbortController，快速粘贴触发竞态
- [ ] 40. **[性能]** `content.js:53` `querySelectorAll('*')` 全量遍历DOM，性能差
- [ ] 41. **[Bug]** `manifest.json:26` `all_frames:true` 导致多 frame 的 `onMessage` 竞争响应
- [ ] 42. **[脆弱]** `content.js:17-50` DOM提取强依赖 Element UI CSS类名，OA系统升级即失效
- [ ] 43. **[规范]** `sidebar.js:144,150` `isTargetPage()` 和 `isOATab()` 功能完全重复
- [ ] 44. **[Bug]** `sidebar.js:737` 自动解析 `setTimeout(1000)` 时机不可靠，侧边栏DOM可能未就绪
- [ ] 45. **[UX]** `AnnouncementsPage.tsx` 无 `useIsSmallScreen` 响应式适配，无分页条数切换，与其他管理页不一致
- [ ] 46. **[UX]** `UsersPage.tsx` 无分页、无搜索、删除操作 Popconfirm 不处理 Promise rejection
- [ ] 47. **[Bug]** `RolesPage.tsx:124` `checkedKeys` 仅传叶子key，antd Tree 需要含半选父key才正确显示
- [ ] 48. **[Bug]** `InsertGenPage.tsx:180` `URL.revokeObjectURL` 在 `a.click()` 后立即调用，浏览器可能未完成下载

> AI生成