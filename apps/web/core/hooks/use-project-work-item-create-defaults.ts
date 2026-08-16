/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { getWorkItemCreateDefaults } from "@/helpers/work-item-create-defaults";
import { useIssues } from "@/hooks/store/use-issues";

export const useProjectWorkItemCreateDefaults = (projectId: string | undefined, enabled: boolean): Partial<TIssue> => {
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  if (!enabled || !projectId) return {};

  const richFilters = issuesFilter.getIssueFilters(projectId)?.richFilters;
  return richFilters ? getWorkItemCreateDefaults(richFilters) : {};
};
