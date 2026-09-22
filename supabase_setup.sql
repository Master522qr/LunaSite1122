-- LunaVisual database v5
-- Run in Supabase Dashboard -> SQL Editor.
-- Browser code uses ONLY the publishable key. Never put service/secret keys in GitHub Pages.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core users / permissions
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  mc_nickname text,
  avatar_url text,
  hwid text,
  subscription_active boolean not null default false,
  subscription_until text,
  subscription_expires_at timestamptz,
  subscription_lifetime boolean not null default false,
  alpha_access_until timestamptz,
  alpha_lifetime boolean not null default false,
  rank text not null default 'user',
  is_admin boolean not null default false, -- legacy only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists mc_nickname text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists hwid text;
alter table public.profiles add column if not exists subscription_active boolean not null default false;
alter table public.profiles add column if not exists subscription_until text;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists subscription_lifetime boolean not null default false;
alter table public.profiles add column if not exists alpha_access_until timestamptz;
alter table public.profiles add column if not exists alpha_lifetime boolean not null default false;
alter table public.profiles add column if not exists rank text not null default 'user';
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','super_admin')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(lower(email));
create index if not exists profiles_rank_idx on public.profiles(rank);

-- New account -> persistent database profile. Session persistence is handled by Supabase Auth.
create or replace function public.handle_lunavisual_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,mc_nickname,avatar_url)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'mc_nickname',new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1),'Player'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict(id) do update set
    email=excluded.email,
    mc_nickname=coalesce(nullif(public.profiles.mc_nickname,''),excluded.mc_nickname),
    avatar_url=coalesce(public.profiles.avatar_url,excluded.avatar_url),
    updated_at=now();
  return new;
end $$;
drop trigger if exists on_auth_user_created_lunavisual on auth.users;
create trigger on_auth_user_created_lunavisual
after insert or update of email,raw_user_meta_data on auth.users
for each row execute procedure public.handle_lunavisual_new_user();

insert into public.profiles(id,email,mc_nickname,avatar_url)
select id,email,
       coalesce(raw_user_meta_data->>'mc_nickname',raw_user_meta_data->>'full_name',split_part(coalesce(email,''),'@',1),'Player'),
       raw_user_meta_data->>'avatar_url'
from auth.users
on conflict(id) do update set email=excluded.email;

insert into public.admin_roles(user_id,role)
select id,'admin' from public.profiles where is_admin=true
on conflict(user_id) do nothing;

create or replace function public.current_lunavisual_role()
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select role from public.admin_roles where user_id=auth.uid()),'user')
$$;
grant execute on function public.current_lunavisual_role() to authenticated;

create or replace function public.current_lunavisual_rank()
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select rank from public.profiles where id=auth.uid()),'user')
$$;
grant execute on function public.current_lunavisual_rank() to authenticated;

create or replace function public.is_lunavisual_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_roles where user_id=auth.uid() and role in ('admin','super_admin'))
$$;
grant execute on function public.is_lunavisual_admin() to authenticated, anon;

create or replace function public.is_lunavisual_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_roles where user_id=auth.uid() and role='super_admin')
$$;
grant execute on function public.is_lunavisual_super_admin() to authenticated;

-- One-time owner bootstrap from SQL Editor. The owner identity is not hardcoded in site files.
-- Example after owner registration:
--   select public.bootstrap_lunavisual_owner('owner@example.com');
create or replace function public.bootstrap_lunavisual_owner(p_email text)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid;
begin
  if current_user not in ('postgres','supabase_admin') then raise exception 'sql_editor_only'; end if;
  select id into v_id from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_id is null then raise exception 'auth_user_not_found'; end if;
  insert into public.profiles(id,email,mc_nickname)
  select id,email,coalesce(raw_user_meta_data->>'mc_nickname',split_part(email,'@',1)) from auth.users where id=v_id
  on conflict(id) do update set email=excluded.email;
  insert into public.admin_roles(user_id,role) values(v_id,'super_admin')
  on conflict(user_id) do update set role='super_admin',updated_at=now();
  update public.profiles set rank='admin',updated_at=now() where id=v_id;
  return v_id;
end $$;
revoke all on function public.bootstrap_lunavisual_owner(text) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
create table if not exists public.rpc_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key(user_id,action)
);

create or replace function public.check_lunavisual_rate_limit(p_action text,p_max_requests integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_now timestamptz:=clock_timestamp(); v_row public.rpc_rate_limits%rowtype;
begin
  if v_uid is null then raise exception 'login_required'; end if;
  insert into public.rpc_rate_limits(user_id,action,window_started_at,request_count)
  values(v_uid,p_action,v_now,1) on conflict(user_id,action) do nothing;
  select * into v_row from public.rpc_rate_limits where user_id=v_uid and action=p_action for update;
  if v_row.window_started_at + make_interval(secs=>p_window_seconds) <= v_now then
    update public.rpc_rate_limits set window_started_at=v_now,request_count=1 where user_id=v_uid and action=p_action;
    return true;
  end if;
  if v_row.request_count>=p_max_requests then return false; end if;
  update public.rpc_rate_limits set request_count=request_count+1 where user_id=v_uid and action=p_action;
  return true;
end $$;
revoke all on function public.check_lunavisual_rate_limit(text,integer,integer) from public;
grant execute on function public.check_lunavisual_rate_limit(text,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Main license keys
-- ---------------------------------------------------------------------------
create or replace function public.lunavisual_random_digits(p_len integer)
returns text language plpgsql volatile security definer set search_path=public as $$
declare b bytea; out_text text:=''; i integer;
begin
  if p_len<1 or p_len>128 then raise exception 'invalid_length'; end if;
  b:=gen_random_bytes(p_len);
  for i in 0..p_len-1 loop out_text:=out_text||((get_byte(b,i)%10)::text); end loop;
  return out_text;
end $$;
revoke all on function public.lunavisual_random_digits(integer) from public,anon,authenticated;

create table if not exists public.license_keys (
  id bigint generated by default as identity primary key,
  code text not null unique,
  duration_days integer,
  is_used boolean not null default false,
  used_by text,
  used_by_user_id uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.license_keys add column if not exists duration_days integer;
alter table public.license_keys add column if not exists is_used boolean not null default false;
alter table public.license_keys add column if not exists used_by text;
alter table public.license_keys add column if not exists used_by_user_id uuid references auth.users(id) on delete set null;
alter table public.license_keys add column if not exists used_at timestamptz;
alter table public.license_keys add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.license_keys add column if not exists created_at timestamptz not null default now();
create index if not exists license_keys_used_idx on public.license_keys(is_used,created_at desc);
create index if not exists license_keys_user_idx on public.license_keys(used_by_user_id);

create or replace function public.generate_lunavisual_keys(p_count integer,p_duration_days integer default 30)
returns setof public.license_keys language plpgsql security definer set search_path=public as $$
declare i integer; v_code text; v_row public.license_keys%rowtype;
begin
  if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if;
  if not public.check_lunavisual_rate_limit('generate_keys',40,60) then raise exception 'rate_limited'; end if;
  if p_count is null or p_count<1 or p_count>1000 then raise exception 'count_1_to_1000_per_request'; end if;
  if p_duration_days is not null and (p_duration_days<1 or p_duration_days>36500) then raise exception 'invalid_duration'; end if;
  for i in 1..p_count loop
    loop
      v_code:='LUNAVISUALKEY-'||public.lunavisual_random_digits(4)||'-'||public.lunavisual_random_digits(4)||'-'||public.lunavisual_random_digits(4)||'-'||public.lunavisual_random_digits(4)||'-'||public.lunavisual_random_digits(4);
      begin
        insert into public.license_keys(code,duration_days,created_by) values(v_code,p_duration_days,auth.uid()) returning * into v_row;
        exit;
      exception when unique_violation then end;
    end loop;
    return next v_row;
  end loop;
end $$;
grant execute on function public.generate_lunavisual_keys(integer,integer) to authenticated;

create or replace function public.redeem_lunavisual_key(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  k public.license_keys%rowtype;
  p public.profiles%rowtype;
  v_exp timestamptz;
  v_text text;
  v_alpha_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not public.check_lunavisual_rate_limit('redeem_key',10,60) then return jsonb_build_object('ok',false,'error','rate_limited'); end if;
  select * into k from public.license_keys where upper(code)=upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if k.is_used then return jsonb_build_object('ok',false,'error','used'); end if;
  select * into p from public.profiles where id=auth.uid() for update;

  if k.duration_days is null then
    v_text:='Навсегда';
    update public.profiles
      set subscription_active=true,subscription_lifetime=true,subscription_expires_at=null,subscription_until=v_text,
          alpha_access_until=case
            when alpha_lifetime then alpha_access_until
            when alpha_access_until is null or alpha_access_until < now()+interval '7 days' then now()+interval '7 days'
            else alpha_access_until end,
          updated_at=now()
      where id=auth.uid()
      returning alpha_access_until into v_alpha_exp;
  else
    if p.subscription_lifetime then
      v_text:='Навсегда';
    else
      v_exp:=greatest(now(),coalesce(p.subscription_expires_at,now()))+make_interval(days=>k.duration_days);
      v_text:='до '||to_char(v_exp at time zone 'UTC','DD.MM.YYYY');
      update public.profiles
        set subscription_active=true,subscription_expires_at=v_exp,subscription_until=v_text,updated_at=now()
        where id=auth.uid();
    end if;
  end if;

  update public.license_keys
    set is_used=true,used_by=coalesce(p.mc_nickname,p.email),used_by_user_id=auth.uid(),used_at=now()
    where id=k.id;
  return jsonb_build_object('ok',true,'code',k.code,'duration_days',k.duration_days,'subscription_until',v_text,'free_alpha_7d',k.duration_days is null,'alpha_until',v_alpha_exp);
end $$;
grant execute on function public.redeem_lunavisual_key(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Alpha access: separate key system
-- ---------------------------------------------------------------------------
create table if not exists public.alpha_keys (
  id bigint generated by default as identity primary key,
  code text not null unique,
  duration_days integer,
  is_used boolean not null default false,
  used_by_user_id uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists alpha_keys_used_idx on public.alpha_keys(is_used,created_at desc);

create or replace function public.lunavisual_random_alnum(p_len integer)
returns text language plpgsql volatile security definer set search_path=public as $$
declare alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; out_text text:=''; i integer;
begin
  if p_len<1 or p_len>128 then raise exception 'invalid_length'; end if;
  b:=gen_random_bytes(p_len);
  for i in 0..p_len-1 loop
    out_text:=out_text||substr(alphabet,(get_byte(b,i)%length(alphabet))+1,1);
  end loop;
  return out_text;
end $$;
revoke all on function public.lunavisual_random_alnum(integer) from public,anon,authenticated;

create or replace function public.generate_lunavisual_alpha_keys(p_count integer,p_duration_days integer default 7)
returns setof public.alpha_keys language plpgsql security definer set search_path=public as $$
declare i integer; v_code text; v_row public.alpha_keys%rowtype;
begin
  if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if;
  if not public.check_lunavisual_rate_limit('generate_alpha_keys',40,60) then raise exception 'rate_limited'; end if;
  if p_count is null or p_count<1 or p_count>1000 then raise exception 'count_1_to_1000_per_request'; end if;
  if p_duration_days is not null and (p_duration_days<1 or p_duration_days>36500) then raise exception 'invalid_duration'; end if;
  for i in 1..p_count loop
    loop
      v_code:='ALPHALUNA-KEY-'||public.lunavisual_random_alnum(6)||'-'||public.lunavisual_random_alnum(6)||'-'||public.lunavisual_random_alnum(6)||'-'||public.lunavisual_random_alnum(6)||'-'||public.lunavisual_random_alnum(6)||'-'||public.lunavisual_random_alnum(6)||'-'||public.lunavisual_random_alnum(6);
      begin
        insert into public.alpha_keys(code,duration_days,created_by) values(v_code,p_duration_days,auth.uid()) returning * into v_row;
        exit;
      exception when unique_violation then end;
    end loop;
    return next v_row;
  end loop;
end $$;
grant execute on function public.generate_lunavisual_alpha_keys(integer,integer) to authenticated;

create or replace function public.redeem_lunavisual_alpha_key(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare k public.alpha_keys%rowtype; p public.profiles%rowtype; v_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not public.check_lunavisual_rate_limit('redeem_alpha_key',10,60) then return jsonb_build_object('ok',false,'error','rate_limited'); end if;
  select * into k from public.alpha_keys where upper(code)=upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if k.is_used then return jsonb_build_object('ok',false,'error','used'); end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if k.duration_days is null then
    update public.profiles set alpha_lifetime=true,alpha_access_until=null,updated_at=now() where id=auth.uid();
  else
    if p.alpha_lifetime then v_exp:=null;
    else
      v_exp:=greatest(now(),coalesce(p.alpha_access_until,now()))+make_interval(days=>k.duration_days);
      update public.profiles set alpha_access_until=v_exp,updated_at=now() where id=auth.uid();
    end if;
  end if;
  update public.alpha_keys set is_used=true,used_by_user_id=auth.uid(),used_at=now() where id=k.id;
  return jsonb_build_object('ok',true,'code',k.code,'duration_days',k.duration_days,'alpha_lifetime',p.alpha_lifetime or k.duration_days is null,'alpha_until',v_exp);
end $$;
grant execute on function public.redeem_lunavisual_alpha_key(text) to authenticated;

-- ---------------------------------------------------------------------------
-- News
-- ---------------------------------------------------------------------------
create table if not exists public.news (
  id bigint generated by default as identity primary key,
  title text not null,
  description text not null,
  image_url text,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists news_published_idx on public.news(is_published,published_at desc);

-- ---------------------------------------------------------------------------
-- Creator / influencer verification
-- ---------------------------------------------------------------------------
create table if not exists public.creator_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok','twitch')),
  provider_user_id text not null,
  handle text,
  display_name text,
  avatar_url text,
  profile_url text,
  follower_count bigint not null default 0,
  following_count bigint,
  likes_count bigint,
  video_count bigint,
  view_count bigint,
  provider_verified boolean not null default false,
  quality_score numeric(5,2) not null default 0,
  suspicious boolean not null default false,
  quality_note text,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider),
  unique(provider,provider_user_id)
);
create index if not exists creator_connections_user_idx on public.creator_connections(user_id);
create index if not exists creator_connections_provider_idx on public.creator_connections(provider,follower_count desc);

create table if not exists public.creator_applications (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok','twitch')),
  requested_rank text not null check (requested_rank in ('youtube','tiktok','twitch_streamer')),
  connection_id uuid not null references public.creator_connections(id) on delete cascade,
  follower_count_at_apply bigint not null default 0,
  quality_score_at_apply numeric(5,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  applicant_note text,
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creator_applications_status_idx on public.creator_applications(status,created_at desc);

-- Tokens are server-side only. No client grants / policies are created.
create table if not exists public.creator_oauth_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok','twitch')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now(),
  primary key(user_id,provider)
);
create table if not exists public.creator_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok','twitch')),
  expires_at timestamptz not null default now()+interval '10 minutes',
  created_at timestamptz not null default now()
);
revoke all on table public.creator_oauth_tokens from anon,authenticated;
revoke all on table public.creator_oauth_states from anon,authenticated;

create or replace function public.submit_lunavisual_creator_application(p_provider text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.creator_connections%rowtype; v_rank text; v_min bigint; v_existing bigint;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_provider='youtube' then v_rank:='youtube'; v_min:=1000;
  elsif p_provider='tiktok' then v_rank:='tiktok'; v_min:=2000;
  elsif p_provider='twitch' then v_rank:='twitch_streamer'; v_min:=500;
  else return jsonb_build_object('ok',false,'error','invalid_provider'); end if;
  select * into c from public.creator_connections where user_id=auth.uid() and provider=p_provider;
  if not found then return jsonb_build_object('ok',false,'error','connect_provider_first'); end if;
  if c.last_verified_at < now()-interval '7 days' then return jsonb_build_object('ok',false,'error','verification_outdated'); end if;
  if c.follower_count < v_min then return jsonb_build_object('ok',false,'error','not_enough_followers','required',v_min,'current',c.follower_count); end if;
  if c.suspicious then return jsonb_build_object('ok',false,'error','manual_review_required'); end if;
  select id into v_existing from public.creator_applications where user_id=auth.uid() and provider=p_provider and status='pending' order by id desc limit 1;
  if v_existing is not null then return jsonb_build_object('ok',true,'status','already_pending','application_id',v_existing); end if;
  insert into public.creator_applications(user_id,provider,requested_rank,connection_id,follower_count_at_apply,quality_score_at_apply,applicant_note)
  values(auth.uid(),p_provider,v_rank,c.id,c.follower_count,c.quality_score,nullif(trim(p_note),'')) returning id into v_existing;
  return jsonb_build_object('ok',true,'status','pending','application_id',v_existing,'requested_rank',v_rank);
end $$;
grant execute on function public.submit_lunavisual_creator_application(text,text) to authenticated;

create or replace function public.disconnect_lunavisual_creator_provider(p_provider text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  delete from public.creator_oauth_tokens where user_id=auth.uid() and provider=p_provider;
  delete from public.creator_connections where user_id=auth.uid() and provider=p_provider;
  return true;
end $$;
grant execute on function public.disconnect_lunavisual_creator_provider(text) to authenticated;

create or replace function public.admin_review_creator_application(p_application_id bigint,p_approve boolean,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.creator_applications%rowtype;
begin
  if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if;
  select * into a from public.creator_applications where id=p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  update public.creator_applications
    set status=case when p_approve then 'approved' else 'rejected' end,
        review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_application_id;
  if p_approve then update public.profiles set rank=a.requested_rank,updated_at=now() where id=a.user_id; end if;
  return true;
end $$;
grant execute on function public.admin_review_creator_application(bigint,boolean,text) to authenticated;

create or replace function public.admin_set_lunavisual_rank(p_user_id uuid,p_rank text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if;
  if p_rank not in ('user','admin','youtube','tiktok','twitch_streamer','tester') then raise exception 'invalid_rank'; end if;
  update public.profiles set rank=p_rank,updated_at=now() where id=p_user_id;
  return found;
end $$;
grant execute on function public.admin_set_lunavisual_rank(uuid,text) to authenticated;

-- Admin permission stays separate from public/profile rank. Only super-admin changes admin permissions.
create or replace function public.admin_set_lunavisual_role(p_user_id uuid,p_role text)
returns boolean language plpgsql security definer set search_path=public as $$
declare old_role text; super_count integer;
begin
  if not public.is_lunavisual_super_admin() then raise exception 'super_admin_required'; end if;
  if p_role not in ('user','admin','super_admin') then raise exception 'invalid_role'; end if;
  select role into old_role from public.admin_roles where user_id=p_user_id;
  if old_role='super_admin' and p_role<>'super_admin' then
    select count(*) into super_count from public.admin_roles where role='super_admin';
    if super_count<=1 then raise exception 'cannot_remove_last_super_admin'; end if;
  end if;
  if p_role='user' then delete from public.admin_roles where user_id=p_user_id;
  else
    insert into public.admin_roles(user_id,role,created_by) values(p_user_id,p_role,auth.uid())
    on conflict(user_id) do update set role=excluded.role,updated_at=now();
  end if;
  return true;
end $$;
grant execute on function public.admin_set_lunavisual_role(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Models / cosmetics store
-- ---------------------------------------------------------------------------
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  preview_url text,
  asset_path text,
  price_rub integer not null default 0 check (price_rub>=0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Migration-safe columns for an existing models table.
alter table public.models add column if not exists slug text;
alter table public.models add column if not exists name text;
alter table public.models add column if not exists description text not null default '';
alter table public.models add column if not exists preview_url text;
alter table public.models add column if not exists asset_path text;
alter table public.models add column if not exists price_rub integer not null default 0;
alter table public.models add column if not exists active boolean not null default true;
alter table public.models add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.models add column if not exists created_at timestamptz not null default now();
alter table public.models add column if not exists updated_at timestamptz not null default now();
create unique index if not exists models_slug_uidx on public.models(slug) where slug is not null;
create table if not exists public.user_models (
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key(user_id,model_id)
);
create table if not exists public.model_orders (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','paid','granted','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists model_orders_user_idx on public.model_orders(user_id,created_at desc);

create or replace function public.request_lunavisual_model_order(p_model_id uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not exists(select 1 from public.models where id=p_model_id and active=true) then raise exception 'model_not_found'; end if;
  if exists(select 1 from public.user_models where user_id=auth.uid() and model_id=p_model_id) then raise exception 'already_owned'; end if;
  select id into v_id from public.model_orders where user_id=auth.uid() and model_id=p_model_id and status='pending' order by id desc limit 1;
  if v_id is null then insert into public.model_orders(user_id,model_id) values(auth.uid(),p_model_id) returning id into v_id; end if;
  return v_id;
end $$;
grant execute on function public.request_lunavisual_model_order(uuid) to authenticated;

create or replace function public.admin_grant_lunavisual_model(p_user_id uuid,p_model_id uuid,p_order_id bigint default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if;
  insert into public.user_models(user_id,model_id,granted_by) values(p_user_id,p_model_id,auth.uid()) on conflict do nothing;
  if p_order_id is not null then update public.model_orders set status='granted',updated_at=now() where id=p_order_id and user_id=p_user_id and model_id=p_model_id; end if;
  return true;
end $$;
grant execute on function public.admin_grant_lunavisual_model(uuid,uuid,bigint) to authenticated;

create or replace function public.admin_revoke_lunavisual_model(p_user_id uuid,p_model_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if;
  delete from public.user_models where user_id=p_user_id and model_id=p_model_id;
  return true;
end $$;
grant execute on function public.admin_revoke_lunavisual_model(uuid,uuid) to authenticated;

create or replace function public.get_my_lunavisual_models()
returns table(model_id uuid,slug text,name text,description text,preview_url text,granted_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id,m.slug,m.name,m.description,m.preview_url,um.granted_at
  from public.user_models um join public.models m on m.id=um.model_id
  where um.user_id=auth.uid() and m.active=true order by um.granted_at desc
$$;
grant execute on function public.get_my_lunavisual_models() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin deletes / HWID / launcher state
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_lunavisual_key(p_key_id bigint)
returns boolean language plpgsql security definer set search_path=public as $$
begin if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if; delete from public.license_keys where id=p_key_id; return true; end $$;
grant execute on function public.admin_delete_lunavisual_key(bigint) to authenticated;

create or replace function public.admin_delete_lunavisual_alpha_key(p_key_id bigint)
returns boolean language plpgsql security definer set search_path=public as $$
begin if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if; delete from public.alpha_keys where id=p_key_id; return true; end $$;
grant execute on function public.admin_delete_lunavisual_alpha_key(bigint) to authenticated;

create or replace function public.admin_delete_used_lunavisual_keys()
returns integer language plpgsql security definer set search_path=public as $$
declare n integer; begin if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if; delete from public.license_keys where is_used=true; get diagnostics n=row_count; return n; end $$;
grant execute on function public.admin_delete_used_lunavisual_keys() to authenticated;

create or replace function public.admin_delete_used_lunavisual_alpha_keys()
returns integer language plpgsql security definer set search_path=public as $$
declare n integer; begin if not public.is_lunavisual_admin() then raise exception 'admin_required'; end if; delete from public.alpha_keys where is_used=true; get diagnostics n=row_count; return n; end $$;
grant execute on function public.admin_delete_used_lunavisual_alpha_keys() to authenticated;

create or replace function public.reset_my_lunavisual_hwid()
returns boolean language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'login_required'; end if; update public.profiles set hwid=null,updated_at=now() where id=auth.uid(); return true; end $$;
grant execute on function public.reset_my_lunavisual_hwid() to authenticated;

create or replace function public.get_lunavisual_launcher_state()
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype; v_models jsonb;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not public.check_lunavisual_rate_limit('launcher_state',120,60) then raise exception 'rate_limited'; end if;
  select * into p from public.profiles where id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'slug',m.slug,'name',m.name,'preview_url',m.preview_url)),'[]'::jsonb)
    into v_models from public.user_models um join public.models m on m.id=um.model_id where um.user_id=auth.uid() and m.active=true;
  return jsonb_build_object(
    'user_id',p.id,'email',p.email,'nickname',p.mc_nickname,'hwid',p.hwid,
    'subscription_active',p.subscription_lifetime or (p.subscription_expires_at is not null and p.subscription_expires_at>now()) or (p.subscription_expires_at is null and p.subscription_active),
    'subscription_until',p.subscription_until,'subscription_lifetime',p.subscription_lifetime,'subscription_expires_at',p.subscription_expires_at,
    'alpha_active',p.alpha_lifetime or (p.alpha_access_until is not null and p.alpha_access_until>now()),'alpha_lifetime',p.alpha_lifetime,'alpha_until',p.alpha_access_until,
    'rank',p.rank,'role',public.current_lunavisual_role(),'is_admin',public.is_lunavisual_admin(),'models',v_models
  );
end $$;
grant execute on function public.get_lunavisual_launcher_state() to authenticated;

-- Protect server-owned profile fields from ordinary self-updates.
create or replace function public.protect_lunavisual_profile_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid()=old.id and not public.is_lunavisual_admin() then
    if new.subscription_active is distinct from old.subscription_active
       or new.subscription_until is distinct from old.subscription_until
       or new.subscription_expires_at is distinct from old.subscription_expires_at
       or new.subscription_lifetime is distinct from old.subscription_lifetime
       or new.alpha_access_until is distinct from old.alpha_access_until
       or new.alpha_lifetime is distinct from old.alpha_lifetime
       or new.rank is distinct from old.rank
       or new.is_admin is distinct from old.is_admin then
      raise exception 'protected_profile_fields';
    end if;
  end if;
  new.updated_at:=now(); return new;
end $$;
drop trigger if exists protect_lunavisual_profile_fields_trg on public.profiles;
create trigger protect_lunavisual_profile_fields_trg before update on public.profiles
for each row execute procedure public.protect_lunavisual_profile_fields();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.license_keys enable row level security;
alter table public.alpha_keys enable row level security;
alter table public.rpc_rate_limits enable row level security;
alter table public.news enable row level security;
alter table public.creator_connections enable row level security;
alter table public.creator_applications enable row level security;
alter table public.creator_oauth_tokens enable row level security;
alter table public.creator_oauth_states enable row level security;
alter table public.models enable row level security;
alter table public.user_models enable row level security;
alter table public.model_orders enable row level security;
revoke all on table public.rpc_rate_limits from anon,authenticated;

-- profiles
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_lunavisual_admin());
create policy profiles_self_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid() or public.is_lunavisual_admin()) with check(id=auth.uid() or public.is_lunavisual_admin());

-- admin roles
drop policy if exists admin_roles_read on public.admin_roles;
create policy admin_roles_read on public.admin_roles for select to authenticated using(user_id=auth.uid() or public.is_lunavisual_admin());

-- key databases: admins only read them directly. Redemption/generation is RPC.
drop policy if exists license_keys_admin_read on public.license_keys;
create policy license_keys_admin_read on public.license_keys for select to authenticated using(public.is_lunavisual_admin());
drop policy if exists alpha_keys_admin_read on public.alpha_keys;
create policy alpha_keys_admin_read on public.alpha_keys for select to authenticated using(public.is_lunavisual_admin());

-- news
drop policy if exists news_public_read on public.news;
drop policy if exists news_admin_insert on public.news;
drop policy if exists news_admin_update on public.news;
drop policy if exists news_admin_delete on public.news;
create policy news_public_read on public.news for select to anon,authenticated using(is_published=true or public.is_lunavisual_admin());
create policy news_admin_insert on public.news for insert to authenticated with check(public.is_lunavisual_admin());
create policy news_admin_update on public.news for update to authenticated using(public.is_lunavisual_admin()) with check(public.is_lunavisual_admin());
create policy news_admin_delete on public.news for delete to authenticated using(public.is_lunavisual_admin());

-- creator data
drop policy if exists creator_connections_read on public.creator_connections;
create policy creator_connections_read on public.creator_connections for select to authenticated using(user_id=auth.uid() or public.is_lunavisual_admin());
drop policy if exists creator_applications_read on public.creator_applications;
create policy creator_applications_read on public.creator_applications for select to authenticated using(user_id=auth.uid() or public.is_lunavisual_admin());

-- models
drop policy if exists models_read on public.models;
drop policy if exists models_admin_write on public.models;
create policy models_read on public.models for select to authenticated using(active=true or public.is_lunavisual_admin());
create policy models_admin_write on public.models for all to authenticated using(public.is_lunavisual_admin()) with check(public.is_lunavisual_admin());
drop policy if exists user_models_read on public.user_models;
create policy user_models_read on public.user_models for select to authenticated using(user_id=auth.uid() or public.is_lunavisual_admin());
drop policy if exists model_orders_read on public.model_orders;
create policy model_orders_read on public.model_orders for select to authenticated using(user_id=auth.uid() or public.is_lunavisual_admin());

-- ---------------------------------------------------------------------------
-- Storage buckets for admin news / model uploads
-- ---------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('news','news',true,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets(id,name,public,file_size_limit)
values('models-preview','models-preview',true,10485760)
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit;

insert into storage.buckets(id,name,public,file_size_limit)
values('models-assets','models-assets',false,104857600)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

-- Drop/recreate only LunaVisual storage policies.
drop policy if exists lunavisual_news_public_read on storage.objects;
drop policy if exists lunavisual_news_admin_insert on storage.objects;
drop policy if exists lunavisual_news_admin_update on storage.objects;
drop policy if exists lunavisual_news_admin_delete on storage.objects;
create policy lunavisual_news_public_read on storage.objects for select to public using(bucket_id='news');
create policy lunavisual_news_admin_insert on storage.objects for insert to authenticated with check(bucket_id='news' and public.is_lunavisual_admin());
create policy lunavisual_news_admin_update on storage.objects for update to authenticated using(bucket_id='news' and public.is_lunavisual_admin()) with check(bucket_id='news' and public.is_lunavisual_admin());
create policy lunavisual_news_admin_delete on storage.objects for delete to authenticated using(bucket_id='news' and public.is_lunavisual_admin());

drop policy if exists lunavisual_models_preview_read on storage.objects;
drop policy if exists lunavisual_models_preview_admin_write on storage.objects;
create policy lunavisual_models_preview_read on storage.objects for select to public using(bucket_id='models-preview');
create policy lunavisual_models_preview_admin_write on storage.objects for all to authenticated using(bucket_id='models-preview' and public.is_lunavisual_admin()) with check(bucket_id='models-preview' and public.is_lunavisual_admin());

drop policy if exists lunavisual_models_assets_admin_write on storage.objects;
create policy lunavisual_models_assets_admin_write on storage.objects for all to authenticated using(bucket_id='models-assets' and public.is_lunavisual_admin()) with check(bucket_id='models-assets' and public.is_lunavisual_admin());

-- Clean expired OAuth states opportunistically when SQL is rerun.
delete from public.creator_oauth_states where expires_at<now();
