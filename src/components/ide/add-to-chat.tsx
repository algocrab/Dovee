"use client";

import { MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useIde } from "@/stores/ide-store";

export type ChatSpot = {
  /** viewport x of the button anchor */
  x: number;
  /** viewport y of the button anchor */
  y: number;
  /** true when the button should hang below the anchor instead of above */
  below?: boolean;
  text: string;
  /** optional source hint, e.g. "`src/app/page.tsx` (lines 12-20)" */
  label?: string;
};

export function selectionToMessage(text: string, label?: string) {
  const body = text.trim();
  if (!body) return "";
  const head = label ? `From ${label}:` : "Selected text:";
  return `${head}\n\`\`\`\n${body}\n\`\`\``;
}

export function AddToChatButton({ spot, onDone }: { spot: ChatSpot; onDone?: () => void }) {
  const addToChat = useIde((s) => s.addToChat);
  const message = selectionToMessage(spot.text, spot.label);
  if (!message) return null;
  return (
    <button
      type="button"
      title="Add selection to chat"
      style={{ left: spot.x, top: spot.y }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        addToChat(message);
        onDone?.();
      }}
      className={cn(
        "fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-teal/40 bg-bg-2 px-2 py-1 text-[11px] text-teal shadow-lg hover:bg-hover",
        !spot.below && "-translate-y-full",
      )}
    >
      <MessageSquarePlus className="h-3 w-3" />
      Add to chat
    </button>
  );
}

function spotFromRect(rect: DOMRect, text: string, label?: string): ChatSpot {
  const below = rect.top < 56;
  const half = 70;
  return {
    x: Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half),
    y: below ? rect.bottom + 6 : rect.top - 6,
    below,
    text,
    label,
  };
}

/**
 * Watches plain DOM text selections (file tree, git panel, terminal, chat)
 * and offers an "Add to chat" button next to them. Monaco selections are
 * handled by MonacoPane, since they are not exposed through `getSelection()`.
 */
export function SelectionActions() {
  const [spot, setSpot] = useState<ChatSpot | null>(null);

  useEffect(() => {
    function update() {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSpot(null);
        return;
      }
      const text = selection.toString();
      if (!text.trim()) {
        setSpot(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode) as Element | null;
      if (!element) {
        setSpot(null);
        return;
      }
      if (
        element.closest("input, textarea, [contenteditable='true'], .monaco-editor, [data-no-add-to-chat]")
      ) {
        setSpot(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSpot(null);
        return;
      }
      setSpot(spotFromRect(rect, text));
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSpot(null);
    }

    document.addEventListener("selectionchange", update);
    window.addEventListener("resize", update);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!spot) return null;
  return <AddToChatButton spot={spot} onDone={() => setSpot(null)} />;
}
