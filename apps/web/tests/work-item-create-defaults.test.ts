import { describe, expect, it } from "vitest";
import type { TIssue, TWorkItemFilterExpression } from "@plane/types";
import {
  getWorkItemCreateDefaults,
  isProjectWorkItemsPath,
  mergeWorkItemCreateDefaults,
} from "@/helpers/work-item-create-defaults";

describe("work item create defaults", () => {
  it("maps assignable exact and in filters", () => {
    const richFilters: TWorkItemFilterExpression = {
      and: [
        { priority__exact: "high" },
        { state_id__in: "state-1" },
        { cycle_id__exact: "cycle-1" },
        { label_id__in: "label-1,label-2" },
        { assignee_id__exact: "member-1" },
        { module_id__in: "module-1,module-2" },
        { start_date__exact: "2026-08-01" },
        { target_date__in: "2026-08-31" },
      ],
    };

    expect(getWorkItemCreateDefaults(richFilters)).toEqual({
      priority: "high",
      state_id: "state-1",
      cycle_id: "cycle-1",
      label_ids: ["label-1", "label-2"],
      assignee_ids: ["member-1"],
      module_ids: ["module-1", "module-2"],
      start_date: "2026-08-01",
      target_date: "2026-08-31",
    });
  });

  it("deduplicates repeated multi-value filters in filter order", () => {
    expect(
      getWorkItemCreateDefaults({
        and: [
          { label_id__in: "label-1, label-2" },
          { label_id__exact: "label-1" },
          { label_id__in: "label-3,label-2" },
        ],
      })
    ).toEqual({ label_ids: ["label-1", "label-2", "label-3"] });
  });

  it("only maps a single-valued property when its constraints resolve to one value", () => {
    expect(
      getWorkItemCreateDefaults({
        and: [{ state_id__in: "state-1,state-2" }, { state_id__in: "state-2,state-3" }],
      })
    ).toEqual({ state_id: "state-2" });

    expect(getWorkItemCreateDefaults({ priority__in: "high,urgent" })).toEqual({});
    expect(
      getWorkItemCreateDefaults({ and: [{ cycle_id__exact: "cycle-1" }, { cycle_id__exact: "cycle-2" }] })
    ).toEqual({});
  });

  it("ignores ranges, non-assignable properties, malformed values, and invalid priority or dates", () => {
    expect(
      getWorkItemCreateDefaults({
        and: [
          { target_date__range: "2026-08-01,2026-08-31" },
          { state_group__in: "started" },
          { created_by_id__exact: "member-1" },
          { project_id__exact: "project-1" },
          { priority__exact: "invalid" },
          { start_date__exact: "2026-02-31" },
          { label_id__in: " , " },
        ],
      })
    ).toEqual({});
  });

  it("merges defaults with scalar precedence and multi-value unions", () => {
    const fallback: Partial<TIssue> = { state_id: "default-state" };
    const filterDefaults: Partial<TIssue> = {
      state_id: "filtered-state",
      label_ids: ["filter-label"],
      assignee_ids: ["filter-assignee"],
    };
    const layoutDefaults: Partial<TIssue> = {
      state_id: "group-state",
      label_ids: ["group-label", "filter-label"],
      assignee_ids: ["group-assignee"],
      target_date: "2026-08-15",
    };

    expect(mergeWorkItemCreateDefaults(fallback, filterDefaults, layoutDefaults)).toEqual({
      state_id: "group-state",
      label_ids: ["filter-label", "group-label"],
      assignee_ids: ["filter-assignee", "group-assignee"],
      target_date: "2026-08-15",
    });
  });

  it("matches only the exact project Work items path", () => {
    expect(isProjectWorkItemsPath("/acme/projects/project-1/issues", "acme", "project-1")).toBe(true);
    expect(isProjectWorkItemsPath("/acme/projects/project-1/issues/", "acme", "project-1")).toBe(true);
    expect(isProjectWorkItemsPath("/acme/projects/project-1/issues/issue-1", "acme", "project-1")).toBe(false);
    expect(isProjectWorkItemsPath("/acme/projects/project-1/views/view-1", "acme", "project-1")).toBe(false);
    expect(isProjectWorkItemsPath("/acme/projects/project-2/issues", "acme", "project-1")).toBe(false);
  });
});
