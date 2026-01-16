-- Enable Email/Password Authentication
-- This migration ensures email/password auth is properly configured

-- Note: The actual email confirmation setting is configured in Supabase Dashboard
-- under Authentication > Providers > Email
--
-- For development: Disable "Confirm email" for faster testing
-- For production: Enable "Confirm email" for security
--
-- This migration just ensures the trigger to create profiles is in place,
-- which it already is from 001-complete-schema.sql

-- Verify the trigger exists (this is just a comment for documentation)
-- The handle_new_user() function and trigger should already exist from migration 001
