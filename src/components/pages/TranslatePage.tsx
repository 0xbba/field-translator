import { useMemo } from 'react'
import {
  Card, Typography, Input, Button, Tag, Tooltip, Select, Table, Modal, Popconfirm, Upload as AntUpload, Popover
} from 'antd'
import { InboxOutlined, DownloadOutlined, TableOutlined, CloseOutlined, DeleteOutlined, SnippetsOutlined, CopyOutlined, CheckOutlined, PlusOutlined, PlusCircleOutlined } from '@ant-design/icons'
import type { UseMappingReturn } from '../../hooks/useMapping'
import { useAppContext } from '../../contexts/AppContext'
import { COLORS } from '../../constants'
import { Api } from '../../api'
import { parsePastedHeaders } from '../../utils/translation'
import type { ColumnData } from '../../types'

interface TranslatePageProps {
  mappingHook: UseMappingReturn
}

export default function TranslatePage({ mappingHook }: TranslatePageProps) {
  const { message, dataMode, fetchDbMapping, persistMapping } = useAppContext()

  const {
    mappingData, columns, targetFileName, pasteValue, copied, copiedAlias, copiedComment,
    batchTransOpen, batchTransText, batchParsedResult,
    setColumns, setPasteValue, setTargetFileName, setBatchTransOpen, setBatchTransText,
    setMappingData, setOriginalDataRows,
    handlePasteChange, handleCopyTranslation, handleCopyAlias, handleCopyComment,
    handleExportFull,
    matchedColumns, multiMatchColumns, unmatchedColumns, translatedCount, newMappingCount,
    duplicateTranslations,
    handleBatchTransCopy, handleBatchTransConfirm,
    updateTranslation, saveToMapping, saveAllNewToMapping, canSaveCol, selectAlternative,
    draggerCustomRequest,
  } = mappingHook

  // 重复字段的行索引集合（用于行高亮）
  const duplicateIdxSet = useMemo(() => {
    const s = new Set<number>()
    duplicateTranslations.forEach(d => d.indices.forEach(i => s.add(i)))
    return s
  }, [duplicateTranslations])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`.row-duplicate td { background: #fff1f0 !important; }`}</style>
      {/* 步骤1 */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Typography.Text strong style={{ fontSize:'0.95rem' }}>输入待翻译字段</Typography.Text>
        </div>
        <p style={{ fontSize: '0.75rem', color: COLORS.textTertiary, marginBottom: 12 }}>
          上传文件或粘贴首行字段名，自动翻译
        </p>

        <Input.TextArea
          value={pasteValue}
          onChange={e => handlePasteChange(e.target.value)}
          placeholder={"粘贴首行字段名（支持 Tab/逗号/换行分隔），如: id\tname\tage\tcreate_time"}
          autoSize={{ minRows: 4, maxRows: 10 }}
          style={{ fontFamily: 'monospace' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {columns.length > 0 && (
            <>
              <Button type="dashed" size="small" onClick={handleCopyTranslation}
                icon={copied ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}
              >
                {copied ? '已复制' : '复制翻译行'}
              </Button>
              <Button type="dashed" size="small" onClick={handleCopyAlias}
                icon={copiedAlias ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}
              >
                {copiedAlias ? '已复制' : '复制别名'}
              </Button>
              <Button type="dashed" size="small" onClick={handleCopyComment} disabled={translatedCount === 0}
                icon={copiedComment ? <CheckOutlined style={{ fontSize: 14 }} /> : <CopyOutlined style={{ fontSize: 14 }} />}
              >
                {copiedComment ? '已复制' : '复制Comment'}
              </Button>
              <Button type="dashed" size="small" onClick={handleExportFull} disabled={translatedCount === 0 || targetFileName === '手动粘贴'}
                icon={<DownloadOutlined style={{ fontSize: 14 }} />}
              >
                导出完整文件
              </Button>
              {unmatchedColumns.length > 0 && (
                <Button type="dashed" size="small" onClick={() => { handleBatchTransCopy(); setBatchTransOpen(true) }}
                  icon={<SnippetsOutlined style={{ fontSize: 14 }} />}
                >
                  批量翻译
                </Button>
              )}
            </>
          )}
          <Button type="default" size="small" onClick={() => { setPasteValue(''); setColumns([]); setTargetFileName(''); setOriginalDataRows([]) }} icon={<CloseOutlined style={{ fontSize: 14 }} />}>清空</Button>
          <AntUpload
            accept=".xlsx,.xls,.csv"
            showUploadList={false}
            customRequest={draggerCustomRequest}
          >
            <Button size="small" icon={<InboxOutlined />}>上传文件</Button>
          </AntUpload>
          {pasteValue.trim() && <Tag color="processing">{parsePastedHeaders(pasteValue).length} 个字段</Tag>}
          {targetFileName && !pasteValue.trim() && (
            <>
              <TableOutlined style={{ fontSize: 16, color: COLORS.primary }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{targetFileName}</span>
              <Tag color="processing">{columns.length} 个字段</Tag>
            </>
          )}
        </div>
      </Card>

      {/* 步骤2 */}
      {columns.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize:'0.95rem' }}>翻译结果</Typography.Text>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 12 }}>
            <span>共 {columns.length} 个字段</span>
            {matchedColumns.length > 0 && <Tag color="blue">{matchedColumns.length} 个已匹配</Tag>}
            {translatedCount > matchedColumns.length && <Tag color="green">{translatedCount} 个已翻译</Tag>}
            {multiMatchColumns.length > 0 && <Tag color="blue">{multiMatchColumns.length} 个有多选对照</Tag>}
            {unmatchedColumns.length > 0 && <Tag color="warning">{unmatchedColumns.length} 个无匹配</Tag>}
            {duplicateTranslations.length > 0 && (
              <Popover
                content={
                  <div style={{ maxHeight: 240, overflowY: 'auto', minWidth: 200 }}>
                    {duplicateTranslations.map((d, gi) => (
                      <div key={gi} style={{ marginBottom: gi < duplicateTranslations.length - 1 ? 8 : 0 }}>
                        <div style={{ fontWeight: 600, color: '#ff4d4f', fontSize: '0.8rem' }}>{d.chinese}</div>
                        <div style={{ fontSize: '0.8rem', color: '#666', paddingLeft: 8 }}>
                          {d.indices.map(i => columns[i]?.original).filter(Boolean).join('、')}
                        </div>
                      </div>
                    ))}
                  </div>
                }
                title=""
              >
                <Tag color="error">{duplicateTranslations.length} 组翻译重复（共 {duplicateTranslations.reduce((s, d) => s + d.indices.length, 0)} 个字段）</Tag>
              </Popover>
            )}
            {mappingData.length > 0 && matchedColumns.length === 0 && unmatchedColumns.length === columns.length && columns.length > 0 && (
              <Typography.Text type="warning" style={{ fontSize: '0.85rem' }}>无有效匹配结果，请检查字段名或添加对照记录</Typography.Text>
            )}
          </div>

          {newMappingCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <Button type="primary" size="small" onClick={saveAllNewToMapping}
                icon={<PlusCircleOutlined style={{ fontSize: 14 }} />}
                title="将所有新增翻译一次性添加到对照表"
              >
                一键添加全部 ({newMappingCount})
              </Button>
            </div>
          )}
          <Table<ColumnData>
            size="small"
            dataSource={columns}
            rowKey={(_, index) => String(index ?? 0)}
            pagination={false}
            scroll={{ x: 700 }}
            rowClassName={(_, idx) => duplicateIdxSet.has(idx ?? -1) ? 'row-duplicate' : ''}
            columns={[
              {
                title: '#',
                key: '_idx',
                width: 48,
                align: 'center',
                render: (_, __, index) => <Typography.Text type="secondary">{index + 1}</Typography.Text>,
              },
              {
                title: '匹配状态',
                key: 'matchStatus',
                width: 120,
                align: 'center',
                render: (_, col, idx) => {
                  const isDuplicate = duplicateIdxSet.has(idx)
                  const hasMultiAlts = col.alternatives.length > 1
                  const isMatched = col.alternatives.length > 0
                  if (hasMultiAlts) return <Tag color="processing">{col.alternatives.length} 个对照</Tag>
                  if (isDuplicate && isMatched) return <Tag color="error">已匹配</Tag>
                  if (isMatched) return <Tag color="success">已匹配</Tag>
                  if (mappingData.length > 0) return <Tag color="warning">无匹配</Tag>
                  return null
                },
              },
              {
                title: '英文字段名',
                dataIndex: 'original',
                key: 'original',
                width: 220,
                render: (v) => <Typography.Text code>{v}</Typography.Text>,
              },
              {
                title: '中文翻译',
                key: 'translated',
                width: 330,
                render: (_, col, idx) => {
                  const canSave = canSaveCol(idx)
                  const hasMultiAlts = col.alternatives.length > 1
                    return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Input
                        size="small" value={col.translated}
                        onChange={(e) => updateTranslation(idx, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { e.preventDefault(); saveToMapping(idx) } }}
                        placeholder={col.alternatives.length > 0 ? '' : col.original}
                        style={{ flex: 1 }}
                      />
                      {canSave && (
                        <Tooltip title="保存到对照表（回车也可）">
                          <Button type="text" size="small" onClick={() => saveToMapping(idx)} icon={<PlusOutlined style={{ fontSize: 16 }} />} />
                        </Tooltip>
                      )}
                      {hasMultiAlts && (
                          <Select size="small" value={col.selectedAlt >= 0 ? col.selectedAlt : 0}
                            onChange={(v) => selectAlternative(idx, v)}
                            style={{ width: 140 }}
                            title="选择对照关系"
                          >
                           {col.alternatives.map((alt, aIdx) => (
                             <Select.Option key={aIdx} value={aIdx}>{alt.chinese}{alt.original !== col.original ? ` (来源: ${alt.original})` : ''}</Select.Option>
                           ))}
                         </Select>
                       )}
                       {hasMultiAlts && (
                         <Popconfirm
                           title="确认删除"
                           description={`确定要删除对照「${col.alternatives[col.selectedAlt]?.chinese}」吗？`}
                           onConfirm={() => {
                             const alt = col.alternatives[col.selectedAlt]
                             if (!alt) return
                             const rest = col.alternatives.filter((_, i) => i !== col.selectedAlt)
                             const newAlt = rest.length > 0 ? rest[0] : undefined
                             const next = [...columns]
                             next[idx] = {
                               ...col,
                               alternatives: rest,
                               selectedAlt: 0,
                               translated: newAlt?.chinese ?? col.translated,
                             }
                             setColumns(next)
                             if (alt._dbId && dataMode === 'database') {
                               Api.delete(alt._dbId).then(() => fetchDbMapping()).catch(() => message.error('删除失败'))
                             } else if (dataMode === 'local') {
                               setMappingData(mappingData.filter(m => m !== alt))
                               persistMapping()
                             }
                           }}
                           okText="删除"
                           cancelText="取消"
                           okButtonProps={{ danger: true, size: 'small' }}
                           cancelButtonProps={{ size: 'small' }}
                         >
                           <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 14 }} />} />
                         </Popconfirm>
                       )}
                    </div>
                  )
                },
              },
            ]}
          />
        </Card>
      )}

      {/* 批量翻译弹窗 */}
      <Modal
        open={batchTransOpen}
        title="批量翻译无匹配字段"
        width={720}
        onCancel={() => { setBatchTransOpen(false); setBatchTransText('') }}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">
              {batchParsedResult.length > 0 ? `解析 ${batchParsedResult.length} 行，匹配 ${batchParsedResult.filter(r => r.matchedIdx >= 0 && r.chinese).length} 个字段` : '请粘贴翻译内容'}
            </Typography.Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => { setBatchTransOpen(false); setBatchTransText('') }}>取消</Button>
              <Button type="primary" onClick={handleBatchTransConfirm} disabled={batchParsedResult.filter(r => r.matchedIdx >= 0 && r.chinese).length === 0}>
                确定匹配
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: '0.85rem' }}>
              已复制 {unmatchedColumns.length} 个无匹配字段到剪贴板，可粘贴到 Excel 翻译后再粘贴回下方。
              支持 Tab/逗号/等号/空格分隔（字段名在前，翻译在后）。
            </Typography.Text>
          </div>
          <Input.TextArea
            value={batchTransText}
            onChange={e => setBatchTransText(e.target.value)}
            placeholder={`粘贴翻译内容，每行一个字段，例如：\ncreate_time\t创建时间\nupdate_time\t更新时间\nuser_id=用户ID`}
            autoSize={{ minRows: 6, maxRows: 12 }}
            style={{ fontFamily: 'monospace' }}
          />
          {batchParsedResult.length > 0 && (
            <Table
              size="small"
              dataSource={batchParsedResult}
              rowKey={(_, idx) => String(idx)}
              pagination={false}
              columns={[
                { title: '#', key: '_idx', width: 40, align: 'center' as const, render: (_, __, idx) => idx + 1 },
                { title: '字段名', key: 'original', width: 200, render: (_, r) => <Typography.Text code>{r.original}</Typography.Text> },
                { title: '中文翻译', key: 'chinese', render: (_, r) => r.chinese ? r.chinese : <Typography.Text type="secondary">未识别</Typography.Text> },
                {
                  title: '匹配', key: 'matched', width: 80, align: 'center' as const,
                  render: (_, r) => r.matchedIdx >= 0 && r.chinese
                    ? <Tag color="success">匹配</Tag>
                    : r.matchedIdx >= 0
                      ? <Tag color="warning">缺翻译</Tag>
                      : <Tag color="error">未找到</Tag>,
                },
              ]}
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
