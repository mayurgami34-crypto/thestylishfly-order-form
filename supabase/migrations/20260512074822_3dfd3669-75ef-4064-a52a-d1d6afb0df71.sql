
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.has_role(uuid, app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, app_role) to authenticated;

drop policy "public read product images" on storage.objects;
create policy "public read product image files" on storage.objects
for select using (bucket_id = 'product-images');
