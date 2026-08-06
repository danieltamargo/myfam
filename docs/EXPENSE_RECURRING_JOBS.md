# Procesamiento de gastos recurrentes

Las reglas recurrentes se guardan en `recurring_expense_rules`. La generación de ocurrencias se
realiza dentro de PostgreSQL mediante `public.process_due_recurring_expenses(date)`: no hace
peticiones externas, bloquea cada regla con `FOR UPDATE SKIP LOCKED` y usa una clave única por regla
y fecha para que repetir una ejecución sea seguro.

## Programación en producción

La función solo está concedida a `service_role` y al propietario de la base de datos. En un proyecto
Supabase con `pg_cron`, ejecutar una vez como administrador:

```sql
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'myfamily-expenses-daily',
  '5 0 * * *',
  $$select public.process_due_recurring_expenses(current_date);$$
);
```

La expresión se evalúa según la zona horaria configurada para PostgreSQL. La aplicación trabaja con
columnas `DATE`, por lo que una ejecución diaria después de medianoche es suficiente. No se debe
invocar esta función desde el navegador ni concederla al rol `authenticated`.

## Operación

- Una regla pausada o perteneciente a una colección archivada no genera movimientos.
- Si el pagador, creador o cualquier participante del reparto deja de estar activo, la regla se
  desactiva sin crear una ocurrencia parcial.
- El resultado entero de la función es el número de movimientos creados en esa ejecución.
- Una segunda ejecución con la misma fecha devuelve `0` si ya no hay ocurrencias pendientes.

Comprobación manual segura:

```sql
begin;
select public.process_due_recurring_expenses(current_date);
rollback;
```
