## ADDED Requirements

### Requirement: 实际输出尺寸 authority
Photoshop placement MUST 以返回图片解码得到的实际 width/height/format 为输出事实，不得依赖预先生成的输出矩阵或假定尺寸。

#### Scenario: Provider 返回图片
- **WHEN** provider 结果被 materialize 为图片 Asset
- **THEN** placement 使用该 Asset 的实际尺寸和现有 document/frame evidence

### Requirement: 公共输入与 Mask
Photoshop 输入图像和 canonical Mask MUST 在公共 host-neutral domain 中准备，provider adapter 只能转换它们以适配自身协议。

#### Scenario: GRSAI 与 RunningHub 使用同一 Mask
- **WHEN** 用户提交同一 PS Mask 到不同 provider
- **THEN** 两个 adapter 可以使用不同上传/字段格式，但 Mask 语义和 primary binding 保持一致
