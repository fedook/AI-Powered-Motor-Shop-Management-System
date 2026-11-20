import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Search, Filter } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { Badge } from "../components/ui/Badge";
import { IconButton } from "../components/ui/IconButton";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import {
  listProducts,
  listCategories,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../services/data.service";
import type { Category, Product } from "../types";
import { formatCurrency } from "../utils/format";

interface ProductForm {
  categoryId: string;
  name: string;
  sku: string;
  description: string;
  purchasePrice: string;
  sellingPrice: string;
  stockQuantity: string;
  minimumStock: string;
  imageUrl: string;
}

const emptyForm: ProductForm = {
  categoryId: "",
  name: "",
  sku: "",
  description: "",
  purchasePrice: "",
  sellingPrice: "",
  stockQuantity: "0",
  minimumStock: "5",
  imageUrl: "",
};

export default function ProductsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sort, setSort] = useState("created_desc");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => toast.error("Failed to load categories."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await listProducts({
        page,
        pageSize: 20,
        search: search || undefined,
        categoryId: categoryId || undefined,
        lowStock: lowStockOnly || undefined,
        sort,
      });
      setProducts(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, categoryId, lowStockOnly, sort]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id || "" });
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      categoryId: product.categoryId,
      name: product.name,
      sku: product.sku,
      description: product.description || "",
      purchasePrice: product.purchasePrice != null ? String(product.purchasePrice) : "",
      sellingPrice: String(product.sellingPrice),
      stockQuantity: String(product.stockQuantity),
      minimumStock: String(product.minimumStock),
      imageUrl: product.imageUrl || "",
    });
    setModalOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          categoryId: form.categoryId,
          name: form.name.trim(),
          sku: form.sku.trim().toUpperCase(),
          description: form.description.trim() || null,
          sellingPrice: Number(form.sellingPrice),
          minimumStock: Number(form.minimumStock),
          imageUrl: form.imageUrl.trim() || null,
        };
        if (isAdmin && form.purchasePrice !== "") payload.purchasePrice = Number(form.purchasePrice);
        await updateProduct(editing.id, payload);
        toast.success("Product updated.");
      } else {
        await createProduct({
          categoryId: form.categoryId,
          name: form.name.trim(),
          sku: form.sku.trim().toUpperCase(),
          description: form.description.trim() || null,
          purchasePrice: Number(form.purchasePrice),
          sellingPrice: Number(form.sellingPrice),
          stockQuantity: Number(form.stockQuantity),
          minimumStock: Number(form.minimumStock),
          imageUrl: form.imageUrl.trim() || null,
        });
        toast.success("Product created.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget.id);
      toast.success("Product deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to delete product.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Manage catalog, pricing, and stock levels."
        actions={
          isAdmin ? (
            <Button onClick={openCreate} disabled={categories.length === 0}>
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          ) : undefined
        }
      />

      <div className="card toolbar">
        <div className="grid gap-3 md:grid-cols-4">
          <form
            className="md:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(searchInput.trim());
            }}
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search by name or SKU..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  left={<Search className="h-4 w-4" />}
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </div>
          </form>
          <Select value={categoryId} onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
            <option value="created_desc">Newest</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="price_asc">Price low–high</option>
            <option value="price_desc">Price high–low</option>
            <option value="stock_asc">Stock low–high</option>
            <option value="stock_desc">Stock high–low</option>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => { setPage(1); setLowStockOnly(e.target.checked); }}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <Filter className="h-4 w-4" /> Low stock only
          </label>
          {(search || categoryId || lowStockOnly) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setCategoryId(""); setLowStockOnly(false); setPage(1); }}
              className="text-link"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner label="Loading products..." />
        ) : products.length === 0 ? (
          <EmptyState
            title="No products found"
            description={isAdmin ? "Add your first product to start selling." : "No products match your filters."}
            action={isAdmin ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Product</Button> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    {isAdmin && <th scope="col">Cost</th>}
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Status</th>
                    {isAdmin && <th scope="col" className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const low = product.stockQuantity <= product.minimumStock;
                    const out = product.stockQuantity === 0;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/60">
                        <td>
                          <p className="font-medium text-slate-900">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.sku}</p>
                        </td>
                        <td className="text-slate-600">
                          {product.category?.name || categoryMap.get(product.categoryId) || "—"}
                        </td>
                        {isAdmin && <td className="text-slate-600">{formatCurrency(product.purchasePrice ?? 0)}</td>}
                        <td className="font-medium text-slate-800">{formatCurrency(product.sellingPrice)}</td>
                        <td className="text-slate-700">
                          {product.stockQuantity} <span className="text-slate-400">/ min {product.minimumStock}</span>
                        </td>
                        <td>
                          <Badge tone={out ? "red" : low ? "amber" : "green"}>
                            {out ? "Out of stock" : low ? "Low stock" : "In stock"}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td>
                            <div className="flex justify-end gap-1">
                              <IconButton label={`Edit ${product.name}`} onClick={() => openEdit(product)}><Pencil className="h-4 w-4" /></IconButton>
                              <IconButton label={`Delete ${product.name}`} tone="danger" onClick={() => setDeleteTarget(product)}><Trash2 className="h-4 w-4" /></IconButton>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Edit Product" : "Add Product"}
        description={editing ? "Stock quantity is managed through Inventory movements." : "Set opening stock; it will be recorded as an inventory movement."}
        onClose={() => setModalOpen(false)}
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="product-form" loading={saving}>{editing ? "Save Changes" : "Create Product"}</Button>
          </>
        }
      >
        <form id="product-form" onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Product name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <Select label="Category" required value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="SKU" required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))} placeholder="e.g. HEL-001" />
          <Input label="Selling price (PHP)" type="number" min="0" step="0.01" required value={form.sellingPrice} onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))} />
          {isAdmin && (
            <Input label="Purchase/cost price (PHP)" type="number" min="0" step="0.01" required={!editing} value={form.purchasePrice} onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))} hint={editing ? "Leave blank to keep current cost." : undefined} />
          )}
          {!editing && isAdmin && (
            <Input label="Opening stock quantity" type="number" min="0" step="1" required value={form.stockQuantity} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} />
          )}
          <Input label="Minimum stock level" type="number" min="0" step="1" required value={form.minimumStock} onChange={(e) => setForm((f) => ({ ...f, minimumStock: e.target.value }))} />
          <div className="sm:col-span-2">
            <Input label="Image URL (optional)" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete product"
        message={`Delete "${deleteTarget?.name}"? Products with sales or inventory history cannot be deleted.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
