<script setup>
import { computed, onMounted, ref } from 'vue'
import AppChart from '@/components/AppChart.vue'
import * as api from '@/api'
import { ElMessage } from 'element-plus'

const timeFrom = ref('')
const timeTo = ref('')
const topN = ref(20)
const data = ref(null)
const loading = ref(false)

const tableRows = computed(() => data.value?.items ?? [])

const barOption = computed(() => {
  const labels = data.value?.chart?.labels ?? []
  const scores = data.value?.chart?.scores ?? []
  return {
    color: ['#1890ff'],
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: 40, bottom: 56 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 35, fontSize: 11 } },
    yAxis: { type: 'value', name: '综合分', max: 100, splitLine: { lineStyle: { type: 'dashed' } } },
    series: [
      {
        type: 'bar',
        data: scores,
        barMaxWidth: 36,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
})

async function load() {
  loading.value = true
  try {
    const params = { top_n: topN.value }
    if (timeFrom.value) params.time_from = timeFrom.value
    if (timeTo.value) params.time_to = timeTo.value
    data.value = await api.getBenchmarkScoreboard(params)
  } catch (e) {
    ElMessage.error(e.message ?? '加载失败')
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="ems-page-title">能效对标</div>
    <p class="page-desc">
      参照 MyEMS「空间 / 对标」思路：按演示综合分（电耗、夜间基荷、峰谷比加权）对建筑排序，用于节能横向对比。
    </p>

    <el-card shadow="never" class="ems-card filter-card">
      <el-form :inline="true">
        <el-form-item label="开始时间">
          <el-input v-model="timeFrom" placeholder="YYYY-MM-DD HH:MM:SS" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-input v-model="timeTo" placeholder="YYYY-MM-DD HH:MM:SS" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="上榜数量">
          <el-input-number v-model="topN" :min="3" :max="200" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="load">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="16" class="mt">
      <el-col :xs="24" :lg="14">
        <el-card v-loading="loading" shadow="never" class="ems-card">
          <template #header>排行榜</template>
          <el-table v-if="tableRows.length" :data="tableRows" stripe border max-height="520" size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="rank" label="名次" width="72" />
            <el-table-column prop="building_id" label="建筑" min-width="160" show-overflow-tooltip />
            <el-table-column prop="score" label="综合分" width="88" sortable />
            <el-table-column prop="total_electricity_kwh" label="总电耗" min-width="110" show-overflow-tooltip />
            <el-table-column prop="night_base_ratio" label="夜间基荷占比" min-width="120" />
            <el-table-column prop="peak_valley_ratio" label="峰谷比" min-width="100" />
          </el-table>
          <el-empty v-else description="暂无数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="10">
        <el-card v-loading="loading" shadow="never" class="ems-card chart-card">
          <template #header>得分分布（柱状）</template>
          <AppChart v-if="data?.chart?.labels?.length" :option="barOption" />
          <el-empty v-else description="暂无图表数据" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page-desc {
  margin: -8px 0 16px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.6;
}

.filter-card {
  margin-bottom: 0;
}

.mt {
  margin-top: 16px;
}

.chart-card {
  min-height: 400px;
}
</style>
