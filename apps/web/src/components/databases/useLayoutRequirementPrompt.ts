import { ref, type Ref } from 'vue';
import type { LayoutPropertyRequirement } from './views/types';
import type { RequiredPropertyCreateInput } from './views/layoutRequirements';

interface LayoutRequirementPromptState {
    viewLabel: string;
    requirements: LayoutPropertyRequirement[];
}

export function useLayoutRequirementPrompt(): {
    layoutRequirementPrompt: Ref<LayoutRequirementPromptState | null>;
    requestMissingLayoutProperties: (
        viewLabel: string,
        requirements: readonly LayoutPropertyRequirement[],
    ) => Promise<RequiredPropertyCreateInput[] | null>;
    onLayoutRequirementSubmit: (items: RequiredPropertyCreateInput[]) => void;
    onLayoutRequirementCancel: () => void;
} {
    const layoutRequirementPrompt = ref<LayoutRequirementPromptState | null>(null);
    let resolver: ((items: RequiredPropertyCreateInput[] | null) => void) | null = null;

    function requestMissingLayoutProperties(
        viewLabel: string,
        requirements: readonly LayoutPropertyRequirement[],
    ): Promise<RequiredPropertyCreateInput[] | null> {
        layoutRequirementPrompt.value = { viewLabel, requirements: [...requirements] };
        return new Promise((resolve) => {
            resolver = resolve;
        });
    }

    function onLayoutRequirementSubmit(items: RequiredPropertyCreateInput[]): void {
        layoutRequirementPrompt.value = null;
        resolver?.(items);
        resolver = null;
    }

    function onLayoutRequirementCancel(): void {
        layoutRequirementPrompt.value = null;
        resolver?.(null);
        resolver = null;
    }

    return {
        layoutRequirementPrompt,
        requestMissingLayoutProperties,
        onLayoutRequirementSubmit,
        onLayoutRequirementCancel,
    };
}