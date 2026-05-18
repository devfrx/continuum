<script setup lang="ts">
/**
 * TemplatePropertiesPanel — renders template property blueprints through
 * the same PropertyRow component used by the note editor. The row value is
 * the template `defaultValue`, i.e. the value materialised when a new note
 * is created from this template.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  isComputedPropertyType,
  type NoteProperty,
  type PageTemplate,
  type PropertyDefinition,
  type PropertyValue,
  type TemplatePropertyDefinition,
} from '@continuum/shared';
import { Icon, UiButton, UiConfirmModal } from '@/components/ui';
import { usePageTemplates } from '@/composables/usePageTemplates';
import AddPropertyModal from '@/components/properties/AddPropertyModal.vue';
import PropertyRow from '@/components/properties/PropertyRow.vue';

const props = defineProps<{
  template: PageTemplate;
}>();

const templates = usePageTemplates();

const adding = ref(false);
const pendingDelete = ref<{ id: string; label: string } | null>(null);
const draggedPropertyId = ref<string | null>(null);
const dragOverPropertyId = ref<string | null>(null);
const reorderBusy = ref(false);
const defaultDrafts = ref<Record<string, PropertyValue | null>>({});
const defaultSaveTimers = new Map<string, number>();

interface TemplatePropertyEntry {
  property: TemplatePropertyDefinition;
  entry: NoteProperty;
  defaultEditable: boolean;
}

const propertyEntries = computed<TemplatePropertyEntry[]>(() =>
  props.template.properties.map((property) => ({
    property,
    entry: {
      definition: definitionFor(property),
      value: defaultValueFor(property),
    },
    defaultEditable: canEditDefault(property),
  })),
);

function canEditDefault(property: TemplatePropertyDefinition): boolean {
  return property.type !== 'button' && !isComputedPropertyType(property.type);
}

function definitionFor(property: TemplatePropertyDefinition): PropertyDefinition {
  return {
    id: property.id,
    scope: 'note',
    kindId: props.template.targetKind,
    noteId: null,
    databaseId: null,
    key: property.key,
    label: property.label,
    type: property.type,
    icon: property.icon,
    description: property.description,
    config: property.config,
    position: property.position,
    createdAt: props.template.createdAt,
    updatedAt: props.template.updatedAt,
  };
}

function defaultValueFor(property: TemplatePropertyDefinition): PropertyValue | null {
  return Object.prototype.hasOwnProperty.call(defaultDrafts.value, property.id)
    ? defaultDrafts.value[property.id] ?? null
    : property.defaultValue;
}

function normalizeDefaultValue(value: PropertyValue): PropertyValue | null {
  switch (value.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
    case 'date':
      return value.value ? value : null;
    case 'dateRange':
      return value.value.from || value.value.to ? value : null;
    case 'multiSelect':
    case 'relation':
    case 'files':
      return value.value.length > 0 ? value : null;
    case 'verification':
      return value.state !== 'unverified' || value.verifiedAt ? value : null;
    case 'number':
    case 'checkbox':
    case 'progress':
      return value;
    case 'button':
    case 'createdBy':
    case 'createdTime':
    case 'formula':
    case 'lastEditedBy':
    case 'lastEditedTime':
    case 'rollup':
    case 'uniqueId':
      return null;
  }
}

function updateDefault(propertyId: string, value: PropertyValue): void {
  const normalized = normalizeDefaultValue(value);
  defaultDrafts.value = { ...defaultDrafts.value, [propertyId]: normalized };
  const existing = defaultSaveTimers.get(propertyId);
  if (existing) window.clearTimeout(existing);
  defaultSaveTimers.set(
    propertyId,
    window.setTimeout(() => {
      defaultSaveTimers.delete(propertyId);
      void persistDefault(propertyId, normalized);
    }, 450),
  );
}

async function persistDefault(
  propertyId: string,
  value: PropertyValue | null,
): Promise<void> {
  await templates.updateProperty(props.template.id, propertyId, { defaultValue: value });
  const current = defaultDrafts.value[propertyId] ?? null;
  if (JSON.stringify(current) !== JSON.stringify(value)) return;
  const next = { ...defaultDrafts.value };
  delete next[propertyId];
  defaultDrafts.value = next;
}

function requestRemove(id: string, label: string): void {
  pendingDelete.value = { id, label };
}

function onDeleteOpenChange(open: boolean): void {
  if (!open) pendingDelete.value = null;
}

async function confirmRemove(): Promise<void> {
  if (!pendingDelete.value) return;
  const propertyId = pendingDelete.value.id;
  pendingDelete.value = null;
  await templates.removeProperty(props.template.id, propertyId);
}

function moveProperties(
  properties: TemplatePropertyDefinition[],
  fromId: string,
  toId: string,
): TemplatePropertyDefinition[] {
  const fromIndex = properties.findIndex((property) => property.id === fromId);
  const toIndex = properties.findIndex((property) => property.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return properties;
  const next = [...properties];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return properties;
  next.splice(toIndex, 0, moved);
  return next;
}

function onPropertyDragStart(id: string, event: DragEvent): void {
  if (reorderBusy.value) return;
  draggedPropertyId.value = id;
  dragOverPropertyId.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
}

function onPropertyDragOver(id: string, event: DragEvent): void {
  if (reorderBusy.value || !draggedPropertyId.value) return;
  event.preventDefault();
  dragOverPropertyId.value = id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

async function onPropertyDrop(id: string, event: DragEvent): Promise<void> {
  if (reorderBusy.value || !draggedPropertyId.value) return;
  event.preventDefault();
  const fromId = draggedPropertyId.value;
  clearDragState();
  if (fromId === id) return;

  const next = moveProperties(props.template.properties, fromId, id);
  if (next === props.template.properties) return;

  reorderBusy.value = true;
  try {
    await templates.reorderProperties(
      props.template.id,
      next.map((property) => property.id),
    );
  } finally {
    reorderBusy.value = false;
  }
}

function clearDragState(): void {
  draggedPropertyId.value = null;
  dragOverPropertyId.value = null;
}

function ignoreSelect(): void {
  // Template defaults can reference notes, but the template editor does not navigate.
}

onBeforeUnmount(() => {
  for (const timer of defaultSaveTimers.values()) window.clearTimeout(timer);
  defaultSaveTimers.clear();
});
</script>

<template>
  <div class="tpl-props">
    <div v-if="propertyEntries.length > 0" class="tpl-props__list" :class="{ 'is-reordering': reorderBusy }">
      <PropertyRow
        v-for="item in propertyEntries"
        :key="item.property.id"
        :entry="item.entry"
        :value-readonly="!item.defaultEditable"
        :reorderable="propertyEntries.length > 1 && !reorderBusy"
        :drag-active="draggedPropertyId === item.property.id"
        :drop-target="dragOverPropertyId === item.property.id && draggedPropertyId !== item.property.id"
        @drag-start="onPropertyDragStart(item.property.id, $event)"
        @drag-over="onPropertyDragOver(item.property.id, $event)"
        @drop="onPropertyDrop(item.property.id, $event)"
        @drag-end="clearDragState"
        @update:value="updateDefault(item.property.id, $event)"
        @select="ignoreSelect"
        @remove="requestRemove(item.property.id, item.property.label)"
      />
    </div>
    <p v-else class="tpl-props__empty">
      No properties yet. Add one below.
    </p>

    <div class="tpl-props__add">
      <UiButton variant="ghost" size="sm" @click="adding = true">
        <template #icon-left>
          <Icon name="plus" :size="13" />
        </template>
        Add property
      </UiButton>
    </div>

    <AddPropertyModal
      v-model="adding"
      owner="template"
      :template-id="template.id"
      :template-properties="template.properties"
    />

    <UiConfirmModal
      :model-value="pendingDelete !== null"
      title="Delete property?"
      :message="`Remove '${pendingDelete?.label}' from this template? Notes already created from it will keep their own properties.`"
      confirm-label="Delete"
      confirm-variant="danger"
      @update:model-value="onDeleteOpenChange"
      @confirm="confirmRemove"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
.tpl-props {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tpl-props__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 4px 0;
}

.tpl-props__list.is-reordering {
  cursor: wait;
}

.tpl-props__empty {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

</style>
