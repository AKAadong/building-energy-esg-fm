<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  BILLING_CYCLES,
  MUSIC_PLANS,
  ENTERPRISE_CUSTOM,
  yearSaveAmount,
  yearPerMonth,
} from '@/data/pricingPlans'

const billingCycle = ref('month')
const enterpriseVisible = ref(false)

const isYearly = computed(() => billingCycle.value === 'year')

function displayPrice(plan) {
  if (isYearly.value) {
    return { main: plan.priceYear, unit: '/ 年', original: null, sub: `折合 ¥${yearPerMonth(plan)} / 月` }
  }
  return {
    main: plan.priceMonth,
    unit: '/ 月',
    original: plan.priceMonthOriginal,
    sub: `按年计费 ¥${plan.priceYear} / 年`,
  }
}

function onSubscribe(plan) {
  const cycle = isYearly.value ? '连续包年' : '连续包月'
  const p = displayPrice(plan)
  ElMessage.success(`已选择「${plan.name} · ${plan.tempo}」${cycle} · ¥${p.main}${p.unit}（演示，未接入支付）`)
}

function onEnterprise() {
  enterpriseVisible.value = true
}

function contactEnterprise() {
  enterpriseVisible.value = false
  ElMessageBox.alert(
    `${ENTERPRISE_CUSTOM.summary}。${ENTERPRISE_CUSTOM.detail}`,
    ENTERPRISE_CUSTOM.title,
    { confirmButtonText: '知道了' },
  )
}
</script>

<template>
  <div class="music-pricing">
    <!-- 顶栏：企业定制版 -->
    <div class="pricing-topbar">
      <el-button class="enterprise-btn" round @click="onEnterprise">
        {{ ENTERPRISE_CUSTOM.title }}
      </el-button>
    </div>

    <!-- 居中主标题 -->
    <header class="pricing-header">
      <h1 class="main-title">建筑能源智能管理 · 会员套餐</h1>
      <p class="main-sub">
        按场景选配 Andante → Allegro，年付更省
      </p>

      <!-- 连续包月 / 连续包年 -->
      <div class="billing-toggle-wrap">
        <div class="billing-toggle">
          <button
            v-for="c in BILLING_CYCLES"
            :key="c.key"
            type="button"
            class="toggle-btn"
            :class="{ active: billingCycle === c.key }"
            @click="billingCycle = c.key"
          >
            {{ c.label }}
            <span v-if="c.badge && billingCycle === c.key" class="toggle-badge">{{ c.badge }}</span>
            <span v-else-if="c.badge" class="toggle-badge muted">{{ c.badge }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- 四栏卡片 -->
    <div class="plans-grid">
      <article
        v-for="plan in MUSIC_PLANS"
        :key="plan.id"
        class="plan-card"
        :class="{ 'plan-card--rec': plan.recommended }"
      >
        <div v-if="plan.recommended" class="plan-ribbon">专业优选</div>

        <div class="plan-head">
          <div class="plan-name">{{ plan.name }}</div>
          <div class="plan-tempo">
            {{ plan.tempo }} · {{ plan.tierLabel }}
          </div>
          <p class="plan-headline">{{ plan.headline }}</p>
        </div>

        <div class="plan-price-block">
          <div class="price-row">
            <span class="price-currency">¥</span>
            <span class="price-main">{{ displayPrice(plan).main }}</span>
            <span class="price-unit">{{ displayPrice(plan).unit }}</span>
          </div>
          <div v-if="!isYearly && displayPrice(plan).original" class="price-original">
            原价 ¥{{ displayPrice(plan).original }} / 月
          </div>
          <div v-if="isYearly" class="price-save">
            较月付×12 省 ¥{{ yearSaveAmount(plan) }}
          </div>
          <div class="price-sub">{{ displayPrice(plan).sub }}</div>
        </div>

        <button type="button" class="subscribe-btn" @click="onSubscribe(plan)">
          订阅
        </button>

        <ul class="feature-list">
          <li
            v-for="(f, idx) in plan.features"
            :key="idx"
            class="feature-item"
            :class="f.included ? 'feature--yes' : 'feature--no'"
          >
            <span class="feature-icon" aria-hidden="true">{{ f.included ? '✅' : '❌' }}</span>
            <span class="feature-text">{{ f.text }}</span>
          </li>
        </ul>

        <footer class="plan-scene">
          <span class="scene-label">适用</span>
          {{ plan.scene }}
        </footer>
      </article>
    </div>

    <!-- 企业定制版弹层 -->
    <el-dialog
      v-model="enterpriseVisible"
      :title="ENTERPRISE_CUSTOM.title"
      width="480px"
      align-center
    >
      <p class="enterprise-p">{{ ENTERPRISE_CUSTOM.summary }}</p>
      <p class="enterprise-p">{{ ENTERPRISE_CUSTOM.detail }}</p>
      <template #footer>
        <el-button @click="enterpriseVisible = false">关闭</el-button>
        <el-button type="primary" @click="contactEnterprise">
          {{ ENTERPRISE_CUSTOM.cta }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.music-pricing {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 8px 32px;
}

.pricing-topbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.enterprise-btn {
  font-weight: 600;
  color: #1a1a1a;
  border: 1px solid #1a1a1a;
  background: #fff;
}

.enterprise-btn:hover {
  background: #1a1a1a;
  color: #fff;
}

.pricing-header {
  text-align: center;
  margin-bottom: 28px;
}

.main-title {
  font-size: 26px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0 0 8px;
  letter-spacing: 0.02em;
}

.main-sub {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin: 0 0 24px;
}

.billing-toggle-wrap {
  display: flex;
  justify-content: center;
}

.billing-toggle {
  display: inline-flex;
  background: #f0f0f0;
  border-radius: 999px;
  padding: 4px;
  gap: 4px;
}

.toggle-btn {
  position: relative;
  border: none;
  background: transparent;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.55);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}

.toggle-btn.active {
  background: #1a1a1a;
  color: #fff;
}

.toggle-badge {
  display: block;
  font-size: 10px;
  font-weight: 500;
  margin-top: 2px;
  opacity: 0.95;
}

.toggle-badge.muted {
  color: rgba(0, 0, 0, 0.4);
}

.toggle-btn.active .toggle-badge.muted {
  color: rgba(255, 255, 255, 0.85);
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 1200px) {
  .plans-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .plans-grid {
    grid-template-columns: 1fr;
  }

  .toggle-btn {
    padding: 8px 14px;
    font-size: 13px;
  }
}

.plan-card {
  position: relative;
  background: #fff;
  border-radius: 16px;
  padding: 24px 20px 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.plan-card--rec {
  border-color: #1a1a1a;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1);
}

.plan-ribbon {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #1a1a1a;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 4px;
}

.plan-head {
  margin-bottom: 16px;
  min-height: 100px;
}

.plan-name {
  font-size: 22px;
  font-weight: 800;
  color: #1a1a1a;
  letter-spacing: 0.03em;
}

.plan-tempo {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a1a;
  margin-top: 4px;
}

.plan-headline {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  line-height: 1.5;
  margin: 10px 0 0;
}

.plan-price-block {
  margin-bottom: 16px;
}

.price-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px;
}

.price-currency {
  font-size: 18px;
  font-weight: 800;
  color: #1a1a1a;
}

.price-main {
  font-size: 36px;
  font-weight: 900;
  color: #1a1a1a;
  line-height: 1;
}

.price-unit {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-left: 2px;
}

.price-original {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.35);
  text-decoration: line-through;
  margin-top: 6px;
}

.price-save {
  font-size: 12px;
  color: #c41d7f;
  font-weight: 600;
  margin-top: 6px;
}

.price-sub {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  margin-top: 6px;
}

.subscribe-btn {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: #1a1a1a;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 20px;
  transition: opacity 0.2s, transform 0.15s;
}

.subscribe-btn:hover {
  opacity: 0.88;
  transform: translateY(-1px);
}

.subscribe-btn:active {
  transform: translateY(0);
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  flex: 1;
}

.feature-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 10px;
}

.feature-icon {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.4;
}

.feature--yes .feature-text {
  color: rgba(0, 0, 0, 0.78);
}

.feature--no .feature-text {
  color: rgba(0, 0, 0, 0.38);
  text-decoration: line-through;
}

.plan-scene {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  line-height: 1.6;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  margin-top: auto;
}

.scene-label {
  display: inline-block;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.65);
  margin-right: 4px;
}

.enterprise-p {
  font-size: 14px;
  line-height: 1.7;
  color: rgba(0, 0, 0, 0.65);
  margin: 0 0 12px;
}
</style>
