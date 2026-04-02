-- Kill Switch: add kill_switch row to existing system_state table
INSERT INTO system_state (key, value, updated_at)
VALUES ('kill_switch', 'inactive', now())
ON CONFLICT (key) DO NOTHING;
