DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "orders"
    WHERE "provider_order_id" IS NOT NULL
    GROUP BY "provider", "provider_order_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add orders(provider, provider_order_id) uniqueness; duplicate provider order ids exist. Resolve duplicates before running this migration.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "orders_provider_provider_order_id_key"
  ON "orders"("provider", "provider_order_id");
