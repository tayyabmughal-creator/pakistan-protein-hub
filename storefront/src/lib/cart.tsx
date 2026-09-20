"use client";

/**
 * The cart.
 *
 * Lives in localStorage and holds **variant ids and quantities**. Everything
 * else it stores — name, price, image — is a display snapshot so the drawer can
 * render instantly without a round trip.
 *
 * That snapshot is not authoritative and is never sent as the price. Checkout
 * posts variant ids and quantities; the server prices the lines from the
 * catalogue itself (`CheckoutPreparationService._price_lines`). If a price
 * changed while the cart sat in a tab overnight, the server's number wins and
 * the customer is shown the difference before paying. A cart that could set
 * its own prices is the single most exploitable thing a storefront can have.
 *
 * Quantities are likewise advisory: the server re-checks availability under a
 * row lock at checkout, so a stale "3 left" here cannot oversell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";

import type { Product, Variant } from "./types";

const STORAGE_KEY = "pn-cart-v1";
/** Guards against a runaway loop or a pasted quantity filling the cart. */
const MAX_QUANTITY_PER_LINE = 99;

export interface CartLine {
  variantId: number;
  quantity: number;
  /** Display snapshot — re-priced by the server at checkout. */
  snapshot: {
    productName: string;
    productSlug: string;
    variantLabel: string;
    price: string;
    image: string | null;
  };
}

type CartAction =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; line: CartLine }
  | { type: "setQuantity"; variantId: number; quantity: number }
  | { type: "remove"; variantId: number }
  | { type: "clear" };

function clamp(quantity: number, limit = MAX_QUANTITY_PER_LINE) {
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(Math.floor(quantity), limit));
}

function reducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "hydrate":
      return action.lines;

    case "add": {
      const existing = state.find((l) => l.variantId === action.line.variantId);
      if (!existing) return [...state, action.line];
      // Adding the same variant again tops up the line rather than creating a
      // duplicate row, which is what every customer expects and what keeps the
      // drawer readable.
      return state.map((line) =>
        line.variantId === action.line.variantId
          ? {
              ...line,
              quantity: clamp(line.quantity + action.line.quantity),
              snapshot: action.line.snapshot,
            }
          : line,
      );
    }

    case "setQuantity":
      // Setting zero removes the line; it must not leave a zero-quantity row
      // that renders as an item but contributes nothing.
      if (action.quantity <= 0) {
        return state.filter((line) => line.variantId !== action.variantId);
      }
      return state.map((line) =>
        line.variantId === action.variantId
          ? { ...line, quantity: clamp(action.quantity) }
          : line,
      );

    case "remove":
      return state.filter((line) => line.variantId !== action.variantId);

    case "clear":
      return [];
  }
}

/** Rejects anything that is not a cart line, so corrupt storage cannot crash the app. */
function parseStored(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is CartLine => {
      if (typeof line !== "object" || line === null) return false;
      const candidate = line as Partial<CartLine>;
      return (
        typeof candidate.variantId === "number" &&
        typeof candidate.quantity === "number" &&
        candidate.quantity > 0 &&
        typeof candidate.snapshot === "object" &&
        candidate.snapshot !== null
      );
    });
  } catch {
    // Malformed JSON — someone edited it, or a half-written value survived a
    // crash. Start clean rather than throwing on every render.
    return [];
  }
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  /** Indicative only. The server computes what is charged. */
  estimatedSubtotal: number;
  isOpen: boolean;
  /** False until localStorage has been read, so the UI can avoid a flash of "0". */
  isReady: boolean;
  add(product: Product, variant: Variant, quantity?: number): void;
  setQuantity(variantId: number, quantity: number): void;
  remove(variantId: number): void;
  clear(): void;
  open(): void;
  close(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, []);
  const [isReady, setIsReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Read storage after mount, never during render: the server has no
  // localStorage, so reading it in the initial state would make the server and
  // client trees differ and React would throw a hydration error.
  useEffect(() => {
    dispatch({ type: "hydrate", lines: parseStored(localStorage.getItem(STORAGE_KEY)) });
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return; // don't write [] over a real cart before hydrating
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Quota exceeded or storage disabled (Safari private browsing). The cart
      // still works for this page view; it just will not survive a reload.
    }
  }, [lines, isReady]);

  // Keep two tabs in sync. Without this, adding an item in one tab and
  // checking out in another silently drops it.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      dispatch({ type: "hydrate", lines: parseStored(event.newValue) });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (product: Product, variant: Variant, quantity = 1) => {
      dispatch({
        type: "add",
        line: {
          variantId: variant.id,
          quantity: clamp(quantity),
          snapshot: {
            productName: product.name,
            productSlug: product.slug,
            variantLabel: variant.descriptor,
            price: variant.price,
            image: product.image?.url ?? null,
          },
        },
      });
      setIsOpen(true);
    },
    [],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount: lines.reduce((total, line) => total + line.quantity, 0),
      estimatedSubtotal: lines.reduce(
        (total, line) => total + Number(line.snapshot.price) * line.quantity,
        0,
      ),
      isOpen,
      isReady,
      add,
      setQuantity: (variantId, quantity) =>
        dispatch({ type: "setQuantity", variantId, quantity }),
      remove: (variantId) => dispatch({ type: "remove", variantId }),
      clear: () => dispatch({ type: "clear" }),
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [lines, isOpen, isReady, add],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}
