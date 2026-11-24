import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, type SyntheticEvent, useRef } from "react";

import { cn } from "~/lib/utils";
import { ComboboxItem } from "../ui/combobox";

const MODIFIERS = [restrictToVerticalAxis, restrictToFirstScrollableAncestor];
const HANDLE = "[data-project-scope-drag-handle]";

function swallow(event: Event) {
  event.stopPropagation();
  event.preventDefault();
}

// Base UI picks the row under a released pointer, so the release that ends a drag is swallowed.
function swallowReleaseAfterDrag() {
  window.addEventListener("mouseup", swallow, { capture: true });
  window.addEventListener("click", swallow, { capture: true });
  return () =>
    setTimeout(() => {
      window.removeEventListener("mouseup", swallow, { capture: true });
      window.removeEventListener("click", swallow, { capture: true });
    });
}

/** Lets the project picker reorder its rows by a grip, so a press on the row still picks it. */
export function ProjectScopeSortableList(props: {
  projectKeys: readonly string[];
  onReorder: (sourceKey: string, targetKey: string) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const releaseRef = useRef<(() => void) | null>(null);
  const finish = () => {
    releaseRef.current?.();
    releaseRef.current = null;
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    finish();
    if (over === null || active.id === over.id) return;
    props.onReorder(String(active.id), String(over.id));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={MODIFIERS}
      onDragStart={() => {
        releaseRef.current = swallowReleaseAfterDrag();
      }}
      onDragCancel={finish}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={[...props.projectKeys]} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  );
}

const stop = (event: SyntheticEvent) => {
  event.stopPropagation();
};

export function SortableProjectScopeItem({
  sortableId,
  sortable,
  className,
  style,
  children,
  ...itemProps
}: ComponentProps<typeof ComboboxItem> & { sortableId: string; sortable: boolean }) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: sortableId, disabled: !sortable });
  return (
    <ComboboxItem
      {...itemProps}
      ref={setNodeRef}
      style={{ ...style, transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/project-scope-item relative", isDragging && "z-10", className)}
      onPointerDownCapture={(event) => {
        // The item prevents every press to keep focus in the search box, and dnd-kit ignores
        // prevented presses, so a press on the grip skips that.
        if (event.target instanceof Element && event.target.closest(HANDLE)) {
          (event as typeof event & { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
        }
      }}
    >
      {sortable ? (
        <span
          ref={setActivatorNodeRef}
          aria-hidden
          data-project-scope-drag-handle=""
          data-testid="project-scope-drag-handle"
          className="-ms-1.5 flex h-6 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground opacity-0 group-hover/project-scope-item:opacity-100 active:cursor-grabbing pointer-coarse:opacity-100"
          onPointerDown={(event) => {
            listeners?.onPointerDown?.(event);
            stop(event);
          }}
          onMouseDown={(event) => {
            // Keeps focus in the search box, as a press elsewhere on the row does.
            event.preventDefault();
            stop(event);
          }}
          onClick={stop}
        >
          <GripVerticalIcon className="size-3" />
        </span>
      ) : null}
      {children}
    </ComboboxItem>
  );
}
