import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { statusMonitor, StateChangeEvent, MilestoneEvent } from './status-monitor'

const store = new Store<{
  windowPosition?: { x: number; y: number }
  alwaysOnTop?: boolean
  launchAtLogin?: boolean
}>()

let mainWindow: BrowserWindow | null = null

// 同步开机自启设置到系统
function applyLaunchAtLogin(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled })
  console.log('[Store] launch at login:', enabled)
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { workAreaSize } = primaryDisplay

  const savedPos = store.get('windowPosition')
  const onTop = store.get('alwaysOnTop', true)
  console.log('[Store] loaded position:', savedPos, 'alwaysOnTop:', onTop)

  mainWindow = new BrowserWindow({
    width: 300,
    height: 400,
    x: savedPos?.x ?? workAreaSize.width - 340,
    y: savedPos?.y ?? workAreaSize.height - 440,
    frame: false,
    transparent: true,
    alwaysOnTop: onTop,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setIgnoreMouseEvents(false, { forward: true })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: '喂食', click: () => mainWindow?.webContents.send('pet:menu-action', 'feed') },
    { label: '洗澡', click: () => mainWindow?.webContents.send('pet:menu-action', 'bath') },
    { label: '说句话', click: () => mainWindow?.webContents.send('pet:menu-action', 'talk') },
    { type: 'separator' },
    {
      label: '显示状态栏',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        mainWindow?.webContents.send('pet:menu-action', 'toggle-status')
      }
    },
    {
      label: '置顶',
      type: 'checkbox',
      checked: onTop,
      click: (item) => {
        mainWindow?.setAlwaysOnTop(item.checked)
        store.set('alwaysOnTop', item.checked)
      }
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: store.get('launchAtLogin', false),
      click: (item) => {
        store.set('launchAtLogin', item.checked)
        applyLaunchAtLogin(item.checked)
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])

  ipcMain.on('pet:show-context-menu', () => {
    contextMenu.popup()
  })

  // 拖拽窗口：直接把鼠标屏幕坐标发给主进程定位
  ipcMain.on('pet:drag-move-to', (_e, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y))
    store.set('windowPosition', { x: Math.round(x), y: Math.round(y) })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  statusMonitor.start()

  // 恢复开机自启设置
  applyLaunchAtLogin(store.get('launchAtLogin', false))

  statusMonitor.on('state-change', (event: StateChangeEvent) => {
    mainWindow?.webContents.send('pet:state-change', event)
  })

  statusMonitor.on('milestone', (event: MilestoneEvent) => {
    mainWindow?.webContents.send('pet:milestone', event)
  })

  ipcMain.handle('pet:get-state', () => statusMonitor.getState())

  // 全局鼠标位置轮询：100ms 查一次，位置变化才推送
  let lastX = -1
  let lastY = -1
  setInterval(() => {
    const pt = screen.getCursorScreenPoint()
    if (pt.x !== lastX || pt.y !== lastY) {
      lastX = pt.x
      lastY = pt.y
      mainWindow?.webContents.send('pet:cursor-pos', { x: pt.x, y: pt.y })
    }
  }, 100)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
