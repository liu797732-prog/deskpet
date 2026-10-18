import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { statusMonitor, StateChangeEvent, MilestoneEvent } from './status-monitor'
import { petState, type PetStatAction } from './pet-state'

const store = new Store<{
  windowPosition?: { x: number; y: number }
  alwaysOnTop?: boolean
  launchAtLogin?: boolean
}>()

// 单实例锁：防止多开
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 有人试图启动第二个实例，聚焦到已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

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
  // 和主窗口同一置顶层级
  statusWindow.setAlwaysOnTop(true, 'screen-saver')
  statusWindow.setIgnoreMouseEvents(false, { forward: true })

  // 跟随主窗口位置
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition()
    const [w] = mainWindow.getSize()
    statusWindow.setPosition(x + w + 6, y + 10)
  }

  // 加载状态栏页面，加载完再显示
  const url = process.env.ELECTRON_RENDERER_URL
  statusWindow.webContents.once('did-finish-load', () => {
    statusWindow?.showInactive()
    updateStatusPos()
    // 立即同步一次当前数值，避免状态栏短暂显示默认值
    statusWindow?.webContents.send('pet:stats-changed', petState.get())
  })
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
  const [w] = mainWindow.getSize()
  const screenWidth = screen.getPrimaryDisplay().workAreaSize.width
  if (x > screenWidth - 200) {
    statusWindow.setPosition(x - 96, y + 10)
  } else {
    statusWindow.setPosition(x + w + 6, y + 10)
  }
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
  mainWindow.setAlwaysOnTop(onTop, 'screen-saver')

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
      id: 'toggle-status',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        mainWindow?.webContents.send('pet:menu-action', 'toggle-status')
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
    // 状态栏也提到最前，保持同层级
    if (statusWindow && !statusWindow.isDestroyed()) {
      statusWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  })

  // 控制状态栏显示/隐藏
  ipcMain.on('pet:toggle-status', (_e, show: boolean) => {
    if (show) {
      if (!statusWindow) {
        createStatusWindow()
      } else {
        statusWindow.showInactive()
      }
      updateStatusPos()
    } else {
      statusWindow?.hide()
    }
    const menuItem = contextMenu.getMenuItemById('toggle-status')
    if (menuItem) menuItem.checked = show
  })

  // 数值状态机：唯一事实来源在主进程，渲染层只读/发动作
  ipcMain.handle('pet:stats:get', () => petState.get())
  ipcMain.handle('pet:stats:action', (_e, action: string) => {
    const allowed: PetStatAction[] = ['feed', 'bath', 'pet']
    if (!allowed.includes(action as PetStatAction)) return petState.get()
    return petState.action(action as PetStatAction)
  })

  // 数值变化推送（主窗口 + 状态栏窗口）
  petState.on('changed', (stats) => {
    mainWindow?.webContents.send('pet:stats-changed', stats)
    statusWindow?.webContents.send('pet:stats-changed', stats)
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
  petState.start()

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
    petState.stop() // 最后一次落盘
    statusWindow?.destroy()
    statusWindow = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
