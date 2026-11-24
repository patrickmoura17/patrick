"use client";
// Public website inquiry form. Embed on the company website (iframe or link):
// every submission creates/dedupes the customer, opens a lead in the pipeline
// and notifies the sales team via automations.
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { bootData } from "@/lib/auth";
import { submitInquiry } from "@/lib/portal";
import { db } from "@/lib/store";
import { supabaseConfigured } from "@/lib/backends/supabase";
import { ServicePicker } from "@/components/forms";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { ServiceCategory } from "@/lib/types";

export default function InquiryPage() {
  const [company, setCompany] = useState<{ name: string; tagline: string; phone: string } | null>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", address: "", services: [] as ServiceCategory[], budget: "", timeline: "Within 1–3 months", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (supabaseConfigured()) return;
    void bootData().then(() => {
      const c = db.all("company_settings")[0];
      if (c) setCompany(c);
    });
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.website) return setDone(true); // honeypot
    if (!f.name.trim() || (!f.email.trim() && !f.phone.trim())) return setErr("Please share your name and an email or phone number.");
    setBusy(true);
    setErr("");
    try {
      await submitInquiry({ name: f.name, email: f.email, phone: f.phone, address: f.address, services: f.services, message: `${f.message}\n\nTimeline: ${f.timeline}`.trim(), budget: Number(f.budget.replace(/[^\d.]/g, "")) || 0, source: "Website" });
      setDone(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="noise min-h-screen bg-ink-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">{company?.tagline ?? "Tile · Flooring · Cabinetry · Stone"}</p>
          <h1 className="mt-2 text-3xl font-semibold">{company?.name ?? "Request a free estimate"}</h1>
          <p className="mt-2 text-sm text-stone-400">Tell us about your project — we&apos;ll reach out within one business day to schedule a consultation.</p>
        </div>
        <Card className="p-6 md:p-8">
          {done ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-sage-600" />
              <h2 className="mt-3 text-xl font-semibold">Thank you, {f.name.split(" ")[0] || "friend"}!</h2>
              <p className="mt-1 text-sm text-stone-500">Your request was received. A design consultant will contact you shortly{company?.phone ? ` — or call us at ${company.phone}` : ""}.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
              <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
              <Field label="Email" className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
              <Field label="Project address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} autoComplete="street-address" /></Field>
              <Field label="What can we help with?" className="sm:col-span-2"><ServicePicker value={f.services} onChange={(services) => setF({ ...f, services })} /></Field>
              <Field label="Approximate budget"><Input value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder="$15,000" /></Field>
              <Field label="Timeline"><Select value={f.timeline} onChange={(e) => setF({ ...f, timeline: e.target.value })}>{["As soon as possible", "Within 1–3 months", "3–6 months", "Just planning"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Project details" className="sm:col-span-2"><Textarea className="min-h-[110px]" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Rooms, square footage, materials you love…" /></Field>
              <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden />
              {err && <p className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700 sm:col-span-2">{err}</p>}
              <Button type="submit" variant="brass" size="lg" className="sm:col-span-2" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request my free estimate"}</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
