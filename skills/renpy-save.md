---
name: renpy-save
description: 编写或修改 Ren'Py 的存档系统（save/load API、FileSave/FileLoad/FilePage/FileSlot 等 File action 族、槽位组织、自动存档、回滚）及 Gallery 图鉴、Music Room 音乐室、Achievement 成就系统时加载。涉及存档界面、读档、画廊解锁、音乐鉴赏、成就解锁时必读。
---

# Ren'Py 存档与内容系统速查（分块构建：①存档机制 ✓ ②Gallery ③Music Room ④Achievement）

内容来自 save_load_rollback.html / 00action_file.rpy / loadsave.py 核验，示例经 8.5.3 SDK lint 验证（save_test.rpy）。

## 块① 存档机制

**核心：存档没有语句，是 action/API**（ast.py 无 Save/Load 语句类）——`renpy.save()`/`renpy.load()` + screen 的 File action 族。

**API（save-functions 核验）**：
```python
renpy.save("manual-1", extra_info="手动存档")   # 存到槽
renpy.load("manual-1")                          # 读档（立即切换）
renpy.can_load("manual-1")                      # 槽是否可读
renpy.list_slots()                              # 全部槽列表
renpy.newest_slot(regexp)                       # 最新槽（自动存档用）
renpy.copy_save(old, new) / renpy.rename_save(old, new)
renpy.slot_screenshot(slot) / renpy.slot_mtime(slot) / renpy.slot_json(slot)
```

**File action 族**（screen 集成，00action_file.rpy）：
| action | 作用 |
|---|---|
| `FileSave(slot)` / `FileLoad(slot)` / `FileDelete(slot)` | 存/读/删指定槽 |
| `FileAction(slot)` | 槽空则存、有档则读（标准槽按钮） |
| `FilePage(num)` / `FilePageNext()` / `FilePagePrevious()` | 翻页 |
| `FileCurrentPage()` / `FilePageName()` | 当前页名（拼槽名用） |
| `FileSlotName(page, slot)` | 槽名（"page-slot"格式） |
| `FileTime(slot, format)` | 存档时间（`%m/%d %H:%M`） |
| `FileScreenshot(slot)` | 存档截图 |
| `FileSaveName(slot)` | 存档名（extra_info） |
| `FileJson(slot)` | 自定义 JSON 数据 |
| `QuickSave()` / `QuickLoad()` | 快速存/读（自动槽） |
| `FileTakeScreenshot()` | 存档前截当前屏 |

**槽位组织**：槽名 = `page-slot`（如 `manual-1`、`auto-1`）；页 = 存档页（每页多个槽）。标准存/读档屏骨架：
```renpy
screen save_slots():
    vbox:
        textbutton "上一页" action FilePagePrevious()
        textbutton "下一页" action FilePageNext()
        grid 2 3:
            for i in range(1, 7):
                $ slot = "%s-%d" % (FileCurrentPage(), i)
                button:
                    action FileAction(slot)     # 空存/有读
                    vbox:
                        text FileSaveName(slot)
                        text FileTime(slot, format="%m/%d %H:%M")
                        add FileScreenshot(slot)
```

**自动存档**：Ren'Py 自动存档到 `auto-1`（`config.auto_save` 相关）；`renpy.newest_slot("auto")` 找最新自动档。

**存档内容边界**：会存 store 变量/存档时界面/回滚历史；**不存** persistent（跨存档）、线程/网络句柄、文件句柄；存档时若有不可 pickle 对象会失败——复杂对象用 `renpy.mark_rollback()`/降级。

**回滚一句**：Ctrl+Z 回滚由引擎管理；`renpy.block_rollback()` 阻止（不可逆场景）、`config.rollback_enabled` 全局开关、`renpy.fix_rollback()` 标记回滚点。保留读档后数据用 `renpy.retain_after_load()`（比如重设背景）。

**坑**：
- 槽名格式统一 `page-slot`（乱命名找不到）；读档前 `renpy.can_load` 检查
- 存档里别放不可 pickle 数据（会静默失败/损坏档）
- 读档后界面可能停在旧状态——需要 `renpy.retain_after_load()` 保留关键显示对象
- FileAction 是"空存有读"，想"永远存/永远读"用 FileSave/FileLoad
- 截图槽 `FileScreenshot` 需先 `FileTakeScreenshot()`（或存时自动）才有图

## 块② Gallery 图鉴（00gallery.rpy 核验）

Gallery 类管**图片锁定/解锁 + 浏览**。**正确流程（源码核验，注意顺序）**：

```renpy
init python:
    g = Gallery()
    g.transition = dissolve                     # 进入/切换转场
    g.locked_button = "gallery_locked.png"      # 未解锁图（可选）
    g.hover_border = "gallery_hover.png"
    g.idle_border = "gallery_idle.png"

    g.button("bg1")                              # ① 创建按钮（当前上下文）
    g.image("bg lecturehall")                    # ② 加图（加到当前按钮，可多张=一组）
    g.image("bg meadow")
    g.unlock("bg lecturehall")                   # ③ 解锁条件：看到过这些图

screen gallery_screen():
    vbox:
        # ④ 按钮：make_button 返回 Button displayable（不是 action！）→ 用 add
        add g.make_button("bg1", "bg lecturehall")
        # 或：textbutton "图组2" action g.Action("bg2")
```

**关键语义（源码核验）**：
- `button(name)` 创建按钮（后续 image/unlock 作用于"当前按钮"）
- `image(*displayables)` 给当前按钮加图（多张 = 一个按钮浏览时组内切换）
- `unlock(*images)` 给当前按钮加解锁条件（"看到过这些图"）
- `Action(name)` 返回浏览 action（**要求 name 已 button() 创建，否则抛异常**）
- `make_button(name, unlocked, locked=None, ...)` **返回 Button 对象**：child=unlocked（解锁时按钮显示图）、insensitive_child=locked（锁图）、hover/idle_foreground（边框叠加）、style 默认 "empty"（不继承按钮边框）

**浏览**：Action 显示 `g.image_screen`（默认 `_gallery` 屏，接收 locked/displayables/index/count/gallery）：解锁显示图片列表、锁定显示"Image N of M locked"；幻灯片 `timer gallery.slideshow_delay action Return("next")`；导航 `gallery_navigation` 屏（prev/next/slideshow/return，`gallery.unlocked_advance` 只前进解锁图）；`key "game_menu" action gallery.Return()`。

**属性**：`transition`/`enter_transition`/`intra_transition`/`exit_transition`、`unlocked_advance`、`navigation`、`slideshow_delay`、`image_screen`（自定义浏览屏）、`span_buttons`（跨按钮连续浏览）。

**进阶**：`condition(表达式)`（条件解锁）、`allprior()`（通关解锁）、`get_fraction(name)`（"已看/总数"文字）。

## 块③ Music Room 音乐室（00musicroom.rpy 核验）

```renpy
init python:
    mr = MusicRoom(fadeout=1.0)                 # 参数：channel/fadeout/fadein/loop/single_track/shuffle
    mr.add("audio/1.ogg")                        # 播放过自动解锁（renpy.seen_audio）
    mr.add("audio/2.ogg", always_unlocked=True)  # 常开（无需播放过）

screen music_room_screen():
    vbox:
        textbutton "曲1" action mr.Play("audio/1.ogg")
        textbutton "曲2" action mr.Play("audio/2.ogg")
        textbutton "停止" action mr.Stop()
        textbutton "切换播放" action mr.TogglePlay()
```

**解锁机制（源码核验）**：**没有 unlock 方法**——曲目被播放过（`renpy.seen_audio(filename)`）自动解锁；或 `add(filename, always_unlocked=True)` 常开。

**参数**：`MusicRoom(channel="music", fadeout=0.0, fadein=0.0, loop=True, single_track=False, shuffle=False, stop_action=None)`——**默认用 music 通道**；要与剧情 BGM 隔离需传独立通道（如 `channel="music2"`）；`single_track` 与 `shuffle` 互斥。

**action**：`Play(filename=None)`（指定曲/当前曲/第一首解锁曲）、`Stop()`、`TogglePlay()`（没播→播第一首解锁，播着→停；选中态=正在播）、`Next()`/`Previous()`（需 playlist）。

## 块④ Achievement 成就（00achievement.rpy 核验）

```renpy
init python:
    achievement.register("ending_true")                  # 注册
    achievement.register("collector", stat_max=10)       # 进度型（stat_max 上限）

    def grant_ending():
        achievement.grant("ending_true")                 # 授予
        achievement.progress("collector", 5)             # 进度更新
        return achievement.has("ending_true")            # 查询
```

- **API**：`register(name, stat_max=None)`（注册，init 时）/`grant(name)`（授予）/`progress(name, complete)`（进度更新）/`clear(name)`/`has(name)`（查询）/`clear_all()`
- 成就数据**自动同步 persistent**（`persistent._achievements`，00achievement.rpy PersistentBackend 核验）+ Steam 后端（有 Steam 时）；未注册就 grant 会报错
- 显示：自定义成就屏用 `achievement.has()` 查状态渲染

## 坑（内容系统通用）

- **必须先注册再操作**：unlock/grant 的对象要先 `add`/`register`（否则报错或无效）
- **解锁时机放剧情节点**：`g.unlock`/`achievement.grant` 在"看到/达成"那一刻调用，别只在 init 里；MusicRoom 无需显式解锁（播放过自动）
- Gallery/MusicRoom 的图/曲名要和 `g.image`/`mr.add` 注册名一致
- 进度型成就 `progress(name, n)` 的 n 到 stat_max 自动 grant；`clear` 后进度重置
