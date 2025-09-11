import { FC } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { EIssueServiceType, EIssuesStoreType, TIssue, type TIssuePriorities } from "@plane/types";
// components
import { BulkDeleteIssuesModal } from "@/components/core";
import { CreateUpdateIssueModal, DeleteIssueModal } from "@/components/issues";
// hooks
import { useCommandPalette, useIssueDetail, useUser, useIssues } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
import { useIssuesActions } from "@/hooks/use-issues-actions";

export type TIssueLevelModalsProps = {
  projectId: string | undefined;
  issueId: string | undefined;
};

export const IssueLevelModals: FC<TIssueLevelModalsProps> = observer((props) => {
  const { projectId, issueId } = props;
  // router
  const pathname = usePathname();
  const { workspaceSlug, cycleId, moduleId } = useParams();
  const router = useAppRouter();
  // store hooks
  const { data: currentUser } = useUser();
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  const { removeIssue: removeEpic } = useIssuesActions(EIssuesStoreType.EPIC);
  const { removeIssue: removeWorkItem } = useIssuesActions(EIssuesStoreType.PROJECT);

  const {
    isCreateIssueModalOpen,
    toggleCreateIssueModal,
    isDeleteIssueModalOpen,
    toggleDeleteIssueModal,
    isBulkDeleteIssueModalOpen,
    toggleBulkDeleteIssueModal,
    createWorkItemAllowedProjectIds,
    createIssueStoreType,
  } = useCommandPalette();

  // Get current view filters for PROJECT_VIEW context
  const {
    issuesFilter: { issueFilters },
  } = useIssues(EIssuesStoreType.PROJECT_VIEW);

  // derived values
  const issueDetails = issueId ? getIssueById(issueId) : undefined;
  const isDraftIssue = pathname?.includes("draft-issues") || false;
  const { fetchSubIssues: fetchSubWorkItems } = useIssueDetail();
  const { fetchSubIssues: fetchEpicSubWorkItems } = useIssueDetail(EIssueServiceType.EPICS);

  const handleDeleteIssue = async (workspaceSlug: string, projectId: string, issueId: string) => {
    try {
      const isEpic = issueDetails?.is_epic;
      const deleteAction = isEpic ? removeEpic : removeWorkItem;
      const redirectPath = `/${workspaceSlug}/projects/${projectId}/${isEpic ? "epics" : "issues"}`;

      await deleteAction(projectId, issueId);
      router.push(redirectPath);
    } catch (error) {
      console.error("Failed to delete issue:", error);
    }
  };

  const handleCreateIssueSubmit = async (newIssue: TIssue) => {
    if (!workspaceSlug || !newIssue.project_id || !newIssue.id || newIssue.parent_id !== issueDetails?.id) return;

    const fetchAction = issueDetails?.is_epic ? fetchEpicSubWorkItems : fetchSubWorkItems;
    await fetchAction(workspaceSlug?.toString(), newIssue.project_id, issueDetails.id);
  };

  const getCreateIssueModalData = () => {
    // Handle cycle and module contexts first
    if (cycleId) return { cycle_id: cycleId.toString() };
    if (moduleId) return { module_ids: [moduleId.toString()] };

    // Handle project view context - extract relevant filters
    if (createIssueStoreType === EIssuesStoreType.PROJECT_VIEW && issueFilters?.filters) {
      const viewFilters = issueFilters.filters;
      const modalData: Partial<TIssue> = {};

      // Extract priority filter (take the first one if multiple are selected, excluding "None")
      if (viewFilters.priority && viewFilters.priority.length > 0) {
        const validPriorities = viewFilters.priority.filter((priority) => priority !== "None");
        if (validPriorities.length > 0) {
          modalData.priority = validPriorities[0] as TIssuePriorities;
        }
      }

      // Extract assignee filter (take the first one if multiple are selected, excluding "None")
      if (viewFilters.assignees && viewFilters.assignees.length > 0) {
        const validAssignees = viewFilters.assignees.filter((assignee) => assignee !== "None");
        if (validAssignees.length > 0) {
          modalData.assignee_ids = [validAssignees[0]];
        }
      }

      // Extract cycle filter (take the first one if multiple are selected, excluding "None")
      if (viewFilters.cycle && viewFilters.cycle.length > 0) {
        const validCycles = viewFilters.cycle.filter((cycle) => cycle !== "None");
        if (validCycles.length > 0) {
          modalData.cycle_id = validCycles[0];
        }
      }

      // Extract module filter (excluding "None")
      if (viewFilters.module && viewFilters.module.length > 0) {
        const validModules = viewFilters.module.filter((module) => module !== "None");
        if (validModules.length > 0) {
          modalData.module_ids = validModules;
        }
      }

      // Extract label filter (excluding "None")
      if (viewFilters.labels && viewFilters.labels.length > 0) {
        const validLabels = viewFilters.labels.filter((label) => label !== "None");
        if (validLabels.length > 0) {
          modalData.label_ids = validLabels;
        }
      }

      return modalData;
    }

    return undefined;
  };

  return (
    <>
      <CreateUpdateIssueModal
        isOpen={isCreateIssueModalOpen}
        onClose={() => toggleCreateIssueModal(false)}
        data={getCreateIssueModalData()}
        isDraft={isDraftIssue}
        onSubmit={handleCreateIssueSubmit}
        allowedProjectIds={createWorkItemAllowedProjectIds}
      />
      {workspaceSlug && projectId && issueId && issueDetails && (
        <DeleteIssueModal
          handleClose={() => toggleDeleteIssueModal(false)}
          isOpen={isDeleteIssueModalOpen}
          data={issueDetails}
          onSubmit={() => handleDeleteIssue(workspaceSlug.toString(), projectId?.toString(), issueId?.toString())}
          isEpic={issueDetails?.is_epic}
        />
      )}
      <BulkDeleteIssuesModal
        isOpen={isBulkDeleteIssueModalOpen}
        onClose={() => toggleBulkDeleteIssueModal(false)}
        user={currentUser}
      />
    </>
  );
});
