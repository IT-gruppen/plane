/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  IIssueDisplayFilterOptions,
  IIssueFilters,
  TWorkItemFilterConditionData,
  TWorkItemFilterExpression,
} from "@plane/types";
import { CORE_OPERATORS, WORK_ITEM_FILTER_PROPERTY_KEYS } from "@plane/types";
import { ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";

const VIRTUAL_DISPLAY_PARAM_KEYS = [
  "layout",
  "group_by",
  "sub_group_by",
  "order_by",
  "show_empty_groups",
  "sub_issue",
  "calendar_layout",
  "calendar_show_weekends",
] as const;

const PROJECT_LAYOUT_OPTIONS = ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.layoutOptions;
const PROJECT_LAYOUT_CONFIGS = Object.values(PROJECT_LAYOUT_OPTIONS);
const ALLOWED_LAYOUTS = new Set<string>(Object.keys(PROJECT_LAYOUT_OPTIONS));
const ALLOWED_GROUP_BY = new Set<string>([
  "null",
  ...PROJECT_LAYOUT_CONFIGS.flatMap((config) => [
    ...(config.display_filters.group_by ?? []),
    ...(config.display_filters.sub_group_by ?? []),
  ]).filter((value) => value !== null),
]);
const ALLOWED_ORDER_BY = new Set<string>(
  PROJECT_LAYOUT_CONFIGS.flatMap((config) => config.display_filters.order_by ?? [])
);
const ALLOWED_CALENDAR_LAYOUTS = new Set(["month", "week"]);
const ALLOWED_FILTER_PROPERTIES = new Set<string>(WORK_ITEM_FILTER_PROPERTY_KEYS);
const ALLOWED_FILTER_OPERATORS = new Set<string>(Object.values(CORE_OPERATORS));

type TSearchParamsLike = Pick<URLSearchParams, "forEach" | "toString">;

export type TVirtualProjectViewOverrides = {
  isActive: boolean;
  hasRichFilters: boolean;
  displayFilters: Partial<IIssueDisplayFilterOptions>;
  richFilters: TWorkItemFilterExpression;
  signature: string;
};

export type TVirtualProjectViewSerializationResult =
  | { success: true; searchParams: URLSearchParams }
  | { success: false; reason: string };

const parseBoolean = (value: string): boolean | undefined => {
  if (["true", "1"].includes(value.toLowerCase())) return true;
  if (["false", "0"].includes(value.toLowerCase())) return false;
  return undefined;
};

const parseNullableGroup = (value: string) => {
  if (!ALLOWED_GROUP_BY.has(value)) return undefined;
  return value === "null" ? null : value;
};

const isRichFilterKey = (key: string) => {
  const separatorIndex = key.lastIndexOf("__");
  if (separatorIndex === -1) return false;
  return (
    ALLOWED_FILTER_PROPERTIES.has(key.slice(0, separatorIndex)) &&
    ALLOWED_FILTER_OPERATORS.has(key.slice(separatorIndex + 2))
  );
};

const buildSignature = (entries: Array<[string, string]>) => {
  const sortedEntries = [...entries];
  // oxlint-disable-next-line unicorn/no-array-sort
  sortedEntries.sort(([keyA, valueA], [keyB, valueB]) =>
    keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)
  );
  const params = new URLSearchParams();
  sortedEntries.forEach(([key, value]) => params.append(key, value));
  return params.toString() || "default";
};

export const parseVirtualProjectViewSearchParams = (searchParams: TSearchParamsLike): TVirtualProjectViewOverrides => {
  const displayFilters: Partial<IIssueDisplayFilterOptions> = {};
  const richFilterConditions: TWorkItemFilterConditionData[] = [];
  const normalizedEntries: Array<[string, string]> = [];

  searchParams.forEach((rawValue, key) => {
    const value = rawValue.trim();

    if (key === "layout" && ALLOWED_LAYOUTS.has(value)) {
      displayFilters.layout = value;
      normalizedEntries.push([key, value]);
      return;
    }

    if (key === "group_by" || key === "sub_group_by") {
      const group = parseNullableGroup(value);
      if (group !== undefined) {
        displayFilters[key] = group as IIssueDisplayFilterOptions[typeof key];
        normalizedEntries.push([key, group ?? "null"]);
      }
      return;
    }

    if (key === "order_by" && ALLOWED_ORDER_BY.has(value)) {
      displayFilters.order_by = value as IIssueDisplayFilterOptions["order_by"];
      normalizedEntries.push([key, value]);
      return;
    }

    if (key === "show_empty_groups" || key === "sub_issue") {
      const parsedValue = parseBoolean(value);
      if (parsedValue !== undefined) {
        displayFilters[key] = parsedValue;
        normalizedEntries.push([key, String(parsedValue)]);
      }
      return;
    }

    if (key === "calendar_layout" && ALLOWED_CALENDAR_LAYOUTS.has(value)) {
      displayFilters.calendar = { ...displayFilters.calendar, layout: value as "month" | "week" };
      normalizedEntries.push([key, value]);
      return;
    }

    if (key === "calendar_show_weekends") {
      const parsedValue = parseBoolean(value);
      if (parsedValue !== undefined) {
        displayFilters.calendar = { ...displayFilters.calendar, show_weekends: parsedValue };
        normalizedEntries.push([key, String(parsedValue)]);
      }
      return;
    }

    if (value && isRichFilterKey(key)) {
      richFilterConditions.push({ [key]: value });
      normalizedEntries.push([key, value]);
    }
  });

  const richFilters: TWorkItemFilterExpression =
    richFilterConditions.length === 0
      ? {}
      : richFilterConditions.length === 1
        ? richFilterConditions[0]
        : { and: richFilterConditions };

  return {
    isActive: normalizedEntries.length > 0,
    hasRichFilters: richFilterConditions.length > 0,
    displayFilters,
    richFilters,
    signature: buildSignature(normalizedEntries),
  };
};

const getRichFilterConditions = (
  richFilters: TWorkItemFilterExpression
): { success: true; conditions: TWorkItemFilterConditionData[] } | { success: false } => {
  if (!richFilters || Object.keys(richFilters).length === 0) return { success: true, conditions: [] };

  if ("and" in richFilters) {
    if (!Array.isArray(richFilters.and)) return { success: false };
    return { success: true, conditions: richFilters.and };
  }

  return { success: true, conditions: [richFilters] };
};

export const serializeVirtualProjectView = (filters: IIssueFilters): TVirtualProjectViewSerializationResult => {
  const params = new URLSearchParams();
  const displayFilters = filters.displayFilters;

  if (displayFilters?.layout && !ALLOWED_LAYOUTS.has(displayFilters.layout))
    return { success: false, reason: "The current layout cannot be represented in a virtual-view URL." };
  if (displayFilters?.layout) params.set("layout", displayFilters.layout);
  if (
    displayFilters?.group_by !== undefined &&
    displayFilters.group_by !== null &&
    !ALLOWED_GROUP_BY.has(displayFilters.group_by)
  )
    return { success: false, reason: "The current grouping cannot be represented in a virtual-view URL." };
  if (displayFilters?.group_by !== undefined)
    params.set("group_by", displayFilters.group_by === null ? "null" : displayFilters.group_by);
  if (
    displayFilters?.sub_group_by !== undefined &&
    displayFilters.sub_group_by !== null &&
    !ALLOWED_GROUP_BY.has(displayFilters.sub_group_by)
  )
    return { success: false, reason: "The current subgrouping cannot be represented in a virtual-view URL." };
  if (displayFilters?.sub_group_by !== undefined)
    params.set("sub_group_by", displayFilters.sub_group_by === null ? "null" : displayFilters.sub_group_by);
  if (displayFilters?.order_by && !ALLOWED_ORDER_BY.has(displayFilters.order_by))
    return { success: false, reason: "The current ordering cannot be represented in a virtual-view URL." };
  if (displayFilters?.order_by) params.set("order_by", displayFilters.order_by);
  if (displayFilters?.show_empty_groups !== undefined)
    params.set("show_empty_groups", String(displayFilters.show_empty_groups));
  if (displayFilters?.sub_issue !== undefined) params.set("sub_issue", String(displayFilters.sub_issue));
  if (displayFilters?.calendar?.layout && !ALLOWED_CALENDAR_LAYOUTS.has(displayFilters.calendar.layout))
    return { success: false, reason: "The current calendar layout cannot be represented in a virtual-view URL." };
  if (displayFilters?.calendar?.layout) params.set("calendar_layout", displayFilters.calendar.layout);
  if (displayFilters?.calendar?.show_weekends !== undefined)
    params.set("calendar_show_weekends", String(displayFilters.calendar.show_weekends));

  const conditionResult = getRichFilterConditions(filters.richFilters);
  if (!conditionResult.success)
    return { success: false, reason: "The current filter expression cannot be represented in a virtual-view URL." };

  for (const condition of conditionResult.conditions) {
    const entries = Object.entries(condition);
    if (entries.length === 0) continue;

    for (const [key, value] of entries) {
      if (!isRichFilterKey(key) || !["string", "number", "boolean"].includes(typeof value))
        return { success: false, reason: "The current filters contain an unsupported property or value." };
      params.append(key, String(value));
    }
  }

  const canonicalParams = new URLSearchParams();
  const canonicalEntries = [...params.entries()];
  // oxlint-disable-next-line unicorn/no-array-sort
  canonicalEntries.sort(([keyA, valueA], [keyB, valueB]) =>
    keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)
  );
  canonicalEntries.forEach(([key, value]) => canonicalParams.append(key, value));

  return { success: true, searchParams: canonicalParams };
};

export const VIRTUAL_PROJECT_VIEW_DISPLAY_PARAM_KEYS = new Set<string>(VIRTUAL_DISPLAY_PARAM_KEYS);
