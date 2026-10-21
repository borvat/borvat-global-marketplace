import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Store } from "lucide-react";

export const Route = createFileRoute("/seller")({
  head: () => ({
    meta: [
      { title: "Word verkoper — marktje" },
      {
        name: "description",
        content: "Verkoop je eigen producten op marktje aan miljoenen kopers.",
      },
      { property: "og:title", content: "Word verkoper — marktje" },
      { property: "og:description", content: "Begin vandaag met verkopen." },
    ],
  }),
  component: Seller,
});

function Seller() {
  const [shopName, setShopName] = useState("");
  const [busy, setBusy] = useState(false);
  const [isSeller, setIsSeller] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      setIsSeller(!!roles?.some((r) => r.role === "seller"));
    })();
  }, []);

  if (signedIn === false) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <Store className="w-10 h-10 text-brand mx-auto mb-3" />
        <h1 className="text-2xl font-bold mb-2">Word verkoper op marktje</h1>
        <p className="text-muted-foreground mb-4">Log eerst in om verkoper te worden.</p>
        <Link
          to="/auth"
          className="inline-block bg-brand text-brand-foreground px-4 py-2 rounded"
        >
          Inloggen
        </Link>
      </div>
    );
  }

  if (isSeller) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <h1 className="text-2xl font-bold mb-2">Je bent al verkoper 🎉</h1>
        <Link
          to="/seller/dashboard"
          className="inline-block bg-brand text-brand-foreground px-4 py-2 rounded mt-3"
        >
          Naar je dashboard
        </Link>
      </div>
    );
  }

  async function become(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user!.id;
      // P0-2: the seller role can only be granted from an approved seller
      // application. There is no client-side INSERT path to user_roles.
      const { error } = await (supabase as any).rpc(
        "grant_seller_role_from_approved_application",
      );
      if (error) {
        toast.error(
          "Je hebt nog geen goedgekeurde verkopersaanvraag. Dien eerst je aanvraag in.",
        );
        navigate({ to: "/seller/onboarding" });
        return;
      }
      await supabase.from("profiles").update({ seller_shop_name: shopName }).eq("id", uid);
      toast.success("Welkom als verkoper!");
      navigate({ to: "/seller/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="bg-card border border-border rounded p-6">
        <Store className="w-10 h-10 text-brand mx-auto mb-3" />
        <h1 className="text-2xl font-bold mb-2 text-center">Word verkoper</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Verkoop je producten aan miljoenen kopers op marktje. Gratis om te beginnen.
        </p>
        <form onSubmit={become} className="space-y-3">
          <input
            required
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Naam van je winkel"
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
          <button
            disabled={busy}
            className="w-full bg-brand text-brand-foreground rounded py-2 font-medium"
          >
            Verkoper worden
          </button>
        </form>
      </div>
    </div>
  );
}
