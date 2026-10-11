INSERT INTO permissions (code, description) VALUES ('reports.view', 'Отчёты банка');
INSERT INTO role_permissions (role_id, permission_code) SELECT id, 'reports.view' FROM roles WHERE code IN ('admin', 'credit_officer');
