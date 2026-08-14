import { describe, expect, it, vi } from "vitest";
import { EIssueFilterType } from "@plane/constants";
import type { IProjectUserPropertiesResponse } from "@plane/types";
import { parseVirtualProjectViewSearchParams } from "@/helpers/virtual-project-view";
import { ProjectIssuesFilter } from "../core/store/issue/project/filter.store";
import type { IIssueRootStore } from "../core/store/issue/root.store";

const persistedProperties = {
  rich_filters: { priority__in: "high" },
  display_filters: {
    layout: "list",
    group_by: null,
    sub_group_by: null,
    order_by: "sort_order",
    show_empty_groups: false,
    sub_issue: false,
    calendar: { layout: "month", show_weekends: false },
  },
  display_properties: { assignee: true },
  sort_order: 0,
} as IProjectUserPropertiesResponse;

const createStore = () => {
  const rootStore = {
    projectId: "project-1",
    currentUserId: "user-1",
    projectIssues: {
      clear: vi.fn(),
      fetchIssuesWithExistingPagination: vi.fn(),
    },
  } as unknown as IIssueRootStore;
  const store = new ProjectIssuesFilter(rootStore);
  const getProperties = vi
    .spyOn(store.projectService, "getProjectUserProperties")
    .mockResolvedValue(persistedProperties);
  const updateProperties = vi
    .spyOn(store.projectService, "updateProjectUserProperties")
    .mockResolvedValue(persistedProperties);

  return { store, getProperties, updateProperties };
};

describe("project virtual-view filter mode", () => {
  it("overlays URL settings without writing any project-member preferences", async () => {
    const { store, getProperties, updateProperties } = createStore();
    const overrides = parseVirtualProjectViewSearchParams(
      new URLSearchParams("layout=kanban&group_by=state&label_id__in=meeting-label")
    );

    await store.fetchFilters("acme", "project-1", overrides);

    expect(getProperties).toHaveBeenCalledOnce();
    expect(store.getIssueFilters("project-1")).toMatchObject({
      richFilters: { label_id__in: "meeting-label" },
      displayFilters: { layout: "kanban", group_by: "state" },
    });

    await store.updateFilterExpression("acme", "project-1", { state_group__in: "started" });
    await store.updateFilters("acme", "project-1", EIssueFilterType.DISPLAY_FILTERS, { layout: "list" });
    await store.updateFilters("acme", "project-1", EIssueFilterType.DISPLAY_PROPERTIES, { labels: false });
    await store.updateFilters("acme", "project-1", EIssueFilterType.KANBAN_FILTERS, {
      group_by: ["state-1"],
      sub_group_by: [],
    });

    expect(updateProperties).not.toHaveBeenCalled();

    await store.fetchFilters("acme", "project-1");
    expect(store.getIssueFilters("project-1")).toMatchObject({
      richFilters: { priority__in: "high" },
      displayFilters: { layout: "list", group_by: null },
    });
  });

  it("does not let a stale meeting request overwrite the latest virtual link", async () => {
    const { store, getProperties } = createStore();
    const pendingRequests: Array<(value: IProjectUserPropertiesResponse) => void> = [];
    getProperties.mockImplementation(
      () => new Promise<IProjectUserPropertiesResponse>((resolve) => pendingRequests.push(resolve))
    );

    const firstRequest = store.fetchFilters(
      "acme",
      "project-1",
      parseVirtualProjectViewSearchParams(new URLSearchParams("label_id__in=meeting-one"))
    );
    const secondRequest = store.fetchFilters(
      "acme",
      "project-1",
      parseVirtualProjectViewSearchParams(new URLSearchParams("label_id__in=meeting-two"))
    );

    pendingRequests[1]?.(persistedProperties);
    await secondRequest;
    pendingRequests[0]?.(persistedProperties);
    await firstRequest;

    expect(store.getIssueFilters("project-1")?.richFilters).toEqual({ label_id__in: "meeting-two" });
  });
});
