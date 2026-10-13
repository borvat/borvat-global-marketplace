#!/usr/bin/env bash
# End-to-end proof through the real HTTP API: buyer, two vendors, one split order.
# Requires: the API running on $BASE and the seed data present.
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PRETTY="python3 $DIR/pretty.py"
BUYER_EMAIL="buyer-$(date +%s)@borvat.test"
PASSWORD="borvat-demo-password"
ADMIN_EMAIL="admin@borvat.test"
ALPHA_EMAIL="alpha@borvat.test"

pick() { $PRETTY get "$1"; }

echo "== 1. health =="
curl -sS "$BASE/healthz" | python3 -m json.tool

echo
echo "== 2. register a buyer =="
curl -sS -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"HTTP Buyer\",\"country\":\"NL\"}" \
  | python3 -m json.tool

echo
echo "== 3. login the buyer =="
BUYER_TOKEN=$(curl -sS -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"$PASSWORD\"}" | pick "['token']")
echo "buyer token acquired: ${BUYER_TOKEN:0:12}..."

echo
echo "== 4. public catalogue search, no authentication =="
curl -sS "$BASE/api/catalog/search?market=NL&q=stove" | python3 -m json.tool
PRODUCT_ID=$(curl -sS "$BASE/api/catalog/search?market=NL&q=stove" | pick "['results'][0]['product']['id']")
echo "product id: $PRODUCT_ID"

echo
echo "== 5. competing offers for the same product, ranked by total payable =="
curl -sS "$BASE/api/catalog/products/$PRODUCT_ID/offers?market=NL&quantity=1" | $PRETTY offers
OFFER_A=$(curl -sS "$BASE/api/catalog/products/$PRODUCT_ID/offers?market=NL" | pick "['offers'][0]['offer']['id']")
OFFER_B=$(curl -sS "$BASE/api/catalog/products/$PRODUCT_ID/offers?market=NL" | pick "['offers'][1]['offer']['id']")

echo
echo "== 6. the buyer builds one cart from two vendors =="
CART_ID=$(curl -sS -X POST "$BASE/api/cart" -H "authorization: Bearer $BUYER_TOKEN" \
  -H 'content-type: application/json' -d '{"market":"NL","currency":"EUR"}' | pick "['cartId']")
echo "cart id: $CART_ID"
curl -sS -X POST "$BASE/api/cart/$CART_ID/items" -H "authorization: Bearer $BUYER_TOKEN" \
  -H 'content-type: application/json' -d "{\"offerId\":\"$OFFER_A\",\"quantity\":2}" >/dev/null
curl -sS -X POST "$BASE/api/cart/$CART_ID/items" -H "authorization: Bearer $BUYER_TOKEN" \
  -H 'content-type: application/json' -d "{\"offerId\":\"$OFFER_B\",\"quantity\":1}" >/dev/null
curl -sS "$BASE/api/cart/$CART_ID" -H "authorization: Bearer $BUYER_TOKEN" | $PRETTY cart

echo
echo "== 7. quote the cart =="
QUOTE=$(curl -sS -X POST "$BASE/api/cart/$CART_ID/quote" -H "authorization: Bearer $BUYER_TOKEN")
echo "$QUOTE" | $PRETTY quote
TOTAL=$(echo "$QUOTE" | pick "['totalMinor']")

echo
echo "== 8. checkout with an idempotency key =="
IDEM="e2e-$(date +%s)-0001"
ORDER=$(curl -sS -X POST "$BASE/api/checkout" -H "authorization: Bearer $BUYER_TOKEN" \
  -H "idempotency-key: $IDEM" -H 'content-type: application/json' \
  -d "{\"cartId\":\"$CART_ID\",\"expectedTotalMinor\":\"$TOTAL\"}")
echo "$ORDER" | $PRETTY order
ORDER_ID=$(echo "$ORDER" | pick "['orderId']")

echo
echo "== 9. replaying the same key returns the same order =="
REPLAY=$(curl -sS -X POST "$BASE/api/checkout" -H "authorization: Bearer $BUYER_TOKEN" \
  -H "idempotency-key: $IDEM" -H 'content-type: application/json' \
  -d "{\"cartId\":\"$CART_ID\",\"expectedTotalMinor\":\"$TOTAL\"}")
if [ "$(echo "$REPLAY" | pick "['orderId']")" = "$ORDER_ID" ]; then
  echo "  same order returned: YES"
else
  echo "  same order returned: NO"
fi

echo
echo "== 10. the buyer reads the order =="
curl -sS "$BASE/api/orders/$ORDER_ID" -H "authorization: Bearer $BUYER_TOKEN" | $PRETTY buyer-order

echo
echo "== 11. vendor Alpha sees only its own sub-order and ledger =="
ALPHA_TOKEN=$(curl -sS -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$ALPHA_EMAIL\",\"password\":\"$PASSWORD\"}" | pick "['token']")
curl -sS "$BASE/api/vendor/orders" -H "authorization: Bearer $ALPHA_TOKEN" | $PRETTY vendor-orders
curl -sS "$BASE/api/vendor/ledger" -H "authorization: Bearer $ALPHA_TOKEN" | $PRETTY ledger

echo
echo "== 12. vendor Alpha cannot see vendor Beta offers =="
curl -sS "$BASE/api/vendor/offers" -H "authorization: Bearer $ALPHA_TOKEN" | $PRETTY offers-list

echo
echo "== 13. unauthenticated calls are refused =="
echo -n "  GET /api/vendor/offers  -> "
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/api/vendor/offers"
echo -n "  GET /api/orders/<id>    -> "
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/api/orders/$ORDER_ID"

echo
echo "== 14. admin sees the pending vendor queue =="
ADMIN_TOKEN=$(curl -sS -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PASSWORD\"}" | pick "['token']")
curl -sS "$BASE/api/admin/vendor/applications" -H "authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool

echo
echo "E2E COMPLETE"