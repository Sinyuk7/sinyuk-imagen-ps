## ADDED Requirements

### Requirement: FileConfigAdapter 实现

`FileConfigAdapter` SHALL 实现 `ConfigStorageAdapter` 接口，将 provider 配置持久化到本地文件系统。

配置文件路径 SHALL 为 `~/.imagen-ps/config.json`。

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
- **AND** 临时文件可被后续操作清理
