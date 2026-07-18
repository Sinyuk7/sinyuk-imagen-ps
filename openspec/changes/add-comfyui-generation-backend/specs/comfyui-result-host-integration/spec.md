## ADDED Requirements

### Requirement: Known prompt outputs必须通过shared history/view collector
两个drivers MUST从acknowledged promptId进入同一collector。Collector MUST验证history/queue response bounds，只选择contract声明的ordered output nodes，并校验每个view descriptor的path/type安全性。

#### Scenario: Ordered multiple outputs
- **WHEN**history在contract output nodes返回多张图片
- **THEN**collector MUST按contract/node/image稳定顺序下载并产生ordered result assets

#### Scenario: Unsafe descriptor
- **WHEN**history descriptor包含absolute path、traversal、control char或unsupported type
- **THEN**collector MUST跳过或失败该output按bounded policy处理，且 MUST不请求unsafe `/view` URL

### Requirement: Downloaded outputs必须进入现有AssetStore与TaskOutput
`/view` response MUST验证HTTP status、byte limit、supported image MIME与signature。Validated bytes MUST写入existing AssetStore并由`ComfyUiGenerationBackend.projectTerminal()`形成shared TaskOutputs；MUST不创建ComfyUI result cache/history。

#### Scenario: 成功output projection
- **WHEN**collector下载并验证图片bytes
- **THEN**同一Task MUST完成并通过StoredAssetRefs支持existing Preview、Download与retention

### Requirement: Photoshop Placement必须复用existing app/host owner
ComfyUI result MUST使用Task中既有`TaskPlacement`进入same target resolution与writeback path。Driver、Bridge与ComfyUI server MUST不决定Photoshop document/layer placement，也 MUST不创建第二份placement evidence。

#### Scenario: Exact-frame Photoshop input
- **WHEN**Task保留valid exact-frame evidence且output满足existing geometry guard
- **THEN**Photoshop host MUST通过same placement path写回目标frame

#### Scenario: Placement evidence不足
- **WHEN**Task只有document-only或unbound evidence
- **THEN**App MUST沿用existing degrade/no-auto-write behavior，且 MUST不因backend为ComfyUI改变规则

### Requirement: History UI必须backend-neutral
ComfyUI Task MUST只使用CHANGE-01的generic backend/connection/target summary、status、prompt、attachments、outputs、error与timestamps。History、Preview、Download、Retry与Place actions MUST不依赖ComfyUI driver-specific字段。

#### Scenario: API与Frontend Task并列显示
- **WHEN**History同时加载API Graph与Frontend Queue完成的Tasks
- **THEN**两者 MUST通过同一view model渲染，且driver kind MUST不改变resource actions

### Requirement: ComfyUI retry policy必须防止重复remote execution
Submission call开始前的deterministic prepare/upload failure MAY通过backend Retry创建same Task/new Job。任何`POST /prompt`或native Queue call已经开始、receipt unknown或remote may continue状态 MUST禁用generic Retry；再次执行 MUST创建new Task、new Job与remote operation identity。

Remote may continue MUST只投影为generic `TaskError.details.remoteMayContinue: true`与bounded error code，MUST不向TaskRecord添加ComfyUI-specific top-level字段。

#### Scenario: Pre-submission failure
- **WHEN**deterministic failure发生在任何generation submission call开始前
- **THEN**backend MAY允许same Task/new Job Retry，且 MUST保持零`/prompt`与零native Queue

#### Scenario: Frontend receipt unknown
- **WHEN**native Queue可能成功但receipt丢失
- **THEN**Task MUST失败为unknown state、标记remote may continue且 MUST不提供replay旧operation的action

#### Scenario: App reload after unknown receipt
- **WHEN**页面重载或重启发生在receipt unknown之后
- **THEN**Task MUST恢复为 interrupted/remote may continue 的只读历史事实，且 MUST不尝试 recovery replay 或自动补跑

### Requirement: Deterministic与real-host gates必须分层
Default validation MUST使用mock-only contract/scenario tests且不得访问real network。Owner-local AutoDL live harness MUST分别证明API Graph与Frontend Queue的real image-only vertical flow；Photoshop UXP manual gate MUST证明real capture、WebView/Bridge、history/view、placement与cleanup。Mask runtime及其live/UXP proof MUST由后续Change负责，不属于当前Change acceptance gate。Chrome evidence MUST不替代UXP evidence。

Owner-local live harness MAY使用local SSH alias或environment-bound target name访问AutoDL，但 MUST不把resolved credentials、endpoint secrets或generated payload写入tracked files。

#### Scenario: Default CI
- **WHEN**运行`pnpm validate`
- **THEN**所有ComfyUI tests MUST使用fakes/mocks且 MUST不读取owner credentials或访问AutoDL

#### Scenario: AutoDL Chrome vertical proof
- **WHEN**显式运行owner-local live gate
- **THEN**API与Frontend各自 MUST使用不含mask entry的workflow完成connection -> contract -> image upload -> one submission -> history/view -> TaskOutput流程

#### Scenario: Photoshop UXP manual proof
- **WHEN**在real Photoshop/UXP Developer Tool执行manual smoke
- **THEN**必须使用不含mask entry的workflow记录panel/WebView lifecycle、real image materialization、submission、output placement、reload/destroy与cleanup证据

### Requirement: Live credentials与artifacts不得进入仓库
仓库不得持有AutoDL SSH password、fixed endpoint values、auth headers、workflow payload、generated images或raw remote logs；这些内容 MUST仅保存在owner-local approved storage/environment，MUST不写入OpenSpec、canonical docs、fixtures、Task records或git-tracked files。

#### Scenario: 记录live gate配置
- **WHEN**文档或test harness引用owner-local AutoDL target
- **THEN**它 MUST只引用environment variable或local alias名称，不得包含实际secret或fixed credential value
