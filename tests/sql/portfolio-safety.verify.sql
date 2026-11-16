-- Run in the Supabase SQL Editor as database admin after migration 009.
-- Verification transaction only: ALL data/version changes are rolled back.
begin;
create temporary table portfolio_guard_checks(name text, passed boolean);
do $$
declare original jsonb; revision timestamptz; initial_id bigint; result jsonb; changed jsonb; current_revision timestamptz; count_before integer;
begin
  select data,updated_at into original,revision from public.edu_shared where id='alfa_portfoy_public';
  select v.id into initial_id from public.portfolio_versions v where v.data=original order by v.id desc limit 1;
  if initial_id is null then raise exception 'Baseline missing'; end if;
  insert into portfolio_guard_checks values('baseline_matches_current',true);
  changed := original || '{"_guard_test":"rollback-only"}'::jsonb;
  result := public.portfolio_commit(revision,changed,'save',null,null,null);
  current_revision := (result->>'revision')::timestamptz;
  if not (result->>'backedUp')::boolean or current_revision <= revision then raise exception 'Version failed'; end if;
  if not exists(select 1 from public.portfolio_versions v where v.id=initial_id and v.data=original) then raise exception 'Old copy lost'; end if;
  insert into portfolio_guard_checks values('save_and_backup_atomic',true);
  begin
    perform public.portfolio_commit(revision,original,'save',null,null,null);
    raise exception 'Stale write accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'portfolio_conflict' then raise; end if;
    insert into portfolio_guard_checks values('stale_revision_denied',true);
  end;
  begin
    perform public.portfolio_commit(current_revision,changed || '{"positions":[],"sells":[],"history":[]}'::jsonb,'save',null,null,null);
    raise exception 'Empty overwrite accepted';
  exception when check_violation then insert into portfolio_guard_checks values('empty_overwrite_denied',true);
  end;
  begin
    perform public.portfolio_commit(current_revision,jsonb_set(changed,'{positions}',(changed->'positions') - 0),'save',null,null,null);
    raise exception 'Position loss accepted';
  exception when check_violation then insert into portfolio_guard_checks values('silent_position_loss_denied',true);
  end;
  begin
    perform public.portfolio_commit(current_revision,jsonb_set(changed,'{sells}',(changed->'sells') - 0),'save',null,null,null);
    raise exception 'Sales loss accepted';
  exception when check_violation then insert into portfolio_guard_checks values('sales_loss_denied',true);
  end;
  begin
    perform public.portfolio_commit(current_revision,jsonb_set(changed,'{positions,0,qty}','"bad"'),'save',null,null,null);
    raise exception 'Invalid quantity accepted';
  exception when check_violation then insert into portfolio_guard_checks values('invalid_quantity_denied',true);
  end;
  begin
    perform public.portfolio_commit(current_revision,null,'reset',null,null,null);
    raise exception 'Unconfirmed reset accepted';
  exception when check_violation then insert into portfolio_guard_checks values('unconfirmed_reset_denied',true);
  end;
  result := public.portfolio_commit(current_revision,null,'reset',null,null,'PORTFOYU SIFIRLA');
  current_revision := (result->>'revision')::timestamptz;
  if not exists(select 1 from public.portfolio_versions v where v.id=initial_id and v.data=original) then raise exception 'Reset lost backup'; end if;
  insert into portfolio_guard_checks values('confirmed_reset_retains_backup',true);
  result := public.portfolio_commit(current_revision,null,'restore',null,initial_id,'RESTORE');
  current_revision := (result->>'revision')::timestamptz;
  if not exists(select 1 from public.edu_shared e where e.id='alfa_portfoy_public' and e.data=original) then raise exception 'Restore mismatch'; end if;
  insert into portfolio_guard_checks values('restore_exact_snapshot',true);
  begin
    delete from public.edu_shared where id='alfa_portfoy_public';
    raise exception 'Delete accepted';
  exception when check_violation then insert into portfolio_guard_checks values('row_delete_denied',true);
  end;
  select count(*) into count_before from public.portfolio_versions;
  begin
    execute 'set local role anon';
    update public.edu_shared set updated_at=clock_timestamp() where id='alfa_portfoy_public';
    raise exception 'Anonymous write accepted';
  exception when insufficient_privilege then
    insert into portfolio_guard_checks values('anonymous_direct_write_denied',true);
  end;
  if (select count(*) from public.portfolio_versions) <> count_before then raise exception 'Denied write created backup'; end if;
  insert into portfolio_guard_checks values('denied_writes_leave_versions_unchanged',true);
end;
$$;
select jsonb_agg(jsonb_build_object('test',name,'passed',passed)) as checks from portfolio_guard_checks;
rollback;
