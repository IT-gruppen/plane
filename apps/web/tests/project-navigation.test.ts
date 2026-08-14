import { describe, expect, it } from "vitest";
import { convertHTMLDocumentToAllFormats } from "@plane/editor";
import { emojiToString } from "@plane/propel/emoji-icon-picker";
import { EPageAccess } from "@plane/types";
import type { TLogoProps, TPage } from "@plane/types";
import {
  decodeProjectConfigLogo,
  encodeProjectConfigLogo,
  findProjectConfigPage,
  getProjectConfigPageCount,
  isProjectConfigPageVisible,
  isProjectNavigationEntryActive,
  parseProjectConfigDocument,
  parseProjectNavigationDocument,
  reorderProjectConfigRows,
  serializeProjectConfigRows,
  validateProjectConfigRows,
} from "@/helpers/project-navigation";

const createCell = (textContent: string, href?: string) => ({
  textContent,
  querySelector: () => (href ? { getAttribute: (name: string) => (name === "href" ? href : null) } : null),
});

const createDocument = (tables: Array<Array<Array<{ text: string; href?: string }>>>) => ({
  querySelectorAll: () =>
    tables.map((rows) => ({
      rows: rows.map((cells) => ({
        cells: cells.map((cell) => createCell(cell.text, cell.href)),
      })),
    })),
});

const calendarLogo: TLogoProps = {
  in_use: "icon",
  icon: { name: "Calendar", color: "#6D7B8A" },
};
const meetingEmojiLogo: TLogoProps = {
  in_use: "emoji",
  emoji: { value: emojiToString("📅") },
};

describe("Project Config Page", () => {
  it("selects exactly one public, active Project Config Page", () => {
    const page = {
      id: "page-1",
      name: "Project Config",
      access: EPageAccess.PUBLIC,
      archived_at: null,
      deleted_at: undefined,
    } as TPage;

    expect(findProjectConfigPage([page])).toBe(page);
    expect(findProjectConfigPage([{ ...page, access: EPageAccess.PRIVATE }])).toBeUndefined();
    expect(findProjectConfigPage([{ ...page, archived_at: "2026-08-03" }])).toBeUndefined();
    expect(findProjectConfigPage([{ ...page, name: "Project navigation" }])).toBeUndefined();
    expect(findProjectConfigPage([page, { ...page, id: "page-2" }])).toBeUndefined();
    expect(getProjectConfigPageCount([page, { ...page, id: "page-2" }])).toBe(2);
    expect(isProjectConfigPageVisible(page, true)).toBe(true);
    expect(isProjectConfigPageVisible(page, false)).toBe(false);
    expect(isProjectConfigPageVisible({ name: "Meeting notes" }, false)).toBe(true);
  });

  it("round-trips Plane emoji and Lucide logo values", () => {
    const iconToken = encodeProjectConfigLogo(calendarLogo);
    const emojiToken = encodeProjectConfigLogo(meetingEmojiLogo);

    expect(iconToken).toMatch(/^plane-logo:v1:[\w-]+$/);
    expect(emojiToken).toMatch(/^plane-logo:v1:[\w-]+$/);
    expect(decodeProjectConfigLogo(iconToken)).toEqual({
      in_use: "icon",
      icon: { name: "Calendar", color: "#6d7b8a" },
    });
    expect(decodeProjectConfigLogo(emojiToken)).toEqual(meetingEmojiLogo);
    expect(decodeProjectConfigLogo("plane-logo:v1:malformed")).toBeUndefined();
  });

  it("parses the first matching table in row order", () => {
    const calendarToken = encodeProjectConfigLogo(calendarLogo) ?? "";
    const emojiToken = encodeProjectConfigLogo(meetingEmojiLogo) ?? "";
    const document = createDocument([
      [[{ text: "Other" }]],
      [
        [{ text: "Icon" }, { text: "Label" }, { text: "URL" }],
        [
          { text: calendarToken },
          { text: "Weekly meeting" },
          {
            text: "ignored link text",
            href: "https://plane.example/acme/projects/project-1/issues?layout=kanban&label_id__in=label-1",
          },
        ],
        [{ text: emojiToken }, { text: "Notes" }, { text: "/acme/projects/project-1/pages/page-1" }],
      ],
    ]);

    expect(parseProjectConfigDocument(document)).toEqual({
      hasConfigTable: true,
      rows: [
        {
          logo: { in_use: "icon", icon: { name: "Calendar", color: "#6d7b8a" } },
          label: "Weekly meeting",
          url: "https://plane.example/acme/projects/project-1/issues?layout=kanban&label_id__in=label-1",
        },
        {
          logo: meetingEmojiLogo,
          label: "Notes",
          url: "/acme/projects/project-1/pages/page-1",
        },
      ],
    });
    expect(parseProjectNavigationDocument(document, "https://plane.example")).toEqual([
      {
        logo: { in_use: "icon", icon: { name: "Calendar", color: "#6d7b8a" } },
        label: "Weekly meeting",
        href: "/acme/projects/project-1/issues?layout=kanban&label_id__in=label-1",
        pathname: "/acme/projects/project-1/issues",
        search: "?layout=kanban&label_id__in=label-1",
      },
      {
        logo: meetingEmojiLogo,
        label: "Notes",
        href: "/acme/projects/project-1/pages/page-1",
        pathname: "/acme/projects/project-1/pages/page-1",
        search: "",
      },
    ]);
  });

  it("validates required values, unsafe URLs, and duplicates", () => {
    const results = validateProjectConfigRows(
      [
        { logo: undefined, label: "", url: "https://example.com" },
        { logo: calendarLogo, label: "Valid", url: "/valid" },
        { logo: meetingEmojiLogo, label: "Duplicate", url: "https://plane.example/valid" },
      ],
      "https://plane.example"
    );

    expect(results[0]?.errors).toEqual({
      logo: "Select an emoji or icon.",
      label: "Enter a label.",
      url: "Enter a valid URL on this Plane installation.",
    });
    expect(results[1]?.errors.url).toBe("Each navigation URL must be unique.");
    expect(results[2]?.errors.url).toBe("Each navigation URL must be unique.");
  });

  it("serializes a canonical three-column Page table", () => {
    const html = serializeProjectConfigRows(
      [{ logo: calendarLogo, label: "Weekly & planning", url: "/acme/issues?layout=kanban" }],
      "https://plane.example"
    );

    expect(html).toContain("<th><p>Icon</p></th><th><p>Label</p></th><th><p>URL</p></th>");
    expect(html).toContain("Weekly &amp; planning");
    expect(html).toContain('href="https://plane.example/acme/issues?layout=kanban"');
    expect(html).toContain("plane-logo:v1:");

    const documentPayload = convertHTMLDocumentToAllFormats({ document_html: html, variant: "document" });
    expect(documentPayload.description_binary.length).toBeGreaterThan(0);
    expect(documentPayload.description_html).toContain("<table");
    expect(documentPayload.description_html).toContain("plane-logo:v1:");
    expect(documentPayload.description_html).toContain("Weekly &amp; planning");
    expect(documentPayload.description_html).toContain("https://plane.example/acme/issues?layout=kanban");
    expect(documentPayload.description_json).toMatchObject({ type: "doc" });
  });

  it("reorders rows above and below the drop target", () => {
    const rows = [{ id: "one" }, { id: "two" }, { id: "three" }];
    expect(reorderProjectConfigRows(rows, "three", "one", "top").map(({ id }) => id)).toEqual(["three", "one", "two"]);
    expect(reorderProjectConfigRows(rows, "one", "three", "bottom").map(({ id }) => id)).toEqual([
      "two",
      "three",
      "one",
    ]);
  });

  it("ignores malformed, duplicate, and external rows in sidebar navigation", () => {
    const calendarToken = encodeProjectConfigLogo(calendarLogo) ?? "";
    const document = createDocument([
      [
        [{ text: "Icon" }, { text: "Label" }, { text: "URL" }],
        [{ text: calendarToken }, { text: "External" }, { text: "https://example.com" }],
        [{ text: "malformed" }, { text: "Invalid icon" }, { text: "/invalid-icon" }],
        [{ text: calendarToken }, { text: "Valid" }, { text: "/valid" }],
        [{ text: calendarToken }, { text: "Duplicate" }, { text: "https://plane.example/valid" }],
      ],
    ]);

    expect(parseProjectNavigationDocument(document, "https://plane.example")).toEqual([]);
  });

  it("matches both the path and complete query without depending on parameter order", () => {
    const entry = {
      pathname: "/acme/projects/project-1/issues",
      search: "?layout=kanban&label_id__in=meeting-one",
    };

    expect(
      isProjectNavigationEntryActive(
        entry,
        "/acme/projects/project-1/issues/",
        new URLSearchParams("label_id__in=meeting-one&layout=kanban")
      )
    ).toBe(true);
    expect(
      isProjectNavigationEntryActive(
        entry,
        "/acme/projects/project-1/issues",
        new URLSearchParams("layout=kanban&label_id__in=meeting-two")
      )
    ).toBe(false);
  });
});
