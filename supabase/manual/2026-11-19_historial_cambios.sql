-- Historial de cambios (Track): solicitudes de cambio a la app, con prioridad,
-- historial automático de modificaciones y conversación por usuario.
-- Lectura y escritura solo por funciones (security definer) para usuarios de Track.

create table if not exists public.solicitudes_cambio (
  id bigint generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text not null default '',
  solicitante text not null default '',
  fecha_solicitud date not null default (now() at time zone 'America/Mexico_City')::date,
  fecha_compromiso date,
  alcance text not null default '',
  prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
  orden integer not null default 0,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_proceso','listo','pospuesto','cancelado')),
  fecha_cierre date,
  creado_por text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  borrado_en timestamptz
);

create table if not exists public.solicitudes_cambio_eventos (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references public.solicitudes_cambio(id),
  tipo text not null check (tipo in ('creacion','cambio','comentario')),
  usuario text not null,
  texto text not null default '',
  detalle jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists idx_sc_eventos_solicitud on public.solicitudes_cambio_eventos (solicitud_id, creado_en);

alter table public.solicitudes_cambio enable row level security;
alter table public.solicitudes_cambio_eventos enable row level security;
revoke all on public.solicitudes_cambio, public.solicitudes_cambio_eventos from anon, authenticated;

create or replace function public._sc_acceso() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_user_permissions
    where user_id = auth.uid() and (coalesce(es_admin,false) or coalesce(puede_operaciones,true))
  );
$$;
revoke all on function public._sc_acceso() from public, anon;
grant execute on function public._sc_acceso() to authenticated;

create or replace function public._sc_usuario() returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select email from auth.users where id = auth.uid()), 'desconocido');
$$;
revoke all on function public._sc_usuario() from public, anon, authenticated;

-- Lista (sin borrados), en orden de prioridad.
create or replace function public.sc_lista()
returns setof public.solicitudes_cambio
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._sc_acceso() then raise exception 'sin acceso'; end if;
  return query
    select * from public.solicitudes_cambio where borrado_en is null
    order by case when estado in ('pendiente','en_proceso') then 0 else 1 end,
             case prioridad when 'alta' then 0 when 'media' then 1 else 2 end,
             orden, id;
end $$;

create or replace function public.sc_eventos(p_id bigint)
returns setof public.solicitudes_cambio_eventos
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._sc_acceso() then raise exception 'sin acceso'; end if;
  return query select * from public.solicitudes_cambio_eventos where solicitud_id = p_id order by creado_en, id;
end $$;

create or replace function public.sc_crear(
  p_nombre text, p_descripcion text, p_solicitante text, p_fecha_solicitud date,
  p_fecha_compromiso date, p_alcance text, p_prioridad text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_u text := public._sc_usuario(); v_orden int;
begin
  if not public._sc_acceso() then raise exception 'sin acceso'; end if;
  select coalesce(max(orden),0) + 1 into v_orden from public.solicitudes_cambio
    where borrado_en is null and prioridad = coalesce(p_prioridad,'media');
  insert into public.solicitudes_cambio (nombre, descripcion, solicitante, fecha_solicitud, fecha_compromiso, alcance, prioridad, orden, creado_por)
  values (trim(p_nombre), coalesce(p_descripcion,''), coalesce(nullif(trim(p_solicitante),''), v_u),
          coalesce(p_fecha_solicitud, (now() at time zone 'America/Mexico_City')::date),
          p_fecha_compromiso, coalesce(p_alcance,''), coalesce(p_prioridad,'media'), v_orden, v_u)
  returning id into v_id;
  insert into public.solicitudes_cambio_eventos (solicitud_id, tipo, usuario, texto)
  values (v_id, 'creacion', v_u, 'Creó la solicitud');
  return v_id;
end $$;

-- Edita campos; registra en el historial cada campo que cambió (antes → después).
create or replace function public.sc_editar(p_id bigint, p_campos jsonb, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_u text := public._sc_usuario();
  v_old public.solicitudes_cambio;
  v_new public.solicitudes_cambio;
  v_dif jsonb := '{}'::jsonb;
  k text;
begin
  if not public._sc_acceso() then raise exception 'sin acceso'; end if;
  select * into v_old from public.solicitudes_cambio where id = p_id and borrado_en is null for update;
  if not found then raise exception 'no existe'; end if;

  update public.solicitudes_cambio s set
    nombre = case when p_campos ? 'nombre' and length(trim(p_campos->>'nombre')) > 0 then trim(p_campos->>'nombre') else s.nombre end,
    descripcion = case when p_campos ? 'descripcion' then coalesce(p_campos->>'descripcion','') else s.descripcion end,
    solicitante = case when p_campos ? 'solicitante' then coalesce(p_campos->>'solicitante','') else s.solicitante end,
    fecha_solicitud = case when p_campos ? 'fecha_solicitud' and nullif(p_campos->>'fecha_solicitud','') is not null then (p_campos->>'fecha_solicitud')::date else s.fecha_solicitud end,
    fecha_compromiso = case when p_campos ? 'fecha_compromiso' then nullif(p_campos->>'fecha_compromiso','')::date else s.fecha_compromiso end,
    alcance = case when p_campos ? 'alcance' then coalesce(p_campos->>'alcance','') else s.alcance end,
    prioridad = case when p_campos ? 'prioridad' then p_campos->>'prioridad' else s.prioridad end,
    orden = case when p_campos ? 'orden' then (p_campos->>'orden')::int else s.orden end,
    estado = case when p_campos ? 'estado' then p_campos->>'estado' else s.estado end,
    fecha_cierre = case
      when p_campos ? 'estado' and p_campos->>'estado' in ('listo','pospuesto','cancelado')
        then coalesce(case when s.estado = p_campos->>'estado' then s.fecha_cierre end, (now() at time zone 'America/Mexico_City')::date)
      when p_campos ? 'estado' then null
      else s.fecha_cierre end,
    actualizado_en = now()
  where id = p_id
  returning * into v_new;

  for k in select unnest(array['nombre','descripcion','solicitante','fecha_solicitud','fecha_compromiso','alcance','prioridad','estado']) loop
    if (to_jsonb(v_old)->k) is distinct from (to_jsonb(v_new)->k) then
      v_dif := v_dif || jsonb_build_object(k, jsonb_build_object('antes', to_jsonb(v_old)->k, 'despues', to_jsonb(v_new)->k));
    end if;
  end loop;
  if v_dif <> '{}'::jsonb then
    insert into public.solicitudes_cambio_eventos (solicitud_id, tipo, usuario, texto, detalle)
    values (p_id, 'cambio', v_u, coalesce(nullif(trim(p_nota),''), ''), v_dif);
  end if;
end $$;

-- Sube o baja un lugar dentro de su misma prioridad (intercambia el orden con el vecino).
create or replace function public.sc_mover(p_id bigint, p_dir int)
returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.solicitudes_cambio; v_b public.solicitudes_cambio; v_u text := public._sc_usuario();
begin
  if not public._sc_acceso() then raise exception 'sin acceso'; end if;
  select * into v_a from public.solicitudes_cambio where id = p_id and borrado_en is null;
  if not found then return; end if;
  if p_dir < 0 then
    select * into v_b from public.solicitudes_cambio
     where borrado_en is null and prioridad = v_a.prioridad and estado in ('pendiente','en_proceso')
       and (orden, id) < (v_a.orden, v_a.id) order by orden desc, id desc limit 1;
  else
    select * into v_b from public.solicitudes_cambio
     where borrado_en is null and prioridad = v_a.prioridad and estado in ('pendiente','en_proceso')
       and (orden, id) > (v_a.orden, v_a.id) order by orden, id limit 1;
  end if;
  if v_b.id is null then return; end if;
  update public.solicitudes_cambio set orden = case when id = v_a.id then v_b.orden else v_a.orden end, actualizado_en = now()
   where id in (v_a.id, v_b.id);
  if v_a.orden = v_b.orden then
    update public.solicitudes_cambio set orden = orden + (case when p_dir < 0 then -1 else 1 end) where id = v_a.id;
  end if;
  insert into public.solicitudes_cambio_eventos (solicitud_id, tipo, usuario, texto)
  values (p_id, 'cambio', v_u, case when p_dir < 0 then 'Subió la prioridad' else 'Bajó la prioridad' end);
end $$;

create or replace function public.sc_comentar(p_id bigint, p_texto text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._sc_acceso() then raise exception 'sin acceso'; end if;
  if length(trim(coalesce(p_texto,''))) = 0 then return; end if;
  if not exists (select 1 from public.solicitudes_cambio where id = p_id and borrado_en is null) then raise exception 'no existe'; end if;
  insert into public.solicitudes_cambio_eventos (solicitud_id, tipo, usuario, texto)
  values (p_id, 'comentario', public._sc_usuario(), trim(p_texto));
  update public.solicitudes_cambio set actualizado_en = now() where id = p_id;
end $$;

revoke all on function public.sc_lista(), public.sc_eventos(bigint),
  public.sc_crear(text,text,text,date,date,text,text), public.sc_editar(bigint,jsonb,text),
  public.sc_mover(bigint,int), public.sc_comentar(bigint,text) from public, anon;
grant execute on function public.sc_lista(), public.sc_eventos(bigint),
  public.sc_crear(text,text,text,date,date,text,text), public.sc_editar(bigint,jsonb,text),
  public.sc_mover(bigint,int), public.sc_comentar(bigint,text) to authenticated;
