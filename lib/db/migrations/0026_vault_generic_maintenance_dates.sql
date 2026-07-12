UPDATE `reminders`
SET `kind` = 'maintenance'
WHERE `kind` IN ('mot', 'service');
