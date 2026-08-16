import { describe, expect, it, vi } from "vitest";
import { FilterInstance, WorkItemFilterStore, workItemFiltersAdapter } from "@plane/shared-state";
import type { TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import {
  createCompatibleWorkItemFilter,
  getWorkItemFilterExpressionSignature,
  supportsOwnedFilterRegistration,
} from "@/helpers/work-item-filter-registration";

describe("work item filter synchronization", () => {
  it("resets an externally supplied expression without notifying the persistence callback", () => {
    const onExpressionChange = vi.fn();
    const filter = new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
      adapter: workItemFiltersAdapter,
      initialExpression: { priority__exact: "high" },
      onExpressionChange,
    });

    filter.resetExpression({ label_id__in: "meeting-label" }, true, false);

    expect(filter.allConditionsForDisplay).toHaveLength(1);
    expect(filter.allConditionsForDisplay[0]).toMatchObject({
      property: "label_id",
      value: "meeting-label",
    });
    expect(filter.hasChanges).toBe(false);
    expect(onExpressionChange).not.toHaveBeenCalled();
  });

  it("does not let an older root cleanup delete its replacement", () => {
    const store = new WorkItemFilterStore();
    const firstFilter = store.createFilter({
      entityType: EIssuesStoreType.PROJECT,
      entityId: "project-id",
    });
    store.registerFilter(EIssuesStoreType.PROJECT, "project-id", firstFilter);
    const replacementFilter = store.createFilter({
      entityType: EIssuesStoreType.PROJECT,
      entityId: "project-id",
    });
    store.registerFilter(EIssuesStoreType.PROJECT, "project-id", replacementFilter);

    store.deleteFilter(EIssuesStoreType.PROJECT, "project-id", firstFilter.id);

    expect(store.getFilter(EIssuesStoreType.PROJECT, "project-id")).toBe(replacementFilter);
  });

  it("can re-register the owned filter after effect cleanup replay", () => {
    const store = new WorkItemFilterStore();
    const filter = store.createFilter({
      entityType: EIssuesStoreType.PROJECT,
      entityId: "project-id",
    });
    store.registerFilter(EIssuesStoreType.PROJECT, "project-id", filter);

    store.deleteFilter(EIssuesStoreType.PROJECT, "project-id", filter.id);
    expect(store.getFilter(EIssuesStoreType.PROJECT, "project-id")).toBeUndefined();

    store.registerFilter(EIssuesStoreType.PROJECT, "project-id", filter);
    expect(store.getFilter(EIssuesStoreType.PROJECT, "project-id")).toBe(filter);
  });

  it("falls back to the v1.4.2 store API when a live store predates the new registration methods", () => {
    const filter = new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
      adapter: workItemFiltersAdapter,
    });
    const legacyStore = {
      getOrCreateFilter: vi.fn(() => filter),
    };

    const result = createCompatibleWorkItemFilter(legacyStore, {
      entityType: EIssuesStoreType.PROJECT,
      entityId: "project-id",
    });

    expect(result).toBe(filter);
    expect(legacyStore.getOrCreateFilter).toHaveBeenCalledOnce();
    expect(supportsOwnedFilterRegistration(legacyStore)).toBe(false);
  });

  it("keeps the synchronization signature stable for equivalent filter objects", () => {
    const firstExpression = { and: [{ priority__exact: "high" }, { label_id__in: "meeting-label" }] };
    const equivalentExpression = structuredClone(firstExpression);

    expect(getWorkItemFilterExpressionSignature(equivalentExpression)).toBe(
      getWorkItemFilterExpressionSignature(firstExpression)
    );
    expect(getWorkItemFilterExpressionSignature({ priority__exact: "urgent" })).not.toBe(
      getWorkItemFilterExpressionSignature(firstExpression)
    );
  });
});
