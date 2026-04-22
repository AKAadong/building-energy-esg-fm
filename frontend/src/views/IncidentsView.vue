<script setup>
import { onMounted, ref } from 'vue'
import * as api from '@/api'
import { ElMessage } from 'element-plus'

const list = ref([])
const summary = ref(null)
const buildings = ref([])
const loading = ref(false)

const dialogVisible = ref(false)
const form = ref({
  title: '',
  building_id: '',
  severity: 'medium',
  status: 'open',
  detail: '',
})

function severityLabel(s) {
  const m = { low: '低', medium: '中', high: '高', critical: '紧急' }
  return m[s] ?? s
}

function statusLabel(s) {
  const m = { open: '待处理', in_progress: '进行中', resolved: '已解决', closed: '已关闭' }
  return m[s] ?? s
}

function severityTagType(s) {
  if (s === 'high' || s === 'critical') return 'danger'
  if (s === 'medium') return 'warning'
  return 'info'
}

async function loadSummary() {
  summary.value = await api.getIncidentsSummary().catch(() => null)
}

async function loadList() {
  loading.value = true
  try {
    const data = await api.getIncidents({ limit: 200 })
    list.value = data.items ?? []
  } catch (e) {
    ElMessage.error(e.message ?? '加载工单失败')
  } finally {
    loading.value = false
  }
}

async function loadBuildings() {
  const data = await api.getBuildings().catch(() => ({ items: [] }))
  buildings.value = data.items ?? []
}

async function submit() {
  if (!form.value.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  loading.value = true
  try {
    await api.postIncident(form.value)
    ElMessage.success('已创建')
    dialogVisible.value = false
    form.value = {
      title: '',
      building_id: '',
      severity: 'medium',
      status: 'open',
      detail: '',
    }
    await loadList()
    await loadSummary()
  } catch (e) {
    ElMessage.error(e.message ?? '创建失败')
  } finally {
    loading.value = false
  }
}

async function patchStatus(row, status) {
  loading.value = true
  try {
    const id = row.incident_id ?? row.id
    if (!id) throw new Error('缺少工单 id')
    await api.patchIncident(id, { status })
    ElMessage.success('已更新')
    await loadList()
    await loadSummary()
  } catch (e) {
    ElMessage.error(e.message ?? '更新失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadBuildings()
  await loadSummary()
  await loadList()
})
</script>

<template>
  <div class="inc-page">
    <header class="inc-head">
      <h1 class="inc-title">运维工单</h1>
      <div class="inc-head-actions">
        <el-button type="primary" size="small" @click="dialogVisible = true">新建工单</el-button>
        <el-button size="small" @click="loadList">刷新</el-button>
      </div>
    </header>

    <div class="inc-summary">
      <span class="inc-sum-item">待处理 <strong class="num-font">{{ summary?.pending ?? 0 }}</strong></span>
      <span class="inc-sum-sep" aria-hidden="true">|</span>
      <span class="inc-sum-item">总数 <strong class="num-font">{{ summary?.total ?? 0 }}</strong></span>
      <template v-for="(n, k) in summary?.by_status ?? {}" :key="k">
        <span class="inc-sum-sep" aria-hidden="true">|</span>
        <span class="inc-sum-item">{{ k }} <strong class="num-font">{{ n }}</strong></span>
      </template>
    </div>

    <div v-loading="loading" class="inc-feed" role="list">
      <div v-for="row in list" :key="row.id ?? row.incident_id" class="inc-feed-row" role="listitem">
        <div class="inc-tl">
          <span class="inc-tl-dot" aria-hidden="true" />
          <span class="inc-tl-line" aria-hidden="true" />
        </div>
        <div class="inc-feed-body">
          <div class="inc-feed-top">
            <el-tag :type="severityTagType(row.severity)" size="small" class="ems-tag-soft" effect="plain">
              {{ severityLabel(row.severity) }}
            </el-tag>
            <el-tag type="info" size="small" class="ems-tag-soft" effect="plain">{{ statusLabel(row.status) }}</el-tag>
            <span class="inc-time num-font">{{ row.created_at ?? '' }}</span>
          </div>
          <div class="inc-feed-title">{{ row.title }}</div>
          <div class="inc-feed-meta">
            <span v-if="row.building_id">建筑 {{ row.building_id }}</span>
            <span v-if="row.detail" class="inc-detail">{{ row.detail }}</span>
          </div>
          <div v-if="row.status === 'open' || row.status === 'in_progress'" class="inc-actions">
            <el-button size="small" text type="primary" @click="patchStatus(row, 'in_progress')">受理</el-button>
            <el-button size="small" text type="primary" @click="patchStatus(row, 'resolved')">解决</el-button>
            <el-button size="small" text @click="patchStatus(row, 'closed')">关闭</el-button>
          </div>
        </div>
      </div>
      <el-empty v-if="!loading && !list.length" description="暂无工单" :image-size="56" />
    </div>

    <el-dialog v-model="dialogVisible" title="新建工单" width="520px">
      <el-form label-width="88px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="建筑">
          <el-select v-model="form.building_id" clearable filterable style="width: 100%">
            <el-option
              v-for="b in buildings"
              :key="JSON.stringify(b)"
              :label="b.building_id ?? String(b)"
              :value="b.building_id ?? b.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="form.severity" style="width: 100%">
            <el-option label="low" value="low" />
            <el-option label="medium" value="medium" />
            <el-option label="high" value="high" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="open" value="open" />
            <el-option label="in_progress" value="in_progress" />
          </el-select>
        </el-form-item>
        <el-form-item label="详情">
          <el-input v-model="form.detail" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.inc-page {
  max-width: 880px;
  margin: 0 auto;
  padding: 0 var(--ems-space-sm, 8px);
}

.inc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e4e7ed;
}

.inc-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2329;
}

.inc-summary {
  font-size: 13px;
  color: #86909c;
  margin-bottom: 16px;
}

.inc-sum-item strong {
  color: #1f2329;
  font-weight: 600;
}

.inc-sum-sep {
  margin: 0 8px;
  color: #e4e7ed;
}

.inc-feed {
  min-height: 200px;
}

.inc-feed-row {
  display: flex;
  gap: 0;
  align-items: stretch;
}

.inc-tl {
  position: relative;
  width: 14px;
  flex-shrink: 0;
  margin-right: 12px;
}

.inc-tl-dot {
  position: absolute;
  top: 10px;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c9cdd4;
}

.inc-tl-line {
  position: absolute;
  top: 18px;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: #e4e7ed;
}

.inc-feed-body {
  flex: 1;
  min-width: 0;
  padding: 8px 0 16px;
  border-bottom: 1px dashed #e4e7ed;
}

.inc-feed-row:last-child .inc-feed-body {
  border-bottom: none;
}

.inc-feed-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.inc-time {
  margin-left: auto;
  font-size: 12px;
  color: #86909c;
}

.inc-feed-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2329;
  line-height: 1.4;
}

.inc-feed-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #86909c;
  line-height: 1.45;
}

.inc-detail {
  display: block;
  margin-top: 4px;
}

.inc-actions {
  margin-top: 8px;
}
</style>
