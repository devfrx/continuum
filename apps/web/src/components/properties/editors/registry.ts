/**
 * Property editor registry.
 *
 * Maps each `PropertyType` to the Vue component responsible for rendering
 * its inline editor. The `PropertyRow` consumer reads from this map at
 * runtime via `<component :is>` so adding a new property type is a
 * one-line change here plus the new editor file.
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
import RelationEditor from './RelationEditor.vue';

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
    relation: RelationEditor,
};
