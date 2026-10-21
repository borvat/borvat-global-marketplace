CREATE SCHEMA IF NOT EXISTS harness;

-- Seeds one independent manual-quote scenario and returns the ids.
-- Every call creates brand new rows; nothing is reused across scenarios.
CREATE OR REPLACE FUNCTION harness.seed(
  p_tag text,
  p_offer_expires_in interval DEFAULT interval '2 days',
  p_publish boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_company uuid := gen_random_uuid();
  v_store uuid := gen_random_uuid();
  v_origin uuid := gen_random_uuid();
  v_dest uuid := gen_random_uuid();
  v_destv uuid := gen_random_uuid();
  v_prod uuid := gen_random_uuid();
  v_sku uuid := gen_random_uuid();
  v_prof uuid := gen_random_uuid();
  v_req uuid := gen_random_uuid();
  v_offer uuid := gen_random_uuid();
  v_family uuid;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user),(v_buyer);
  INSERT INTO public.profiles(id,email) VALUES (v_user,p_tag||'-owner@example.test'),(v_buyer,p_tag||'-buyer@example.test');
  INSERT INTO public.companies(id,name,slug,owner_user_id) VALUES (v_company,'HC '||p_tag,'hc-'||p_tag,v_user);
  INSERT INTO public.merchant_stores(id,company_id,slug,display_name,status,country_code,default_currency)
    VALUES (v_store,v_company,'hs-'||p_tag,'Store '||p_tag,'active','NL','EUR');
  INSERT INTO public.merchant_fulfillment_origins(id,company_id,merchant_store_id,origin_type,label,country_code,postal_code,status)
    VALUES (v_origin,v_company,v_store,'warehouse','Origin '||p_tag,'NL','1011AB','active');
  INSERT INTO public.customer_delivery_destinations(id,buyer_principal_id,status) VALUES (v_dest,v_buyer,'active');
  INSERT INTO public.customer_delivery_destination_versions(
      id,customer_delivery_destination_id,buyer_principal_id,version_number,precision_level,
      country_code,postal_code,postal_code_normalized,city,street_name,house_number,destination_type,status)
    VALUES (v_destv,v_dest,v_buyer,1,'street_address','NL','1012 AB','1012AB','Amsterdam','Damstraat','1','residential','active');
  INSERT INTO public.catalog_products(id,company_id,title,status) VALUES (v_prod,v_company,'P '||p_tag,'active');
  INSERT INTO public.catalog_skus(id,company_id,product_id,code,status) VALUES (v_sku,v_company,v_prod,'SKU-'||p_tag,'active');
  INSERT INTO public.merchant_store_sku_shipping_profiles(id,company_id,merchant_store_id,catalog_sku_id,handling_class,status)
    VALUES (v_prof,v_company,v_store,v_sku,'standard','active');
  INSERT INTO public.merchant_store_sku_fulfillment_origins(id,shipping_profile_id,fulfillment_origin_id,company_id,merchant_store_id,priority,is_default,status)
    VALUES (gen_random_uuid(),v_prof,v_origin,v_company,v_store,1,true,'active');

  INSERT INTO public.manual_shipping_quote_requests(
      id,company_id,merchant_store_id,buyer_principal_id,delivery_destination_version_id,
      fulfillment_origin_id,shipment_form,currency_code,status)
    VALUES (v_req,v_company,v_store,v_buyer,v_destv,v_origin,'parcel','EUR','draft');
  INSERT INTO public.manual_shipping_quote_request_items(id,manual_shipping_quote_request_id,company_id,merchant_store_id,shipping_profile_id,line_number,quantity)
    VALUES (gen_random_uuid(),v_req,v_company,v_store,v_prof,1,1);
  INSERT INTO public.manual_shipping_quote_request_packages(id,manual_shipping_quote_request_id,package_number,package_count,weight_grams,length_mm,width_mm,height_mm)
    VALUES (gen_random_uuid(),v_req,1,1,2500,400,300,200);

  UPDATE public.manual_shipping_quote_requests
     SET status='requested', requested_at = now() - interval '1 hour', expires_at = now() + interval '7 days'
   WHERE id = v_req;
  UPDATE public.manual_shipping_quote_requests SET status='under_review' WHERE id=v_req;

  INSERT INTO public.manual_shipping_quote_offers(
      id,manual_shipping_quote_request_id,company_id,merchant_store_id,buyer_principal_id,
      version_number,status,quote_source,responsible_party,currency_code,
      customer_shipping_charge_minor,delivery_min_calendar_days_after_acceptance,
      delivery_max_calendar_days_after_acceptance,carrier_code,service_code,offered_at,expires_at)
    VALUES (v_offer,v_req,v_company,v_store,v_buyer,1,
      'draft',
      'merchant_store','merchant_store','EUR',1495,2,5,'POSTNL','STANDARD',
      NULL, NULL);
  INSERT INTO public.manual_shipping_quote_offer_conditions(id,manual_shipping_quote_offer_id,condition_number,condition_code,condition_text)
    VALUES (gen_random_uuid(),v_offer,1,'curbside_delivery',NULL);

  IF p_publish THEN
    UPDATE public.manual_shipping_quote_offers
       SET status='offered', offered_at = now() - interval '5 minutes',
           expires_at = now() + p_offer_expires_in
     WHERE id = v_offer;
    UPDATE public.manual_shipping_quote_requests SET status='quoted' WHERE id=v_req;
  END IF;

  SELECT request_family_id INTO v_family FROM public.manual_shipping_quote_requests WHERE id=v_req;

  RETURN jsonb_build_object(
    'tag',p_tag,'buyer',v_buyer,'company',v_company,'store',v_store,'origin',v_origin,
    'destv',v_destv,'profile',v_prof,'request',v_req,'offer',v_offer,'family',v_family);
END $$;

-- Inserts the acceptance + the two settlement updates that must land together.
CREATE OR REPLACE FUNCTION harness.accept(p jsonb, p_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  o public.manual_shipping_quote_offers%ROWTYPE;
  r public.manual_shipping_quote_requests%ROWTYPE;
  v_acc uuid := gen_random_uuid();
BEGIN
  SELECT * INTO o FROM public.manual_shipping_quote_offers WHERE id=(p->>'offer')::uuid;
  SELECT * INTO r FROM public.manual_shipping_quote_requests WHERE id=(p->>'request')::uuid;

  INSERT INTO public.manual_shipping_quote_acceptances(
      id,request_family_id,manual_shipping_quote_request_id,manual_shipping_quote_offer_id,
      offer_version_number,buyer_principal_id,company_id,merchant_store_id,currency_code,
      accepted_shipping_charge_minor,delivery_min_calendar_days_after_acceptance,
      delivery_max_calendar_days_after_acceptance,carrier_code,service_code,quote_source,
      responsible_party,fulfillment_origin_id,delivery_destination_version_id,shipment_form,
      offer_offered_at,offer_expires_at,accepted_at,accepted_by_actor_type,accepted_by_buyer_principal_id)
    VALUES (v_acc,r.request_family_id,r.id,o.id,o.version_number,o.buyer_principal_id,o.company_id,
      o.merchant_store_id,o.currency_code,o.customer_shipping_charge_minor,
      o.delivery_min_calendar_days_after_acceptance,o.delivery_max_calendar_days_after_acceptance,
      o.carrier_code,o.service_code,o.quote_source,o.responsible_party,r.fulfillment_origin_id,
      r.delivery_destination_version_id,r.shipment_form,o.offered_at,o.expires_at,p_at,
      'buyer',r.buyer_principal_id);

  UPDATE public.manual_shipping_quote_offers   SET status='accepted' WHERE id=o.id;
  UPDATE public.manual_shipping_quote_requests SET status='accepted' WHERE id=r.id;

  INSERT INTO public.manual_shipping_quote_state_events(
      request_family_id,manual_shipping_quote_request_id,manual_shipping_quote_offer_id,
      subject,event_type,from_status,to_status,actor_type,actor_principal_id)
    VALUES (r.request_family_id,r.id,o.id,'acceptance','acceptance_recorded','offered','accepted','buyer',r.buyer_principal_id);
  RETURN v_acc;
END $$;
