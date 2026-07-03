import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";

export interface OpmlFeed {
  url: string;
  title: string | null;
  site_url: string | null;
}

interface Outline {
  "@_xmlUrl"?: string;
  "@_htmlUrl"?: string;
  "@_title"?: string;
  "@_text"?: string;
  outline?: Outline | Outline[];
}

export async function parseOpml(path: string): Promise<OpmlFeed[]> {
  const xml = await readFile(path, "utf8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);

  const feeds: OpmlFeed[] = [];
  const root = doc?.opml?.body?.outline;

  const walk = (node: Outline | Outline[] | undefined) => {
    if (!node) return;
    const nodes = Array.isArray(node) ? node : [node];
    for (const n of nodes) {
      if (n["@_xmlUrl"]) {
        feeds.push({
          url: n["@_xmlUrl"],
          title: n["@_title"] || n["@_text"] || null,
          site_url: n["@_htmlUrl"] || null,
        });
      }
      if (n.outline) walk(n.outline);
    }
  };

  walk(root);
  return feeds;
}
