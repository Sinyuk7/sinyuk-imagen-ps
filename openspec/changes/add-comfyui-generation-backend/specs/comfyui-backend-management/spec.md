## ADDED Requirements

### Requirement: ComfyUI 必须作为一个 GenerationBackend 注册
Application MUST注册单一 `ComfyUiGenerationBackend`，Core MUST注册单一 `ComfyUiExecutionAdapter`。API Graph与Frontend Queue MUST是该backend内部drivers；它们 MUST不创建平行Session、TaskStore、History或result pipeline。

#### Scenario: 选择不同workflow source
- **WHEN**用户分别选择API Graph workflow与Frontend workflow
- **THEN**Application MUST通过同一GenerationBackend admission与同一Job/Task lifecycle提交，并仅在ComfyUiExecutionAdapter内部选择driver

### Requirement: Generation target selection 必须保持最小联合形状
UI MUST把 Provider targets 与 ComfyUI targets 视为同一 `GenerationTargetSelection` 联合，但只允许最小可区分字段。Provider target MAY保留其既有 provider identity；ComfyUI target MUST只保留 `workflowId`，其 `connectionId` 与 `source` MUST由已选择 workflow 反推。删除、失效或 readiness 失败时 MUST清空当前 selection，且 MUST不自动替换为其它 target。

#### Scenario: 选择 ComfyUI workflow
- **WHEN**用户选择一个 ComfyUI workflow target
- **THEN**selection MUST仅记录workflowId，且 MUST从workflow repository 反推connectionId与source

#### Scenario: 当前 target 失效
- **WHEN**当前选中 target 被删除或 readiness 失败
- **THEN**Application MUST清空当前 selection，并等待用户显式选择新的合法 target

### Requirement: CHANGE-01 contract 必须保持冻结
CHANGE-02 MUST不修改 `Job`、`ExecutionRef`、`ExecutionAdapter`、`GenerationBackend`、Session queue或Task lifecycle public contract。若ComfyUI实现需要这些修改，implementation MUST停止并重新打开CHANGE-01。

#### Scenario: ComfyUI driver需要新增Core字段
- **WHEN**实现发现driver需要Core理解graph、promptId、Canvas或backend error
- **THEN**CHANGE-02 MUST停止，且 MUST不把该字段添加到Job或ExecutionContext

### Requirement: Connection repository 必须保存bounded safe config
Application MUST提供ComfyUI connection list/get/save/delete/test contract。Persisted record MUST只包含stable id、display name、canonical origin、bounded timings与non-secret settings；MUST拒绝userinfo URL、fragment、unsupported scheme、control chars与secret-shaped fields。

V1产品connection record MUST不保存username/password形式的credentials、raw auth header、query secret或其他resolved credential values。仅用于live gate/test setup的owner-local SSH target name MAY存在于运行时环境或本地别名，MUST不写入持久化record或OpenSpec。

#### Scenario: 保存合法connection
- **WHEN**用户保存canonical HTTPS origin与合法timings
- **THEN**repository MUST持久化sanitized record并允许Chrome/UXP adapter重新加载

#### Scenario: URL包含credentials
- **WHEN**origin包含username、password或secret query value
- **THEN**save MUST在network call前失败，且 error/log MUST不回显credential

### Requirement: Connection readiness 必须按source验证
Connection test MUST验证bounded health response。API Graph readiness MUST要求server/API capability；Frontend readiness还 MUST要求compatible Bridge status、page handshake、pinned frontend/core/contract versions与native Queue capability。

两个source的workflow readiness MUST把任何包含`mask` entry的canonical contract标记为`not-ready/workflow`。Parser/validator MAY保留并验证mask vocabulary，但当前Change的admission MUST在Task dispatch、asset resolution、upload或submission前fail closed。

#### Scenario: API可用但Bridge不可用
- **WHEN**ComfyUI API health成功但Bridge handshake失败
- **THEN**API Graph workflow MAY保持runnable，Frontend workflow MUST fail closed

#### Scenario: Contract包含mask entry
- **WHEN**API Graph或Frontend workflow的canonical contract包含`mask` role
- **THEN**workflow readiness MUST返回`not-ready/workflow`，且 MUST不创建dispatch、解析asset、upload或submit

### Requirement: Workflow repository 必须区分两种source
Workflow repository MUST持久化stable workflow id、display name、connection id、source discriminant与validated workflow contract。API Graph source MUST保存 bounded immutable graph snapshot，并在保存时 deep-clone / freeze；Frontend source MUST只保存canonical remote path，MUST不保存frontend JSON、Canvas、compiled graph或load/client identity。

#### Scenario: Import API Graph
- **WHEN**用户导入合法bounded API Format workflow与valid contract
- **THEN**repository MUST保存deep-cloned graph snapshot并在admission重新验证contract targets

#### Scenario: API Graph bounds
- **WHEN**用户导入API Graph workflow
- **THEN**import MUST拒绝超过 `2MB`、`2000` nodes、`32` depth、`128` nodeId length 或 `256` class name length 的输入，且 MUST拒绝非纯数据结构

#### Scenario: 保存Frontend workflow
- **WHEN**用户从Bridge discovery选择remote workflow
- **THEN**repository MUST保存canonical relative path和contract，且 MUST不复制remote workflow内容

### Requirement: Frontend discovery 必须返回bounded canonical identity
Bridge discovery MUST只返回bounded relative workflow paths与contract summary。Absolute path、traversal、encoded separator、control chars、oversized path或entry overflow MUST拒绝。Refresh MUST不自动选择、rename或删除当前target。

#### Scenario: Nested remote workflow
- **WHEN**Bridge返回合法nested workflow path
- **THEN**Application MUST创建stable identity并保留canonical relative path
