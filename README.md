# DeskPet 桌面宠物

一个基于 Live2D 的 Windows 桌面宠物，住在你桌面上，陪你互动，有养成系统。

## 功能

- **桌面悬浮**：无边框透明小窗口（110x133），可拖拽，位置自动保存，置顶开关，开机自启
- **Live2D 互动**：Knight 骑士模型，眼睛全局跟随鼠标，点头/点身体触发不同反应
- **养成系统**：饱食度 / 心情 / 清洁度随时间衰减，右键喂食洗澡恢复，经验升级
- **状态感知**：
  - 20分钟鼠标键盘不动 → 宠物自言自语发呆
  - 用户回来动鼠标 → 调皮调侃
  - 深夜（23点后活跃）→ 关怀提醒
- **独立状态栏**：低状态自动弹出小窗口显示数值进度条，跟随宠物位置
- **右键菜单**：喂食 / 洗澡 / 说句话 / 显示状态栏 / 置顶 / 开机自启 / 退出
- **随机闲聊**：每30-60分钟主动说一句

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 44 |
| 构建工具 | electron-vite |
| 前端 | Vue 3 + TypeScript |
| Live2D 渲染 | pixi.js v6 + pixi-live2d-display v0.4（Cubism 4） |
| 本地存储 | electron-store + localStorage |

## 开发

```bash
npm install
npm run dev
```

## 打包

```bash
npm run build
```

## 目录结构

```
src/
├── main/
│   ├── index.ts        # 窗口、右键菜单、IPC、状态栏独立窗口
│   └── status-monitor.ts  # 空闲检测、深夜关怀
├── preload/
│   └── index.ts        # IPC 桥接
└── renderer/src/
    ├── App.vue           # 主窗口：气泡、台词、养成逻辑
    ├── main.ts          # 入口（hash 路由区分宠物/状态栏）
    ├── pet-stats.ts      # 数值系统（localStorage 持久化）
    └── components/
        ├── PetCanvas.vue      # PIXI + Live2D 渲染
        └── StatusWindow.vue    # 独立状态栏小窗口
```

## 路线图

- [x] MVP：桌面悬浮 + Live2D + 养成 + 状态感知
- [ ] 换更多宠物模型
- [ ] 装扮系统、小游戏
- [ ] 广告变现
