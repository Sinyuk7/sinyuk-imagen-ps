# UI Main Page — Sinyuk Imagen PS

## 当前适用范围

本文件继续有效，但属于后续 UXP UI 阶段参考，不属于当前 change 的交付 gate。

当前 change 先验证业务核心、thin facade 和 CLI。
UI 真正接入时，应直接复用 shared facade，而不是通过外部 CLI 进程通信。

## 文档目的

本文件只定义主页面 UI，不定义 runtime 内部实现。

它回答的是：

- 主页面长什么样
- 一轮对话怎么呈现
- UI 在不同状态下怎么表现
- UI 层只依赖哪些 UI-facing 数据

它不回答的是：

- job store 怎么实现
- 事件总线怎么实现
- 是否有队列
- 状态机内部怎么落

## 页面定位

主页面不是 launcher，不是欢迎页，也不是 gallery。

主页面是一个看起来像聊天窗口的单线程任务系统：

- `我` 发送一条请求
- `provider` 返回一条回复
- 在 `provider` 回复前，不能继续发送下一条

## 窗口比例

- 设计基准窗口比例：`1:1` 到 `1:1.618`
- 更接近插件工作窗，而不是手机长屏

## 页面结构

主页面固定分成三块：

1. Header
2. Conversation
3. Composer

### Header

包含：

- 左侧轻量导航入口
- 中间标题或当前 provider / model 摘要
- 右侧 settings 入口

要求：

- chrome 尽量少
- 不做大 banner
- 不占用主工作区

### Conversation

这是页面主体。

默认显示历史回合，而不是欢迎页。

一个回合由两条消息组成：

1. `我` 的请求消息
2. `provider` 的回复消息

### Composer

固定在底部，永远可见。

包含：

- prompt 输入
- 图片附件入口
- provider / model 的当前选择
- 主发送动作

## 消息结构

### `我` 的消息

必须包含：

- prompt 文本
- `Copy Prompt`
- 输入图片组缩略图
- 时间信息

规则：

- prompt 默认折叠为 2 到 4 行
- 不提供常驻展开
- 输入图片组以缩略图 strip 呈现
- 1 张或多张都按同一视觉模型处理

### `provider` 的消息

必须包含：

- provider / model 身份信息
- 当前状态或结果
- 单张结果图预览

规则：

- `v1` 只考虑单图回复
- 返回图像按“回复消息”呈现，不按 gallery 呈现
- 图像只承担预览作用，不要求全尺寸铺开

## UI 表现状态

这里只定义表现，不定义内部状态机。

### Idle

- 页面可用
- 若没有历史记录，显示极轻量空状态
- composer 可输入

### Submitting / Running

- 先落一条 `我` 的消息
- 紧接着出现一条 `provider` loading reply
- composer 全量禁用
- 显示清晰的 running 反馈和 elapsed time

### Success

- loading reply 被结果图预览替换
- 保留 provider / model 元信息
- 可出现 `Retry`、`Save` 等后续动作

### Failure

- 回复位置显示结构化错误
- 当前回合保留在流中
- 用户可从这一轮重新发起

## UI-Facing Data Boundary

UI 不应该直接消费 runtime 内部结构，也不应该自己理解 provider 业务语义。

UI 当前只依赖这些概念层数据：

- `header`
- `conversationRounds`
- `composer`
- `pageState`

### Header

- `title`
- `providerLabel`
- `modelLabel`
- `settingsEntryVisible`

### Conversation Round

- `roundId`
- `requestMessage`
- `replyMessage`

### Request Message

- `role`
- `promptText`
- `promptCollapsed`
- `inputThumbnails`
- `timestampLabel`
- `copyEnabled`

### Reply Message

- `role`
- `status`
- `providerLabel`
- `modelLabel`
- `elapsedLabel`
- `previewImage`
- `errorMessage`
- `actions`

### Composer

- `promptDraft`
- `attachedImages`
- `providerLabel`
- `modelLabel`
- `isDisabled`
- `submitEnabled`

## 明确不做

- 不在这里定义 engine API
- 不在这里定义 job queue
- 不在这里定义 cancellation
- 不在这里定义 runtime event ordering
- 不在这里定义 Photoshop writeback 技术细节
