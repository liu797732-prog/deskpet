<template>
  <div
    ref="containerRef"
    class="pet-canvas"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
  >
    <div v-if="errorMsg" class="error-overlay">{{ errorMsg }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

const emit = defineEmits(['pet-click'])

;(window as any).PIXI = PIXI

const containerRef = ref<HTMLElement | null>(null)
const errorMsg = ref('')
let app: PIXI.Application | null = null
let model: Live2DModel | null = null

// 拖拽/点击区分
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let offsetX = 0
let offsetY = 0
let movedDistance = 0
const CLICK_THRESHOLD = 5 // 移动超过5像素算拖拽

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging = true
  movedDistance = 0
  dragStartX = e.screenX
  dragStartY = e.screenY
  offsetX = e.clientX
  offsetY = e.clientY
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return
  const dx = e.screenX - dragStartX
  const dy = e.screenY - dragStartY
  movedDistance = Math.max(movedDistance, Math.abs(dx) + Math.abs(dy))
  if (movedDistance > CLICK_THRESHOLD) {
    ;(window as any).petAPI?.dragMoveTo(e.screenX - offsetX, e.screenY - offsetY)
  }
}

function onMouseUp(e: MouseEvent) {
  if (!isDragging) return
  isDragging = false
  if (movedDistance <= CLICK_THRESHOLD && model && app) {
    const rect = (app.view as HTMLCanvasElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // 模型区域：从 model.y 到 model.y + model.height
    // 上半部分算头，下半部分算身体
    const modelTop = model.y
    const modelHeight = model.height
    const headLine = modelTop + modelHeight * 0.4

    if (y < headLine) {
      ;(model as any)?.motion?.('TapBody')
      emit('pet-click', 'head')
    } else {
      ;(model as any)?.motion?.('TapBody')
      emit('pet-click', 'body')
    }
  }
}

onMounted(async () => {
  if (!containerRef.value) return

  try {
    app = new PIXI.Application({
      width: 110,
      height: 133,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true,
      resizeTo: containerRef.value
    })

    containerRef.value.appendChild(app.view as HTMLCanvasElement)
    model = await Live2DModel.from('/models/knight/Knight/knight.model3.json')

    const scale = Math.max(
      app.screen.width / model.width,
      app.screen.height / model.height
    ) * 0.95
    model.scale.set(scale)
    model.x = (app.screen.width - model.width) / 2
    model.y = app.screen.height - model.height

    app.stage.addChild(model)

    // 监听主进程推送的全局鼠标位置
    ;(window as any).petAPI?.onCursorPos((pos: { x: number; y: number }) => {
      if (!model || !app) return
      const rect = (app.view as HTMLCanvasElement).getBoundingClientRect()
      // screen coords -> canvas-relative pixel coords
      const mouseX = pos.x - (window.screenX + rect.left)
      const mouseY = pos.y - (window.screenY + rect.top)
      model.focus(mouseX, mouseY)
    })
  } catch (err: any) {
    console.error('Failed to load Live2D model:', err)
    errorMsg.value = '加载失败: ' + (err?.message || String(err))
  }
})

onBeforeUnmount(() => {
  if (app) {
    app.destroy(true, { children: true, texture: true, baseTexture: true })
  }
})
</script>

<style scoped>
.pet-canvas {
  width: 100%;
  height: 100%;
}

.pet-canvas canvas {
  cursor: grab;
}

.error-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 200, 200, 0.95);
  color: #c00;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 12px;
  max-width: 260px;
  text-align: center;
  z-index: 100;
}
</style>
