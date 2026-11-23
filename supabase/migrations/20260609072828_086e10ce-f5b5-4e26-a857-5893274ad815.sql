GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

CREATE POLICY "anyone can view orders" ON public.orders
FOR SELECT TO public USING (true);