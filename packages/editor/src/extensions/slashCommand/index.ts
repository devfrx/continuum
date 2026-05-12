/**
 * Public surface of the slash-command extension. Importers should use
 * the wiring helper exported from this barrel rather than reaching into
 * the individual files.
 */
export { SlashCommand, SlashCommandPluginKey } from './SlashCommand';
export type {
  SlashCommandOptions,
  SlashRendererInstance,
  SlashRendererProps,
} from './SlashCommand';
export { createDefaultSlashCommands, SLASH_COMMAND_SECTIONS } from './slashCommandItems';
export type { SlashCommandItem, SlashCommandSection } from './slashCommandItems';
export { default as SlashCommandMenu } from './SlashCommandMenu.vue';
