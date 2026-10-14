## 1. Catalog 与账号基础

- [x] 1.1 将参考项目的 RunningHub catalog 和 GRSAI 模型/参数配置复制或同步到 `packages/providers/catalog/`，记录来源、版本和同步校验命令
- [x] 1.2 定义 catalog schema、固定 `grsai`/`runninghub` provider identity、模型 operation、输入限制和基础参数 choice 类型
- [x] 1.3 实现只读 catalog loader 与校验，覆盖重复 ID、无效默认值、空参数、非法组合和发布资源缺失
- [ ] 1.4 将 provider account storage 收敛为每个 provider 一条 API Key 记录，删除多 Profile lifecycle 的新入口，并补充 repository fake/contract tests

## 2. 公共生成请求与 provider adapter

- [ ] 2.1 定义 host-neutral `GenerationRequest`、catalog parameter values、canonical input Asset/Mask 和统一 provider result，移除 `wireModelId`、`baseModelId`、`requestStrategyId` 等字段
- [ ] 2.2 实现 GRSAI adapter：catalog 校验、请求构建、`replyType: "async"`、submit/poll、结果下载和错误归一化
- [ ] 2.3 实现 RunningHub adapter：catalog endpoint 选择、图片/Mask 上传、请求构建、submit/poll/download 和错误归一化
- [ ] 2.4 保证 provider 付费 submit 一次性语义，复用 Application async manager 做 jobId 去重、取消和轮询预算
- [ ] 2.5 为两个 adapter 添加 request fixture、submit/poll fake、重复提交、取消、超时、响应异常和统一 result contract tests

## 3. Application 执行链重构

- [ ] 3.1 将 provider GenerationBackend admission 改为 providerId/modelId/catalog parameter 解析，移除 Profile-owned model repository 和 model config resolution
- [ ] 3.2 将 provider account/key resolver 接入 dispatch-time adapter，确保 secret 只在当前调用栈 materialize
- [ ] 3.3 保持统一 Job/Task、History、AssetStore、Preview、Download、billing 和 terminal error projection，补齐 provider lane regression tests
- [ ] 3.4 删除 `ProviderProfile`、`UserModelConfig`、default template initialization、setup/ready promotion、remote discovery/cache 和旧 model commands/ports/fixtures

## 4. App UI 与偏好

- [ ] 4.1 将 Provider Settings 改为固定 GRSAI/RunningHub 账号编辑入口，保存操作只更新对应 API Key
- [ ] 4.2 将主页面模型列表和基础参数控件改为 catalog projection，支持 GRSAI 组合尺寸选项与 RunningHub ratio/resolution 联动选项
- [ ] 4.3 将生成参数偏好按 `providerId + modelId` 保存，切换模型时回退非法值到 catalog 默认值
- [ ] 4.4 移除 Profile picker、model management、output matrix UI、矩阵 cell 选择和通用 endpoint/path/auth 编辑 surface；保留高级参数扩展点
- [ ] 4.5 更新共享 i18n、Chrome harness、UI contract tests 和 visual cases，覆盖未配置 provider、Key 更新、模型切换和动态参数空/错误状态

## 5. Photoshop、ComfyUI 与资源边界

- [ ] 5.1 保持 Photoshop 图层输入、canonical Mask、primary binding 和 provider adapter materialization 的边界，补充跨 provider Mask contract tests
- [ ] 5.2 删除输出矩阵驱动的 geometry projection，改为使用 materialized 图片实际 width/height/format 进入统一 Asset 和 placement 流程
- [ ] 5.3 为实际返回尺寸缺失、解码失败和尺寸不一致建立 bounded provider error/diagnostics tests，不伪造 geometry
- [ ] 5.4 验证 ComfyUI backend、workflow revision、Bridge、API Graph、Frontend Queue 和 connection switching 不依赖新的 provider catalog 协议

## 6. 清理、文档与验证

- [ ] 6.1 清理旧 ApiFormat/implementation/profile/model/matrix exports、host repositories、storage schema、fixtures 和无引用 transport
- [ ] 6.2 更新 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`、`packages/providers/AGENTS.md` 和 README 中的固定 provider、catalog、单账号与统一结果边界
- [ ] 6.3 运行 providers/application affected tests、catalog harness、app Chrome tests、TypeScript build、`pnpm check:policy` 和 `pnpm validate`
- [ ] 6.4 运行 `pnpm release:verify`，记录真实 Photoshop/UXP 验收为 user-owned gate，不由 agent 自动执行
