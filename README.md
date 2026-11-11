# JAPZGRILL Inventory Management

Inventory management module for Japz Grill and Bistro, built on Express, Sequelize, and MySQL.

## Features

- Session-authenticated dashboard with stock totals, low/out-of-stock counts, valuation, recent movement, and expiration alerts.
- Item search, category/status filters, sorting, item maintenance, and archived items that retain transaction history.
- Stock-in batch records for delivery date, supplier reference, cost, remarks, and expiration date.
- Transactional stock updates with row locks, quantity validation, expiration-aware stock-outs, FEFO batch allocation, and per-batch allocation audit records. Expired batch quantities are excluded from available stock and low-stock calculations until recorded as an expiry adjustment.
- Immutable movement history and filtered current-stock / movement reports with browser printing and CSV export.
- Role controls: administrator accounts can sign in and manage item records, stock, and inventory views.

## Local setup

1. Install dependencies with `npm install`.
2. Create a MySQL account/database with permission to create the configured application database.
3. Configure the database and session environment:

   ```powershell
   $env:DB_HOST = "localhost"
   $env:DB_PORT = "3306"
   $env:DB_NAME = "InventoryJapz"
   $env:DB_USER = "root"
   $env:DB_PASSWORD = "your-local-db-password"
   $env:SESSION_SECRET = "a-long-random-secret"
   ```

4. Create missing tables without resetting existing data: `npm run migrate`.
5. Create the first administrator (password must be at least 12 characters):

   ```powershell
   $env:ADMIN_NAME = "Inventory Admin"
   $env:ADMIN_EMAIL = "admin@example.com"
   $env:ADMIN_PASSWORD = "use-a-unique-password"
   npm run create:admin
   ```

6. Start the server with `npm start` and open `http://localhost:3000`.

If PowerShell blocks the `npm.ps1` shim due to its execution policy, use `npm.cmd` in place of `npm` for these commands.

The admin command refuses to overwrite an existing account. Public registration creates `visitors` accounts with read-only access. Create staff accounts using the main JAPZGRILL account provisioning process; the registration form never accepts a role or grants elevated permissions.

## Configuration

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` configure MySQL. `SESSION_SECRET` is required when `NODE_ENV=production`; set `NODE_ENV=production` behind HTTPS so session cookies are marked secure. `DB_LOGGING=true` enables Sequelize SQL logs.

Database table creation and the delivery-date schema update are intentionally additive and non-destructive. The module does not automatically alter existing tables on application startup. For production, use the project's controlled schema migration process and a persistent Express session store.

Supplier IDs and names are stored as references on stock-in batches and movements; no duplicate supplier directory is created. Point-of-sale integrations should record consumption through the authenticated stock-movement API and treat transaction history as append-only.
