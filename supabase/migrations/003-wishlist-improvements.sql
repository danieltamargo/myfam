-- =====================================================
-- WISHLIST MODULE - Improvements
-- =====================================================
-- Created: 2025-12-28
-- Description: Add support for multiple links and remove quantity field

-- 1. Remove quantity field (not needed, can add to name like "4x Example")
ALTER TABLE gift_items DROP COLUMN IF EXISTS quantity;

-- 2. Change url to links array (support multiple links)
ALTER TABLE gift_items DROP COLUMN IF EXISTS url;
ALTER TABLE gift_items ADD COLUMN links TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 3. Add comment to explain image storage
COMMENT ON COLUMN gift_items.image_url IS 'Image stored in Supabase Storage bucket "gift-images" or external URL';

-- 4. Create storage bucket for gift images (if not exists)
-- This needs to be run in Supabase Dashboard Storage section:
-- Bucket name: gift-images
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/gif, image/webp

-- Note: The bucket creation is done via Dashboard, not SQL
-- After creating the bucket, set the following RLS policies:

-- INSERT policy: Family members can upload images
-- SELECT policy: Anyone can view images (public bucket)
-- UPDATE policy: Owner can update their images
-- DELETE policy: Owner can delete their images
