-- =====================================================
-- Enable Realtime for Wishlist Tables
-- =====================================================
-- Created: 2025-12-28
-- Description: Enable Supabase Realtime subscriptions for wishlist tables

-- Enable realtime for gift_items table
ALTER PUBLICATION supabase_realtime ADD TABLE gift_items;

-- Enable realtime for gift_purchases table
ALTER PUBLICATION supabase_realtime ADD TABLE gift_purchases;

-- Enable realtime for gift_item_events table
ALTER PUBLICATION supabase_realtime ADD TABLE gift_item_events;

-- Enable realtime for gift_event_categories table (for future updates)
ALTER PUBLICATION supabase_realtime ADD TABLE gift_event_categories;
