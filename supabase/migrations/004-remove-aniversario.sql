-- =====================================================
-- Remove "Aniversario" event from all families
-- =====================================================
-- Created: 2025-12-28

DELETE FROM gift_event_categories
WHERE name = 'Aniversario'
AND is_system = true;
