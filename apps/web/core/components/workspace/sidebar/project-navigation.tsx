"use client";

import React, { FC, useCallback, useMemo, useEffect, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { FileText, Layers } from "lucide-react";
import { EUserPermissionsLevel, EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles, type IProjectView, TLogoProps } from "@plane/types";
// plane ui
import { DiceIcon, ContrastIcon, LayersIcon, Intake } from "@plane/ui";
// components
import { SidebarNavItem } from "@/components/sidebar";
import { Logo } from "@/components/common";
// hooks
import { useAppTheme, useIssueDetail, useProject, useProjectView, useUserPermissions } from "@/hooks/store";

export type TNavigationItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  access: EUserPermissions[] | EUserProjectRoles[];
  shouldRender: boolean;
  sortOrder: number;
  i18n_key: string;
  key: string;
  logoProps?: TLogoProps; // For favorite views with custom icons/emojis
  viewId?: string; // For favorite views
};

type TProjectItemsProps = {
  workspaceSlug: string;
  projectId: string;
  additionalNavigationItems?: (workspaceSlug: string, projectId: string) => TNavigationItem[];
};

// TODO Read the locale from somewhere else
const collator = new Intl.Collator("nb-NO", {
  usage: "sort",
  sensitivity: "base",
  ignorePunctuation: true,
  numeric: true,
});

const useProjectViews = (projectId: string, workspaceSlug: string) => {
  const { getProjectViews, fetchedMap, fetchViews } = useProjectView();
  const [projectViews, setProjectViews] = useState<IProjectView[] | undefined>();

  useEffect(() => {
    if (!fetchedMap[projectId]) {
      fetchViews(workspaceSlug, projectId).then(setProjectViews);
    }
  }, [projectId, workspaceSlug, fetchedMap, fetchViews, setProjectViews]);

  return getProjectViews(projectId) || projectViews;
};

export const ProjectNavigation: FC<TProjectItemsProps> = observer((props) => {
  const { workspaceSlug, projectId, additionalNavigationItems } = props;
  const { workItem: workItemIdentifierFromRoute } = useParams();
  // store hooks
  const { t } = useTranslation();
  const { toggleSidebar } = useAppTheme();
  const { getPartialProjectById } = useProject();

  const { allowPermissions } = useUserPermissions();
  const {
    issue: { getIssueIdByIdentifier, getIssueById },
  } = useIssueDetail();
  // pathname
  const pathname = usePathname();
  // derived values
  const workItemId = workItemIdentifierFromRoute
    ? getIssueIdByIdentifier(workItemIdentifierFromRoute?.toString())
    : undefined;
  const workItem = workItemId ? getIssueById(workItemId) : undefined;
  const project = getPartialProjectById(projectId);
  // handlers
  const handleProjectClick = useCallback(() => {
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  }, [toggleSidebar]);

  if (!project) return null;

  const projectViews = useProjectViews(projectId, workspaceSlug);

  // Get favorite project views data directly for MobX reactivity
  const projectFavoriteViews = useMemo(() => {
    if (!projectViews || projectViews.length === 0) return [];

    const projectFavoriteViews = [
      ...projectViews
        .filter((view) => !view.name.startsWith("(") && view.description.toLowerCase().startsWith("project favorite"))
        .sort((viewA, viewB) => collator.compare(viewA.name, viewB.name)),
      ...projectViews
        .filter((view) => view.name.startsWith("(") && view.description.toLowerCase().startsWith("project favorite"))
        .sort((viewA, viewB) => collator.compare(viewA.name, viewB.name)),
    ];

    return projectFavoriteViews.map((view, index) => ({
        name: view.name,
        href: `/${workspaceSlug}/projects/${projectId}/views/${view.id}`,
        icon: Layers, // Default icon, will be overridden by logo_props rendering
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: true,
        sortOrder: 0.1 + index * 0.01, // Ensure favorite views appear first
        i18n_key: `favorite_view_${view.id}`,
        key: `favorite_view_${view.id}`,
        logoProps: view.logo_props,
        viewId: view.id,
      }));
    },
    [projectViews, workspaceSlug, projectId]
  );

  const baseNavigation = useCallback(
    (workspaceSlug: string, projectId: string): TNavigationItem[] => [
      {
        i18n_key: "sidebar.work_items",
        key: "work_items",
        name: "Work items",
        href: `/${workspaceSlug}/projects/${projectId}/issues`,
        icon: LayersIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: true,
        sortOrder: 1,
      },
      {
        i18n_key: "sidebar.cycles",
        key: "cycles",
        name: "Cycles",
        href: `/${workspaceSlug}/projects/${projectId}/cycles`,
        icon: ContrastIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: project.cycle_view,
        sortOrder: 2,
      },
      {
        i18n_key: "sidebar.modules",
        key: "modules",
        name: "Modules",
        href: `/${workspaceSlug}/projects/${projectId}/modules`,
        icon: DiceIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: project.module_view,
        sortOrder: 3,
      },
      {
        i18n_key: "sidebar.views",
        key: "views",
        name: "Views",
        href: `/${workspaceSlug}/projects/${projectId}/views`,
        icon: Layers,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project.issue_views_view,
        sortOrder: 4,
      },
      {
        i18n_key: "sidebar.pages",
        key: "pages",
        name: "Pages",
        href: `/${workspaceSlug}/projects/${projectId}/pages`,
        icon: FileText,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project.page_view,
        sortOrder: 5,
      },
      {
        i18n_key: "sidebar.intake",
        key: "intake",
        name: "Intake",
        href: `/${workspaceSlug}/projects/${projectId}/intake`,
        icon: Intake,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project.inbox_view,
        sortOrder: 6,
      },
    ],
    [project]
  );

  // memoized navigation items and adding additional navigation items
  const navigationItemsMemo = useMemo(() => {
    // Get base navigation items
    const navItems = baseNavigation(workspaceSlug, projectId);

    if (additionalNavigationItems) {
      navItems.push(...additionalNavigationItems(workspaceSlug, projectId));
    }

    // Combine favorite views with regular navigation items and sort by sortOrder
    return [...projectFavoriteViews, ...navItems].sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
    );
  }, [workspaceSlug, projectId, baseNavigation, additionalNavigationItems, projectFavoriteViews]);

  const isActive = useCallback(
    (item: TNavigationItem) => {
      // work item condition
      const workItemCondition = workItemId && workItem && !workItem?.is_epic && workItem?.project_id === projectId;
      // epic condition
      const epicCondition = workItemId && workItem && workItem?.is_epic && workItem?.project_id === projectId;
      // is active
      const isWorkItemActive = item.key === "work_items" && workItemCondition;
      const isEpicActive = item.key === "epics" && epicCondition;

      // Check if we're currently in a specific favorite view (not the main views page)
      const isInSpecificFavoriteView = pathname.includes(`/${workspaceSlug}/projects/${projectId}/views/`) &&
        !pathname.endsWith(`/${workspaceSlug}/projects/${projectId}/views`) &&
        pathname !== `/${workspaceSlug}/projects/${projectId}/views`;

      // For the "views" nav item, don't mark it as active if we're in a specific favorite view
      // But keep it active if we're on the main views page
      if (item.key === "views" && isInSpecificFavoriteView) {
        return false;
      }

      // pathname condition
      const isPathnameActive = pathname.includes(item.href);
      // return
      return isWorkItemActive || isEpicActive || isPathnameActive;
    },
    [pathname, workItem, workItemId, projectId, workspaceSlug]
  );

  const renderedNavigationItems = useMemo(() => {
    return navigationItemsMemo.map((item, index) => {
      if (!item.shouldRender) return null;

      const hasAccess = allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project.id);
      if (!hasAccess) return null;

      // Check if this is a favorite view
      const isFavoriteView = item.viewId !== undefined;

      // Check if we need to show separator (first non-favorite item after favorites)
      const previousItem = navigationItemsMemo[index - 1];
      const showSeparator =
        (!isFavoriteView && previousItem?.viewId !== undefined) ||
        (previousItem &&
          isFavoriteView &&
          previousItem.viewId !== undefined &&
          item.name.startsWith("(") &&
          !previousItem.name.startsWith("("));

      // Render function for icon/emoji based on logoProps
      const renderIcon = () => {
        if (item.logoProps && item.logoProps.in_use) {
          return <Logo logo={item.logoProps} size={16} type="lucide" />;
        }

        // Fallback to default icon
        return (
          <item.icon className={`flex-shrink-0 size-4 ${item.name === "Intake" ? "stroke-1" : "stroke-[1.5]"}`} />
        );
      };

      return (
        <div key={item.key}>
          {showSeparator && (
            <div className="mx-[18px] my-1 border-t border-custom-border-200" />
          )}
          <Link href={item.href} onClick={handleProjectClick}>
            <SidebarNavItem className="pl-[18px]" isActive={isActive(item)}>
              <div className="flex items-center gap-1.5 py-[1px]">
                {renderIcon()}
                <span className={`text-xs ${isFavoriteView ? 'font-bold' : 'font-medium'}`}>
                {item.logoProps ? item.name : t(item.i18n_key)}
              </span>
              </div>
            </SidebarNavItem>
          </Link>
        </div>
      );
    });
  }, [navigationItemsMemo, allowPermissions, workspaceSlug, project.id, isActive, handleProjectClick, t]);

  return (
    <>
      {renderedNavigationItems}
    </>
  );
});
