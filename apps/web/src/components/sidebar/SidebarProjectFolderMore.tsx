import { ChevronDownIcon } from "lucide-react";
import { useGT } from "gt-react";
import { memo } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { sidebarFolderRowId } from "./SidebarProjectFolder";

/** Reveals the folder's next page of threads; closing the folder folds them back. */
export const SidebarProjectFolderMore = memo(function SidebarProjectFolderMore(props: {
  group: SidebarProjectSnapshot;
  nextCount: number;
  onShowMore: (group: SidebarProjectSnapshot) => void;
}) {
  const gt = useGT();
  const { group, nextCount } = props;
  if (nextCount === 0) return null;
  const rowId = sidebarFolderRowId(group.projectKey);
  return (
    <li className="list-none">
      <button
        type="button"
        data-sidebar-row={`${rowId}:more`}
        data-sidebar-parent={rowId}
        onClick={() => props.onShowMore(group)}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-(--control-radius) ps-9 pe-2.5 text-left text-xs text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" />
        {gt("{count, plural, one {Show {count} more} other {Show {count} more}}", {
          count: nextCount,
        })}
      </button>
    </li>
  );
});
