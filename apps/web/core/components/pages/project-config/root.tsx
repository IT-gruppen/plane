/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { AlertTriangle, Plus, SmilePlus, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useSWRConfig } from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { convertHTMLDocumentToAllFormats } from "@plane/editor";
import type { TChangeHandlerProps } from "@plane/propel/emoji-icon-picker";
import { EmojiIconPickerTypes, EmojiPicker, Logo } from "@plane/propel/emoji-icon-picker";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TLogoProps } from "@plane/types";
import { EPageAccess } from "@plane/types";
import { DragHandle, DropIndicator, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// helpers
import {
  getProjectConfigNavigationCacheKey,
  hasMeaningfulProjectConfigContent,
  parseProjectConfigHtml,
  reorderProjectConfigRows,
  serializeProjectConfigRows,
  validateProjectConfigRows,
} from "@/helpers/project-navigation";
import type { TProjectConfigRow, TProjectConfigRowErrors } from "@/helpers/project-navigation";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type TEditableProjectConfigRow = TProjectConfigRow & { id: string };

type TProjectConfigEditorProps = {
  configPageCount: number;
  page: TPageInstance;
  projectId: string;
  workspaceSlug: string;
};

type TProjectConfigRowEditorProps = {
  canEdit: boolean;
  errors: TProjectConfigRowErrors;
  onChange: (row: TEditableProjectConfigRow) => void;
  onDelete: () => void;
  onMove: (sourceId: string, destinationId: string, edge: Edge | null) => void;
  row: TEditableProjectConfigRow;
};

const createRowId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const withRowIds = (rows: TProjectConfigRow[]): TEditableProjectConfigRow[] =>
  rows.map((row) => ({ ...row, id: createRowId() }));
const getRowsFingerprint = (rows: TProjectConfigRow[]) =>
  JSON.stringify(rows.map(({ logo, label, url }) => ({ logo, label, url })));

const pickerValueToLogo = (value: TChangeHandlerProps): TLogoProps =>
  value.type === EmojiIconPickerTypes.EMOJI
    ? { in_use: "emoji", emoji: { value: value.value } }
    : { in_use: "icon", icon: value.value };

function ProjectConfigRowEditor(props: TProjectConfigRowEditorProps) {
  const { canEdit, errors, onChange, onDelete, onMove, row } = props;
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const rowElement = rowRef.current;
    const dragHandleElement = dragHandleRef.current;
    if (!rowElement || !dragHandleElement || !canEdit) return;

    const data = { type: "project-config-row", id: row.id };
    return combine(
      draggable({
        element: rowElement,
        dragHandle: dragHandleElement,
        getInitialData: () => data,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: rowElement,
        canDrop: ({ source }) => source.data.type === data.type && source.data.id !== row.id,
        getData: ({ input, element }) =>
          attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: ({ self, source }) => {
          setClosestEdge(null);
          const sourceId = source.data.id;
          if (typeof sourceId === "string") onMove(sourceId, row.id, extractClosestEdge(self.data));
        },
      })
    );
  }, [canEdit, onMove, row.id]);

  return (
    <>
      <tr aria-hidden="true">
        <td colSpan={3} className="h-0 p-0">
          <DropIndicator isVisible={closestEdge === "top"} />
        </td>
      </tr>
      <tr ref={rowRef} className={cn("group border-b border-subtle", { "opacity-50": isDragging })}>
        <td className="relative w-36 px-3 py-3 align-top">
          {canEdit && (
            <DragHandle
              ref={dragHandleRef}
              className="absolute top-4 -left-7 bg-transparent opacity-0 group-hover:opacity-100"
            />
          )}
          <div className="flex flex-col gap-1.5">
            <EmojiPicker
              isOpen={isPickerOpen}
              handleToggle={setIsPickerOpen}
              closeOnSelect
              iconType="lucide"
              buttonClassName={cn(
                "flex h-9 w-full items-center justify-center rounded-md border-[0.5px] border-subtle bg-layer-2",
                { "border-danger-strong": !!errors.logo }
              )}
              label={
                row.logo ? (
                  <Logo logo={row.logo} size={20} type="lucide" />
                ) : (
                  <span className="flex items-center gap-1.5 text-12 text-tertiary">
                    <SmilePlus className="size-4" /> Select
                  </span>
                )
              }
              onChange={(value) => onChange({ ...row, logo: pickerValueToLogo(value) })}
              defaultIconColor={row.logo?.in_use === "icon" ? row.logo.icon?.color : undefined}
              defaultOpen={row.logo?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
              disabled={!canEdit}
            />
            {errors.logo && <span className="text-11 text-danger-primary">{errors.logo}</span>}
          </div>
        </td>
        <td className="w-1/3 px-3 py-3 align-top">
          {canEdit ? (
            <Input
              value={row.label}
              onChange={(event) => onChange({ ...row, label: event.target.value })}
              hasError={!!errors.label}
              placeholder="Weekly meeting"
              className="w-full"
            />
          ) : (
            <span className="block min-h-9 py-2 text-13">{row.label}</span>
          )}
          {errors.label && <span className="mt-1.5 block text-11 text-danger-primary">{errors.label}</span>}
        </td>
        <td className="relative px-3 py-3 align-top">
          {canEdit ? (
            <Input
              value={row.url}
              onChange={(event) => onChange({ ...row, url: event.target.value })}
              hasError={!!errors.url}
              placeholder="https://plane.example/..."
              className="w-full pr-10"
            />
          ) : (
            <>
              {errors.url ? (
                <span className="block min-h-9 truncate py-2 text-13 text-secondary">{row.url}</span>
              ) : (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block min-h-9 truncate py-2 text-13 text-accent-primary hover:underline"
                >
                  {row.url}
                </a>
              )}
            </>
          )}
          {canEdit && (
            <button
              type="button"
              className="absolute top-[19px] right-5 grid size-5 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-danger-primary"
              onClick={onDelete}
              aria-label={`Delete ${row.label || "navigation"} row`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          {errors.url && <span className="mt-1.5 block text-11 text-danger-primary">{errors.url}</span>}
        </td>
      </tr>
      <tr aria-hidden="true">
        <td colSpan={3} className="h-0 p-0">
          <DropIndicator isVisible={closestEdge === "bottom"} />
        </td>
      </tr>
    </>
  );
}

export const ProjectConfigEditor = observer(function ProjectConfigEditor(props: TProjectConfigEditorProps) {
  const { configPageCount, page, projectId, workspaceSlug } = props;
  const { mutate } = useSWRConfig();
  const { allowPermissions } = useUserPermissions();
  const [origin, setOrigin] = useState("");
  const [rows, setRows] = useState<TEditableProjectConfigRow[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState(getRowsFingerprint([]));
  const [loadedHtml, setLoadedHtml] = useState<string | undefined>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsupportedContent, setHasUnsupportedContent] = useState(false);
  const [hasConfirmedReset, setHasConfirmedReset] = useState(false);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const canEdit = isAdmin && page.isContentEditable;
  const currentFingerprint = getRowsFingerprint(rows);
  const isDirty = currentFingerprint !== savedFingerprint;
  const validation = useMemo(() => (origin ? validateProjectConfigRows(rows, origin) : []), [origin, rows]);
  const hasErrors = validation.some(({ errors }) => Object.keys(errors).length > 0);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    const html = page.description_html;
    if (html === undefined || html === loadedHtml || (isInitialized && isDirty)) return;

    const parsed = parseProjectConfigHtml(html);
    const nextRows = withRowIds(parsed.rows);
    const containsUnsupportedContent = !parsed.hasConfigTable && hasMeaningfulProjectConfigContent(html);
    setRows(nextRows);
    setSavedFingerprint(containsUnsupportedContent ? "__unsupported_project_config__" : getRowsFingerprint(nextRows));
    setHasUnsupportedContent(containsUnsupportedContent);
    setHasConfirmedReset(false);
    setLoadedHtml(html);
    setIsInitialized(true);
    page.setSyncingStatus("synced");
  }, [isDirty, isInitialized, loadedHtml, page, page.description_html]);

  const handleRowChange = useCallback((updatedRow: TEditableProjectConfigRow) => {
    setRows((currentRows) => currentRows.map((row) => (row.id === updatedRow.id ? updatedRow : row)));
  }, []);

  const handleMove = useCallback((sourceId: string, destinationId: string, edge: Edge | null) => {
    setRows((currentRows) => reorderProjectConfigRows(currentRows, sourceId, destinationId, edge));
  }, []);

  const handleSave = async () => {
    if (!origin || !canEdit || hasErrors || (hasUnsupportedContent && !hasConfirmedReset)) return;
    setIsSaving(true);
    page.setSyncingStatus("syncing");
    try {
      const normalizedRows = validation.map(({ row }) => row);
      const documentHtml = serializeProjectConfigRows(normalizedRows, origin);
      const documentPayload = convertHTMLDocumentToAllFormats({
        document_html: documentHtml,
        variant: "document",
      });
      setLoadedHtml(documentPayload.description_html);
      await page.updateDescription(documentPayload);
      const nextRows = withRowIds(normalizedRows);
      setRows(nextRows);
      setSavedFingerprint(getRowsFingerprint(nextRows));
      setHasUnsupportedContent(false);
      setHasConfirmedReset(false);
      page.setSyncingStatus("synced");
      void mutate(getProjectConfigNavigationCacheKey(workspaceSlug, projectId));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Project Config saved",
        message: "The shared project links have been updated.",
      });
    } catch {
      page.setSyncingStatus("error");
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not save Project Config",
        message: "Your changes are still here. Please try saving again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isInitialized)
    return <div className="mx-auto w-full max-w-5xl px-10 py-12 text-13 text-secondary">Loading configuration…</div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-10 py-10">
        <div>
          <h1 className="text-24 font-semibold text-primary">Project Config</h1>
          <p className="mt-1 text-13 text-secondary">
            Configure the shared links shown above the standard project navigation. Row order is preserved.
          </p>
        </div>

        {!isAdmin && (
          <div className="rounded-md border border-subtle bg-layer-1 px-4 py-3 text-12 text-secondary">
            This configuration is read-only. Project admins can edit it.
          </div>
        )}
        {page.access !== EPageAccess.PUBLIC && (
          <div className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle/20 px-4 py-3 text-12 text-secondary">
            <AlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-warning-primary" />
            Make this Page public before using it for shared project navigation.
          </div>
        )}
        {configPageCount > 1 && (
          <div className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle/20 px-4 py-3 text-12 text-secondary">
            <AlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-warning-primary" />
            More than one active public Project Config Page exists. Navigation links are disabled until only one
            remains.
          </div>
        )}
        {hasUnsupportedContent && !hasConfirmedReset && (
          <div className="flex items-start justify-between gap-4 rounded-md border border-warning-subtle bg-warning-subtle/20 px-4 py-3">
            <div className="flex items-start gap-2 text-12 text-secondary">
              <AlertTriangle className="mt-0.5 size-4 flex-shrink-0 text-warning-primary" />
              This Page contains content that is not a Project Config table. Resetting will replace that content.
            </div>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setHasConfirmedReset(true)}>
                Reset as config
              </Button>
            )}
          </div>
        )}

        {(!hasUnsupportedContent || hasConfirmedReset) && (
          <>
            <div className="ml-7 overflow-visible rounded-md border border-subtle bg-surface-1">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-subtle bg-layer-1 text-left text-11 font-medium text-secondary">
                    <th className="w-36 px-3 py-2.5">Icon</th>
                    <th className="w-1/3 px-3 py-2.5">Label</th>
                    <th className="px-3 py-2.5">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <ProjectConfigRowEditor
                      key={row.id}
                      row={row}
                      errors={validation[index]?.errors ?? {}}
                      canEdit={canEdit}
                      onChange={handleRowChange}
                      onDelete={() => setRows((currentRows) => currentRows.filter(({ id }) => id !== row.id))}
                      onMove={handleMove}
                    />
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-13 text-tertiary">
                        No shared navigation links configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="ml-7 flex items-center justify-between gap-4">
                <Button
                  variant="secondary"
                  size="sm"
                  prependIcon={<Plus />}
                  onClick={() =>
                    setRows((currentRows) => [
                      ...currentRows,
                      { id: createRowId(), logo: undefined, label: "", url: "" },
                    ])
                  }
                >
                  Add link
                </Button>
                <Button size="sm" loading={isSaving} disabled={!origin || !isDirty || hasErrors} onClick={handleSave}>
                  Save configuration
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
