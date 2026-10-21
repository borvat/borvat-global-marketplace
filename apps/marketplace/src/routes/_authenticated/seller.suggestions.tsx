import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/seller/suggestions")({
  head: () => ({
    meta: [
      { title: "AI-suggesties — Borvat® Verkoper" },
      { name: "description", content: "Bekijk en accepteer AI-suggesties voor je productcatalogus." },
    ],
  }),
  component: SuggestionsPage,
});

type Suggestion = {
  id: string;
  product_id: string | null;
  suggestion_type: string;
  current_value: { value?: string; price_cents?: number; market_avg_cents?: number | null } | null;
  suggested_value: { value?: string; price_cents?: number };
  reasoning: string | null;
  status: string;
  created_at: string;
};

function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as Suggestion[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function decide(s: Suggestion, accept: boolean) {
    // Route through the secure SECURITY DEFINER RPC — the client cannot update
    // product_suggestions directly (UPDATE is revoked). The RPC enforces:
    // ownership, single-apply (status='pending'), product version check, and audit.
    const { error } = await supabase.rpc("decide_product_suggestion", {
      _suggestion_id: s.id,
      _accept: accept,
      _feedback: feedback[s.id] ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success(accept ? "Toegepast" : "Geweigerd");
    load();
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <h1 className="text-2xl font-bold mb-2">AI-suggesties</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All suggestions are drafts. Nothing is applied automatically — you decide.
      </p>
      {loading ? (
        <p>Laden…</p>
      ) : items.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Geen openstaande suggesties.</Card>
      ) : (
        <div className="space-y-4">
          {items.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded bg-primary/10 px-2 py-0.5 font-medium">{s.suggestion_type}</span>
                <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString("nl-NL")}</span>
              </div>
              {s.suggestion_type === "price" ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Huidig</div>
                    <div className="font-medium">€{((s.current_value?.price_cents ?? 0) / 100).toFixed(2)}</div>
                    {s.current_value?.market_avg_cents ? (
                      <div className="text-xs text-muted-foreground">
                        Markt: €{(s.current_value.market_avg_cents / 100).toFixed(2)}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-muted-foreground">Voorgesteld</div>
                    <div className="font-medium text-primary">
                      €{((s.suggested_value.price_cents ?? 0) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Huidig</div>
                    <div>{s.current_value?.value ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Voorgesteld</div>
                    <div className="text-primary">{s.suggested_value.value}</div>
                  </div>
                </div>
              )}
              {s.reasoning && (
                <p className="text-sm bg-muted p-2 rounded">
                  <span className="font-medium">Reden:</span> {s.reasoning}
                </p>
              )}
              <Textarea
                placeholder="Optionele feedback voor de AI (wat werkt wel/niet)…"
                value={feedback[s.id] ?? ""}
                onChange={(e) => setFeedback((f) => ({ ...f, [s.id]: e.target.value }))}
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => decide(s, false)}>Weigeren</Button>
                <Button onClick={() => decide(s, true)}>Accepteren</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
