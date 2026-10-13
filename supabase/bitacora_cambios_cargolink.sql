-- Bitácora de cambios que llegan DE Cargolink (carga programada, botón
-- Actualizar o al abrir un booking). Solo la ven administradores.
create table if not exists public.bitacora_cambios_cargolink (
  id bigint generated always as identity primary key,
  id_booking bigint not null,
  no_booking text,
  cliente text,
  ejecutivo text,
  campo text not null,
  etiqueta text not null,
  valor_antes text,
  valor_despues text,
  fecha_cargolink timestamp,
  origen text not null,
  detectado_por text,
  detectado_at timestamptz not null default now()
);
create index if not exists bitacora_cambios_cargolink_fecha on public.bitacora_cambios_cargolink (detectado_at desc);
create index if not exists bitacora_cambios_cargolink_booking on public.bitacora_cambios_cargolink (id_booking);

alter table public.bitacora_cambios_cargolink enable row level security;
revoke all on public.bitacora_cambios_cargolink from anon, authenticated;
grant select on public.bitacora_cambios_cargolink to authenticated;
drop policy if exists solo_admin_bitacora_cambios on public.bitacora_cambios_cargolink;
create policy solo_admin_bitacora_cambios on public.bitacora_cambios_cargolink
  for select to authenticated
  using (coalesce((select es_admin from public.get_my_permissions()), false));

create or replace function public.registrar_cambios_cargolink()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_origen text;
  v_detectado text;
  k text;
  etiquetas constant jsonb := '{
    "etd_atd": "ATD real", "eta": "ETA", "ata": "ATA real", "revalidacion": "Revalidación",
    "telex_house_bl": "Telex HBL", "telex_master_bl": "Telex MBL", "regreso_vacio": "Regreso de vacío",
    "solicitud_garantia": "Solicitud de garantía", "regreso_garantia": "Regreso de garantía",
    "dias_libres_demora": "Días libres de demora", "ejecutivo": "Ejecutivo", "status_booking": "Estatus del booking",
    "his_mov_atd": "Etapa ATD", "his_mov_eta": "Etapa ETA", "his_mov_ata": "Etapa ATA",
    "his_mov_alertFech": "Etapa Aviso de arribo", "his_mov_alertAta": "Etapa Aviso de ATA",
    "his_mov_aviso_atd": "Etapa Aviso de ATD", "his_mov_hbl_telex": "Etapa Telex HBL", "his_mov_mbl_telex": "Etapa Telex MBL",
    "his_mov_rev": "Etapa Revalidación", "his_mov_entrega_vacio": "Etapa Entrega de vacío",
    "his_mov_transbordo": "Etapa Transbordo", "his_mov_demoras": "Etapa Demoras", "his_mov_kpi": "Etapa KPIs",
    "his_mov_manifiesto": "Etapa Manifiesto", "his_mov_origen": "Etapa Origen", "his_mov_seguro": "Etapa Seguro",
    "his_mov_mercancia": "Etapa Mercancía", "his_mov_facturacion": "Etapa Facturación",
    "his_mov_factura_extra": "Etapa Factura extra"
  }'::jsonb;
  v_antes text;
  v_despues text;
  v_fecha text;
begin
  -- 'App' si hubo un cambio desde la app a ese booking en los últimos 15 min.
  v_origen := case when exists (
      select 1 from bitacora_cargolink b
      where b.id_booking = new.id_booking and b.ok and b.created_at > now() - interval '15 minutes')
    then 'App' else 'Cargolink' end;
  v_detectado := coalesce((select email from auth.users where id = auth.uid()), 'Carga automática');

  for k in select unnest(array['etd_atd','eta','ata','revalidacion','telex_house_bl','telex_master_bl',
                               'regreso_vacio','solicitud_garantia','regreso_garantia','dias_libres_demora',
                               'ejecutivo','status_booking']) loop
    v_antes := to_jsonb(old) ->> k;
    v_despues := to_jsonb(new) ->> k;
    if v_antes is distinct from v_despues then
      insert into bitacora_cambios_cargolink (id_booking, no_booking, cliente, ejecutivo, campo, etiqueta,
        valor_antes, valor_despues, fecha_cargolink, origen, detectado_por)
      values (new.id_booking, new.no_booking, new.cliente, new.ejecutivo, k, etiquetas ->> k,
        v_antes, v_despues, null, v_origen, v_detectado);
    end if;
  end loop;

  for k in select x from jsonb_object_keys(coalesce(new.datos, '{}'::jsonb) || coalesce(old.datos, '{}'::jsonb)) x
           where x ~ '^his_mov_[A-Za-z_]+$' and x !~ '(BackgroundColor|Leyenda)$' loop
    v_antes := nullif(old.datos ->> k, '');
    v_despues := nullif(new.datos ->> k, '');
    if v_antes is distinct from v_despues then
      v_fecha := new.datos ->> ('his_fecha_' || substr(k, 9));
      insert into bitacora_cambios_cargolink (id_booking, no_booking, cliente, ejecutivo, campo, etiqueta,
        valor_antes, valor_despues, fecha_cargolink, origen, detectado_por)
      values (new.id_booking, new.no_booking, new.cliente, new.ejecutivo, k, coalesce(etiquetas ->> k, k),
        v_antes, v_despues,
        case when v_fecha ~ '^\d{4}-\d{2}-\d{2}' and v_fecha !~ '^0000' then left(v_fecha, 19)::timestamp end,
        v_origen, v_detectado);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_registrar_cambios_cargolink on public.operaciones_maritima;
create trigger trg_registrar_cambios_cargolink
  after update on public.operaciones_maritima
  for each row
  when (old.* is distinct from new.*)
  execute function public.registrar_cambios_cargolink();
