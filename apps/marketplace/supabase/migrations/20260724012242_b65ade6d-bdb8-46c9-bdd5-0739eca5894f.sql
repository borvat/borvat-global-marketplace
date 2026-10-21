CREATE OR REPLACE FUNCTION public.place_order(
  p_user_id uuid,
  p_total_cents int,
  p_shipping_address jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  r record;
  v_avail int;
BEGIN
  -- Create the order
  INSERT INTO public.orders (user_id, total_cents, status, shipping_address)
  VALUES (p_user_id, p_total_cents, 'paid', p_shipping_address)
  RETURNING id INTO v_order_id;

  -- Iterate over cart items and create order items
  FOR r IN
    SELECT ci.id AS cart_id, ci.quantity, p.id AS product_id, p.seller_id, p.title, p.price_cents, p.stock
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.user_id = p_user_id
  LOOP
    IF r.stock < r.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product %', r.product_id;
    END IF;

    INSERT INTO public.order_items (order_id, product_id, seller_id, title, price_cents, quantity)
    VALUES (v_order_id, r.product_id, r.seller_id, r.title, r.price_cents, r.quantity);

    UPDATE public.products
    SET stock = stock - r.quantity
    WHERE id = r.product_id;
  END LOOP;

  -- Clear cart
  DELETE FROM public.cart_items WHERE user_id = p_user_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(uuid, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, int, jsonb) TO service_role;