class SmartCameraSwitcher extends HTMLElement {
  static getStubConfig() {
    return {
      title: 'Smart Camera',
      active_entity: 'sensor.active_camera_example',
      selector_entity: 'input_select.camera_selector',
      cameras: [
        { id: 'front_door', entity: 'camera.front_door', name: 'Front Door' },
        { id: 'driveway', entity: 'camera.driveway', name: 'Driveway' },
      ],
    };
  }

  setConfig(config) {
    if (!Array.isArray(config.cameras) || config.cameras.length === 0) {
      throw new Error('smart-camera-switcher: cameras is required');
    }
    for (const camera of config.cameras) {
      if (!camera.id || !camera.entity) {
        throw new Error('smart-camera-switcher: each camera needs id and entity');
      }
    }

    this._config = {
      title: 'Smart Camera',
      active_entity: undefined,
      selector_entity: undefined,
      max_height: '25vh',
      camera_view: 'live',
      fit_mode: 'cover',
      show_names: false,
      debug: false,
      ...config,
    };
    this._debugLines = [];
    this._debug('configured', this._config);
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _activeCameraId() {
    const cfg = this._config;
    const manual = cfg.selector_entity ? this._hass.states[cfg.selector_entity]?.state : undefined;
    if (manual && manual !== 'auto' && cfg.cameras.some((camera) => camera.id === manual)) {
      return manual;
    }

    const active = cfg.active_entity ? this._hass.states[cfg.active_entity]?.state : undefined;
    if (active && cfg.cameras.some((camera) => camera.id === active)) {
      return active;
    }

    return cfg.cameras[0].id;
  }

  _selectCamera(camera) {
    const selector = this._config.selector_entity;
    if (!selector) return;

    this._hass.callService('input_select', 'select_option', {
      entity_id: selector,
      option: camera.id,
    });
  }

  _moreInfo(entityId) {
    const event = new Event('hass-more-info', { bubbles: true, composed: true });
    event.detail = { entityId };
    this.dispatchEvent(event);
  }

  _render() {
    if (!this._hass || !this._config) return;

    const cfg = this._config;
    const activeId = this._activeCameraId();
    const activeCamera = cfg.cameras.find((camera) => camera.id === activeId) || cfg.cameras[0];
    this._debug('render', {
      activeId,
      activeCamera,
      cameraCount: cfg.cameras.length,
      cameraView: cfg.camera_view,
      fitMode: cfg.fit_mode,
    });

    this.innerHTML = `
      <ha-card>
        ${cfg.title ? `<div class="header">${this._escape(cfg.title)}</div>` : ''}
        <div class="viewer" style="height:${this._escape(cfg.max_height)}">
          <hui-picture-entity-card></hui-picture-entity-card>
        </div>
        <div class="thumbs">
          ${cfg.cameras
            .map(
              (camera) => `
                <button class="thumb ${camera.id === activeCamera.id ? 'active' : ''}" data-camera="${this._escape(camera.id)}" title="${this._escape(camera.name || camera.id)}">
                  <hui-picture-entity-card></hui-picture-entity-card>
                  ${cfg.show_names ? `<span>${this._escape(camera.name || camera.id)}</span>` : ''}
                </button>`
            )
            .join('')}
        </div>
        ${cfg.debug ? '<pre class="debug-log"></pre>' : ''}
        <style>
          smart-camera-switcher .header {
            padding: 12px 16px 8px;
            font-size: 16px;
            font-weight: 500;
          }
          smart-camera-switcher .viewer {
            overflow: hidden;
            background: var(--divider-color, rgba(127,127,127,.15));
          }
          smart-camera-switcher .viewer hui-picture-entity-card,
          smart-camera-switcher .viewer hui-picture-entity-card > *,
          smart-camera-switcher .viewer > * {
            display: block;
            height: 100%;
          }
          smart-camera-switcher .thumbs {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
            gap: 10px;
            padding: 12px 14px 14px;
          }
          smart-camera-switcher .thumb {
            appearance: none;
            border: 2px solid var(--divider-color);
            border-radius: 999px;
            aspect-ratio: 1 / 1;
            overflow: hidden;
            padding: 0;
            background: var(--ha-card-background, var(--card-background-color, #fff));
            cursor: pointer;
            position: relative;
          }
          smart-camera-switcher .thumb.active {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 25%, transparent);
          }
          smart-camera-switcher .thumb hui-picture-entity-card,
          smart-camera-switcher .thumb hui-picture-entity-card > *,
          smart-camera-switcher .thumb > * {
            display: block;
            width: 100%;
            height: 100%;
          }
          smart-camera-switcher .thumb span {
            position: absolute;
            inset: auto 0 0;
            padding: 3px;
            font-size: 10px;
            color: white;
            background: rgba(0,0,0,.5);
          }
          smart-camera-switcher .debug-log {
            margin: 0;
            padding: 8px 12px 12px;
            max-height: 160px;
            overflow: auto;
            font-size: 11px;
            white-space: pre-wrap;
            color: var(--secondary-text-color);
          }
        </style>
      </ha-card>`;
    this._updateDebugLog();

    this._configurePictureCard(this.querySelector('.viewer hui-picture-entity-card'), activeCamera);
    for (const button of this.querySelectorAll('.thumb')) {
      const camera = cfg.cameras.find((item) => item.id === button.dataset.camera);
      this._configurePictureCard(button.querySelector('hui-picture-entity-card'), camera);
      button.addEventListener('click', () => this._selectCamera(camera));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this._moreInfo(camera.entity);
      });
    }
  }

  _configurePictureCard(element, camera) {
    if (!element || !camera) return;
    const childConfig = {
      type: 'picture-entity',
      entity: camera.entity,
      show_name: false,
      show_state: false,
      camera_view: this._config.camera_view,
      fit_mode: this._config.fit_mode,
      tap_action: { action: 'more-info' },
    };

    if (typeof window.loadCardHelpers === 'function') {
      this._debug('creating picture card with helpers', childConfig);
      window
        .loadCardHelpers()
        .then((helpers) => {
          if (!element.isConnected) return;
          const card = helpers.createCardElement(childConfig);
          card.hass = this._hass;
          element.replaceWith(card);
          this._debug('picture card configured', childConfig);
        })
        .catch((error) => {
          console.error('smart-camera-switcher: picture card helper failed', childConfig, error);
        });
      return;
    }

    if (typeof element.setConfig !== 'function') {
      this._debug('picture card not ready', { camera });
      customElements.whenDefined('hui-picture-entity-card').then(() => {
        if (element.isConnected) {
          this._debug('picture card ready, retrying', { camera });
          this._configurePictureCard(element, camera);
        }
      });
      return;
    }

    try {
      element.setConfig(childConfig);
      element.hass = this._hass;
      this._debug('picture card configured', childConfig);
    } catch (error) {
      console.error('smart-camera-switcher: picture card configuration failed', childConfig, error);
    }
  }

  _debug(message, detail) {
    if (!this._config || !this._config.debug) return;
    this._debugLines = this._debugLines || [];
    const text = `${new Date().toLocaleTimeString()} ${message}${detail ? ` ${this._safeJson(detail)}` : ''}`;
    this._debugLines.push(text);
    this._debugLines = this._debugLines.slice(-30);
    this._updateDebugLog();
    console.info(`smart-camera-switcher: ${message}`, detail);
  }

  _updateDebugLog() {
    const log = this.querySelector('.debug-log');
    if (!log) return;
    log.textContent = (this._debugLines || []).join('\n');
  }

  _safeJson(value) {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  _escape(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  getCardSize() {
    return 3;
  }
}

if (!customElements.get('smart-camera-switcher')) {
  customElements.define('smart-camera-switcher', SmartCameraSwitcher);
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'smart-camera-switcher',
  name: 'Smart Camera Switcher',
  description: 'Live camera viewer with circular camera selectors for Home Assistant.',
});
