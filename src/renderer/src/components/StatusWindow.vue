<template>
  <div class="status-window">
    <div class="exp-row">
      <span class="level-badge">Lv.{{ stats.level }}</span>
      <div class="bar exp-bar"><div class="fill exp" :style="{ width: stats.expPercent + '%' }"></div></div>
    </div>
    <div class="stat">
      <span>🍖</span>
      <div class="bar"><div class="fill hunger" :style="{ width: stats.hunger + '%' }"></div></div>
      <span class="num">{{ stats.hunger }}</span>
    </div>
    <div class="stat">
      <span>💛</span>
      <div class="bar"><div class="fill mood" :style="{ width: stats.mood + '%' }"></div></div>
      <span class="num">{{ stats.mood }}</span>
    </div>
    <div class="stat">
      <span>🛁</span>
      <div class="bar"><div class="fill clean" :style="{ width: stats.clean + '%' }"></div></div>
      <span class="num">{{ stats.clean }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const stats = ref({
  hunger: 80,
  mood: 80,
  clean: 90,
  level: 1,
  expPercent: 0
})

onMounted(() => {
  ;(window as any).petAPI?.onStatsUpdate((data: any) => {
    stats.value = data
  })
})
</script>

<style scoped>
.status-window {
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
}

.exp-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.level-badge {
  font-weight: bold;
  color: #666;
  white-space: nowrap;
}

.bar {
  width: 50px;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.exp-bar { flex: 1; }

.fill { height: 100%; }
.fill.hunger { background: #ff9f43; }
.fill.mood { background: #f368e0; }
.fill.clean { background: #48dbfb; }
.fill.exp { background: #a29bfe; }

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.num {
  font-size: 9px;
  color: #888;
  min-width: 16px;
  text-align: right;
}
</style>
