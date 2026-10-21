import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Category = { id: string; name: string };

export function ProductForm({ productId }: { productId?: string }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    original_price: "",
    stock: "10",
    category_id: "",
    image_url: "",
    is_active: true,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("categories")
      .select("id,name")
      .order("sort_order")
      .then(({ data }) => setCats(data ?? []));
    if (productId) {
      supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle()
        .then(({ data }) => {
          if (data)
            setForm({
              title: data.title,
              description: data.description ?? "",
              price: (data.price_cents / 100).toString(),
              original_price: data.original_price_cents
                ? (data.original_price_cents / 100).toString()
                : "",
              stock: data.stock.toString(),
              category_id: data.category_id ?? "",
              image_url: data.image_url ?? "",
              is_active: data.is_active,
            });
        });
    }
  }, [productId]);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed?.signedUrl) setForm((f) => ({ ...f, image_url: signed.signedUrl }));
      toast.success("Foto geüpload");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        title: form.title,
        description: form.description || null,
        price_cents: Math.round(parseFloat(form.price) * 100),
        original_price_cents: form.original_price
          ? Math.round(parseFloat(form.original_price) * 100)
          : null,
        stock: parseInt(form.stock, 10),
        category_id: form.category_id || null,
        image_url: form.image_url || null,
        is_active: form.is_active,
        seller_id: u.user!.id,
      };
      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
        toast.success("Bijgewerkt");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Product toegevoegd");
      }
      navigate({ to: "/seller/products" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-3 py-4">
      <h1 className="text-2xl font-bold mb-4">
        {productId ? "Product bewerken" : "Nieuw product"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-sm font-medium">Titel</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Beschrijving</label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Prijs (€)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full border border-border rounded px-3 py-2 bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Van-prijs (optioneel)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.original_price}
              onChange={(e) => setForm({ ...form, original_price: e.target.value })}
              className="w-full border border-border rounded px-3 py-2 bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Voorraad</label>
            <input
              required
              type="number"
              min="0"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              className="w-full border border-border rounded px-3 py-2 bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Categorie</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="w-full border border-border rounded px-3 py-2 bg-background"
            >
              <option value="">— kies —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Foto</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            className="w-full text-sm"
          />
          {uploading && <p className="text-xs text-muted-foreground">Bezig met uploaden…</p>}
          {form.image_url && (
            <img
              src={form.image_url}
              alt=""
              className="w-32 h-32 object-cover rounded mt-2"
            />
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Zichtbaar in winkel
        </label>
        <button
          disabled={busy}
          className="w-full bg-brand text-brand-foreground rounded py-2 font-medium"
        >
          {busy ? "Opslaan…" : "Opslaan"}
        </button>
      </form>
    </div>
  );
}
