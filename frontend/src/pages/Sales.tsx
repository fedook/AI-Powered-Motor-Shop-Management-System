import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle2 } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { IconButton } from "../components/ui/IconButton";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import { listProducts, listCustomers, createSale } from "../services/data.service";
import type { Customer, Product, Sale } from "../types";
import { formatCurrency } from "../utils/format";

interface CartLine {
  product: Product;
  quantity: number;
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function SalesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash" | "bank_transfer" | "other">("cash");
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [receipt, setReceipt] = useState<Sale | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [prodRes, custRes] = await Promise.all([
        listProducts({ page: 1, pageSize: 100, sort: "name_asc" }),
        listCustomers({ page: 1, pageSize: 100 }),
      ]);
      setProducts(prodRes.data);
      setCustomers(custRes.data);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load POS data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [products, search]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0),
    [cart],
  );
  const discountValue = isAdmin ? Math.max(0, Number(discount || 0)) : 0;
  const total = Math.max(0, subtotal - discountValue);
  const paid = Number(amountPaid || 0);
  const change = paid - total;
  const canSubmit = cart.length > 0 && total >= 0 && paid >= total && !submitting;

  function addToCart(product: Product) {
    if (product.stockQuantity <= 0) {
      toast.error(`${product.name} is out of stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stockQuantity) {
          toast.error(`Only ${product.stockQuantity} unit(s) available for ${product.name}.`);
          return prev;
        }
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== productId) return line;
          const next = line.quantity + delta;
          if (next > line.product.stockQuantity) {
            toast.error(`Only ${line.product.stockQuantity} unit(s) available.`);
            return line;
          }
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscount("0");
    setAmountPaid("");
    setCustomerId("");
    setPaymentMethod("cash");
    setIdempotencyKey(newIdempotencyKey());
  }

  async function submitSale() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const sale = await createSale({
        customerId: customerId || null,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        discount: discountValue,
        paymentMethod,
        amountPaid: paid,
        idempotencyKey,
      });
      setReceipt(sale);
      toast.success(sale.replayed ? "Sale already recorded (duplicate submission prevented)." : "Sale completed successfully.");
      setCart([]);
      setDiscount("0");
      setAmountPaid("");
      setCustomerId("");
      setIdempotencyKey(newIdempotencyKey());
      // refresh products to reflect deducted stock
      const prodRes = await listProducts({ page: 1, pageSize: 100, sort: "name_asc" });
      setProducts(prodRes.data);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to complete sale.");
      // on failure keep cart but rotate key only if we want retry-as-new; keep same for idempotent retry
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner label="Loading POS..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales / POS"
        subtitle="Create transactions with server-side pricing, stock checks, and idempotent submission."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="card toolbar">
            <Input
              placeholder="Search products by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              left={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="card overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <table className="data-table">
                <thead className="sticky top-0">
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col" className="text-right">Add</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr><td colSpan={4}><EmptyState title="No products found" description="Try a different search term." /></td></tr>
                  ) : filteredProducts.map((p) => {
                    const inCart = cart.find((l) => l.product.id === p.id)?.quantity ?? 0;
                    const available = p.stockQuantity - inCart;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td>
                          <p className="font-medium text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.sku} • {p.category?.name || "—"}</p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{formatCurrency(p.sellingPrice)}</td>
                        <td>
                          <Badge tone={available <= 0 ? "red" : available <= p.minimumStock ? "amber" : "green"}>
                            {available} avail
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => addToCart(p)} disabled={available <= 0}>
                            <Plus className="h-4 w-4" /> Add
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-brand-700" />
                <h2 className="card-title">Current Sale</h2>
              </div>
              {cart.length > 0 && (
                <button type="button" onClick={clearCart} className="text-sm text-slate-500 hover:text-rose-700">Clear</button>
              )}
            </div>

            {cart.length === 0 ? (
              <EmptyState title="Your cart is empty" description="Add products to start a sale." />
            ) : (
              <div className="space-y-3">
                {cart.map((line) => (
                  <div key={line.product.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{line.product.name}</p>
                      <p className="text-xs text-slate-500">{formatCurrency(line.product.sellingPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconButton label={`Decrease quantity of ${line.product.name}`} className="border border-slate-200" onClick={() => updateQty(line.product.id, -1)}><Minus className="h-3.5 w-3.5" /></IconButton>
                      <span className="w-8 text-center text-sm font-medium" aria-label={`Quantity: ${line.quantity}`}>{line.quantity}</span>
                      <IconButton label={`Increase quantity of ${line.product.name}`} className="border border-slate-200" onClick={() => updateQty(line.product.id, 1)}><Plus className="h-3.5 w-3.5" /></IconButton>
                    </div>
                    <p className="w-24 text-right text-sm font-semibold">{formatCurrency(line.product.sellingPrice * line.quantity)}</p>
                    <IconButton label={`Remove ${line.product.name} from cart`} tone="danger" onClick={() => removeLine(line.product.id)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              <Select label="Customer (optional)" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </Select>
                <Input label="Discount (PHP)" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={!isAdmin} hint={isAdmin ? undefined : "Admin only"} />
              </div>
              <Input label="Amount paid (PHP)" type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />

              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-slate-500">Discount</span><span>-{formatCurrency(discountValue)}</span></div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
                <div className="mt-1 flex justify-between"><span className="text-slate-500">Change</span><span className={change < 0 ? "text-rose-600 font-medium" : "font-medium"}>{amountPaid ? formatCurrency(Math.max(0, change)) : "—"}</span></div>
                {amountPaid && change < 0 && <p className="mt-2 text-xs text-rose-600">Amount paid is less than the total due.</p>}
              </div>

              <Button className="w-full" onClick={submitSale} disabled={!canSubmit} loading={submitting}>
                <CheckCircle2 className="h-4 w-4" /> Complete Sale
              </Button>
              <p className="text-xs text-slate-500">Stock is validated and deducted in a single database transaction. Duplicate submissions are prevented with an idempotency key.</p>
            </div>
          </div>
        </div>
      </div>

      <Modal open={!!receipt} title={receipt ? `Sale ${receipt.transactionNumber}` : "Receipt"} description="Transaction recorded successfully." onClose={() => setReceipt(null)} width="lg"
        footer={receipt ? <Button onClick={() => window.print()} variant="secondary">Print Receipt</Button> : undefined}>
        {receipt && (
          <div className="print-area space-y-4">
            <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
              <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Payment recorded</p>
              <p className="mt-1 text-sm">Change due: <span className="font-semibold">{formatCurrency(receipt.changeAmount)}</span></p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Customer:</span> <span className="font-medium">{receipt.customerName || "Walk-in"}</span></div>
              <div><span className="text-slate-500">Cashier:</span> <span className="font-medium">{receipt.cashierName || user?.name}</span></div>
              <div><span className="text-slate-500">Payment:</span> {receipt.paymentMethod}</div>
              <div><span className="text-slate-500">Status:</span> <Badge tone={receipt.status === "completed" ? "green" : "red"}>{receipt.status}</Badge></div>
            </div>
            {receipt.items && receipt.items.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="data-table data-table-compact">
                  <thead><tr><th scope="col" className="px-4 py-2">Item</th><th scope="col" className="px-4 py-2 text-right">Qty</th><th scope="col" className="px-4 py-2 text-right">Subtotal</th></tr></thead>
                  <tbody>{receipt.items.map((i) => (<tr key={i.id || i.productId}><td className="px-4 py-2">{i.productName}</td><td className="px-4 py-2 text-right">{i.quantity}</td><td className="px-4 py-2 text-right">{formatCurrency(i.subtotal ?? 0)}</td></tr>))}</tbody>
                </table>
              </div>
            )}
            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(receipt.subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(receipt.discount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Total</span><span>{formatCurrency(receipt.totalAmount)}</span></div>
              <div className="flex justify-between"><span>Paid</span><span>{formatCurrency(receipt.amountPaid)}</span></div>
              <div className="flex justify-between"><span>Change</span><span>{formatCurrency(receipt.changeAmount)}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
