"use client";
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { sendMessage } from "@/lib/services";
import { ago } from "@/lib/format";
import { Button, Card, CardHeader, Textarea, cn } from "./ui";

export function MessageThread({ customerId, projectId }: { customerId: string; projectId: string | null }) {
  const S = useSnapshot();
  const [body, setBody] = useState("");
  const msgs = S.messages.filter((m) => m.customer_id === customerId && (!projectId || m.project_id === projectId || !m.project_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const unread = msgs.filter((m) => m.sender === "customer" && !m.read);
  useEffect(() => {
    if (!unread.length) return;
    const t = setTimeout(() => unread.forEach((m) => db.update("messages", m.id, { read: true })), 800);
    return () => clearTimeout(t);
  }, [unread]);
  return (
    <Card>
      <CardHeader title="Messages" subtitle="Two-way conversation with the customer portal" />
      <div className="max-h-[480px] space-y-3 overflow-y-auto p-5">
        {!msgs.length && <p className="py-6 text-center text-sm text-stone-400">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.sender === "staff" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", m.sender === "staff" ? "rounded-br-sm bg-ink-900 text-white" : "rounded-bl-sm bg-stone-100 text-ink-900")}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={cn("mt-1 text-[10px]", m.sender === "staff" ? "text-stone-400" : "text-stone-500")}>
                {m.sender === "staff" ? db.get("profiles", m.user_id)?.full_name ?? "Team" : "Customer"} · {ago(m.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-stone-100 p-3">
        <Textarea className="min-h-[44px]" rows={1} placeholder="Reply to customer…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button variant="primary" disabled={!body.trim()} onClick={() => { sendMessage(customerId, projectId, body.trim(), "staff"); setBody(""); }} icon={<Send className="h-4 w-4" />}>Send</Button>
      </div>
    </Card>
  );
}
