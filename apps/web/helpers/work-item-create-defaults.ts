/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ISSUE_PRIORITIES } from "@plane/constants";
import type { TIssue, TIssuePriorities, TWorkItemFilterConditionData, TWorkItemFilterExpression } from "@plane/types";

const SUPPORTED_OPERATORS = new Set(["exact", "in"]);
const VALID_PRIORITIES = new Set<string>(ISSUE_PRIORITIES.map((priority) => priority.key));

const SINGLE_VALUE_PROPERTIES = new Set(["priority", "state_id", "cycle_id", "start_date", "target_date"]);
const MULTI_VALUE_PROPERTIES = new Set(["label_id", "assignee_id", "module_id"]);

type TSingleValueProperty = "priority" | "state_id" | "cycle_id" | "start_date" | "target_date";
type TMultiValueProperty = "label_id" | "assignee_id" | "module_id";
type TAssignableProperty = TSingleValueProperty | TMultiValueProperty;

const getFilterConditions = (richFilters: TWorkItemFilterExpression): TWorkItemFilterConditionData[] => {
  if (!richFilters || Object.keys(richFilters).length === 0) return [];

  if ("and" in richFilters) return Array.isArray(richFilters.and) ? richFilters.and : [];

  return [richFilters];
};

const parseFilterKey = (key: string): { property: TAssignableProperty; operator: "exact" | "in" } | undefined => {
  const separatorIndex = key.lastIndexOf("__");
  if (separatorIndex === -1) return undefined;

  const property = key.slice(0, separatorIndex);
  const operator = key.slice(separatorIndex + 2);
  if (!SUPPORTED_OPERATORS.has(operator)) return undefined;
  if (!SINGLE_VALUE_PROPERTIES.has(property) && !MULTI_VALUE_PROPERTIES.has(property)) return undefined;

  return {
    property: property as TAssignableProperty,
    operator: operator as "exact" | "in",
  };
};

const isValidPayloadDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isValidPropertyValue = (property: TAssignableProperty, value: string) => {
  if (!value) return false;
  if (property === "priority") return VALID_PRIORITIES.has(value);
  if (property === "start_date" || property === "target_date") return isValidPayloadDate(value);
  return true;
};

const parseConditionValues = (property: TAssignableProperty, operator: "exact" | "in", rawValue: unknown) => {
  if (typeof rawValue !== "string") return [];

  const values = operator === "in" ? rawValue.split(",") : [rawValue];
  return [...new Set(values.map((value) => value.trim()).filter((value) => isValidPropertyValue(property, value)))];
};

const resolveSingleValue = (conditionValues: string[][]) => {
  if (conditionValues.length === 0 || conditionValues.some((values) => values.length === 0)) return undefined;

  const resolvedValues = conditionValues[0].filter((value) =>
    conditionValues.slice(1).every((values) => values.includes(value))
  );
  return resolvedValues.length === 1 ? resolvedValues[0] : undefined;
};

export const getWorkItemCreateDefaults = (richFilters: TWorkItemFilterExpression): Partial<TIssue> => {
  const singleValueConditions = new Map<TSingleValueProperty, string[][]>();
  const multiValueConditions = new Map<TMultiValueProperty, string[]>();

  getFilterConditions(richFilters).forEach((condition) => {
    Object.entries(condition).forEach(([key, rawValue]) => {
      const parsedKey = parseFilterKey(key);
      if (!parsedKey) return;

      const values = parseConditionValues(parsedKey.property, parsedKey.operator, rawValue);
      if (SINGLE_VALUE_PROPERTIES.has(parsedKey.property)) {
        const property = parsedKey.property as TSingleValueProperty;
        singleValueConditions.set(property, [...(singleValueConditions.get(property) ?? []), values]);
        return;
      }

      const property = parsedKey.property as TMultiValueProperty;
      multiValueConditions.set(property, [...new Set([...(multiValueConditions.get(property) ?? []), ...values])]);
    });
  });

  const defaults: Partial<TIssue> = {};
  const priority = resolveSingleValue(singleValueConditions.get("priority") ?? []);
  const stateId = resolveSingleValue(singleValueConditions.get("state_id") ?? []);
  const cycleId = resolveSingleValue(singleValueConditions.get("cycle_id") ?? []);
  const startDate = resolveSingleValue(singleValueConditions.get("start_date") ?? []);
  const targetDate = resolveSingleValue(singleValueConditions.get("target_date") ?? []);

  if (priority) defaults.priority = priority as TIssuePriorities;
  if (stateId) defaults.state_id = stateId;
  if (cycleId) defaults.cycle_id = cycleId;
  if (startDate) defaults.start_date = startDate;
  if (targetDate) defaults.target_date = targetDate;

  const labelIds = multiValueConditions.get("label_id");
  const assigneeIds = multiValueConditions.get("assignee_id");
  const moduleIds = multiValueConditions.get("module_id");
  if (labelIds?.length) defaults.label_ids = labelIds;
  if (assigneeIds?.length) defaults.assignee_ids = assigneeIds;
  if (moduleIds?.length) defaults.module_ids = moduleIds;

  return defaults;
};

const MULTI_VALUE_ISSUE_FIELDS = ["label_ids", "assignee_ids", "module_ids"] as const;

export const mergeWorkItemCreateDefaults = (...sources: Array<Partial<TIssue> | undefined>): Partial<TIssue> => {
  const defaults = Object.assign({}, ...sources.filter(Boolean)) as Partial<TIssue>;

  MULTI_VALUE_ISSUE_FIELDS.forEach((field) => {
    const values = sources.flatMap((source) => {
      const sourceValues = source?.[field];
      return Array.isArray(sourceValues) ? sourceValues : [];
    });

    if (values.length === 0) return;
    const uniqueValues = [...new Set(values)];
    if (field === "label_ids") defaults.label_ids = uniqueValues;
    if (field === "assignee_ids") defaults.assignee_ids = uniqueValues;
    if (field === "module_ids") defaults.module_ids = uniqueValues;
  });

  return defaults;
};

export const isProjectWorkItemsPath = (
  pathname: string | null,
  workspaceSlug: string | undefined,
  projectId: string | undefined
) => {
  if (!pathname || !workspaceSlug || !projectId) return false;

  const normalizedPathname = pathname.replace(/\/+$/, "");
  return normalizedPathname === `/${workspaceSlug}/projects/${projectId}/issues`;
};
