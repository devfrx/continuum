/**
 * Property editor registry.
 *
 * Maps each `PropertyType` to the Vue component responsible for rendering
 * its inline editor. The `PropertyRow` consumer reads from this map at
 * runtime via `<component :is>` so adding a new property type is a
 * one-line change here plus the new editor file.
 *
 * Editors split into three categories:
 *   – Input editors      (text, number, date, checkbox, …) accept and emit `value`.
 *   – Action editors     (button) require `noteId` to round-trip with the server.
 *   – Display components (formula, rollup, createdTime, …) are read-only
 *     wrappers around `ComputedDisplay`.
 */
import type { Component } from 'vue';
import type { PropertyType } from '@continuum/shared';
import TextEditor from './TextEditor.vue';
import LongTextEditor from './LongTextEditor.vue';
import NumberEditor from './NumberEditor.vue';
import DateEditor from './DateEditor.vue';
import DateRangeEditor from './DateRangeEditor.vue';
import CheckboxEditor from './CheckboxEditor.vue';
import SelectEditor from './SelectEditor.vue';
import MultiSelectEditor from './MultiSelectEditor.vue';
import UrlEditor from './UrlEditor.vue';
import EmailEditor from './EmailEditor.vue';
import PhoneEditor from './PhoneEditor.vue';
import RelationEditor from './RelationEditor.vue';
import StatusEditor from './StatusEditor.vue';
import ProgressEditor from './ProgressEditor.vue';
import VerificationEditor from './VerificationEditor.vue';
import FilesEditor from './FilesEditor.vue';
import ButtonEditor from './ButtonEditor.vue';
import ComputedDisplay from './ComputedDisplay.vue';

export const propertyEditorRegistry: Record<PropertyType, Component> = {
    text: TextEditor,
    longText: LongTextEditor,
    number: NumberEditor,
    date: DateEditor,
    dateRange: DateRangeEditor,
    checkbox: CheckboxEditor,
    select: SelectEditor,
    multiSelect: MultiSelectEditor,
    url: UrlEditor,
    email: EmailEditor,
    phone: PhoneEditor,
    relation: RelationEditor,
    status: StatusEditor,
    progress: ProgressEditor,
    verification: VerificationEditor,
    files: FilesEditor,
    button: ButtonEditor,
    formula: ComputedDisplay,
    rollup: ComputedDisplay,
    uniqueId: ComputedDisplay,
    createdTime: ComputedDisplay,
    createdBy: ComputedDisplay,
    lastEditedTime: ComputedDisplay,
    lastEditedBy: ComputedDisplay,
};
