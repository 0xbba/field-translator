/**
 * P2: 提取记录 CRUD 测试
 */
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { getTestContext } from './helpers.js'

describe('P2: 提取记录 CRUD', () => {
  let app, adminToken
  let createdId
  const testRequestNo = 'EXT-' + Date.now()

  beforeAll(async () => {
    const ctx = await getTestContext()
    app = ctx.app
    adminToken = ctx.adminToken
  })

  it('新增提取记录', async () => {
    const res = await request(app)
      .post('/api/extraction')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        request_no: testRequestNo,
        record_count: 100,
        extractor: '取数人A',
        supervisor: '监督人B',
        remark: '测试备注',
      })
    expect(res.status).toBe(200)
    expect(res.body.id).toBeTruthy()
    createdId = res.body.id
  })

  it('新增: 缺少 request_no 应 400', async () => {
    const res = await request(app)
      .post('/api/extraction')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ record_count: 50 })
    expect(res.status).toBe(400)
  })

  it('查询某单号的提取记录', async () => {
    const res = await request(app)
      .get(`/api/extraction/${testRequestNo}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toBeInstanceOf(Array)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].requestNo).toBe(testRequestNo)
  })

  it('更新提取记录', async () => {
    const res = await request(app)
      .put(`/api/extraction/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ record_count: 200, extractor: '取数人C', remark: '更新备注' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('软删除提取记录', async () => {
    const res = await request(app)
      .delete(`/api/extraction/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('恢复提取记录', async () => {
    const res = await request(app)
      .put(`/api/extraction/${createdId}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
