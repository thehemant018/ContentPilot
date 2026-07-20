import type { ContentBlock, CrawledPage, CrawlResult } from "@/types/crawl";

const SCROLL_PANEL_CLASS =
  "mt-3 max-h-80 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]";

const BLOCK_TYPE_LABELS: Record<ContentBlock["type"], string> = {
  navigation: "Navigation",
  hero: "Hero",
  quote: "Quote",
  video: "Video",
  "rich-text": "Rich text",
  "card-grid": "Card grid",
  media: "Media",
  cta: "CTA",
  footer: "Footer",
  form: "Form",
  section: "Section",
  unknown: "Block",
};

const BLOCK_TYPE_COLORS: Record<ContentBlock["type"], string> = {
  navigation: "bg-sky-100 text-sky-800",
  hero: "bg-teal-100 text-teal-800",
  quote: "bg-indigo-100 text-indigo-800",
  video: "bg-red-100 text-red-800",
  "rich-text": "bg-zinc-100 text-zinc-800",
  "card-grid": "bg-amber-100 text-amber-800",
  media: "bg-pink-100 text-pink-800",
  cta: "bg-orange-100 text-orange-800",
  footer: "bg-slate-100 text-slate-800",
  form: "bg-teal-100 text-teal-800",
  section: "bg-blue-100 text-blue-800",
  unknown: "bg-zinc-100 text-zinc-700",
};

function SubBlockCard({ block }: { block: ContentBlock }) {
  return (
    <li className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BLOCK_TYPE_COLORS[block.type]}`}
        >
          {BLOCK_TYPE_LABELS[block.type]}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">{block.id}</span>
      </div>
      {block.heading && (
        <p className="mt-1 text-xs font-medium text-zinc-800">{block.heading}</p>
      )}
      {block.text && (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{block.text}</p>
      )}
    </li>
  );
}

function BlockCard({ block }: { block: ContentBlock }) {
  const subBlocks = block.subBlocks ?? [];
  const hasSubBlocks = subBlocks.length >= 2;

  return (
    <li className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${BLOCK_TYPE_COLORS[block.type]}`}
        >
          {BLOCK_TYPE_LABELS[block.type]}
        </span>
        <span className="font-mono text-[11px] text-zinc-500">
          {block.selector}
        </span>
        {hasSubBlocks && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
            {subBlocks.length} sub-blocks
          </span>
        )}
      </div>

      {block.heading && (
        <p className="mt-2 text-sm font-semibold text-zinc-900">{block.heading}</p>
      )}

      {block.text && (
        <p className="mt-2 line-clamp-4 text-sm text-zinc-700">{block.text}</p>
      )}

      {(block.links.length > 0 || block.images.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
          {block.links.length > 0 && <span>{block.links.length} link(s)</span>}
          {block.images.length > 0 && <span>{block.images.length} image(s)</span>}
        </div>
      )}

      {hasSubBlocks && (
        <ul className="mt-3 space-y-2 border-l-2 border-blue-200 pl-3">
          {subBlocks.map((subBlock) => (
            <SubBlockCard key={subBlock.id} block={subBlock} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PagePanel({ page, defaultOpen }: { page: CrawledPage; defaultOpen: boolean }) {
  const subBlockCount = page.blocks.reduce(
    (total, block) => total + (block.subBlocks?.length ?? 0),
    0,
  );

  return (
    <details
      className="rounded-xl border border-zinc-200 bg-white p-4"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-900">{page.title}</p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-500">
              {page.url}
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            {page.blocks.length} block(s)
            {subBlockCount > 0 ? ` Â· ${subBlockCount} sub-block(s)` : ""}
          </span>
        </div>
      </summary>

      {page.blocks.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No semantic blocks detected.</p>
      ) : (
        <ul className={`${SCROLL_PANEL_CLASS} space-y-2`}>
          {page.blocks.map((block) => (
            <BlockCard key={`${page.url}-${block.id}`} block={block} />
          ))}
        </ul>
      )}
    </details>
  );
}

export function CrawlResults({ result }: { result: CrawlResult }) {
  if (!result.pages?.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {result.pages.map((page, index) => (
          <PagePanel key={page.url} page={page} defaultOpen={index === 0} />
        ))}
      </div>
    </div>
  );
}
