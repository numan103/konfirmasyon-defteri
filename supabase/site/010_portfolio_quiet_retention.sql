-- Reduce retention on existing installations; do not edit the live portfolio.
begin;
lock table public.edu_shared in share row exclusive mode;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.portfolio_guard_version()'::regprocedure) into definition;
  if position('offset 100' in definition) > 0 then
    execute replace(definition, 'offset 100', 'offset 5');
  elsif position('offset 5' in definition) = 0 then
    raise exception 'Unexpected portfolio guard definition: retention was not changed';
  end if;
end;
$$;
delete from public.portfolio_versions where id in
  (select id from public.portfolio_versions order by id desc offset 5);
commit;
