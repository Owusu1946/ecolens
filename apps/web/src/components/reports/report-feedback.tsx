"use client";

import { Button } from "@ecolens/ui/components/button";
import { Textarea } from "@ecolens/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { useDataUser } from "@/components/shell/offline-data";
import { useCanCallApi } from "@/components/shell/use-me";
import { outbox, useOutbox } from "@/lib/offline/outbox";
import { orpc } from "@/utils/orpc";

// MEL "decision usefulness" (brief section 9): one quick answer per reader,
// which they can change. Saved through the outbox like any other action.
export function ReportFeedback({ reportId, reportRef }: { reportId: string; reportRef: string }) {
  const userId = useDataUser();
  const saved = useQuery({
    ...orpc.dashboard.myFeedback.queryOptions({
      input: { targetType: "report", targetId: reportId },
    }),
    enabled: useCanCallApi(),
  });
  const queued = useOutbox(userId).findLast(
    (i) => i.path[1] === "feedback" && i.input.targetId === reportId,
  );
  const current = queued ? (queued.input.useful as boolean) : (saved.data?.useful ?? null);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");

  async function send(useful: boolean, text?: string) {
    if (!userId) return;
    await outbox.enqueue(
      userId,
      ["dashboard", "feedback"],
      { targetType: "report", targetId: reportId, useful, comment: text || undefined },
      `Feedback on ${reportRef}`,
    );
  }

  if (choice !== null) {
    return (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(choice, comment.trim());
          setChoice(null);
          setComment("");
        }}
      >
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={choice ? "What made it useful? (optional)" : "What was missing? (optional)"}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setChoice(null)}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Send
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">
        {current === null
          ? "Did this report help a decision?"
          : `You found it ${current ? "useful" : "not useful"}.`}
      </span>
      <Button
        variant={current === true ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={current === true}
        onClick={() => setChoice(true)}
      >
        <ThumbsUp /> Useful
      </Button>
      <Button
        variant={current === false ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={current === false}
        onClick={() => setChoice(false)}
      >
        <ThumbsDown /> Not useful
      </Button>
    </div>
  );
}
