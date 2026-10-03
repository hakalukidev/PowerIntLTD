"use client";

import { useState } from "react";
import { Check, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useERP } from "@/lib/erp/provider";
import type { CustomerCommitment } from "@/lib/erp/types";
import { canActAtStage } from "@/lib/erp/utils";

const STAGE_STYLES: Record<
  "authorizer" | "chairman" | "rejected",
  { label: string; className: string }
> = {
  authorizer: {
    label: "Waiting for Authorizer",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  chairman: {
    label: "Waiting for Chairman",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

/** Where a zone in charge's commitment stands: with the Authorizer, with the Chairman, or rejected. Nothing once approved. */
export function CommitmentApprovalBadge({
  commitment,
}: {
  commitment: CustomerCommitment;
}) {
  const stage = commitment.approvalStage;
  if (stage !== "authorizer" && stage !== "chairman" && stage !== "rejected")
    return null;
  const style = STAGE_STYLES[stage];
  const by =
    stage === "rejected"
      ? commitment.rejectedBy
      : stage === "chairman" && commitment.authorizedBy
        ? `authorized by ${commitment.authorizedBy}`
        : "";
  return (
    <span className={`rounded-md px-2 py-0.5 font-semibold ${style.className}`}>
      {style.label}
      {by ? (
        <span className="font-normal">
          {" "}
          · {stage === "rejected" ? `by ${by}` : by}
        </span>
      ) : null}
    </span>
  );
}

/** Submit-to-Chairman / Approve and Reject buttons, shown only to whoever reviews the commitment at its current stage. */
export function CommitmentReviewActions({
  customerId,
  commitment,
  onError,
}: {
  customerId: string;
  commitment: CustomerCommitment;
  onError: (message: string | null) => void;
}) {
  const { currentUser, reviewCustomerCommitment } = useERP();
  const [busy, setBusy] = useState(false);
  const stage =
    commitment.approvalStage === "authorizer" ||
    commitment.approvalStage === "chairman"
      ? commitment.approvalStage
      : null;
  if (!stage || !canActAtStage(currentUser, stage)) return null;

  async function review(decision: "approve" | "reject") {
    onError(null);
    setBusy(true);
    try {
      await reviewCustomerCommitment(customerId, commitment.id, decision);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "Unable to review commitment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <Button
        type="button"
        size="sm"
        className="h-8 rounded-lg"
        disabled={busy}
        onClick={() => void review("approve")}
      >
        {stage === "authorizer" ? (
          <Send className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        )}
        {stage === "authorizer" ? "Submit to Chairman" : "Approve"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg text-destructive hover:text-destructive"
        disabled={busy}
        onClick={() => void review("reject")}
      >
        <X className="mr-1.5 h-3.5 w-3.5" />
        Reject
      </Button>
    </div>
  );
}
