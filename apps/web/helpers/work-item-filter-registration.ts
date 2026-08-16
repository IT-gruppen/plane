import type { IWorkItemFilterStore } from "@plane/shared-state";
import type { TWorkItemFilterExpression } from "@plane/types";

type TLegacyCompatibleWorkItemFilterStore = Pick<IWorkItemFilterStore, "getOrCreateFilter"> &
  Partial<Pick<IWorkItemFilterStore, "createFilter" | "registerFilter">>;

type TOwnedFilterRegistrationStore = TLegacyCompatibleWorkItemFilterStore &
  Required<Pick<IWorkItemFilterStore, "createFilter" | "registerFilter">>;

export const supportsOwnedFilterRegistration = (
  store: TLegacyCompatibleWorkItemFilterStore
): store is TOwnedFilterRegistrationStore =>
  typeof store.createFilter === "function" && typeof store.registerFilter === "function";

export const createCompatibleWorkItemFilter = (
  store: TLegacyCompatibleWorkItemFilterStore,
  params: Parameters<IWorkItemFilterStore["getOrCreateFilter"]>[0]
) => (supportsOwnedFilterRegistration(store) ? store.createFilter(params) : store.getOrCreateFilter(params));

export const getWorkItemFilterExpressionSignature = (expression: TWorkItemFilterExpression | undefined): string =>
  JSON.stringify(expression ?? {});
