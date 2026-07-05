## ADDED Requirements

### Requirement: Image model output capability SHALL separate truth from recommended presets
The system SHALL represent image output capability as provider-owned truth that is distinct from recommended output presets. Capability records MUST describe what a model actually supports, while any preset list MUST be treated only as recommended entry points rather than the full capability set.

#### Scenario: Recommended options do not redefine capability truth
- **WHEN** a model supports a constrained but large output space such as legal `WIDTHxHEIGHT`
- **THEN** the capability record MUST describe the underlying geometry kind and constraints
- **AND** any recommended `Output Size` preset list MUST be treated as presentation data rather than the complete capability set

### Requirement: Output geometry SHALL use a discriminated union
The system SHALL model output geometry using a discriminated union rather than a single fixed `imageSize + ratio + outputFormat` matrix shape. In the first implementation, the union MUST support `flexible-pixels` and `ratio-resolution`.

#### Scenario: GPT-style pixel space uses flexible-pixels
- **WHEN** a model supports `auto` and legal `WIDTHxHEIGHT` values under documented pixel constraints
- **THEN** its capability MUST use `flexible-pixels`
- **AND** the capability MUST describe constraints such as pixel bounds, max edge, aspect ratio bounds, and multiple-of requirements

#### Scenario: Gemini-style native ratio and resolution uses ratio-resolution
- **WHEN** a model exposes `aspectRatio` and `resolution` as native provider geometry fields
- **THEN** its capability MUST use `ratio-resolution`
- **AND** the capability MUST preserve ratio and resolution as distinct truth-level dimensions

### Requirement: Capability SHALL support exact input size as an edit-derived geometry mode without creating a second output section
Capability records MUST be able to declare edit-only exact input size as a derived geometry mode. This mode MUST be attached to the same output geometry family rather than forcing a second output capability section.

#### Scenario: Exact input size is an edit-only derived mode
- **WHEN** a model supports reusing the input image size during `image_edit`
- **THEN** the capability MUST declare an edit-derived geometry mode for exact input size
- **AND** the capability MUST NOT require a separate top-level output module just to represent that mode

### Requirement: Edit input capability SHALL describe input and external mask facts only
Edit input capability SHALL describe only input file facts and external mask protocol facts, including accepted input formats, max image count, optional max bytes per image, and supported external mask capability. Request-builder behavior such as omitting provider parameters MUST NOT be encoded as edit input capability.

#### Scenario: Input fidelity behavior is not an edit capability fact
- **WHEN** a provider always uses one internal input fidelity mode and requires callers to omit an explicit request parameter
- **THEN** the capability MUST NOT represent that rule as a user-facing edit input capability field
- **AND** the behavior MUST instead belong to the builder or request strategy layer

#### Scenario: External mask capability describes alpha-image validation facts
- **WHEN** a provider supports an external alpha-mask image file that targets the first edited input
- **THEN** the capability MUST describe that protocol as `alpha-image`
- **AND** it MUST be able to express validation facts such as target image, allowed formats, max bytes, and same-dimension requirements

#### Scenario: OpenAI-style mask capability records minimal validation facts
- **WHEN** a provider requires an external mask image to be PNG, under 4 MB, applied to the first input image, and matched to that input's dimensions
- **THEN** the capability MUST be able to express `target = first-input`
- **AND** it MUST be able to express `formats = ['png']`
- **AND** it MUST be able to express the maximum allowed bytes
- **AND** it MUST be able to express `requiresSameDimensions = true`
