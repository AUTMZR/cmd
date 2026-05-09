-- 016: pc.devices.plugin_providers — что прислал hello.message от агента
-- (id/label/models/status каждого загруженного plugin-провайдера).
-- Кешируется здесь, чтобы UI мог рендерить даже когда агент офлайн.

ALTER TABLE pc.devices
  ADD COLUMN IF NOT EXISTS plugin_providers JSONB NOT NULL DEFAULT '[]'::jsonb;
