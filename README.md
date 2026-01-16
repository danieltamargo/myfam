# MyFamily

Proyecto creado por amor al arte y la familia. Una aplicación para, emulando el comportamiento de un ERP, se puedan gestionar las actividades, eventos, listas de regalos y mucho más dentro de una familia.

## Comandos

Comandos de utilidad para gestionar el proyecto Svelte y la base de datos Supabase localmente.

### Svelte

```bash
# Iniciar proyecto
npm install
npm run dev
```

### Supabase local

```bash
# Manejo
supabase start
supabase stop
supabase db reset
supabase status

# Script custom para reiniciar la bbdd de manera ágil en Windows (daba problema con contenedor)
./reset-supabase.ps1

# Dump
supabase db dump --data-only > supabase/seed.sql

# Regenerar tipos de la base de datos
supabase gen types typescript --project-id wismzxvqrypwqwqpgnfi > src/lib/types/database.ts

# Push de los cambios en la base de datos (nuevas migraciones)
supabase db push --local
supabase db push --linked
supabase db push
```
