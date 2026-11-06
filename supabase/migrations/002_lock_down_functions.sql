-- Signed-out visitors can't call any database functions; crew actions need a login.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.scan_pack(uuid, text) from public, anon;
revoke execute on function public.scan_return(text, text) from public, anon;
revoke execute on function public.set_job_item_state(uuid, text) from public, anon;
revoke execute on function public.flag_item(uuid, text, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.scan_pack(uuid, text) to authenticated;
grant execute on function public.scan_return(text, text) to authenticated;
grant execute on function public.set_job_item_state(uuid, text) to authenticated;
grant execute on function public.flag_item(uuid, text, text) to authenticated;
