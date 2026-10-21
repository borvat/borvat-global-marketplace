"""Small JSON formatter for the end-to-end HTTP script."""
import json
import sys


def main() -> None:
    mode = sys.argv[1]
    data = json.load(sys.stdin)

    if mode == "get":
        print(eval("data" + sys.argv[2]))  # noqa: S307 - test helper, local input only
        return

    if mode == "offers":
        for offer in data["offers"]:
            print(
                f"  {offer['vendorName']:<20} price={offer['offer']['priceMinor']:<7} "
                f"ship={offer['shippingMinor']:<5} total={offer['totalMinor']:<7} "
                f"stock={offer['offer']['stockAvailable']:<4} days={offer['offer']['handlingDays']}"
            )
        return

    if mode == "cart":
        print("vendors:", data["vendorCount"])
        for line in data["lines"]:
            print(
                f"  {line['vendorName']:<20} {line['productTitle'][:30]:<32} "
                f"x{line['quantity']} state={line['state']} line={line['lineTotalMinor']}"
            )
        print(
            f"  items={data['itemsSubtotalMinor']} shipping={data['shippingMinor']} "
            f"tax={data['taxMinor']} total={data['totalMinor']} vat_bps={data['taxRateBps']} "
            f"blocking={data['hasBlockingIssue']}"
        )
        return

    if mode == "quote":
        print(
            f"  quote={data['quoteId']} total={data['totalMinor']} "
            f"vendors={data['vendorCount']} hash={data['contentHash'][:16]}"
        )
        return

    if mode == "order":
        print(
            f"  order={data['orderNumber']} status={data['status']} total={data['totalMinor']} "
            f"payment={data['paymentRef']}"
        )
        for vendor_order in data["vendorOrders"]:
            print(
                f"    {vendor_order['vendorOrderNumber']} total={vendor_order['totalMinor']} "
                f"commission={vendor_order['commissionMinor']} ({vendor_order['commissionBps']}bps) "
                f"payout={vendor_order['payoutMinor']}"
            )
        return

    if mode == "vendor-orders":
        print("  vendor orders visible:", len(data["orders"]))
        for order in data["orders"]:
            print(
                f"    {order['vendorOrderNumber']} status={order['status']} "
                f"payout={order['payoutMinor']} commission={order['commissionMinor']} "
                f"lines={len(order['lines'])}"
            )
        return

    if mode == "ledger":
        print(f"  ledger balance: {data['balanceMinor']} {data['currency']}")
        for entry in data["entries"]:
            print(f"    {entry['kind']:<12} {entry['amountMinor']}")
        return

    if mode == "offers-list":
        print("  offers visible:", len(data["offers"]))
        print("  refs:", sorted(offer["offerRef"] for offer in data["offers"]))
        return

    if mode == "buyer-order":
        print(
            f"  {data['orderNumber']} {data['status']} {data['totalMinor']} "
            f"across {len(data['vendorOrders'])} vendor orders"
        )
        return

    raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    main()