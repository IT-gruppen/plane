/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { emojiToString, LUCIDE_ICONS_LIST, stringToEmoji } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps, TPage } from "@plane/types";
import { EPageAccess } from "@plane/types";

export const PROJECT_CONFIG_PAGE_NAME = "Project Config";

const PROJECT_CONFIG_LOGO_PREFIX = "plane-logo:v1:";
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const HEX_COLOR_PATTERN = /^#[\dA-Fa-f]{6}$/;
const PLAIN_EMOJI_PATTERN =
  /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)$/u;

type TReadableSearchParams = Pick<URLSearchParams, "getAll" | "keys">;

type TTableCellLike = {
  querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
  textContent: string | null;
};

type TTableRowLike = {
  cells: ArrayLike<TTableCellLike>;
};

type TTableLike = {
  rows: ArrayLike<TTableRowLike>;
};

type TDocumentLike = {
  querySelectorAll: (selector: string) => ArrayLike<TTableLike>;
};

type TProjectConfigLogoPayload =
  | {
      type: "emoji";
      value: string;
    }
  | {
      type: "icon";
      name: string;
      color: string;
    };

export type TProjectConfigRow = {
  logo: TLogoProps | undefined;
  label: string;
  url: string;
};

export type TProjectConfigRowErrors = Partial<Record<"logo" | "label" | "url", string>>;

export type TProjectConfigRowValidation = {
  errors: TProjectConfigRowErrors;
  normalizedUrl:
    | {
        absoluteUrl: string;
        href: string;
        pathname: string;
        search: string;
      }
    | undefined;
  row: TProjectConfigRow;
};

export type TProjectNavigationEntry = {
  logo: TLogoProps;
  label: string;
  href: string;
  pathname: string;
  search: string;
};

const normalizeCellText = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
const normalizePathname = (value: string) => (value.length > 1 ? value.replace(/\/+$/, "") : value);

const encodeBase64 = (value: Uint8Array) => {
  let output = "";
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index] ?? 0;
    const second = value[index + 1] ?? 0;
    const third = value[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(combined >> 18) & 63];
    output += BASE64_ALPHABET[(combined >> 12) & 63];
    output += index + 1 < value.length ? BASE64_ALPHABET[(combined >> 6) & 63] : "=";
    output += index + 2 < value.length ? BASE64_ALPHABET[combined & 63] : "=";
  }
  return output;
};

const decodeBase64 = (value: string) => {
  if (!/^[\d+/A-Za-z]*={0,2}$/.test(value) || value.length % 4 !== 0) return undefined;

  const output: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index] ?? "");
    const second = BASE64_ALPHABET.indexOf(value[index + 1] ?? "");
    const thirdCharacter = value[index + 2];
    const fourthCharacter = value[index + 3];
    const third = thirdCharacter === "=" ? 0 : BASE64_ALPHABET.indexOf(thirdCharacter ?? "");
    const fourth = fourthCharacter === "=" ? 0 : BASE64_ALPHABET.indexOf(fourthCharacter ?? "");
    if (first < 0 || second < 0 || third < 0 || fourth < 0) return undefined;

    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;
    output.push((combined >> 16) & 255);
    if (thirdCharacter !== "=") output.push((combined >> 8) & 255);
    if (fourthCharacter !== "=") output.push(combined & 255);
  }

  return new Uint8Array(output);
};

const encodeBase64Url = (value: string) =>
  encodeBase64(new TextEncoder().encode(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const decodeBase64Url = (value: string) => {
  if (!/^[\w-]+$/.test(value)) return undefined;
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const decoded = decodeBase64(base64);
  if (!decoded) return undefined;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch {
    return undefined;
  }
};

const normalizeLogo = (logo: TLogoProps | undefined): TLogoProps | undefined => {
  if (logo?.in_use === "emoji") {
    const value = logo.emoji?.value;
    if (!value) return undefined;
    const emoji = stringToEmoji(value);
    if (!emoji || emojiToString(emoji) !== value || !PLAIN_EMOJI_PATTERN.test(emoji)) return undefined;
    return { in_use: "emoji", emoji: { value } };
  }

  if (logo?.in_use === "icon") {
    const name = logo.icon?.name;
    const color = logo.icon?.color;
    if (!name || !color || !HEX_COLOR_PATTERN.test(color)) return undefined;
    if (!LUCIDE_ICONS_LIST.some((icon) => icon.name === name)) return undefined;
    return { in_use: "icon", icon: { name, color: color.toLowerCase() } };
  }

  return undefined;
};

export const encodeProjectConfigLogo = (logo: TLogoProps) => {
  const normalizedLogo = normalizeLogo(logo);
  if (!normalizedLogo) return undefined;

  const payload: TProjectConfigLogoPayload =
    normalizedLogo.in_use === "emoji"
      ? { type: "emoji", value: normalizedLogo.emoji?.value ?? "" }
      : {
          type: "icon",
          name: normalizedLogo.icon?.name ?? "",
          color: normalizedLogo.icon?.color ?? "",
        };
  return `${PROJECT_CONFIG_LOGO_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
};

export const decodeProjectConfigLogo = (value: string | null | undefined): TLogoProps | undefined => {
  const token = normalizeCellText(value);
  if (!token.startsWith(PROJECT_CONFIG_LOGO_PREFIX)) return undefined;
  const decodedPayload = decodeBase64Url(token.slice(PROJECT_CONFIG_LOGO_PREFIX.length));
  if (!decodedPayload) return undefined;

  try {
    const payload = JSON.parse(decodedPayload) as Partial<TProjectConfigLogoPayload>;
    if (payload.type === "emoji" && typeof payload.value === "string")
      return normalizeLogo({ in_use: "emoji", emoji: { value: payload.value } });
    if (payload.type === "icon" && typeof payload.name === "string" && typeof payload.color === "string")
      return normalizeLogo({ in_use: "icon", icon: { name: payload.name, color: payload.color } });
  } catch {
    return undefined;
  }

  return undefined;
};

const hasConfigHeaders = (table: TTableLike) => {
  const headerCells = Array.from(table.rows[0]?.cells ?? []);
  if (headerCells.length !== 3) return false;

  return ["icon", "label", "url"].every(
    (header, index) => normalizeCellText(headerCells[index]?.textContent).toLowerCase() === header
  );
};

const getConfigTable = (document: TDocumentLike) =>
  Array.from(document.querySelectorAll("table")).find(hasConfigHeaders);

const normalizeSameOriginUrl = (rawHref: string, origin: string) => {
  try {
    const url = new URL(rawHref, origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return undefined;

    return {
      absoluteUrl: url.href,
      href: `${url.pathname}${url.search}${url.hash}`,
      pathname: url.pathname,
      search: url.search,
    };
  } catch {
    return undefined;
  }
};

export const getProjectConfigNavigationCacheKey = (workspaceSlug: string, projectId: string) =>
  `PROJECT_CONFIG_NAVIGATION_${workspaceSlug}_${projectId}`;

export const isProjectConfigPage = (page: Pick<TPage, "name"> | undefined) =>
  page?.name?.trim() === PROJECT_CONFIG_PAGE_NAME;

export const isProjectConfigPageVisible = (page: Pick<TPage, "name">, isProjectAdmin: boolean) =>
  !isProjectConfigPage(page) || isProjectAdmin;

export const reorderProjectConfigRows = <TRow extends { id: string }>(
  rows: TRow[],
  sourceId: string,
  destinationId: string,
  edge: string | null
) => {
  const sourceIndex = rows.findIndex((row) => row.id === sourceId);
  if (sourceIndex < 0) return rows;
  const reorderedRows = [...rows];
  const [sourceRow] = reorderedRows.splice(sourceIndex, 1);
  if (!sourceRow) return rows;
  const destinationIndex = reorderedRows.findIndex((row) => row.id === destinationId);
  if (destinationIndex < 0) return rows;
  reorderedRows.splice(destinationIndex + (edge === "bottom" ? 1 : 0), 0, sourceRow);
  return reorderedRows;
};

export const findProjectConfigPage = (pages: TPage[]) => {
  const matches = pages.filter(
    (page) => isProjectConfigPage(page) && page.access === EPageAccess.PUBLIC && !page.archived_at && !page.deleted_at
  );

  return matches.length === 1 ? matches[0] : undefined;
};

export const getProjectConfigPageCount = (
  pages: Array<Pick<TPage, "name" | "access" | "archived_at" | "deleted_at">>
) =>
  pages.filter(
    (page) => isProjectConfigPage(page) && page.access === EPageAccess.PUBLIC && !page.archived_at && !page.deleted_at
  ).length;

export const parseProjectConfigDocument = (document: TDocumentLike) => {
  const table = getConfigTable(document);
  if (!table) return { hasConfigTable: false, rows: [] as TProjectConfigRow[] };

  const rows = Array.from(table.rows)
    .slice(1)
    .map((row): TProjectConfigRow | undefined => {
      const cells = Array.from(row.cells);
      if (cells.length !== 3) return undefined;
      const urlCell = cells[2];
      const linkedUrl = urlCell?.querySelector("a[href]")?.getAttribute("href");
      return {
        logo: decodeProjectConfigLogo(cells[0]?.textContent),
        label: normalizeCellText(cells[1]?.textContent),
        url: linkedUrl ?? normalizeCellText(urlCell?.textContent),
      };
    })
    .filter((row): row is TProjectConfigRow => !!row);

  return { hasConfigTable: true, rows };
};

export const parseProjectConfigHtml = (html: string) => {
  if (!html || typeof DOMParser === "undefined") return { hasConfigTable: false, rows: [] as TProjectConfigRow[] };
  return parseProjectConfigDocument(new DOMParser().parseFromString(html, "text/html"));
};

export const hasMeaningfulProjectConfigContent = (html: string) => {
  if (!html) return false;
  const withoutMarkup = html
    .replace(/<(?:br|hr)\s*\/?\s*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, "")
    .trim();
  return withoutMarkup.length > 0 || /<(?:audio|embed|iframe|img|video)\b/i.test(html);
};

export const validateProjectConfigRows = (rows: TProjectConfigRow[], origin: string): TProjectConfigRowValidation[] => {
  const preliminary = rows.map((row) => {
    const errors: TProjectConfigRowErrors = {};
    const normalizedLogo = normalizeLogo(row.logo);
    const label = row.label.trim();
    const normalizedUrl = row.url.trim() ? normalizeSameOriginUrl(row.url.trim(), origin) : undefined;

    if (!normalizedLogo) errors.logo = "Select an emoji or icon.";
    if (!label) errors.label = "Enter a label.";
    if (!normalizedUrl) errors.url = "Enter a valid URL on this Plane installation.";

    return {
      errors,
      normalizedUrl,
      row: {
        logo: normalizedLogo,
        label,
        url: normalizedUrl?.absoluteUrl ?? row.url.trim(),
      },
    };
  });
  const urlCounts = new Map<string, number>();
  for (const result of preliminary) {
    if (result.normalizedUrl)
      urlCounts.set(result.normalizedUrl.href, (urlCounts.get(result.normalizedUrl.href) ?? 0) + 1);
  }

  for (const result of preliminary) {
    if (result.normalizedUrl && (urlCounts.get(result.normalizedUrl.href) ?? 0) > 1)
      result.errors.url = "Each navigation URL must be unique.";
  }
  return preliminary;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const serializeProjectConfigRows = (rows: TProjectConfigRow[], origin: string) => {
  const validation = validateProjectConfigRows(rows, origin);
  if (validation.some((result) => Object.keys(result.errors).length > 0))
    throw new Error("Project Config contains invalid rows.");

  const serializedRows = validation
    .map(({ row }) => {
      const logo = row.logo ? encodeProjectConfigLogo(row.logo) : undefined;
      if (!logo) throw new Error("Project Config contains an invalid icon.");
      return `<tr><td><p>${escapeHtml(logo)}</p></td><td><p>${escapeHtml(row.label)}</p></td><td><p><a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a></p></td></tr>`;
    })
    .join("");

  return `<table><tbody><tr><th><p>Icon</p></th><th><p>Label</p></th><th><p>URL</p></th></tr>${serializedRows}</tbody></table>`;
};

export const parseProjectNavigationDocument = (document: TDocumentLike, origin: string): TProjectNavigationEntry[] => {
  const { rows } = parseProjectConfigDocument(document);
  return validateProjectConfigRows(rows, origin).flatMap(({ errors, normalizedUrl, row }) => {
    if (Object.keys(errors).length > 0 || !normalizedUrl || !row.logo) return [];
    return [
      {
        logo: row.logo,
        label: row.label,
        href: normalizedUrl.href,
        pathname: normalizedUrl.pathname,
        search: normalizedUrl.search,
      },
    ];
  });
};

export const parseProjectNavigationHtml = (html: string, origin: string): TProjectNavigationEntry[] => {
  if (!html || typeof DOMParser === "undefined") return [];
  return parseProjectNavigationDocument(new DOMParser().parseFromString(html, "text/html"), origin);
};

export const isProjectNavigationEntryActive = (
  entry: Pick<TProjectNavigationEntry, "pathname" | "search">,
  currentPathname: string,
  currentSearchParams: TReadableSearchParams
) => {
  if (normalizePathname(currentPathname) !== normalizePathname(entry.pathname)) return false;

  const configuredParams = new URLSearchParams(entry.search);
  const queryKeys = new Set([...configuredParams.keys(), ...currentSearchParams.keys()]);
  for (const key of queryKeys) {
    const configuredValues = configuredParams.getAll(key);
    const currentValues = currentSearchParams.getAll(key);
    // oxlint-disable-next-line unicorn/no-array-sort
    configuredValues.sort();
    // oxlint-disable-next-line unicorn/no-array-sort
    currentValues.sort();
    if (
      configuredValues.length !== currentValues.length ||
      configuredValues.some((value, index) => value !== currentValues[index])
    )
      return false;
  }

  return true;
};
