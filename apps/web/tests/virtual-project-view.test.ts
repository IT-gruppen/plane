import { describe, expect, it } from "vitest";
import type { IIssueFilters } from "@plane/types";
import { parseVirtualProjectViewSearchParams, serializeVirtualProjectView } from "@/helpers/virtual-project-view";

describe("virtual project views", () => {
  it("parses supported display and rich-filter parameters", () => {
    const overrides = parseVirtualProjectViewSearchParams(
      new URLSearchParams(
        "layout=kanban&group_by=state&show_empty_groups=1&label_id__in=label-1&priority__in=high%2Curgent"
      )
    );

    expect(overrides.isActive).toBe(true);
    expect(overrides.hasRichFilters).toBe(true);
    expect(overrides.displayFilters).toEqual({
      layout: "kanban",
      group_by: "state",
      show_empty_groups: true,
    });
    expect(overrides.richFilters).toEqual({
      and: [{ label_id__in: "label-1" }, { priority__in: "high,urgent" }],
    });
  });

  it("ignores unknown and invalid parameters", () => {
    const overrides = parseVirtualProjectViewSearchParams(
      new URLSearchParams("layout=unsupported&unknown=value&label_id__contains=label-1&sub_issue=maybe")
    );

    expect(overrides).toMatchObject({
      isActive: false,
      hasRichFilters: false,
      displayFilters: {},
      richFilters: {},
      signature: "default",
    });
  });

  it("preserves repeated filters, ranges, and explicit false boolean values", () => {
    const overrides = parseVirtualProjectViewSearchParams(
      new URLSearchParams(
        "label_id__in=label-2&target_date__range=2026-08-01%2C2026-08-31&label_id__in=label-1&sub_issue=0&calendar_show_weekends=false"
      )
    );

    expect(overrides.displayFilters).toEqual({
      sub_issue: false,
      calendar: { show_weekends: false },
    });
    expect(overrides.richFilters).toEqual({
      and: [{ label_id__in: "label-2" }, { target_date__range: "2026-08-01,2026-08-31" }, { label_id__in: "label-1" }],
    });
    expect(overrides.signature).toBe(
      "calendar_show_weekends=false&label_id__in=label-1&label_id__in=label-2&sub_issue=false&target_date__range=2026-08-01%2C2026-08-31"
    );
  });

  it("serializes and parses a supported configuration without losing behavior", () => {
    const filters: IIssueFilters = {
      richFilters: {
        and: [{ label_id__in: "label-1" }, { state_group__in: "backlog,started" }],
      },
      displayFilters: {
        layout: "kanban",
        group_by: "state",
        sub_group_by: null,
        order_by: "sort_order",
        show_empty_groups: false,
        sub_issue: true,
        calendar: { layout: "month", show_weekends: false },
      },
      displayProperties: undefined,
      kanbanFilters: undefined,
    };

    const result = serializeVirtualProjectView(filters);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const parsed = parseVirtualProjectViewSearchParams(result.searchParams);
    expect(result.searchParams.toString().startsWith("calendar_layout=month&calendar_show_weekends=false")).toBe(true);
    expect(parsed.displayFilters).toEqual(filters.displayFilters);
    expect(parsed.richFilters).toEqual(filters.richFilters);
  });

  it("refuses unsupported rich-filter expressions", () => {
    const result = serializeVirtualProjectView({
      richFilters: { unsupported__exact: "value" } as IIssueFilters["richFilters"],
      displayFilters: { layout: "list" },
      displayProperties: undefined,
      kanbanFilters: undefined,
    });

    expect(result.success).toBe(false);
  });
});
