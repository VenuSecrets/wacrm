-- Permite que más de un correo administre (agende/edite) el calendario del
-- salón. Antes solo `info@venusecretsbcn.es`; ahora también la cuenta del CRM
-- (`venusecretsbcn@gmail.com`), para que el mismo usuario que gestiona WACRM
-- pueda agendar sin cambiar de sesión. Debe mantenerse en sync con la lista
-- CORREOS_ADMIN de public/calendario/js/config.js.
alter policy editar_citas on public.citas
  using (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']))
  with check (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']));

alter policy editar_clientes on public.clientes
  using (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']))
  with check (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']));

alter policy editar_servicios on public.servicios
  using (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']))
  with check (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']));

alter policy editar_trabajadoras on public.trabajadoras
  using (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']))
  with check (auth.email() = any (array['info@venusecretsbcn.es','venusecretsbcn@gmail.com']));
