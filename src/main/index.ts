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
let statusWindow: BrowserWindow | null = null

// 创建状态栏小窗口
function createStatusWindow() {
  if (statusWindow) return
  statusWindow = new BrowserWindow({
    width: 90,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  statusWindow.setIgnoreMouseEvents(false, { forward: true })

  // 跟随主窗口位置
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition()
    const [w] = mainWindow.getSize()
    statusWindow.setPosition(x + w + 6, y + 10)
  }

  // 加载状态栏页面
  const url = process.env.ELECTRON_RENDERER_URL
  if (url) {
    statusWindow.loadURL(url + '#/status')
  } else {
    statusWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'status' })
  }
}

// 更新状态栏位置（跟随主窗口）
function updateStatusPos() {
  if (!statusWindow || !mainWindow) return
  const [x, y] = mainWindow.getPosition()
  const [w, h] = mainWindow.getSize()
  // 默认在右边，太靠左就放左边
  const mainX = x
  const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
  if (mainX > screenWidth - 200) {
    // 太靠右，放左边
    statusWindow.setPosition(x - 96, y + 10)
  } else {
    // 默认放右边
    statusWindow.setPosition(x + w + 6, y + 10)
  }
}

// 同步数值到状态栏窗口
function syncStatsToWindow(stats: any) {
  statusWindow?.webContents.send('pet:stats-update', stats)
}

// 同步开机自启设置到系统
function applyLaunchAtLogin(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled })
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { workAreaSize } = primaryDisplay

  const savedPos = store.get('windowPosition')
  const onTop = store.get('alwaysOnTop', true)

  mainWindow = new BrowserWindow({
    width: 110,
    height: 133,
    x: savedPos?.x ?? workAreaSize.width - 150,
    y: savedPos?.y ?? workAreaSize.height - 187,
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

  // 拖拽窗口
  ipcMain.on('pet:drag-move-to', (_e, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y))
    store.set('windowPosition', { x: Math.round(x), y: Math.round(y) })
    updateStatusPos()
  })

  // 控制状态栏显示/隐藏
  ipcMain.on('pet:toggle-status', (_e, show: boolean) => {
    if (show) {
      createStatusWindow()
      statusWindow?.showInactive()
      updateStatusPos()
    } else {
      statusWindow?.hide()
    }
  })

  // 数值更新推送到状态栏
  ipcMain.on('pet:stats-update', (_e, stats: any) => {
    syncStatsToWindow(stats)
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
  const cursorTimer = setInterval(() => {
    const pt = screen.getCursorScreenPoint()
    if (pt.x !== lastX || pt.y !== lastY) {
      lastX = pt.x
      lastY = pt.y
      mainWindow?.webContents.send('pet:cursor-pos', { x: pt.x, y: pt.y })
    }
  }, 100)

  // 退出前清理所有定时器，避免访问已销毁对象
  app.on('before-quit', () => {
    clearInterval(cursorTimer)
    statusMonitor.stop()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
