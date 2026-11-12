# Límite para derechos comerciales de módulos

MyFamily resuelve el acceso efectivo a un módulo con tres decisiones independientes:

1. La disponibilidad global versionada en `src/lib/config/modules.ts` decide si el código está publicado.
2. `family_modules.enabled` guarda únicamente la preferencia operativa de la familia.
3. `ModuleEntitlementProvider` queda como límite para un derecho comercial futuro.

La regla prevista para un módulo opcional es:

```text
disponible globalmente AND activado por la familia AND permitido por el entitlement
```

El módulo `core` (`members`) no depende de una preferencia ni debe convertirse en un producto comercializable. Wishlist es opcional y usa la preferencia familiar igual que los demás módulos `available`. Cualquier módulo `disabled` permanece bloqueado aunque exista una fila familiar habilitada o un proveedor futuro lo permita.

## Contrato actual

`src/lib/server/modules/availability.ts` expone `ModuleEntitlementProvider`. El proveedor activo, `NO_BILLING_ENTITLEMENT_PROVIDER`, devuelve siempre `true`; no consulta planes, suscripciones ni pagos. Las guardas de servidor evalúan después la preferencia familiar para los módulos `available`.

Una integración futura deberá implementar el contrato sin reutilizar `family_modules` como fuente de derechos. Su almacenamiento, caché y sincronización tendrán que ser independientes y no podrán debilitar RLS ni las ACL de cada dominio.

Quedan expresamente fuera de este roadmap Stripe, paywalls, planes, precios, periodos de prueba y cualquier mutación de billing.
