/**
 * @ui-builder/components — the built-in library's specs and the registry over them.
 *
 * Dependency direction (PLAN.md §2): schema <- components <- runtime <- web.
 * This package may import from `@ui-builder/schema` and nothing else in the repo.
 *
 * **This entry point is data.** A `ComponentSpec` describes a component — its props, its
 * defaults, the markup it exports as — without being one, so the code generator and the
 * API behind it can read the whole library without React or lucide coming with it. The
 * React implementations are `@ui-builder/components/react`, joined back to a spec by
 * `key`. Importing them from server code is then a visible act rather than an accident.
 */

export * from './spec.js';
export * from './derive.js';
export * from './emit.js';
export * from './css.js';
export * from './markdown.js';
export * from './registry.js';
export * from './symbols.js';
export * from './runtime.js';

export { AvatarSpec } from './specs/Avatar.js';
export { BadgeSpec } from './specs/Badge.js';
export { BoxSpec } from './specs/Box.js';
export { ButtonSpec } from './specs/Button.js';
export { CardSpec } from './specs/Card.js';
export { ChatMessageSpec } from './specs/ChatMessage.js';
export { ChatThreadSpec } from './specs/ChatThread.js';
export { CheckboxSpec } from './specs/Checkbox.js';
export { DatePickerSpec } from './specs/DatePicker.js';
export { DividerSpec } from './specs/Divider.js';
export { FooterSpec } from './specs/Footer.js';
export { GridSpec } from './specs/Grid.js';
export { HeaderSpec } from './specs/Header.js';
export { HeadingSpec } from './specs/Heading.js';
export { ImageSpec } from './specs/Image.js';
export { InputSpec } from './specs/Input.js';
export { LinkSpec } from './specs/Link.js';
export { PromptInputSpec } from './specs/PromptInput.js';
export { RadioSpec } from './specs/Radio.js';
export { RichTextSpec } from './specs/RichText.js';
export { SelectSpec } from './specs/Select.js';
export { SideNavSpec } from './specs/SideNav.js';
export { SliderSpec } from './specs/Slider.js';
export { SpacerSpec } from './specs/Spacer.js';
export { HStackSpec, VStackSpec } from './specs/Stack.js';
export { SwitchSpec } from './specs/Switch.js';
export { TableSpec } from './specs/Table.js';
export { TextSpec } from './specs/Text.js';
export { TextareaSpec } from './specs/Textarea.js';
export { TypingIndicatorSpec } from './specs/TypingIndicator.js';
