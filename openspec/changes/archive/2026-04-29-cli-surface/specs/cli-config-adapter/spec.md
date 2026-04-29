## ADDED Requirements

### Requirement: FileConfigAdapter 实现

`FileConfigAdapter` SHALL 实现 `ConfigStorageAdapter` 接口，将 provider 配置持久化到本地文件系统。

配置文件路径 SHALL 为 `~/.imagen-ps/config.json`。实现 SHALL 使用 Node.js `os.homedir()` 解析 home 目录，并在其下拼接 `.imagen-ps/config.json`，不得依赖 shell 对 `~` 的展开。

文件格式 SHALL 为：
```json
{
  "version": 1,
  "providers": {
    "<providerId>": { ...ProviderConfig }
  }
}
```

#### Scenario: 首次保存配置
- **WHEN** 调用 `adapter.save('mock', config)` 且配置文件不存在
- **THEN** 创建 `~/.imagen-ps/` 目录（如不存在）
- **AND** 创建 `config.json` 文件
- **AND** 写入配置

#### Scenario: 更新已有配置
- **WHEN** 调用 `adapter.save('mock', newConfig)` 且配置文件已存在
- **THEN** 读取现有文件
- **AND** 更新对应 provider 的配置
- **AND** 写入文件（保留其他 provider 配置）

#### Scenario: 获取已保存配置
- **WHEN** 调用 `adapter.get('mock')` 且该 provider 配置已保存
- **THEN** 返回对应的 `ProviderConfig`

#### Scenario: 获取未保存配置
- **WHEN** 调用 `adapter.get('nonexistent')` 且该 provider 配置未保存
- **THEN** 返回 `undefined`

#### Scenario: 配置文件不存在时获取
- **WHEN** 调用 `adapter.get('mock')` 且配置文件不存在
- **THEN** 返回 `undefined`
- **AND** MUST NOT 抛出异常

---

### Requirement: CLI 启动时注入 FileConfigAdapter

CLI 入口 SHALL 在执行命令前调用 `setConfigAdapter(fileConfigAdapter)` 注入文件系统 adapter。

#### Scenario: CLI 启动注入 adapter
- **WHEN** 用户执行任意 CLI 命令
- **THEN** CLI 先创建 `FileConfigAdapter` 实例
- **AND** 调用 `setConfigAdapter(adapter)` 注入
- **AND** 然后执行实际命令

---

### Requirement: 配置文件原子写入

`FileConfigAdapter` 的写操作 SHALL 使用原子写入策略，避免写入中断导致文件损坏。

#### Scenario: 原子写入
- **WHEN** 调用 `adapter.save()` 写入配置
- **THEN** 先写入临时文件 `config.json.tmp`
- **AND** 写入成功后 rename 为 `config.json`

#### Scenario: 写入中断恢复
- **WHEN** 写入过程中断（进程退出）
- **THEN** 原有 `config.json` 保持不变
- **AND** 残留的 `config.json.tmp` 不得被 `get()` 当作有效配置读取

#### Scenario: 清理残留临时文件
- **WHEN** 下次调用 `adapter.save()` 且检测到残留的 `config.json.tmp`
- **THEN** adapter SHALL 先删除该临时文件
- **AND** 然后执行新的原子写入流程

---

### Requirement: 文件系统错误处理

`FileConfigAdapter` SHALL 将文件系统错误作为异常抛出，不在 adapter 内吞掉错误。CLI 命令层 SHALL 捕获这些异常，并将其转换为 stderr JSON 与非零 exit code。

#### Scenario: 权限不足
- **WHEN** `adapter.get()` 或 `adapter.save()` 遇到权限错误（如 `EACCES` / `EPERM`）
- **THEN** adapter SHALL 抛出异常
- **AND** CLI SHALL 输出 JSON 错误到 stderr
- **AND** exit code SHALL 为 1

#### Scenario: 磁盘空间不足
- **WHEN** `adapter.save()` 写入过程中遇到磁盘空间不足（如 `ENOSPC`）
- **THEN** adapter SHALL 抛出异常
- **AND** 已存在的 `config.json` SHALL 尽可能保持不变
- **AND** CLI SHALL 输出 JSON 错误到 stderr
- **AND** exit code SHALL 为 1

#### Scenario: 配置目录路径被文件占用
- **WHEN** 需要创建 `~/.imagen-ps/` 目录但该路径已存在且不是目录
- **THEN** adapter SHALL 抛出异常
- **AND** CLI SHALL 输出 JSON 错误到 stderr
- **AND** exit code SHALL 为 1
