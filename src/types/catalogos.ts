export type CatalogoVendedor = {
  id: number;
  vendedor: string;
  plaza: string;
};

export type CatalogoOperativo = {
  id: number;
  nombre_operativo: string;
  activo: boolean;
  user_id: string | null;
};

export type CatalogoTerminalPortuaria = {
  id: number;
  codigo: string;
  nombre: string;
};

export type AppUser = {
  id: string;
  email: string;
  banned_until?: string | null;
  created_at?: string;
  es_admin?: boolean;
  puede_exportar?: boolean;
  puede_borrar?: boolean;
  puede_operativos?: boolean;
  es_master?: boolean;
  operativo_asociado?: string | null;
};
