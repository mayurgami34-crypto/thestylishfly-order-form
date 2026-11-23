CREATE OR REPLACE FUNCTION public.sync_product_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_product_id uuid;
BEGIN
  affected_product_id := COALESCE(NEW.product_id, OLD.product_id);

  UPDATE public.products
  SET images = COALESCE((
    SELECT array_agg(url ORDER BY sort_order, created_at)
    FROM public.product_images
    WHERE product_id = affected_product_id
  ), '{}'::text[]),
  updated_at = now()
  WHERE id = affected_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_product_images_after_change ON public.product_images;
CREATE TRIGGER sync_product_images_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.product_images
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_images();

UPDATE public.products p
SET images = COALESCE((
  SELECT array_agg(pi.url ORDER BY pi.sort_order, pi.created_at)
  FROM public.product_images pi
  WHERE pi.product_id = p.id
), '{}'::text[]);

DROP POLICY IF EXISTS "public update product image files" ON storage.objects;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_product_images() FROM PUBLIC;