## ADDED Requirements

### Requirement: assertSerializable validates cross-boundary data
The system SHALL provide an `assertSerializable` function that validates whether a value can be safely serialized across package boundaries.

#### Scenario: assertSerializable accepts plain objects and primitives
- **WHEN** `assertSerializable` is called with a plain object, array, string, number, boolean, or null
- **THEN** it SHALL return without throwing

#### Scenario: assertSerializable rejects functions
- **WHEN** `assertSerializable` is called with a function
- **THEN** it SHALL throw a `JobError` with `category` set to `'validation'`

#### Scenario: assertSerializable rejects symbols
- **WHEN** `assertSerializable` is called with a symbol
- **THEN** it SHALL throw a `JobError` with `category` set to `'validation'`

#### Scenario: assertSerializable rejects undefined in object values
- **WHEN** `assertSerializable` is called with an object containing `undefined` as a property value
- **THEN** it SHALL throw a `JobError` with `category` set to `'validation'`

#### Scenario: assertSerializable rejects circular references
- **WHEN** `assertSerializable` is called with an object that contains a circular reference
- **THEN** it SHALL throw a `JobError` with `category` set to `'validation'`

### Requirement: assertImmutable provides shallow immutability protection
The system SHALL provide an `assertImmutable` function that ensures a value is treated as immutable at the boundary.

#### Scenario: assertImmutable freezes objects
- **WHEN** `assertImmutable` is called with a plain object
- **THEN** it SHALL return the object after applying `Object.freeze`
- **AND** the return type SHALL be `Readonly<T>`

#### Scenario: assertImmutable freezes arrays
- **WHEN** `assertImmutable` is called with an array
- **THEN** it SHALL return the array after applying `Object.freeze`
- **AND** the return type SHALL be `Readonly<T>`

#### Scenario: assertImmutable passes through primitives
- **WHEN** `assertImmutable` is called with a primitive value (string, number, boolean, null)
- **THEN** it SHALL return the value unchanged

### Requirement: safeStringify provides debug-safe serialization
The system SHALL provide a `safeStringify` function for logging and debugging that does not throw on unserializable values.

#### Scenario: safeStringify handles circular references
- **WHEN** `safeStringify` is called with an object containing a circular reference
- **THEN** it SHALL return a JSON string without throwing
- **AND** circular references SHALL be replaced with a placeholder (e.g., `"[Circular]"`)

#### Scenario: safeStringify handles BigInt
- **WHEN** `safeStringify` is called with an object containing a `BigInt`
- **THEN** it SHALL return a JSON string without throwing
- **AND** the `BigInt` value SHALL be converted to a string representation

### Requirement: Invariant guards are host-agnostic and exported
All invariant guard functions SHALL remain host-agnostic and be exported from the module entry point.

#### Scenario: Guards contain no host-specific types
- **WHEN** inspecting `assertSerializable`, `assertImmutable`, or `safeStringify`
- **THEN** they SHALL NOT reference `Document`, `Layer`, `Window`, `FileSystem`, or network types

#### Scenario: Guards are exported from module root
- **WHEN** a consumer imports from `@imagen-ps/core-engine`
- **THEN** it SHALL be able to access `assertSerializable`, `assertImmutable`, and `safeStringify`
- **AND** the module SHALL compile without errors after the export update
