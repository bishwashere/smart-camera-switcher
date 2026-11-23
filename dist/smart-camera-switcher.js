class SmartCameraSwitcherTest extends HTMLElement {
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

    this._clearPendingAutoSwitch();
    this._clearManualIntent();
    this._manualReturnDefaultUntil = undefined;
    this._unreadyAutoTarget = undefined;
    this._config = {
      title: 'Smart Camera',
      active_entity: undefined,
      selector_entity: undefined,
      default_camera: undefined,
      auto_option: 'auto',
      max_height: '25vh',
      camera_view: 'live',
      thumbnail_camera_view: 'live',
      fit_mode: 'cover',
      show_names: false,
      manual_timeout_seconds: 10,
      min_auto_switch_seconds: 3,
      switch_hold_seconds: 2,
      debug: false,
      ...config,
    };
    this._setPreviewPhase('auto');
    this._debugLines = [];
    this._debug('configured', this._config);
  }

  set hass(hass) {
    this._hass = hass;
    const setupMessage = this._setupMessage();
    if (setupMessage) {
      this._setPreviewPhase('auto');
      this._clearPendingAutoSwitch();
      this._clearManualIntent();
      this._renderNotice(setupMessage);
      return;
    }

    this._ackManualIntent();
    this._update();
  }

  disconnectedCallback() {
    this._clearManualReset();
    this._manualReturnDefaultUntil = undefined;
    this._clearManualIntent();
    this._clearPendingAutoSwitch();
    this._unreadyAutoTarget = undefined;
    if (this._viewerSwapTimer) window.clearTimeout(this._viewerSwapTimer);
    this._viewerSwapTimer = undefined;
  }

  _desiredCameraSelection() {
    const cfg = this._config;
    if (this._manualIntent) return { id: this._manualIntent.id, source: 'manual' };
    const manual = cfg.selector_entity ? this._hass.states[cfg.selector_entity]?.state : undefined;
    if (manual && manual !== cfg.auto_option && cfg.cameras.some((camera) => camera.id === manual)) {
      return { id: manual, source: 'manual' };
    }

    const active = cfg.active_entity ? this._hass.states[cfg.active_entity]?.state : undefined;
    if (active && cfg.cameras.some((camera) => camera.id === active)) {
      return { id: active, source: 'auto' };
    }

    return { id: this._defaultCameraId(), source: 'fallback' };
  }

  _defaultCameraId() {
    const cfg = this._config;
    if (cfg.default_camera && cfg.cameras.some((camera) => camera.id === cfg.default_camera)) {
      return cfg.default_camera;
    }
    return cfg.cameras[0].id;
  }

  _selectCamera(camera) {
    this._manualReturnDefaultUntil = undefined;
    this._unreadyAutoTarget = undefined;
    const current = this._pendingAutoAttempt;
    if (current?.kind !== 'manual' || current.id !== camera.id) {
      this._clearPendingAutoSwitch();
      this._clearManualReset();
      if (this._viewerSwapTimer) window.clearTimeout(this._viewerSwapTimer);
      this._viewerSwapTimer = undefined;
      this._clearManualIntent();
      const selector = this._config.selector_entity;
      if (selector) {
        const intent = { id: camera.id, selector };
        this._manualIntent = intent;
        // Keep the latest tap authoritative while an old selector echo is in flight.
        // After the two-second switch deadline, allow a short bounded ack grace.
        intent.timer = window.setTimeout(() => {
          if (this._manualIntent !== intent) return;
          this._clearManualIntent();
          this._update();
        }, 3000);
      }
      this._setPreviewPhase('waiting');
      if (camera.id !== this._renderedActiveId) this._showManualPreview(camera.id);
      this._startViewerAttempt(camera.id, 'manual');
    }
    this._selectOption(camera.id);
    this._ackManualIntent();
  }

  _setPreviewPhase(phase) {
    if (this.dataset.cameraPreviewPhase === phase) return;
    this.dataset.cameraPreviewPhase = phase;
    this.dataset.cameraPreviewPhaseTime = String(Math.round(performance.now()));
  }

  _showManualPreview(id) {
    const thumbs = Array.from(this.querySelectorAll('.thumb'));
    const thumbnail = thumbs.find(button => button.dataset.camera === id);
    const viewer = this.querySelector('.viewer');
    if (!thumbnail || !viewer) return;

    const sources = this._cameraMediaIn(thumbnail);
    for (const source of [...sources.filter(x => x.tagName === 'VIDEO'), ...sources.filter(x => x.tagName === 'IMG')]) {
      const isVideo = source.tagName === 'VIDEO';
      const w = isVideo ? source.videoWidth : source.naturalWidth;
      const h = isVideo ? source.videoHeight : source.naturalHeight;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 ||
          (isVideo ? source.readyState < 2 : !source.complete)) continue;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1280 / Math.max(w, h));
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const graphics = canvas.getContext('2d');
        if (!graphics) continue;
        // Paint the already-loaded source locally; no pixel readback, export,
        // URL assignment, extra media request or durable storage.
        graphics.drawImage(source, 0, 0, canvas.width, canvas.height);
        canvas.className = 'manual-preview';
        canvas.style.objectFit = ['contain', 'cover', 'fill', 'none', 'scale-down'].includes(this._config.fit_mode)
          ? this._config.fit_mode : 'cover';
        canvas.setAttribute('aria-hidden', 'true');
        viewer.append(canvas);
        this._manualPreview = canvas;
        this._setPreviewPhase('thumbnail');
        return;
      } catch {
        // Unavailable/undrawable thumbnail: try its other already-loaded media.
      }
    }
  }

  _clearManualPreview() {
    const canvas = this._manualPreview;
    this._manualPreview = undefined;
    if (!canvas) return;
    canvas.remove();
    canvas.width = canvas.height = 0;
  }

  _ackManualIntent() {
    const intent = this._manualIntent;
    if (!intent || (this._pendingAutoAttempt?.kind === 'manual' && !this._pendingAutoAttempt.promoted)) return;
    if (this._hass.states[intent.selector]?.state === intent.id) this._clearManualIntent();
  }

  _clearManualIntent() {
    if (this._manualIntent) window.clearTimeout(this._manualIntent.timer);
    this._manualIntent = undefined;
  }

  _selectOption(option) {
    const selector = this._config.selector_entity;
    if (!selector) return;

    this._hass.callService('input_select', 'select_option', {
      entity_id: selector,
      option,
    });
  }

  _scheduleManualReset(selectedOption) {
    const cfg = this._config;
    const timeout = Number(cfg?.manual_timeout_seconds || 0);
    if (!this._hass || !cfg?.selector_entity || !cfg.auto_option || timeout <= 0) return;

    const manual = selectedOption || this._hass.states[cfg.selector_entity]?.state;
    if (!manual || manual === cfg.auto_option) {
      this._clearManualReset();
      return;
    }

    if (this._manualResetTimer && this._manualResetOption === manual) return;
    this._clearManualReset();
    this._manualResetOption = manual;
    this._manualResetTimer = window.setTimeout(() => {
      const current = this._hass?.states[cfg.selector_entity]?.state;
      if (current === manual) {
        // The manual viewing window already elapsed. On the ensuing auto
        // selector acknowledgement, don't add the ordinary idle debounce.
        this._manualReturnDefaultUntil = performance.now() + 2000;
        this._selectOption(cfg.auto_option);
      }
      this._clearManualReset();
    }, timeout * 1000);
  }

  _clearManualReset() {
    if (this._manualResetTimer) window.clearTimeout(this._manualResetTimer);
    this._manualResetTimer = undefined;
    this._manualResetOption = undefined;
  }

  _scheduleAutoSwitch(activeId) {
    if ((this._pendingAutoAttempt?.id === activeId && this._pendingAutoAttempt.kind === 'motion') ||
        this._unreadyAutoTarget === activeId) return;
    this._clearPendingAutoSwitch();
    this._startViewerAttempt(activeId, 'motion');
  }

  _startViewerAttempt(activeId, kind) {
    const until = performance.now() + 2000;
    const slot = this._prepareViewer(activeId);
    if (!slot) {
      if (kind === 'manual') this._clearManualPreview();
      return;
    }
    const attempt = { id: activeId, slot, until, kind };
    this._pendingAutoAttempt = attempt;
    if (kind === 'manual' && this._renderedActiveId === activeId) {
      attempt.promoted = true;
      attempt.visibleAt = performance.now();
    } else {
      attempt.deadline = window.setTimeout(() => this._expireAutoAttempt(attempt), Math.max(0, until - performance.now()));
    }
    this._watchAutoVideo(attempt);
  }

  _scheduleFallbackSwitch(activeId) {
    if (this._pendingAutoAttempt?.id === activeId && this._pendingAutoAttempt.kind === 'fallback') return;
    this._clearPendingAutoSwitch();
    const delay = Math.max(0, Number(this._config.min_auto_switch_seconds || 0) * 1000);
    if (delay === 0) {
      this._switchActiveCamera(activeId);
      return;
    }
    this._prepareViewer(activeId);
    const attempt = { id: activeId, kind: 'fallback' };
    this._pendingAutoAttempt = attempt;
    attempt.deadline = window.setTimeout(() => {
      if (this._pendingAutoAttempt !== attempt) return;
      const choice = this._desiredCameraSelection();
      if ((choice.source === 'fallback' ||
          (choice.source === 'auto' && choice.id === this._defaultCameraId())) && choice.id === activeId) {
        this._clearPendingAutoSwitch(true);
        this._switchActiveCamera(activeId);
      } else {
        this._clearPendingAutoSwitch();
        this._update();
      }
    }, delay);
  }

  _expireAutoAttempt(attempt) {
    if (this._pendingAutoAttempt !== attempt) return;
    if (attempt.kind === 'manual') {
      this._promoteManualForObservation(attempt);
      return;
    }
    // Do not reload the same failed stream on every unrelated HA state update.
    this._unreadyAutoTarget = attempt.id;
    this._clearPendingAutoSwitch();
  }

  _cameraMediaIn(root) {
    const media = [];
    const pending = [root];
    while (pending.length) {
      const node = pending.pop();
      if (node.tagName === 'VIDEO' || node.tagName === 'IMG') media.push(node);
      if (node.shadowRoot) pending.push(node.shadowRoot);
      for (let i = (node.children?.length || 0) - 1; i >= 0; i--) pending.push(node.children[i]);
    }
    return media;
  }

  _finishAutoAttempt(attempt, video) {
    if (this._pendingAutoAttempt !== attempt) return;
    if (performance.now() >= attempt.until) {
      this._expireAutoAttempt(attempt);
      return;
    }
    const selection = this._desiredCameraSelection();
    if (attempt.kind === 'motion' && (selection.source !== 'auto' || selection.id !== attempt.id)) {
      this._clearPendingAutoSwitch();
      return;
    }
    if (this._viewerSlotFor(attempt.id) !== attempt.slot ||
        !this._cameraMediaIn(attempt.slot).includes(video) ||
        !video.videoWidth || !video.videoHeight) return;

    if (attempt.kind === 'manual') {
      this._promoteManualForObservation(attempt);
    } else {
      this._clearPendingAutoSwitch(true);
      this._promoteViewer(attempt.id);
    }
  }

  _promoteManualForObservation(attempt) {
    if (this._pendingAutoAttempt !== attempt || attempt.promoted) return;
    if (this._viewerSlotFor(attempt.id) !== attempt.slot) {
      this._clearPendingAutoSwitch();
      return;
    }
    window.clearTimeout(attempt.deadline);
    this._cancelAutoFrame(attempt);
    attempt.promoted = true;
    attempt.visibleAt = performance.now();
    attempt.progress = undefined;
    attempt.slot.classList.add('instant');
    this._promoteViewer(attempt.id);
    this._ackManualIntent();
  }

  _observePresentedManualFrame(attempt, video, time, frames, presentationTime) {
    if (this._pendingAutoAttempt !== attempt || !attempt.promoted ||
        this._renderedActiveId !== attempt.id ||
        this._viewerSlotFor(attempt.id) !== attempt.slot ||
        !attempt.slot.classList.contains('active') ||
        !this._cameraMediaIn(attempt.slot).includes(video)) return;
    if (document.visibilityState === 'hidden' ||
        (typeof this.getClientRects === 'function' && this.getClientRects().length === 0) ||
        !video.videoWidth || !video.videoHeight || video.paused || video.ended ||
        !Number.isFinite(time) || !Number.isFinite(frames) ||
        (Number.isFinite(presentationTime) && presentationTime < attempt.visibleAt)) {
      attempt.progress = undefined;
      return;
    }
    const earlier = attempt.progress;
    if (!earlier || time < earlier.time || frames < earlier.frames) {
      attempt.progress = { time, frames };
      return;
    }
    // A decoded poster/stalled frame is not live movement. Two post-promotion
    // samples must advance the playback timeline and the frame count.
    if (time <= earlier.time || frames <= earlier.frames) return;
    this._clearPendingAutoSwitch(true);
    this._setPreviewPhase('live');
    this._ackManualIntent();
    this._scheduleManualReset(attempt.id);
  }

  _watchAutoVideo(attempt) {
    if (this._pendingAutoAttempt !== attempt) return;
    if (!attempt.promoted && performance.now() >= attempt.until) {
      this._expireAutoAttempt(attempt);
      if (this._pendingAutoAttempt === attempt && attempt.promoted) {
        attempt.poll = window.setTimeout(() => this._watchAutoVideo(attempt), 50);
      }
      return;
    }
    const liveVideos = this._cameraMediaIn(attempt.slot).filter(x => x.tagName === 'VIDEO');
    const video = liveVideos.find(v => !v.paused && !v.ended) || liveVideos[0];
    if (video !== attempt.video) {
      this._cancelAutoFrame(attempt);
      attempt.video = video;
      attempt.progress = undefined;
    }
    if (video) {
      if (typeof video.requestVideoFrameCallback === 'function') {
        if (attempt.frameId === undefined) {
          const version = attempt.frameVersion;
          attempt.frameId = video.requestVideoFrameCallback((_now, meta) => {
            if (this._pendingAutoAttempt !== attempt || attempt.video !== video ||
                attempt.frameVersion !== version) return;
            attempt.frameId = undefined;
            if (attempt.promoted) {
              this._observePresentedManualFrame(attempt, video, meta?.mediaTime, meta?.presentedFrames, meta?.presentationTime);
            } else {
              this._finishAutoAttempt(attempt, video);
            }
          });
        }
      } else if (attempt.promoted) {
        let frames;
        try {
          frames = video.getVideoPlaybackQuality?.()?.totalVideoFrames ?? video.webkitDecodedFrameCount;
        } catch { /* no observed frame progress */ }
        this._observePresentedManualFrame(attempt, video, video.currentTime, frames);
      } else if (attempt.kind === 'motion' && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        this._finishAutoAttempt(attempt, video);
      }
    }
    if (this._pendingAutoAttempt === attempt) {
      attempt.poll = window.setTimeout(() => this._watchAutoVideo(attempt), attempt.promoted ? 250 : 50);
    }
  }

  _cancelAutoFrame(attempt) {
    attempt.frameVersion = (attempt.frameVersion || 0) + 1;
    if (attempt.frameId !== undefined && typeof attempt.video?.cancelVideoFrameCallback === 'function') {
      attempt.video.cancelVideoFrameCallback(attempt.frameId);
    }
    attempt.frameId = undefined;
  }

  _clearPendingAutoSwitch(keepPrepared = false) {
    const attempt = this._pendingAutoAttempt;
    this._pendingAutoAttempt = undefined;
    if (attempt) {
      window.clearTimeout(attempt.deadline);
      window.clearTimeout(attempt.poll);
      this._cancelAutoFrame(attempt);
    }
    if (attempt?.kind === 'manual' || !keepPrepared) this._clearManualPreview();
    if (!keepPrepared) this._clearPreparedViewers();
  }

  _moreInfo(entityId) {
    const event = new Event('hass-more-info', { bubbles: true, composed: true });
    event.detail = { entityId };
    this.dispatchEvent(event);
  }

  _setupMessage() {
    if (!this._hass || !this._config) return undefined;

    const missingCameras = this._config.cameras.filter((camera) => !this._hass.states[camera.entity]);
    if (missingCameras.length > 0) {
      const exampleEntities = ['camera.front_door', 'camera.driveway'];
      const hasExampleCamera = this._config.cameras.some((camera) => exampleEntities.includes(camera.entity));
      if (hasExampleCamera) {
        return 'Replace the example camera entities with your real Home Assistant camera entities.';
      }
      return `Camera entity not found: ${missingCameras.map((camera) => camera.entity).join(', ')}`;
    }

    if (this._config.selector_entity && !this._hass.states[this._config.selector_entity]) {
      if (this._config.selector_entity === 'input_select.camera_selector') {
        return 'Replace the example selector entity input_select.camera_selector, or remove selector_entity.';
      }
      return `Selector entity ${this._config.selector_entity} was not found.`;
    }

    if (this._config.active_entity && !this._hass.states[this._config.active_entity]) {
      if (this._config.active_entity === 'sensor.active_camera_example') {
        return 'Replace the example active entity sensor.active_camera_example, or remove active_entity.';
      }
      return `Active camera entity ${this._config.active_entity} was not found.`;
    }

    return undefined;
  }

  _update() {
    if (!this._hass || !this._config) return;

    const cfg = this._config;
    const selection = this._desiredCameraSelection();
    const activeId = selection.id;
    if (selection.source !== 'manual') this._setPreviewPhase('auto');
    // A local tap owns its warming viewer even if HA is still echoing the old
    // selector state. Explicitly superseding taps cancel it in _selectCamera.
    const manualAttempt = this._pendingAutoAttempt;
    if (manualAttempt?.kind === 'manual' && (!manualAttempt.promoted ||
        (selection.source === 'manual' && activeId === manualAttempt.id))) {
      this._updateSelectorState();
      this._updateChildHass();
      return;
    }
    if (selection.source !== 'auto' || activeId !== this._unreadyAutoTarget) {
      this._unreadyAutoTarget = undefined;
    }

    if (!this._hasRendered || this._renderedCameraCount !== cfg.cameras.length) {
      this._clearPendingAutoSwitch();
      this._render(activeId);
      return;
    }

    if (this._renderedActiveId === activeId) {
      if (selection.source !== 'manual') this._manualReturnDefaultUntil = undefined;
      this._clearPendingAutoSwitch();
      this._updateSelectorState();
      this._updateChildHass();
      return;
    }

    if (selection.source === 'manual') {
      // The selector confirmation (or an unrelated HA update) can arrive while
      // this same viewer is already warming. Don't rebuild it or restart its hold.
      if (this._viewerSwapTimer && this._viewerSlotFor(activeId)?.classList.contains('prepared')) {
        this._updateSelectorState();
        this._updateChildHass();
        return;
      }
      this._clearPendingAutoSwitch();
      this._switchActiveCamera(activeId);
      return;
    }

    const returningFromManual = this._manualReturnDefaultUntil !== undefined &&
      performance.now() <= this._manualReturnDefaultUntil;
    this._manualReturnDefaultUntil = undefined;
    if (returningFromManual && activeId === this._defaultCameraId()) {
      this._clearPendingAutoSwitch();
      const slot = this._prepareViewer(activeId);
      if (slot) {
        slot.classList.add('instant');
        this._promoteViewer(activeId);
        return;
      }
    }

    if (selection.source === 'auto' && activeId !== this._defaultCameraId()) this._scheduleAutoSwitch(activeId);
    else this._scheduleFallbackSwitch(activeId);
    this._updateSelectorState();
    this._updateChildHass();
  }

  _render(activeId) {
    if (!this._hass || !this._config) return;

    const cfg = this._config;
    const activeCamera = cfg.cameras.find((camera) => camera.id === activeId) || cfg.cameras[0];
    this._renderedActiveId = activeId;
    this._renderedCameraCount = cfg.cameras.length;
    this._activeChangedAt = Date.now();
    this._hasRendered = true;
    this._debug('render', {
      activeId,
      activeCamera,
      cameraCount: cfg.cameras.length,
      cameraView: cfg.camera_view,
      thumbnailCameraView: cfg.thumbnail_camera_view,
      fitMode: cfg.fit_mode,
    });

    this.innerHTML = `
      <ha-card>
        ${cfg.title ? `<div class="header">${this._escape(cfg.title)}</div>` : ''}
        <div class="viewer" style="height:${this._escape(cfg.max_height)}">
          <div class="viewer-slot active" data-camera-id="${this._escape(activeCamera.id)}">
            <hui-picture-entity-card></hui-picture-entity-card>
          </div>
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
            position: relative;
          }
          smart-camera-switcher .viewer-slot {
            position: absolute;
            inset: 0;
            transition: opacity .18s ease;
          }
          smart-camera-switcher .viewer-slot.active {
            opacity: 1;
            z-index: 2;
          }
          smart-camera-switcher .viewer-slot.instant {
            transition: none;
          }
          smart-camera-switcher .manual-preview {
            position: absolute;
            inset: 0;
            display: block;
            width: 100%;
            height: 100%;
            z-index: 3;
            pointer-events: none;
            background: var(--divider-color, #171717);
          }
          smart-camera-switcher .viewer-slot.prepared {
            opacity: 0;
            z-index: 1;
            pointer-events: none;
          }
          smart-camera-switcher .viewer-slot hui-picture-entity-card,
          smart-camera-switcher .viewer-slot hui-picture-entity-card > *,
          smart-camera-switcher .viewer-slot > * {
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
          smart-camera-switcher .thumb hui-picture-entity-card,
          smart-camera-switcher .thumb [data-smart-camera-child="true"] {
            pointer-events: none;
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

    this._configurePictureCard(this.querySelector('.viewer-slot.active hui-picture-entity-card'), activeCamera);
    for (const button of this.querySelectorAll('.thumb')) {
      const camera = cfg.cameras.find((item) => item.id === button.dataset.camera);
      this._configurePictureCard(button.querySelector('hui-picture-entity-card'), camera, {
        aspect_ratio: '1:1',
        camera_view: cfg.thumbnail_camera_view,
        tap_action: { action: 'none' },
        hold_action: { action: 'none' },
      });
      button.addEventListener('click', () => this._selectCamera(camera));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this._moreInfo(camera.entity);
      });
    }
  }

  _renderNotice(message) {
    this._hasRendered = false;
    this.innerHTML = `
      <ha-card>
        ${this._config.title ? `<div class="header">${this._escape(this._config.title)}</div>` : ''}
        <div class="notice">${this._escape(message)}</div>
        <style>
          smart-camera-switcher .header {
            padding: 12px 16px 8px;
            font-size: 16px;
            font-weight: 500;
          }
          smart-camera-switcher .notice {
            padding: 16px;
            color: var(--secondary-text-color);
            line-height: 1.4;
          }
        </style>
      </ha-card>`;
  }

  _switchActiveCamera(activeId) {
    const camera = this._config.cameras.find((item) => item.id === activeId);
    if (!camera || this._renderedActiveId === camera.id) {
      this._updateSelectorState();
      this._updateChildHass();
      return;
    }

    this._debug('switch active camera', { activeId: camera.id, camera });
    const slot = this._prepareViewer(camera.id);
    if (!slot) return;

    const preparedAt = Number(slot.dataset.preparedAt || Date.now());
    const minimumHoldMs = Math.max(0, Number(this._config.switch_hold_seconds || 0) * 1000);
    const waitMs = Math.max(0, minimumHoldMs - (Date.now() - preparedAt));
    if (this._viewerSwapTimer) window.clearTimeout(this._viewerSwapTimer);
    this._viewerSwapTimer = window.setTimeout(() => {
      this._promoteViewer(camera.id);
    }, waitMs);
    this._updateChildHass();
  }

  _prepareViewer(activeId) {
    const camera = this._config.cameras.find((item) => item.id === activeId);
    const viewer = this.querySelector('.viewer');
    if (!camera || !viewer) return undefined;

    const existing = this._viewerSlotFor(camera.id);
    if (existing) return existing;

    this._clearPreparedViewers();
    const slot = document.createElement('div');
    slot.className = 'viewer-slot prepared';
    slot.dataset.cameraId = camera.id;
    slot.dataset.preparedAt = String(Date.now());
    slot.innerHTML = '<hui-picture-entity-card></hui-picture-entity-card>';
    viewer.append(slot);
    this._configurePictureCard(slot.querySelector('hui-picture-entity-card'), camera);
    return slot;
  }

  _promoteViewer(activeId) {
    const viewer = this.querySelector('.viewer');
    const slot = this._viewerSlotFor(activeId);
    if (!slot) return;

    for (const other of viewer.querySelectorAll('.viewer-slot')) {
      if (other !== slot) other.remove();
    }
    slot.classList.remove('prepared');
    slot.classList.add('active');
    this._renderedActiveId = activeId;
    this._activeChangedAt = Date.now();
    this._viewerSwapTimer = undefined;
    this._updateSelectorState();
    this._updateChildHass();
  }

  _clearPreparedViewers() {
    for (const slot of this.querySelectorAll('.viewer-slot.prepared')) {
      slot.remove();
    }
  }

  _viewerSlotFor(cameraId) {
    return Array.from(this.querySelectorAll('.viewer-slot')).find((slot) => slot.dataset.cameraId === cameraId);
  }

  _configurePictureCard(element, camera, options = {}) {
    if (!element || !camera) return;
    const childConfig = {
      type: 'picture-entity',
      entity: camera.entity,
      show_name: false,
      show_state: false,
      camera_view: this._config.camera_view,
      fit_mode: this._config.fit_mode,
      tap_action: { action: 'more-info' },
      ...options,
    };

    if (typeof element.setConfig !== 'function' && typeof window.loadCardHelpers !== 'function') {
      this._debug('picture card not ready', { camera });
      customElements.whenDefined('hui-picture-entity-card').then(() => {
        if (element.isConnected) {
          this._debug('picture card ready, retrying', { camera });
          this._configurePictureCard(element, camera, options);
        }
      });
      return;
    }

    if (typeof element.setConfig === 'function') {
      try {
        element.setConfig(childConfig);
        element.hass = this._hass;
        element.dataset.smartCameraChild = 'true';
        this._debug('picture card configured', childConfig);
      } catch (error) {
        console.error('smart-camera-switcher: picture card configuration failed', childConfig, error);
      }
      return;
    }

    if (typeof window.loadCardHelpers === 'function') {
      this._debug('creating picture card with helpers', childConfig);
      window
        .loadCardHelpers()
        .then((helpers) => {
          if (!element.isConnected) return;
          const card = helpers.createCardElement(childConfig);
          card.dataset.smartCameraChild = 'true';
          card.hass = this._hass;
          element.replaceWith(card);
          this._debug('picture card configured', childConfig);
        })
        .catch((error) => {
          console.error('smart-camera-switcher: picture card helper failed', childConfig, error);
        });
    }
  }

  _updateSelectorState() {
    for (const button of this.querySelectorAll('.thumb')) {
      button.classList.toggle('active', button.dataset.camera === this._renderedActiveId);
    }
  }

  _updateChildHass() {
    for (const element of this.querySelectorAll('[data-smart-camera-child="true"]')) {
      element.hass = this._hass;
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
  customElements.define('smart-camera-switcher', SmartCameraSwitcherTest);
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'smart-camera-switcher',
  name: 'Smart Camera Switcher',
  description: 'Live camera viewer with circular camera selectors for Home Assistant.',
});
