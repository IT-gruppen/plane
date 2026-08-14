/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageOptionsDropdown } from "../editor/toolbar";
import { PageArchivedBadge } from "./archived-badge";
import { PageCopyLinkControl } from "./copy-link-control";
import { PageFavoriteControl } from "./favorite-control";
import { PageOfflineBadge } from "./offline-badge";
import { PageLockControl } from "./lock-control";

type Props = {
  canManageConfig?: boolean;
  configMode?: boolean;
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageHeaderActions = observer(function PageHeaderActions(props: Props) {
  const { canManageConfig = false, configMode = false, page, storeType } = props;

  if (configMode)
    return (
      <div className="flex items-center gap-1">
        <PageArchivedBadge page={page} />
        <PageCopyLinkControl page={page} />
        {canManageConfig && <PageLockControl page={page} />}
        {canManageConfig && <PageOptionsDropdown configMode page={page} storeType={storeType} />}
      </div>
    );

  return (
    <div className="flex items-center gap-1">
      <PageArchivedBadge page={page} />
      <PageOfflineBadge page={page} />
      <PageLockControl page={page} />
      <PageCopyLinkControl page={page} />
      <PageFavoriteControl page={page} />
      <PageOptionsDropdown page={page} storeType={storeType} />
    </div>
  );
});
