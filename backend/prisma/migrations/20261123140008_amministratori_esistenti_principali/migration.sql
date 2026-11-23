-- Gli amministratori gia' presenti (creati con npm run setup) diventano amministratori principali
UPDATE "users" SET "role" = 'SUPERADMIN' WHERE "role" = 'ADMIN';
