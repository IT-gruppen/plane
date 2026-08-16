/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { v4 as uuidv4 } from "uuid";
// plane imports
import type { TSaveViewOptions, TUpdateViewOptions } from "@plane/constants";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IIssueFilters, TWorkItemFilterExpression } from "@plane/types";
// store hooks
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
// plane web imports
import type { TWorkItemFiltersEntityProps } from "@/hooks/work-item-filters/use-work-item-filters-config";
import { useWorkItemFiltersConfig } from "@/hooks/work-item-filters/use-work-item-filters-config";
import {
  createCompatibleWorkItemFilter,
  getWorkItemFilterExpressionSignature,
  supportsOwnedFilterRegistration,
} from "@/helpers/work-item-filter-registration";
// local imports
import type { TSharedWorkItemFiltersHOCProps, TSharedWorkItemFiltersProps } from "./shared";

type TAdditionalWorkItemFiltersProps = {
  saveViewOptions?: TSaveViewOptions<TWorkItemFilterExpression>;
  updateViewOptions?: TUpdateViewOptions<TWorkItemFilterExpression>;
} & TWorkItemFiltersEntityProps;

type TWorkItemFiltersHOCProps = TSharedWorkItemFiltersHOCProps & TAdditionalWorkItemFiltersProps;

export const WorkItemFiltersHOC = observer(function WorkItemFiltersHOC(props: TWorkItemFiltersHOCProps) {
  const { children, initialWorkItemFilters } = props;

  // Only initialize filter instance when initial work item filters are defined
  if (!initialWorkItemFilters)
    return <>{typeof children === "function" ? children({ filter: undefined }) : children}</>;

  return (
    <WorkItemFilterRoot {...props} initialWorkItemFilters={initialWorkItemFilters}>
      {children}
    </WorkItemFilterRoot>
  );
});

type TWorkItemFilterProps = TSharedWorkItemFiltersProps &
  TAdditionalWorkItemFiltersProps & {
    initialWorkItemFilters: IIssueFilters;
    children: React.ReactNode | ((props: { filter: IWorkItemFilterInstance }) => React.ReactNode);
  };

const WorkItemFilterRoot = observer(function WorkItemFilterRoot(props: TWorkItemFilterProps) {
  const {
    children,
    entityType,
    entityId,
    filtersToShowByLayout,
    initialWorkItemFilters,
    isTemporary,
    saveViewOptions,
    updateFilters,
    updateViewOptions,
    showOnMount,
    ...entityConfigProps
  } = props;
  // store hooks
  const workItemFilterStore = useWorkItemFilters();
  const { deleteFilter } = workItemFilterStore;
  const supportsOwnedRegistration = supportsOwnedFilterRegistration(workItemFilterStore);
  // derived values
  const workItemEntityID = useMemo(
    () => (isTemporary ? `TEMP-${entityId ?? uuidv4()}` : entityId),
    [isTemporary, entityId]
  );
  // memoize initial values to prevent re-computations when reference changes
  const initialUserFilters = useMemo(() => initialWorkItemFilters.richFilters, [initialWorkItemFilters]);
  const initialUserFiltersSignature = getWorkItemFilterExpressionSignature(initialUserFilters);
  const workItemFiltersConfig = useWorkItemFiltersConfig({
    allowedFilters: filtersToShowByLayout ? filtersToShowByLayout : [],
    ...entityConfigProps,
  });
  // create the filter instance owned by this mounted root
  const workItemLayoutFilter = useMemo(
    () =>
      createCompatibleWorkItemFilter(workItemFilterStore, {
        entityType,
        entityId: workItemEntityID,
        initialExpression: initialUserFilters,
        onExpressionChange: updateFilters,
        expressionOptions: {
          saveViewOptions,
          updateViewOptions,
        },
        showOnMount,
      }),
    // A filter instance belongs to this mounted root. Dynamic options and expressions are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, workItemEntityID, workItemFilterStore]
  );
  const latestInitialUserFilters = useRef(initialUserFilters);
  latestInitialUserFilters.current = initialUserFilters;
  const synchronizedFilterSignature = useRef<string | undefined>(
    supportsOwnedRegistration ? initialUserFiltersSignature : undefined
  );

  useEffect(() => {
    workItemLayoutFilter.onExpressionChange = updateFilters;
    workItemLayoutFilter.updateExpressionOptions({
      saveViewOptions,
      updateViewOptions,
    });
  }, [saveViewOptions, updateFilters, updateViewOptions, workItemLayoutFilter]);

  // Keep the registered filter instance in sync when an external source, such as a virtual-view URL, changes.
  // This must not notify the change callback because the source expression has already been applied to the store.
  useEffect(() => {
    if (synchronizedFilterSignature.current === initialUserFiltersSignature) return;

    synchronizedFilterSignature.current = initialUserFiltersSignature;
    workItemLayoutFilter.resetExpression(latestInitialUserFilters.current, true, false);
  }, [initialUserFiltersSignature, workItemLayoutFilter]);

  // Re-register during effect setup so React strict-effect replay cannot leave the header lookup orphaned.
  // Identity-aware cleanup prevents an older root from deleting a replacement mounted for the same entity.
  // The compatibility guard also supports a store instance created before shared-state was hot-reloaded.
  useEffect(() => {
    if (!supportsOwnedRegistration) return;

    workItemFilterStore.registerFilter(entityType, workItemEntityID, workItemLayoutFilter);
    return () => {
      deleteFilter(entityType, workItemEntityID, workItemLayoutFilter.id);
    };
  }, [
    deleteFilter,
    entityType,
    supportsOwnedRegistration,
    workItemEntityID,
    workItemFilterStore,
    workItemLayoutFilter,
  ]);

  useEffect(() => {
    workItemLayoutFilter.configManager.setAreConfigsReady(workItemFiltersConfig.areAllConfigsInitialized);
    workItemLayoutFilter.configManager.registerAll(workItemFiltersConfig.configs);
  }, [
    workItemFiltersConfig.areAllConfigsInitialized,
    workItemFiltersConfig.configs,
    workItemLayoutFilter.configManager,
  ]);

  return <>{typeof children === "function" ? children({ filter: workItemLayoutFilter }) : children}</>;
});
