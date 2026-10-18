# DeskPet v1.0 打包前检查明细

> 日期：2026-10-18
> 状态：已修复

## 已发现并修复的问题

### 1. 状态栏窗口加载了宠物页面（严重）
- **现象**：点击显示状态栏后，弹出第二个宠物窗口
- **原因**：`loadFile` 传 hash 为 `'status'`，但 main.ts 判断的是 `'#/status'`，永远不匹配
- **修复**：main.ts 统一处理 hash，去掉 `#/` 前缀再比较

### 2. 退出时 statusWindow 未销毁
- **现象**：退出应用后可能残留进程
- **原因**：before-quit 只清了定时器，没关 statusWindow
- **修复**：before-quit 里 destroy statusWindow

### 3. 右键菜单"显示状态栏"checkbox 不同步
- **现象**：手动开关后菜单 checkbox 状态不更新
- **修复**：给菜单项加 id，toggle-status IPC 里同步 checked

### 4. 状态栏窗口没等加载完就显示
- **现象**：白屏一闪
- **修复**：监听 did-finish-load 后再 show

### 5. 状态栏窗口重复显示
- **现象**：hide 后再 show 不生效
- **原因**：createStatusWindow 里 if (statusWindow) return，但已存在的窗口是 hidden 状态
- **修复**：toggleStatus(true) 时如果窗口已存在就直接 show

### 6. 打包后模型路径错误（Network error）
- **现象**：打包后启动显示"加载失败: Network error"
- **原因**：开发模式用 `/models/...` 绝对路径，打包后 file:// 协议下不对
- **修复**：改成相对路径 `models/...`

### 7. 无用变量清理
- updateStatusPos 里未使用的 h 变量
- App.vue 里未使用的 currentState、petCanvasRef

## 待验证项

- [ ] 开发模式下模型路径（相对路径）是否正常
- [ ] 打包后状态栏窗口正确显示进度条
- [ ] 状态栏窗口跟随宠物拖拽
- [ ] 右键菜单 checkbox 同步
- [ ] 低状态自动弹出状态栏
- [ ] 退出无报错
