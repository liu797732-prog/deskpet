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
    ipcRenderer.on('pet:menu-action', (_e, action) => callback(action))
  },
  showContextMenu: () => ipcRenderer.send('pet:show-context-menu'),
  dragMoveTo: (x: number, y: number) => ipcRenderer.send('pet:drag-move-to', x, y),
  onCursorPos: (callback: (pos: { x: number; y: number }) => void) => {
    ipcRenderer.on('pet:cursor-pos', (_e, pos) => callback(pos))
  }
})
