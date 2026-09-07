/**
 * The React half of the library: what a spec's `key` renders as, and the icon a spec's
 * `icon` name stands for.
 *
 * A spec is data (`spec.ts`) and holds neither, because a component and a `LucideIcon`
 * are both React — a registry carrying them puts React in every bundle that reads one,
 * the API's included, when all it wanted was the `emit` templates. So the two halves are
 * joined here, by name, and only the surfaces that actually render something import this
 * module.
 *
 * Adding a component is: a spec file, a component file, a line in `SPECS`, a line in
 * `COMPONENTS`, and a line in `ICONS` if the icon is new. `implementations.test.ts`
 * asserts that every spec has both — a spec with no component is a palette entry that
 * draws a red "unknown component" box the moment it is dropped.
 */

import {
  Badge as BadgeIcon,
  Calendar,
  ChevronsUpDown,
  CircleDot,
  CircleUser,
  Columns3,
  Component,
  Ellipsis,
  Grid3x3,
  Heading as HeadingIcon,
  IdCard,
  Image as ImageIcon,
  LetterText,
  Link as LinkIcon,
  MessageSquareText,
  MessagesSquare,
  Minus,
  MousePointerClick,
  NotepadText,
  PanelBottom,
  PanelLeft,
  PanelTop,
  Rows3,
  SendHorizontal,
  SlidersHorizontal,
  Space,
  Square,
  SquareCheck,
  Table as TableIcon,
  TextCursorInput,
  ToggleRight,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { SPECS } from '../registry.js';
import { Avatar } from './Avatar.js';
import { Badge } from './Badge.js';
import { Box } from './Box.js';
import { Button } from './Button.js';
import { Card } from './Card.js';
import { ChatMessage } from './ChatMessage.js';
import { ChatThread } from './ChatThread.js';
import { Checkbox } from './Checkbox.js';
import { DatePicker } from './DatePicker.js';
import { Divider } from './Divider.js';
import { Footer } from './Footer.js';
import { Grid } from './Grid.js';
import { Header } from './Header.js';
import { Heading } from './Heading.js';
import { Image } from './Image.js';
import { Input } from './Input.js';
import { Link } from './Link.js';
import { PromptInput } from './PromptInput.js';
import { Radio } from './Radio.js';
import { RichText } from './RichText.js';
import { Select } from './Select.js';
import { SideNav } from './SideNav.js';
import { Slider } from './Slider.js';
import { Spacer } from './Spacer.js';
import { HStack, VStack } from './Stack.js';
import { Switch } from './Switch.js';
import { Table } from './Table.js';
import { Text } from './Text.js';
import { Textarea } from './Textarea.js';
import { TypingIndicator } from './TypingIndicator.js';

/**
 * What each `ComponentSpec.key` mounts as. Every key is spelled the same as its
 * component, which is why this is shorthand — a mismatch would be a component filed
 * under someone else's key, and reading the two columns is how you would catch it.
 */
export const COMPONENTS: Record<string, ComponentType<any>> = {
  Box,
  VStack,
  HStack,
  Grid,
  Spacer,
  Divider,
  Header,
  Footer,
  SideNav,

  Heading,
  Text,
  RichText,
  Button,
  Link,
  Badge,
  Avatar,

  Input,
  Textarea,
  Select,
  Radio,
  Checkbox,
  Switch,
  Slider,
  DatePicker,

  Card,
  Table,

  Image,

  ChatThread,
  ChatMessage,
  PromptInput,
  TypingIndicator,
};

/**
 * The palette's icons, keyed by the lucide name a spec stores in `icon`.
 *
 * Named imports rather than `import * as lucide` and an index: the namespace form
 * defeats tree-shaking, and lucide is a few thousand icons. This table is the studio's
 * icon budget, written down.
 *
 * Exported as the table rather than behind a `iconFor(name)` accessor because the caller
 * renders what comes back: React's compiler lint rejects a component *produced by a call*
 * inside a render — it cannot know the value is a stable module constant — and accepts
 * the lookup. The same reason `spec.icon` used to be read straight off the spec.
 */
export const ICONS: Record<string, LucideIcon> = {
  Badge: BadgeIcon,
  Calendar,
  ChevronsUpDown,
  CircleDot,
  CircleUser,
  Columns3,
  Component,
  Ellipsis,
  Grid3x3,
  Heading: HeadingIcon,
  IdCard,
  Image: ImageIcon,
  LetterText,
  Link: LinkIcon,
  MessageSquareText,
  MessagesSquare,
  Minus,
  MousePointerClick,
  NotepadText,
  PanelBottom,
  PanelLeft,
  PanelTop,
  Rows3,
  SendHorizontal,
  SlidersHorizontal,
  Space,
  Square,
  SquareCheck,
  Table: TableIcon,
  TextCursorInput,
  ToggleRight,
  Type,
};

/**
 * The same icons, keyed by component instead of by icon name — what a surface holding a
 * *node* wants, since a node stores a type and not a spec.
 *
 * Built here, once, rather than looked up per render, and that is load-bearing rather
 * than an optimisation: React's compiler lint rejects a component value that a render
 * derived through a function call, because it cannot tell a stable module constant from
 * one rebuilt every time. Indexing a constant with a prop is the shape it accepts, so
 * this is the shape the layers tree and the palette both use.
 *
 * The value is optional because the caller's fallback is its own: the palette shows a
 * generic square for something it cannot name, the layers tree a question mark, which is
 * the "the library no longer has this component" box the canvas draws.
 */
export const ICON_BY_KEY: Record<string, LucideIcon | undefined> = Object.fromEntries(
  SPECS.map((spec) => [spec.key, ICONS[spec.icon]]),
);

/**
 * The icon every symbol instance wears, for the surfaces that hold a node type rather
 * than a spec.
 *
 * A separate constant instead of an entry in `ICON_BY_KEY` because a symbol's key carries
 * its id and so cannot be known here. Callers write `ICON_BY_KEY[type] ?? SYMBOL_ICON`
 * guarded by `symbolIdOf`, which keeps both operands module constants — the shape React's
 * compiler lint accepts, and the reason `ICON_BY_KEY` exists at all.
 */
export const SYMBOL_ICON_COMPONENT: LucideIcon = Component;

/** Undefined for a key the library no longer has — the renderer draws its unknown box. */
export function componentFor(key: string): ComponentType<any> | undefined {
  return COMPONENTS[key];
}
