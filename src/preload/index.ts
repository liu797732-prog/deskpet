import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('petAPI', {
  getState: () => ipcRenderer.invoke('pet:get-state'),
  onStateChange: (callback: (event: any) => void) => {
    ipcRenderer.on('pet:state-change', (_e, data) => callback(data))
  },
  onMilestone: (callback: (event: any) => void) => {
    ipcRenderer.on('pet:milestone', (_e, data) => callback(data))
  },
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('pet:menu-action', (_e, data) => callback(data))
  },
  showContextMenu: () => ipcRenderer.send('pet:show-context-menu'),
  dragMoveTo: (x: number, y: number) => ipcRenderer.send('pet:drag-move-to', x, y),
  onCursorPos: (callback: (pos: { x: number; y: number }) => void) => {
    ipcRenderer.on('pet:cursor-pos', (_e, pos) => callback(pos))
  },
  toggleStatus: (show: boolean) => ipcRenderer.send('pet:toggle-status', show),

  // ---- 数值（主进程为唯一事实来源） ----
  getStats: () => ipcRenderer.invoke('pet:stats:get'),
  statAction: (action: string) => ipcRenderer.invoke('pet:stats:action', action),
  onStatsChanged: (callback: (stats: any) => void) => {
    ipcRenderer.on('pet:stats-changed', (_e, stats) => callback(stats))
  }
})
