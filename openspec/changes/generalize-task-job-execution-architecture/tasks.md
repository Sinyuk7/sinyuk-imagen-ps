## 1. 冻结现有行为

- [x] 1.1 在现有测试中收敛 Provider submit、retry、queue、billing、terminal Task write、History、Preview、Download 与 Placement characterization cases，记录复用的fixtures与Case Bank入口。
- [x] 1.2 在 `packages/core-engine/src/contract.test.ts` 与 `packages/core-engine/src/scenario.test.ts` 冻结Job lifecycle、Workflow binding、dispatch routing、logger/AbortSignal与immutable handoff基线，并迁移后删除重复窄测试文件。
- [x] 1.3 在 `packages/application/src/session.contract.test.ts` 与 `packages/application/src/use-cases.scenario.test.ts` 冻结FIFO、global/per-profile concurrency、same-tick dedupe、queued removal、reload/dispose drop、Retry与Regenerate基线。
- [x] 1.4 在既有app suites冻结Task History label、missing/evicted resource、Preview、Download与Photoshop Placement行为，不复制UI test suite。

## 2. 泛化 Core execution kernel

- [x] 2.1 定义并导出`ExecutionRef`、`ExecutionContext`、`ExecutionAdapter`与`ExecutionDispatcher`，移除Provider-named Core dispatch exports。
- [x] 2.2 将executable Workflow step收敛为static `kind: 'execution'`与`adapter`，删除`transform/io` public step kinds及从input/name猜测adapter的路径。
- [x] 2.3 将Core Dispatcher的unknown adapter与非法caller input映射为`validation`，将非结构化adapter/runner failure映射为新增`execution`，并保留structured `JobError` category。
- [x] 2.4 在Job submit、dispatch handoff、`afterStepResult`之后及terminal store之前验证serializability与secret-free boundary；非法adapter output必须失败且不得写入partial final output。
- [x] 2.5 更新registry、runner、runtime与store，使adapter只调用一次、Workflow output按序handoff、AbortSignal不触发automatic replay。
- [x] 2.6 完成`packages/core-engine/src/contract.test.ts`与`scenario.test.ts`的unknown adapter、invalid output、secret output、multi-step handoff与abort cases。

## 3. 原子迁移 Application-owned Task v2

- [x] 3.1 将完整Task domain types、validator、resource/evidence helpers、TaskStore port与task-history commands迁移到`packages/application`；`StoredAssetRef`与Job types保留在`core-engine`。
- [x] 3.2 定义`TaskRecord schemaVersion: 2`、generic `backend/connection/target` summary、`latestJobId`、`TaskAttachment.executionInput`，并删除Provider-shaped output source identity。
- [x] 3.3 让`decodeTaskRecord()`只接受v2并把v1返回为`unknown-schema`；不得添加migration、dual-write、legacy alias或旧字段fallback。
- [x] 3.4 原子迁移Application runtime、Chrome IndexedDB、UXP task-history storage及所有Task producers/consumers，然后删除Core Task exports与Provider-shaped Task fields。
- [x] 3.5 更新`apps/app/src/shared/domain/task-snapshot.ts`、`task-actions.ts`、History view model与resource resolver consumers，保持Preview、Download、missing/evicted与Placement行为。
- [x] 3.6 添加Task v2 decode/reject、generic labels、resource resolution、terminal materialization failure与restart interrupted scenarios。
- [x] 3.7 建立Task v2 cutover gate：验证Chrome/UXP fresh v2 round-trip与v1 `unknown-schema`，并扫描确认不存在v1 writer、Provider-shaped字段fallback或compatibility alias。

## 4. 建立 GenerationBackend 与 Provider execution bridge

- [x] 4.1 在Application定义并导出`GenerationCommand`、`JobExecutionRequest`、`ExecutionLane`、`ReadinessDecision`、`GenerationRetryPolicy`、`AdmittedGeneration`及terminal/retry/follow-up inputs。
- [x] 4.2 校验admitted data为immutable、serializable、secret-free，且taskId、v2 running Task、lane与retry policy一致；非法admission必须在queue publication前失败。
- [x] 4.3 实现Provider `GenerationBackend.admit()`，集中profile enabled、implementation selection、model/output resolution、canonical request、prepared `StoredAssetRef`、per-profile lane cap `2`与retry policy。
- [x] 4.4 将Provider execution bridge注册为stable `ExecutionAdapter`；只按admitted implementation id lookup exact Provider，并执行request validation、invoke及error mapping。
- [x] 4.5 注入dispatch-time config/secret resolver，以non-secret profile ref解析当前credential；resolved values不得缓存或进入Job、Task、params clone、output、error与logs。
- [x] 4.6 将Provider terminal Task projection与billing follow-up迁入同一个Provider `GenerationBackend`，保持Provider implementations、registry、transport与wire contracts不变。

## 5. 泛化 Session orchestration

- [x] 5.1 将Session改为只消费registered `GenerationBackend`返回的admitted submissions，不读取profile、model、connection、billing或backend result字段。
- [x] 5.2 实现global cap `5`与optional declared lane `{key,maxConcurrency}`；Provider保持per-profile cap `2`，无lane submission只受global cap。
- [x] 5.3 在出队后、Job创建前调用`checkReadiness()`：`ready`继续，`wait`保留queued并在下一scheduler wake-up重检，`reject`返回bounded admission failure且不创建Job/Task/remote side effect。
- [x] 5.4 建立Application-only `TaskJobCorrelation` sidecar；Job创建后bind `taskId/jobId/backendId/admitted`，再写含`latestJobId`的running Task，禁止通过`__clientTaskId/__clientRoundId`路由terminal event。
- [x] 5.5 为每个jobId实现terminal once guard，并按`projectTerminal -> persist terminal Task -> afterTerminal`顺序执行；完成后释放active correlation entry。
- [x] 5.6 在projector/materialization失败时从running snapshot写入bounded failed Task；`afterTerminal`失败只写sanitized log，不改变Job/Task主结果。
- [x] 5.7 保持FIFO、dedupe、queued removal、reload/dispose drop、event publication、Retry same Task/new Job与Regenerate new Task/new Job行为。

## 6. 迁移 App composition 与清理旧路径

- [x] 6.1 更新Application commands/runtime composition与builtin Provider workflows，使唯一链路为admit、queue、readiness、Job、Task projection与follow-up。
- [x] 6.2 更新Chrome/UXP composition和TaskStore/resource resolver type imports，不改变Composer、queue、History UI、host IO或用户copy。
- [x] 6.3 删除Provider-named Core aliases、parallel submit/dispatch path、旧Task correlation与重复terminal projection helpers；不得保留长期compatibility layer。

## 7. 验证公共扩展点与行为等价

- [x] 7.1 使用test-only non-Provider fake `GenerationBackend`与`ExecutionAdapter`完成admit、queue、readiness、Job、terminal Task projection，并证明policy port不执行transport、execution port不读取Task/Session。
- [x] 7.2 运行`pnpm --filter @imagen-ps/core-engine test`、`pnpm --filter @imagen-ps/providers test`与`pnpm --filter @imagen-ps/application test`。
- [x] 7.3 运行app deterministic、Chrome fake与UXP fake suites，验证History、Preview、Download、Task persistence与Photoshop Placement parity。
- [x] 7.4 运行`pnpm check:policy`与`pnpm validate`；默认gate保持mock-only，不要求real Provider、ComfyUI或Photoshop manual smoke。
- [x] 7.5 对照`add-comfyui-generation-backend`执行stop-rule review；若仍需修改Job、Workflow execution、`GenerationBackend`、Session queue或Task lifecycle contract，则重新打开CHANGE-01。
