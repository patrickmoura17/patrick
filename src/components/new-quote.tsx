"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSnapshot } from "@/lib/store";
import { createCountertopQuote, custName } from "@/lib/services";
import { Button, Field, Input, Modal, Select } from "./ui";

export function NewQuoteModal({ open, onClose, customerId, leadId, estimateId }: { open: boolean; onClose: () => void; customerId?: string; leadId?: string | null; estimateId?: string | null }) {
  const S = useSnapshot();
  const router = useRouter();
  const [cust, setCust] = useState(customerId ?? "");
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) {
      setCust(customerId ?? "");
      const c = S.customers.find((x) => x.id === customerId);
      setName(c ? `${c.last_name || c.company} Kitchen` : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);
  return (
    <Modal open={open} onClose={onClose} title="New countertop quote" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!cust} onClick={() => {
      const lead = leadId ?? S.leads.find((l) => l.customer_id === cust && l.status === "open")?.id ?? null;
      const qt = createCountertopQuote({ customer_id: cust, lead_id: lead, estimate_id: estimateId ?? null, name });
      onClose();
      router.push(`/countertop-quote/${qt.id}`);
    }}>Start drawing</Button></>}>
      <div className="space-y-3">
        <Field label="Customer" required>
          <Select value={cust} disabled={!!customerId} onChange={(e) => { setCust(e.target.value); const c = S.customers.find((x) => x.id === e.target.value); if (c && !name) setName(`${c.last_name || c.company} Kitchen`); }}>
            <option value="">Select…</option>
            {[...S.customers].sort((a, b) => custName(a).localeCompare(custName(b))).map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
          </Select>
        </Field>
        <Field label="Quote name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harrison Kitchen" /></Field>
      </div>
    </Modal>
  );
}
