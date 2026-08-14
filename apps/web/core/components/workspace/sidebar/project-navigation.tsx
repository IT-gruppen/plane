/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { EUserPermissionsLevel, EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CycleIcon, IntakeIcon, LinkIcon, ModuleIcon, PageIcon, ViewsIcon, WorkItemsIcon } from "@plane/propel/icons";
import type { EUserProjectRoles, TLogoProps } from "@plane/types";
// plane ui
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// helpers
import {
  findProjectConfigPage,
  getProjectConfigNavigationCacheKey,
  isProjectNavigationEntryActive,
  parseProjectNavigationHtml,
} from "@/helpers/project-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { ProjectPageService } from "@/services/page";

const projectPageService = new ProjectPageService();

export type TNavigationItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  access: EUserPermissions[] | EUserProjectRoles[];
  shouldRender: boolean;
  sortOrder: number;
  i18n_key: string;
  key: string;
  customLogo?: TLogoProps;
  isProjectNavigationLink?: boolean;
  pathname?: string;
  search?: string;
};

type TProjectItemsProps = {
  workspaceSlug: string;
  projectId: string;
  additionalNavigationItems?: (workspaceSlug: string, projectId: string) => TNavigationItem[];
};

export const ProjectNavigation = observer(function ProjectNavigation(props: TProjectItemsProps) {
  const { workspaceSlug, projectId, additionalNavigationItems } = props;
  const { workItem: workItemIdentifierFromRoute } = useParams();
  // store hooks
  const { t } = useTranslation();
  const { isExtendedProjectSidebarOpened, toggleExtendedProjectSidebar, toggleSidebar } = useAppTheme();
  const { getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const {
    issue: { getIssueIdByIdentifier, getIssueById },
  } = useIssueDetail();
  // pathname
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // derived values
  const workItemId = workItemIdentifierFromRoute
    ? getIssueIdByIdentifier(workItemIdentifierFromRoute?.toString())
    : undefined;
  const workItem = workItemId ? getIssueById(workItemId) : undefined;
  const project = getPartialProjectById(projectId);
  const { data: configuredNavigationEntries = [] } = useSWR(
    project?.page_view ? getProjectConfigNavigationCacheKey(workspaceSlug, projectId) : null,
    async () => {
      const pages = await projectPageService.fetchAll(workspaceSlug, projectId);
      const navigationPage = findProjectConfigPage(pages);
      if (!navigationPage?.id) return [];

      const pageDetails = await projectPageService.fetchById(workspaceSlug, projectId, navigationPage.id, false);
      return parseProjectNavigationHtml(pageDetails.description_html ?? "", window.location.origin);
    },
    {
      revalidateIfStale: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
    }
  );
  // handlers
  const handleProjectClick = () => {
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
    // close the extended sidebar if it is open
    if (isExtendedProjectSidebarOpened) {
      toggleExtendedProjectSidebar(false);
    }
  };

  const baseNavigation = useCallback(
    (targetWorkspaceSlug: string, targetProjectId: string): TNavigationItem[] => [
      {
        i18n_key: "sidebar.work_items",
        key: "work_items",
        name: "Work items",
        href: `/${targetWorkspaceSlug}/projects/${targetProjectId}/issues`,
        icon: WorkItemsIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: true,
        sortOrder: 1,
      },
      {
        i18n_key: "sidebar.cycles",
        key: "cycles",
        name: "Cycles",
        href: `/${targetWorkspaceSlug}/projects/${targetProjectId}/cycles`,
        icon: CycleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: project?.cycle_view ?? false,
        sortOrder: 2,
      },
      {
        i18n_key: "sidebar.modules",
        key: "modules",
        name: "Modules",
        href: `/${targetWorkspaceSlug}/projects/${targetProjectId}/modules`,
        icon: ModuleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: project?.module_view ?? false,
        sortOrder: 3,
      },
      {
        i18n_key: "sidebar.views",
        key: "views",
        name: "Views",
        href: `/${targetWorkspaceSlug}/projects/${targetProjectId}/views`,
        icon: ViewsIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project?.issue_views_view ?? false,
        sortOrder: 4,
      },
      {
        i18n_key: "sidebar.pages",
        key: "pages",
        name: "Pages",
        href: `/${targetWorkspaceSlug}/projects/${targetProjectId}/pages`,
        icon: PageIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project?.page_view ?? false,
        sortOrder: 5,
      },
      {
        i18n_key: "sidebar.intake",
        key: "intake",
        name: "Intake",
        href: `/${targetWorkspaceSlug}/projects/${targetProjectId}/intake`,
        icon: IntakeIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project?.inbox_view ?? false,
        sortOrder: 6,
      },
    ],
    [project]
  );

  const projectPageNavigationItems = useMemo<TNavigationItem[]>(
    () =>
      configuredNavigationEntries.map((entry, index) => ({
        i18n_key: `project_navigation_${index}`,
        key: `project_navigation_${entry.href}`,
        name: entry.label,
        href: entry.href,
        pathname: entry.pathname,
        search: entry.search,
        customLogo: entry.logo,
        icon: LinkIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: true,
        sortOrder: index - configuredNavigationEntries.length,
        isProjectNavigationLink: true,
      })),
    [configuredNavigationEntries]
  );

  // memoized navigation items and adding additional navigation items
  const navigationItemsMemo = useMemo(() => {
    const navigationItems = (targetWorkspaceSlug: string, targetProjectId: string): TNavigationItem[] => {
      const navItems = [...projectPageNavigationItems, ...baseNavigation(targetWorkspaceSlug, targetProjectId)];

      if (additionalNavigationItems) {
        navItems.push(...additionalNavigationItems(targetWorkspaceSlug, targetProjectId));
      }

      return navItems;
    };

    // sort navigation items by sortOrder
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2023 Array#toSorted is outside Plane Web's TS target.
    const sortedNavigationItems = navigationItems(workspaceSlug, projectId).sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
    );

    return sortedNavigationItems;
  }, [workspaceSlug, projectId, baseNavigation, additionalNavigationItems, projectPageNavigationItems]);

  const isProjectNavigationItemActive = useCallback(
    (item: TNavigationItem) => {
      if (!item.isProjectNavigationLink || !item.pathname) return false;

      return isProjectNavigationEntryActive(
        { pathname: item.pathname, search: item.search ?? "" },
        pathname,
        searchParams
      );
    },
    [pathname, searchParams]
  );

  const activeProjectNavigationItem = projectPageNavigationItems.find(isProjectNavigationItemActive);

  const isActive = useCallback(
    (item: TNavigationItem) => {
      if (item.isProjectNavigationLink) return isProjectNavigationItemActive(item);

      // work item condition
      const workItemCondition = workItemId && workItem && !workItem?.is_epic && workItem?.project_id === projectId;
      // epic condition
      const epicCondition = workItemId && workItem && workItem?.is_epic && workItem?.project_id === projectId;
      // is active
      const isWorkItemActive = item.key === "work_items" && workItemCondition;
      const isEpicActive = item.key === "epics" && epicCondition;
      if (activeProjectNavigationItem && pathname.includes(item.href)) return false;
      // pathname condition
      const isPathnameActive = pathname.includes(item.href);
      // return
      return isWorkItemActive || isEpicActive || isPathnameActive;
    },
    [pathname, workItem, workItemId, projectId, activeProjectNavigationItem, isProjectNavigationItemActive]
  );

  if (!project) return null;

  return (
    <>
      {navigationItemsMemo.map((item, index) => {
        if (!item.shouldRender) return;

        const hasAccess = allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project.id);
        if (!hasAccess) return null;

        const shouldShowCount = item.key === "intake" && (project.intake_count ?? 0) > 0;
        const showSeparator =
          !item.isProjectNavigationLink && navigationItemsMemo[index - 1]?.isProjectNavigationLink === true;

        return (
          <div key={item.key}>
            {showSeparator && <div className="mx-[18px] my-1 border-t border-subtle" />}
            <Link href={item.href} onClick={handleProjectClick}>
              <SidebarNavItem isActive={!!isActive(item)}>
                <div className="flex w-full items-center justify-between gap-1.5 py-[1px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {item.customLogo ? (
                      <span className="flex size-4 flex-shrink-0 items-center justify-center" aria-hidden="true">
                        <Logo logo={item.customLogo} size={16} type="lucide" />
                      </span>
                    ) : (
                      <item.icon
                        className={`size-4 flex-shrink-0 ${item.name === "Intake" ? "stroke-1" : "stroke-[1.5]"}`}
                      />
                    )}
                    <span className="truncate text-11 font-medium">
                      {item.isProjectNavigationLink ? item.name : t(item.i18n_key)}
                    </span>
                  </div>
                  {shouldShowCount && <span className="text-11 font-medium text-tertiary">{project.intake_count}</span>}
                </div>
              </SidebarNavItem>
            </Link>
          </div>
        );
      })}
    </>
  );
});
