# App Loop-ready Harness Loop

- 状态：已完成；真实 Photoshop / UXP host smoke 留给下一阶段单独 gate
- Scope owner：`apps/app`
- Shared context：`docs/ENGINEERING_CONTEXT.md`
- Authority decision：CLI surface contract loop 已完成；本 loop 已完成。当前 active loop 由根 `AGENTS.md` 声明。

## 目标

让 `apps/app` 进入可分派、可验证、可停止的 loop-ready 状态，为下一阶段 Photoshop / UXP 联合调试做准备。

本 loop 已完成 mock-only harness、contract tests 与默认 validator 收口；不授权业务重构、不授权 UI 改版、不授权真实 provider smoke 进入默认测试。

## 当前决策

- `apps/app/SPEC.md` 是当前 app contract 与模块边界权威。
- `apps/app/STATUS.md` 是当前实现状态、限制、下一步验证权威。
- `docs/TESTING.md` 是测试入口权威。
- `apps/app/dcos/` 与 `apps/app/prototype/` 只作设计和历史参考；不能覆盖 `AGENTS.md`、`SPEC.md`、`STATUS.md`、`docs/TESTING.md`。
- `APP-HOST-SMOKE-P0` 选择 Option B：先补 fake UXP module / host adapter 单元测试和静态 validator，再进入真实 Photoshop / UXP 联调。

## 当前非目标

- 不新增复杂 loop runner。
- 不新增 app-local `TESTING.md`。
- 不把真实 Photoshop / UXP、真实 provider、真实 credentials 或外网访问放进默认测试。
- 不把 `batchPlay(placeEvent)`、UXP data folder 持久化、manifest domain 策略写成已完成真实 host 验证。
- 不更改 UI 视觉设计、host bridge 行为或 application/session contract，除非后续执行切片明确授权。

## 已完成切片

1. App contract tests：已锁定 MainPage workflow 分流、attachment、writeback、History、SettingsDetail 的用户可见行为。
2. Fake UXP host adapter harness：已用 fake UXP modules 覆盖 profile repository、secret storage、job history、asset store、Photoshop host bridge 的关键路径。
3. Validator / CI：继续复用现有 `pnpm validate` 与 `pnpm check:policy`，未新增复杂 validator 或 app-local testing 文档。
4. Review scoring：总体验收已通过；真实 Photoshop / UXP host smoke 仍不属于默认 gate。

## 停止条件

- 需要真实 Photoshop / UXP 才能确认的行为，不在本 loop 内写成事实。
- 需要真实 provider、credentials、外网或费用的验证，不进入默认测试。
- 发现 `apps/app` 需要直接依赖 `@imagen-ps/core-engine`、`@imagen-ps/providers` 或 `@imagen-ps/cli` 时停止。
- 发现 application/session contract 需要变化时，先回到共享层设计，不在 app 内私自补语义。
